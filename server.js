'use strict';

const express = require('express');
const http    = require('http');
const path    = require('path');
const crypto  = require('crypto');
const { WebSocketServer } = require('ws');
const { GameSession } = require('./game/session');
const storage = require('./game/storage');
const { CLASSES } = require('./game/constants');

const PORT       = process.env.PORT       || 7682;
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';

// Pre-encode the admin token once for constant-time compare.
const ADMIN_PASS_BUF = Buffer.from(ADMIN_PASS, 'utf8');

// ── Hardening limits ──────────────────────────────────────────────────────────
const MAX_WS_PER_IP            = 5;
const MAX_REGS_PER_IP_PER_HOUR = 5;
const REG_WINDOW_MS            = 60 * 60 * 1000;
const MAX_ADMIN_FAILS_PER_MIN  = 5;
const ADMIN_FAIL_WINDOW_MS     = 60 * 1000;

// In-memory tracking. Lifetime = process. Cleaned up on touch.
const wsConnsByIp     = new Map(); // ip -> count
const regAttemptsByIp = new Map(); // ip -> [timestampMs, ...]
const adminFailsByIp  = new Map(); // ip -> [timestampMs, ...]
const activeSessions  = new Map(); // playerId -> ws (single-session-per-player kick)

function clientIp(req) {
  // We're behind nginx-proxy-manager; honor X-Forwarded-For.
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || req.ip || 'unknown';
}

function pruneAndCount(map, ip, windowMs) {
  const now = Date.now();
  const list = (map.get(ip) || []).filter(t => now - t < windowMs);
  if (list.length === 0) map.delete(ip); else map.set(ip, list);
  return list;
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', true); // honor X-Forwarded-For from nginx-proxy-manager
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Public status (no auth) ───────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  const gs      = storage.getGameState();
  const players = storage.getAll();
  res.json({
    currentDay:   gs.currentDay    || 1,
    championName: gs.championName  || 'No Winner Yet',
    championDays: gs.championDays  || 0,
    playerCount:  players.length,
    aliveCount:   players.filter(p => !p.dead).length,
  });
});

// ── Admin auth middleware ──────────────────────────────────────────────────────
// - Constant-time token comparison via crypto.timingSafeEqual
// - Per-IP rate limit gates *failures* only: a correct token always succeeds
//   and clears the counter; rejected attempts past the limit return 429.
function adminAuth(req, res, next) {
  const ip = clientIp(req);

  const auth   = req.headers['authorization'] || '';
  const token  = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const tokBuf = Buffer.from(token, 'utf8');
  const ok = tokBuf.length === ADMIN_PASS_BUF.length &&
             crypto.timingSafeEqual(tokBuf, ADMIN_PASS_BUF);

  if (ok) {
    adminFailsByIp.delete(ip); // clear on success — admin is back in
    return next();
  }

  // Failure path: count it, then enforce the rate limit going forward.
  const fails = pruneAndCount(adminFailsByIp, ip, ADMIN_FAIL_WINDOW_MS);
  fails.push(Date.now());
  adminFailsByIp.set(ip, fails);

  if (fails.length > MAX_ADMIN_FAILS_PER_MIN) {
    res.set('Retry-After', '60');
    return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// ── Admin API ─────────────────────────────────────────────────────────────────

// GET /api/admin/gamestate
app.get('/api/admin/gamestate', adminAuth, (_req, res) => {
  const gs = storage.getGameState();
  res.json({
    currentDay:   gs.currentDay   || 1,
    championName: gs.championName || 'No Winner Yet',
    championDays: gs.championDays || 0,
    lastReset:    gs.lastReset    || null,
    bulletin:     gs.bulletin     || [],
  });
});

// POST /api/admin/announce — post a sysop bulletin board message
app.post('/api/admin/announce', adminAuth, (req, res) => {
  const text = (req.body.text || '').trim().slice(0, 78);
  if (!text) return res.status(400).json({ error: 'text required' });
  storage.postBulletin('Sysop', text);
  res.json({ ok: true });
});

// GET /api/admin/settings
app.get('/api/admin/settings', adminAuth, (_req, res) => {
  res.json(storage.getAllSettings());
});

// PUT /api/admin/settings
app.put('/api/admin/settings', adminAuth, (req, res) => {
  const allowed = Object.keys(storage.SETTING_DEFAULTS);
  const patch   = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const val = Number(req.body[key]);
      if (!isNaN(val) && val >= 0) patch[key] = val;
    }
  }
  storage.setSettings(patch);
  res.json(storage.getAllSettings());
});

// GET /api/admin/players
app.get('/api/admin/players', adminAuth, (_req, res) => {
  const players = storage.getAll().map(p => ({ ...p, passwordHash: undefined }));
  res.json(players);
});

