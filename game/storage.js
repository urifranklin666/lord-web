'use strict';

const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const DATA_DIR   = path.join(__dirname, '..', 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const GAMESTATE_FILE = path.join(DATA_DIR, 'gamestate.json');

const SALT_ROUNDS = 10;

// ── In-memory cache ───────────────────────────────────────────────────────────
let _players   = null;
let _gamestate = null;
let _dirty     = false;
let _saveTimer = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Game state ────────────────────────────────────────────────────────────────
function loadGameState() {
  if (_gamestate) return _gamestate;
  ensureDataDir();
  if (fs.existsSync(GAMESTATE_FILE)) {
    _gamestate = JSON.parse(fs.readFileSync(GAMESTATE_FILE, 'utf8'));
  } else {
    _gamestate = {
      currentDay:    1,
      championName:  'No Winner',
      championDays:  0,
      lastReset:     new Date().toISOString().split('T')[0], // YYYY-MM-DD
    };
    saveGameStateSync();
  }
  return _gamestate;
}

function saveGameStateSync() {
  ensureDataDir();
  fs.writeFileSync(GAMESTATE_FILE, JSON.stringify(_gamestate, null, 2));
}

function getGameState() {
  return loadGameState();
}

function updateGameState(patch) {
  const gs = loadGameState();
  Object.assign(gs, patch);
  saveGameStateSync();
}

// ── Persistent settings ───────────────────────────────────────────────────────
const SETTING_DEFAULTS = {
  forestFights: 50,
  pvpFights:    5,
  innCost:      15,
  healerRate:   3,
  gemHeal:      10,
};

function getSetting(key) {
  const gs = loadGameState();
  if (!gs.settings) gs.settings = {};
  return gs.settings[key] !== undefined ? gs.settings[key] : SETTING_DEFAULTS[key];
}

function setSettings(patch) {
  const gs = loadGameState();
  if (!gs.settings) gs.settings = {};
  Object.assign(gs.settings, patch);
  saveGameStateSync();
}

function getAllSettings() {
  const gs = loadGameState();
  return Object.assign({}, SETTING_DEFAULTS, gs.settings || {});
}

// ── Today's "day number" — resets when calendar date changes ─────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function checkNewDay() {
  const gs = loadGameState();
  const today = todayStr();
  if (gs.lastReset !== today) {
    gs.lastReset = today;
    gs.currentDay++;
    // Reset dragon each new day
    gs.dragon = null;
    saveGameStateSync();
    return true; // new day happened
  }
  return false;
}

// ── Dragon (shared boss state) ────────────────────────────────────────────────
const DRAGON_DEFAULT_HP = 25000; // shared across all players; resets daily

function getDragonState() {
  const gs = loadGameState();
  if (!gs.dragon) {
    gs.dragon = { hp: DRAGON_DEFAULT_HP, maxHp: DRAGON_DEFAULT_HP };
    saveGameStateSync();
  }
  return gs.dragon;
}

function damageDragon(amount) {
  const gs = loadGameState();
  if (!gs.dragon) gs.dragon = { hp: DRAGON_DEFAULT_HP, maxHp: DRAGON_DEFAULT_HP };
  gs.dragon.hp = Math.max(0, gs.dragon.hp - amount);
  saveGameStateSync();
  return gs.dragon;
}

function resetDragon() {
  const gs = loadGameState();
  gs.dragon = { hp: DRAGON_DEFAULT_HP, maxHp: DRAGON_DEFAULT_HP };
  saveGameStateSync();
}

// ── Mail system ───────────────────────────────────────────────────────────────
function sendMail(toPlayerId, mail) {
  const players = loadPlayers();
  const p = players.find(pl => pl.id === toPlayerId);
  if (!p) return;
  if (!p.mailbox) p.mailbox = [];
  p.mailbox.push({ ...mail, sentAt: new Date().toISOString() });
  markDirty();
}

