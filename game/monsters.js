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
    // Level 1
    { index:0,  level:1,  name:'Giant Rat',          strength:15,    gold:20,     weapon:'teeth',      exp:15,     hp:20,   deathMsg:'The rat squeals and dies.' },
    { index:1,  level:1,  name:'Orc',                strength:20,    gold:40,     weapon:'club',       exp:25,     hp:30,   deathMsg:'The orc falls with a crash.' },
    { index:2,  level:1,  name:'Goblin',             strength:18,    gold:30,     weapon:'knife',      exp:20,     hp:25,   deathMsg:'The goblin shrieks as it dies.' },
    // Level 2
    { index:3,  level:2,  name:'Dark Elf',           strength:35,    gold:100,    weapon:'shortsword', exp:60,     hp:55,   deathMsg:'The dark elf crumbles to dust.' },
    { index:4,  level:2,  name:'Forest Troll',       strength:45,    gold:140,    weapon:'fists',      exp:75,     hp:70,   deathMsg:'The troll topples with a tremendous crash.' },
    { index:5,  level:2,  name:'Giant Spider',       strength:40,    gold:120,    weapon:'fangs',      exp:65,     hp:60,   deathMsg:'Spider guts everywhere.' },
    // Level 3
    { index:6,  level:3,  name:'Werewolf',           strength:80,    gold:350,    weapon:'claws',      exp:160,    hp:120,  deathMsg:'The werewolf howls and goes still.' },
    { index:7,  level:3,  name:'Vampire',            strength:90,    gold:450,    weapon:'fangs',      exp:180,    hp:130,  deathMsg:'The vampire dissolves into mist.' },
    { index:8,  level:3,  name:'Lizard Man',         strength:75,    gold:300,    weapon:'spear',      exp:140,    hp:110,  deathMsg:'The lizard man hisses its last breath.' },
    // Level 4
    { index:9,  level:4,  name:'Evil Wizard',        strength:150,   gold:900,    weapon:'magic staff',exp:350,    hp:160,  deathMsg:'The wizard explodes in a shower of sparks.' },
    { index:10, level:4,  name:'Stone Giant',        strength:180,   gold:1100,   weapon:'boulder',    exp:400,    hp:250,  deathMsg:'The giant shakes the ground as it falls.' },
    { index:11, level:4,  name:'Ogre Chief',         strength:160,   gold:950,    weapon:'war club',   exp:370,    hp:220,  deathMsg:'The ogre chief crashes to the earth.' },
    // Level 5
    { index:12, level:5,  name:'Dragon Spawn',       strength:280,   gold:2500,   weapon:'fire breath',exp:700,    hp:380,  deathMsg:'The spawn lets out a final roar.' },
    { index:13, level:5,  name:'Death Knight Ghoul', strength:300,   gold:2800,   weapon:'cursed blade',exp:750,   hp:350,  deathMsg:'The ghoul crumbles into ash.' },
    { index:14, level:5,  name:'Wraith',             strength:260,   gold:2200,   weapon:'spectral claw',exp:650,  hp:320,  deathMsg:'The wraith wails and fades.' },
    // Level 6
    { index:15, level:6,  name:'Fire Elemental',     strength:500,   gold:6000,   weapon:'flames',     exp:1500,   hp:550,  deathMsg:'The elemental collapses into embers.' },
    { index:16, level:6,  name:'Lesser Demon',       strength:520,   gold:6500,   weapon:'hellfire',   exp:1600,   hp:580,  deathMsg:'The demon shrieks and returns to the pit.' },
    { index:17, level:6,  name:'War Troll',          strength:480,   gold:5500,   weapon:'iron maul',  exp:1400,   hp:600,  deathMsg:'The troll topples with a mighty crash.' },
    // Level 7
    { index:18, level:7,  name:'Shadow Assassin',    strength:850,   gold:15000,  weapon:'poison blade',exp:3500,  hp:800,  deathMsg:'The assassin dissolves into shadow.' },
    { index:19, level:7,  name:'Bone Golem',         strength:900,   gold:16000,  weapon:'bone fist',  exp:3800,   hp:950,  deathMsg:'The golem shatters into dust.' },
    { index:20, level:7,  name:'Chaos Warrior',      strength:820,   gold:14000,  weapon:'chaos blade',exp:3300,   hp:850,  deathMsg:'The warrior falls screaming into chaos.' },
    // Level 8
    { index:21, level:8,  name:'Frost Giant',        strength:1400,  gold:40000,  weapon:'ice axe',    exp:8000,   hp:1400, deathMsg:'The giant freezes solid and shatters.' },
    { index:22, level:8,  name:'Greater Vampire',    strength:1500,  gold:45000,  weapon:'drain touch', exp:8500,  hp:1200, deathMsg:'The vampire explodes in a burst of dark energy.' },
    { index:23, level:8,  name:'Death Mage',         strength:1350,  gold:38000,  weapon:'death spell', exp:7800,  hp:1000, deathMsg:'The mage implodes in a flash of dark light.' },
    // Level 9
    { index:24, level:9,  name:'Elder Dragon',       strength:2200,  gold:110000, weapon:'dragon fire', exp:20000, hp:2000, deathMsg:'The elder dragon crashes to the earth, shaking the ground.' },
    { index:25, level:9,  name:'Demon Lord',         strength:2400,  gold:120000, weapon:'demon blade', exp:22000, hp:1900, deathMsg:'The demon lord screams and is banished.' },
    { index:26, level:9,  name:'Arch Lich',          strength:2100,  gold:100000, weapon:'necromancy',  exp:19000, hp:1700, deathMsg:'The lich crumbles to ancient dust.' },
    // Level 10
    { index:27, level:10, name:"Torak's Son",        strength:3500,  gold:280000, weapon:'dark sword',  exp:50000, hp:3000, deathMsg:"Torak's son falls with a thunderous crash." },
    { index:28, level:10, name:'The Grimest Reaper', strength:3800,  gold:310000, weapon:'scythe',      exp:55000, hp:2800, deathMsg:'The Reaper dissolves into darkness.' },
    { index:29, level:10, name:'Adult Gold Dragon',  strength:4000,  gold:350000, weapon:'gold breath', exp:60000, hp:3500, deathMsg:'The gold dragon crashes down, its scales dimming.' },
    // Level 11
    { index:30, level:11, name:'Shogun Warrior',     strength:6000,  gold:700000, weapon:'katana',      exp:120000,hp:5000, deathMsg:'The shogun falls with an honorable last breath.' },
    { index:31, level:11, name:'Mountain',           strength:6500,  gold:750000, weapon:'avalanche',   exp:130000,hp:6000, deathMsg:'The Mountain crumbles into rubble.' },
    { index:32, level:11, name:'Cyclops Warrior',    strength:5800,  gold:680000, weapon:'club',        exp:115000,hp:5500, deathMsg:'The cyclops eye goes dark as it falls.' },
    // Level 12
    { index:33, level:12, name:'Corinthian Giant',   strength:10000, gold:1800000,weapon:'titan fist',  exp:300000,hp:9000, deathMsg:'The giant falls, shaking the very earth.' },
    { index:34, level:12, name:'Black Warlock',      strength:9500,  gold:1600000,weapon:'void magic',  exp:280000,hp:7500, deathMsg:'The warlock implodes, leaving only silence.' },
    { index:35, level:12, name:'Humongous Black Wyre',strength:11000,gold:2000000,weapon:'black fire',  exp:350000,hp:10000,deathMsg:'The wyre lets out a final thunderous roar and goes still.' },
  ];
}

module.exports = { loadMonsters, getMonstersForLevel, randomMonster };
