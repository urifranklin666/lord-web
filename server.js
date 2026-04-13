'use strict';

const express = require('express');
const http    = require('http');
const path    = require('path');
const { WebSocketServer } = require('ws');
const { GameSession } = require('./game/session');
const storage = require('./game/storage');
const { CLASSES } = require('./game/constants');

const PORT       = process.env.PORT       || 7682;
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Admin auth middleware ──────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Admin API ─────────────────────────────────────────────────────────────────

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
  const BOOL_FIELDS = new Set(['dead','inn','hasAmulet','seenMaster','seenDragon','seenViolet','seenBard','v4']);

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
const wss    = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[lord] Connection from ${ip}`);

  const wasNewDay = storage.checkNewDay();
  if (wasNewDay) console.log('[lord] New day — daily reset triggered.');

  const session = new GameSession((text) => {
    if (ws.readyState === ws.OPEN) ws.send(text);
  });

  ws.on('message', (data) => {
    const text = data.toString('utf8');
    if (text === '\x04') { ws.close(); return; }
    for (const ch of text) {
      try { session.onKey(ch); }
      catch (err) {
        console.error('[lord] Session error:', err);
        ws.send('\r\n\x1b[1;31mInternal error. Returning to menu.\x1b[0m\r\n');
        if (session.player) storage.savePlayer(session.player);
        session.state = 'main_menu';
        session._renderMain();
      }
    }
  });

  ws.on('close', () => {
    console.log(`[lord] ${ip} disconnected`);
    if (session.player) storage.savePlayer(session.player);
  });

  ws.on('error', (err) => console.error(`[lord] WS error from ${ip}:`, err.message));

  session.start();
});

server.listen(PORT, () => {
  console.log(`[lord] Legend of the Red Dragon running on port ${PORT}`);
  console.log(`[lord] Admin panel: http://localhost:${PORT}/admin.html`);
});