function getMail(playerId) {
  const players = loadPlayers();
  const p = players.find(pl => pl.id === playerId);
  if (!p || !p.mailbox || !p.mailbox.length) return [];
  return p.mailbox;
}

function clearMail(playerId) {
  const players = loadPlayers();
  const p = players.find(pl => pl.id === playerId);
  if (!p) return;
  p.mailbox = [];
  markDirty();
}

// ── Players ───────────────────────────────────────────────────────────────────
function loadPlayers() {
  if (Array.isArray(_players)) return _players;
  ensureDataDir();
  if (fs.existsSync(PLAYERS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
      _players = Array.isArray(parsed) ? parsed : [];
      if (!Array.isArray(parsed)) {
        console.error('[lord] players.json is not an array, resetting to empty list');
      }
    } catch (e) {
      const backup = PLAYERS_FILE + '.corrupt.' + Date.now();
      try { fs.copyFileSync(PLAYERS_FILE, backup); } catch (_) {}
      console.error('[lord] players.json corrupt, backed up to', backup, ':', e.message);
      _players = [];
    }
  } else {
    _players = [];
  }
  return _players;
}

function scheduleSave() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    if (_dirty) {
      fs.writeFileSync(PLAYERS_FILE, JSON.stringify(_players, null, 2));
      _dirty = false;
    }
  }, 500);
}

function savePlayers() {
  ensureDataDir();
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  fs.writeFileSync(PLAYERS_FILE, JSON.stringify(_players, null, 2));
  _dirty = false;
}

// Flush any pending debounced write — call from SIGTERM/SIGINT handlers.
function flushSync() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  if (_dirty && Array.isArray(_players)) {
    try { fs.writeFileSync(PLAYERS_FILE, JSON.stringify(_players, null, 2)); }
    catch (e) { console.error('[lord] flushSync failed:', e.message); }
    _dirty = false;
  }
}

function markDirty() {
  _dirty = true;
  scheduleSave();
}

// ── Player lookup ─────────────────────────────────────────────────────────────
function findByName(name) {
  const players = loadPlayers();
  const lower = name.toLowerCase();
  return players.find(p => p.name.toLowerCase() === lower) || null;
}

function findById(id) {
  const players = loadPlayers();
  return players.find(p => p.id === id) || null;
}

function getAll() {
  return loadPlayers();
}

function getLivePlayers() {
  return loadPlayers().filter(p => !p.dead);
}

// ── Player creation ───────────────────────────────────────────────────────────
const { CLASS_START, BASE_FOREST_FIGHTS, BASE_PVP_FIGHTS } = require('./constants');

function newPlayer(name, realName, passwordHash, sex, classNum) {
  const players = loadPlayers();
  const start = CLASS_START[classNum];
  const id = players.length > 0 ? players.reduce((max, p) => Math.max(max, p.id), 0) + 1 : 1;

  const player = {
    id,
    name,          // game handle
    realName,      // BBS/real name
    passwordHash,

    // ── Vitals ──
    hp:          start.hp,
    hpMax:       start.hp,
    strength:    start.strength,
    def:         start.def,
    charm:       start.charm,
    level:       1,
    exp:         0,
    gold:        start.gold,
    bank:        0,
    gem:         start.gem,

    // ── Equipment ──
    weaponNum:   1,
    weapon:      'Stick',
    armNum:      0,
    arm:         'nothing',

    // ── Class ──
    class:       classNum,
    sex,          // 0=male, 5=female
    extra:        0,  // 1=has horse

    // ── Daily counters ──
    fightsLeft:   BASE_FOREST_FIGHTS,
    humanLeft:    BASE_PVP_FIGHTS,
    lastDay:      todayStr(),
    v4:           false, // daily special done?
    inGameHour:   6,     // in-game clock (0-23); advances 1 per forest fight

    // ── Skills (per class, max 40) ──
    skillw:  0, skillm:  0, skillt:  0,
    levelw:  0, levelm:  0, levelt:  0,

    // ── Flags ──
    dead:        false,
    inn:         false,
    seenMaster:  false,
    seenDragon:  false,
    seenViolet:  false,
    seenBard:    false,
    hasAmulet:   false, // Amulet of Accuracy
    hasRing:     false, // Ring of Vitality (+15 Max HP)
    hasScroll:   false, // Scroll of Fortification (+3 DEF)

    // ── Social ──
    married:     -1,
    marriedTo:   -1,
    kids:        0,
    lays:        0,
    king:        0,     // times won game
    kills:       0,     // player kills

    // ── Timestamps ──
    createdAt:   new Date().toISOString(),
    lastPlayed:  new Date().toISOString(),
  };

  players.push(player);
  markDirty();
  return player;
}

