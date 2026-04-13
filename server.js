'use strict';

const express = require('express');
const http    = require('http');
const path    = require('path');
const { WebSocketServer } = require('ws');
const { GameSession } = require('./game/session');
const storage = require('./game/storage');

const PORT = process.env.PORT || 7682;

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Health check for Docker
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── HTTP + WebSocket server ───────────────────────────────────────────────────
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[lord] Connection from ${ip}`);

  // Check for new day globally
  const wasNewDay = storage.checkNewDay();
  if (wasNewDay) {
    console.log('[lord] New day — daily reset triggered.');
  }

  const session = new GameSession((text) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(text);
    }
  });

  ws.on('message', (data) => {
    const text = data.toString('utf8');
    // EOT from client = disconnect
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

  ws.on('error', (err) => {
    console.error(`[lord] WS error from ${ip}:`, err.message);
  });

  // Start the game session
  session.start();
});

server.listen(PORT, () => {
  console.log(`[lord] Legend of the Red Dragon running on port ${PORT}`);
  console.log(`[lord] Open http://localhost:${PORT} to play`);
});
