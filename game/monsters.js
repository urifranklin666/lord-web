'use strict';

const fs   = require('fs');
const path = require('path');

// ── Parse LENEMY.DAT ──────────────────────────────────────────────────────────
// Pascal record layout for each monster:
//   name:       string[60]  → 61 bytes (1 length + 60 data)
//   strength:   longint     →  4 bytes
//   gold:       longint     →  4 bytes
//   weapon:     string[60]  → 61 bytes
//   exp_points: longint     →  4 bytes
//   hit_points: longint     →  4 bytes
//   death:      string[100] → 101 bytes
// Total per record: 61+4+4+61+4+4+101 = 239 bytes
// 11 monsters per level, up to 12 levels = up to 132 monsters

const RECORD_SIZE = 239;
const MONSTERS_PER_LEVEL = 11;

function readPascalString(buf, offset, maxLen) {
  const len = Math.min(buf[offset], maxLen);
  return buf.slice(offset + 1, offset + 1 + len).toString('latin1');
}

function readLongInt(buf, offset) {
  // Turbo Pascal longint: little-endian signed 32-bit
  return buf.readInt32LE(offset);
}

let _monsters = null;

function loadMonsters() {
  if (_monsters) return _monsters;

  const file = path.join(__dirname, '..', 'data', 'LENEMY.DAT');
  if (!fs.existsSync(file)) {
    _monsters = getDefaultMonsters();
    return _monsters;
  }

  const buf = fs.readFileSync(file);
  const count = Math.floor(buf.length / RECORD_SIZE);
  _monsters = [];

  for (let i = 0; i < count; i++) {
    const base = i * RECORD_SIZE;
    let off = base;

    const name = readPascalString(buf, off, 60); off += 61;
    const strength = readLongInt(buf, off); off += 4;
    const gold = readLongInt(buf, off); off += 4;
    const weapon = readPascalString(buf, off, 60); off += 61;
    const expPoints = readLongInt(buf, off); off += 4;
    const hitPoints = readLongInt(buf, off); off += 4;
    const death = readPascalString(buf, off, 100);

    if (name.trim().length === 0) continue;

    _monsters.push({
      index:     i,
      level:     Math.floor(i / MONSTERS_PER_LEVEL) + 1,
      name:      name.trim(),
      strength:  Math.max(1, strength),
      gold:      Math.max(0, gold),
      weapon:    weapon.trim() || 'claws',
      exp:       Math.max(1, expPoints),
      hp:        Math.max(1, hitPoints),
      deathMsg:  death.trim() || '',
    });
  }

  if (_monsters.length === 0) {
    _monsters = getDefaultMonsters();
  }

  return _monsters;
}

/**
 * Get all monsters for a given player level.
 */
function getMonstersForLevel(level) {
  const monsters = loadMonsters();
  const levelMonsters = monsters.filter(m => m.level === level);
  if (levelMonsters.length > 0) return levelMonsters;
  // Fallback: scale the level-1 monsters
  return monsters.filter(m => m.level === 1).map(m => ({
    ...m,
    level,
    strength: Math.floor(m.strength * Math.pow(1.5, level - 1)),
    hp:       Math.floor(m.hp       * Math.pow(1.5, level - 1)),
    gold:     Math.floor(m.gold     * Math.pow(2,   level - 1)),
    exp:      Math.floor(m.exp      * Math.pow(2,   level - 1)),
  }));
}

/**
 * Pick a random monster appropriate for the given player level.
 */
function randomMonster(playerLevel) {
  const pool = getMonstersForLevel(playerLevel);
  return { ...pool[Math.floor(Math.random() * pool.length)] };
}

// ── Fallback monsters if LENEMY.DAT parse fails ───────────────────────────────
function getDefaultMonsters() {
  return [
    { index:0, level:1, name:'Giant Rat',       strength:15, gold:20,   weapon:'teeth',    exp:15,   hp:20,  deathMsg:'The rat squeals and dies.' },
    { index:1, level:1, name:'Orc',             strength:20, gold:40,   weapon:'club',     exp:25,   hp:30,  deathMsg:'The orc falls with a crash.' },
    { index:2, level:1, name:'Goblin',          strength:18, gold:30,   weapon:'knife',    exp:20,   hp:25,  deathMsg:'The goblin shrieks as it dies.' },
    { index:3, level:1, name:'Dark Elf',        strength:25, gold:60,   weapon:'shortsword',exp:35,  hp:35,  deathMsg:'The dark elf crumbles to dust.' },
    { index:4, level:1, name:'Forest Troll',    strength:30, gold:80,   weapon:'fists',    exp:45,   hp:50,  deathMsg:'The troll topples with a tremendous crash.' },
    { index:5, level:2, name:'Giant Spider',    strength:40, gold:120,  weapon:'fangs',    exp:60,   hp:60,  deathMsg:'Spider guts everywhere.' },
    { index:6, level:2, name:'Werewolf',        strength:50, gold:180,  weapon:'claws',    exp:80,   hp:75,  deathMsg:'The werewolf howls and goes still.' },
    { index:7, level:2, name:'Vampire',         strength:60, gold:250,  weapon:'fangs',    exp:100,  hp:80,  deathMsg:'The vampire dissolves into mist.' },
    { index:8, level:3, name:'Evil Wizard',     strength:80, gold:400,  weapon:'magic',    exp:150,  hp:90,  deathMsg:'The wizard explodes in a shower of sparks.' },
    { index:9, level:3, name:'Giant',           strength:100,gold:600,  weapon:'boulder',  exp:200,  hp:150, deathMsg:'The giant shakes the ground as it falls.' },
    { index:10,level:4, name:'Dragon Spawn',    strength:150,gold:1000, weapon:'fire',     exp:350,  hp:200, deathMsg:'The spawn lets out a final roar.' },
  ];
}

module.exports = { loadMonsters, getMonstersForLevel, randomMonster };