// ── Password helpers ──────────────────────────────────────────────────────────
async function hashPassword(pw) {
  return bcrypt.hash(pw, SALT_ROUNDS);
}

async function checkPassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

// ── Player update ─────────────────────────────────────────────────────────────
function savePlayer(player) {
  player.lastPlayed = new Date().toISOString();
  markDirty();
}

// ── Shared daily-reset logic ──────────────────────────────────────────────────
function _doPlayerReset(player) {
  player.fightsLeft = getSetting('forestFights') + (player.extra ? 10 : 0);
  player.humanLeft  = getSetting('pvpFights');
  player.v4         = false;
  player.seenViolet = false;
  player.seenBard   = false;
  player.levelw     = player.skillw;
  player.levelm     = player.skillm;
  player.levelt     = player.skillt;
  if (player.inn) { player.hp = player.hpMax; player.inn = false; }
}

// ── In-game tick — advances in-game clock by 1 hour per forest fight ──────────
function advancePlayerTick(player) {
  const prev = player.inGameHour !== undefined ? player.inGameHour : 6;
  const next  = (prev + 1) % 24;
  player.inGameHour = next;
  const newDay = next < prev; // wrapped past midnight
  if (newDay) _doPlayerReset(player);
  markDirty();
  return { newDay, hour: next };
}

// ── Daily reset for a single player (calendar-based login check) ──────────────
function resetPlayerDay(player) {
  const today = todayStr();
  if (player.lastDay === today) return false; // already reset today

  _doPlayerReset(player);
  player.hasAmulet = player.hasAmulet || false; // persist across days
  player.lastDay   = today;
  player.inGameHour = player.inGameHour !== undefined ? player.inGameHour : 6;
  markDirty();
  return true;
}

// ── Bulletin board ────────────────────────────────────────────────────────────
const BULLETIN_MAX = 30;

function getBulletinBoard() {
  const gs = loadGameState();
  if (!gs.bulletin) gs.bulletin = [];
  return gs.bulletin;
}

function postBulletin(playerName, text) {
  const gs = loadGameState();
  if (!gs.bulletin) gs.bulletin = [];
  gs.bulletin.push({ author: playerName, text: text.slice(0, 78), day: gs.currentDay });
  if (gs.bulletin.length > BULLETIN_MAX) gs.bulletin = gs.bulletin.slice(-BULLETIN_MAX);
  saveGameStateSync();
}

module.exports = {
  getGameState,
  updateGameState,
  checkNewDay,
  todayStr,
  findByName,
  findById,
  getAll,
  getLivePlayers,
  newPlayer,
  hashPassword,
  checkPassword,
  savePlayer,
  resetPlayerDay,
  savePlayers,
  getSetting,
  setSettings,
  getAllSettings,
  SETTING_DEFAULTS,
  advancePlayerTick,
  getDragonState,
  damageDragon,
  resetDragon,
  DRAGON_DEFAULT_HP,
  sendMail,
  getMail,
  clearMail,
  getBulletinBoard,
  postBulletin,
  flushSync,
};