// GET /api/admin/players/:id
app.get('/api/admin/players/:id', adminAuth, (req, res) => {
  const p = storage.findById(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({ ...p, passwordHash: undefined });
});

// PUT /api/admin/players/:id  — edit any player field except passwordHash/id
app.put('/api/admin/players/:id', adminAuth, (req, res) => {
  const p = storage.findById(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found' });

  const READONLY = new Set(['id', 'passwordHash', 'createdAt']);
  const NUM_FIELDS = new Set([
    'hp','hpMax','strength','def','charm','level','exp','gold','bank','gem',
    'weaponNum','armNum','fightsLeft','humanLeft','kills','king','lays',
    'kids','married','marriedTo','class','sex','extra',
    'skillw','skillm','skillt','levelw','levelm','levelt',
  ]);
  const BOOL_FIELDS = new Set(['dead','inn','hasAmulet','hasRing','hasScroll','seenMaster','seenDragon','seenViolet','seenBard','v4']);

  for (const [key, val] of Object.entries(req.body)) {
    if (READONLY.has(key)) continue;
    if (NUM_FIELDS.has(key)) { p[key] = Number(val); continue; }
    if (BOOL_FIELDS.has(key)) { p[key] = Boolean(val); continue; }
    if (typeof val === 'string') p[key] = val;
  }

  storage.savePlayer(p);
  storage.savePlayers();
  res.json({ ...p, passwordHash: undefined });
});

// DELETE /api/admin/players/:id
app.delete('/api/admin/players/:id', adminAuth, (req, res) => {
  const players = storage.getAll();
  const idx = players.findIndex(p => p.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  players.splice(idx, 1);
  storage.savePlayers();
  res.json({ ok: true });
});

// POST /api/admin/players/:id/resetday  — immediately reset daily counters
app.post('/api/admin/players/:id/resetday', adminAuth, (req, res) => {
  const p = storage.findById(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found' });
  // Force reset by clearing lastDay
  p.lastDay = '';
  storage.resetPlayerDay(p);
  storage.savePlayer(p);
  storage.savePlayers();
  res.json({ ...p, passwordHash: undefined });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws, req) => {
  const ip = clientIp(req);

  // Per-IP connection cap.
  const conns = wsConnsByIp.get(ip) || 0;
  if (conns >= MAX_WS_PER_IP) {
    console.log(`[lord] Rejecting ${ip} — too many concurrent connections (${conns})`);
    try {
      ws.send('\r\n\x1b[1;31m  Too many concurrent connections from your IP. Try again later.\x1b[0m\r\n');
    } catch (_) {}
    ws.close(1008, 'Too many connections');
    return;
  }
  wsConnsByIp.set(ip, conns + 1);
  console.log(`[lord] Connection from ${ip}  (${conns + 1}/${MAX_WS_PER_IP})`);

  const wasNewDay = storage.checkNewDay();
  if (wasNewDay) console.log('[lord] New day — daily reset triggered.');

  const session = new GameSession(
    (text) => { if (ws.readyState === ws.OPEN) ws.send(text); },
    ()     => ws.close(),
    {
      // Single session per player — kick the previous WS if a new one logs in.
      onLogin: (playerId) => {
        const existing = activeSessions.get(playerId);
        if (existing && existing !== ws) {
          try {
            existing.send('\r\n\x1b[1;31m  Another login from your account — this session is closing.\x1b[0m\r\n');
            existing.close(1000, 'Replaced by new session');
          } catch (_) {}
        }
        activeSessions.set(playerId, ws);
      },
      // Per-IP registration limit (counted at completion, not at attempt).
      canRegister: () => {
        const list = pruneAndCount(regAttemptsByIp, ip, REG_WINDOW_MS);
        if (list.length >= MAX_REGS_PER_IP_PER_HOUR) return false;
        list.push(Date.now());
        regAttemptsByIp.set(ip, list);
        return true;
      },
    }
  );

  ws.on('message', (data) => {
    const text = data.toString('utf8');
    if (text === '\x04') { ws.close(); return; }
    for (const ch of text) {
      try { session.onKey(ch); }
      catch (err) { session._handleError(err); }
    }
  });

  ws.on('close', () => {
    console.log(`[lord] ${ip} disconnected`);
    if (session.player) {
      storage.savePlayer(session.player);
      // Only release the active-session slot if it still belongs to this WS
      // (a kicked old session must not delete the new session's slot).
      const cur = activeSessions.get(session.player.id);
      if (cur === ws) activeSessions.delete(session.player.id);
    }
    const c = (wsConnsByIp.get(ip) || 1) - 1;
    if (c <= 0) wsConnsByIp.delete(ip); else wsConnsByIp.set(ip, c);
  });

  ws.on('error', (err) => console.error(`[lord] WS error from ${ip}:`, err.message));

  session.start();
});

server.listen(PORT, () => {
  console.log(`[lord] Legend of the Red Dragon running on port ${PORT}`);
  console.log(`[lord] Admin panel: http://localhost:${PORT}/admin.html`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Docker stop / Ctrl-C: flush any debounced player writes, close WS sessions, then exit.
let _shuttingDown = false;
function shutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.log(`[lord] ${signal} received — flushing and shutting down`);
  try { storage.flushSync(); } catch (e) { console.error('[lord] flush failed:', e.message); }
  for (const ws of wss.clients) { try { ws.close(); } catch (_) {} }
  server.close(() => process.exit(0));
  // Hard cap so we don't hang forever on a stuck connection.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
