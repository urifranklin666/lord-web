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
    saveGameStateSync();
    return true; // new day happened
  }
  return false;
}

// ── Players ───────────────────────────────────────────────────────────────────
function loadPlayers() {
  if (_players) return _players;
  ensureDataDir();
  if (fs.existsSync(PLAYERS_FILE)) {
    _players = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
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
  fs.writeFileSync(PLAYERS_FILE, JSON.stringify(_players, null, 2));
  _dirty = false;
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
  const id = players.length > 0 ? Math.max(...players.map(p => p.id)) + 1 : 1;

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
    fightsLeft:  BASE_FOREST_FIGHTS,
    humanLeft:   BASE_PVP_FIGHTS,
    lastDay:     todayStr(),
    v4:          false, // daily special done?

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

// ── Daily reset for a single player ──────────────────────────────────────────
function resetPlayerDay(player) {
  const today = todayStr();
  if (player.lastDay === today) return false; // already reset

  player.fightsLeft = getSetting('forestFights') + (player.extra ? 10 : 0); // horse = +10
  player.humanLeft  = getSetting('pvpFights');
  player.v4         = false;
  player.seenViolet = false;
  player.seenBard   = false;
  player.hasAmulet  = player.hasAmulet || false; // persist across days

  // Restore skill uses
  player.levelw = player.skillw;
  player.levelm = player.skillm;
  player.levelt = player.skillt;

  // Inn healing
  if (player.inn) {
    player.hp = player.hpMax;
    player.inn = false;
  }

  player.lastDay = today;
  markDirty();
  return true;
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
};
