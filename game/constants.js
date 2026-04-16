'use strict';

// ── Weapon table ──────────────────────────────────────────────────────────────
const WEAPONS = [
  null, // index 0 unused
  { name: 'Stick',         price:       200, strength:    5 },
  { name: 'Dagger',        price:      1000, strength:   10 },
  { name: 'Short Sword',   price:      3000, strength:   20 },
  { name: 'Long Sword',    price:     10000, strength:   30 },
  { name: 'Huge Axe',      price:     30000, strength:   40 },
  { name: 'Bone Cruncher', price:    100000, strength:   60 },
  { name: 'Twin Swords',   price:    150000, strength:   80 },
  { name: 'Power Axe',     price:    200000, strength:  120 },
  { name: "Able's Sword",  price:    400000, strength:  180 },
  { name: "Wan's Weapon",  price:   1000000, strength:  250 },
  { name: 'Spear Of Gold', price:   4000000, strength:  350 },
  { name: 'Crystal Shard', price:  10000000, strength:  500 },
  { name: "Niras's Teeth", price:  40000000, strength:  800 },
  { name: 'Blood Sword',   price: 100000000, strength: 1200 },
  { name: 'Death Sword',   price: 400000000, strength: 1800 },
];

// ── Armour table ──────────────────────────────────────────────────────────────
const ARMOUR = [
  { name: 'nothing',           price:         0, defense:    0 },
  { name: 'Coat',              price:       200, defense:    1 },
  { name: 'Heavy Coat',        price:      1000, defense:    3 },
  { name: 'Leather Vest',      price:      3000, defense:   10 },
  { name: 'Bronze Armour',     price:     10000, defense:   15 },
  { name: 'Iron Armour',       price:     30000, defense:   25 },
  { name: 'Graphite Armour',   price:    100000, defense:   35 },
  { name: "Erdrick's Armour",  price:    150000, defense:   50 },
  { name: 'Armour Of Death',   price:    200000, defense:   75 },
  { name: "Able's Armour",     price:    400000, defense:  100 },
  { name: 'Full Body Armour',  price:   1000000, defense:  150 },
  { name: 'Blood Armour',      price:   4000000, defense:  225 },
  { name: 'Magic Protection',  price:  10000000, defense:  300 },
  { name: "Belar's Mail",      price:  40000000, defense:  400 },
  { name: 'Golden Armour',     price: 100000000, defense:  600 },
  { name: 'Armour Of Lore',    price: 400000000, defense: 1000 },
];

// ── Character classes ─────────────────────────────────────────────────────────
const CLASSES = {
  1: { name: 'Death Knight', skillName: 'Deadly Strike',    skillDesc: 'Deals massive damage at the cost of HP' },
  2: { name: 'Mystical',     skillName: 'Magic Blast',      skillDesc: 'Bypasses armour for guaranteed damage' },
  3: { name: 'Thief',        skillName: 'Backstab',         skillDesc: 'Steal gold from enemy on kill' },
};

// ── Starting stats by class ───────────────────────────────────────────────────
const CLASS_START = {
  1: { strength: 30, def: 0, hp: 60,  gold: 200,  gem: 0,  charm: 10 }, // DK: more HP to survive early hits
  2: { strength: 20, def: 0, hp: 45,  gold: 150,  gem: 5,  charm: 15 }, // Mage: gem heals compensate
  3: { strength: 25, def: 0, hp: 50,  gold: 300,  gem: 0,  charm: 12 }, // Thief: flee bonus helps survivability
};

// ── Level thresholds (exp required to REACH that level) ──────────────────────
const LEVEL_EXP = [
  0,       // level 1  — starting
  100,     // level 2
  400,     // level 3
  1200,    // level 4
  3500,    // level 5
  9000,    // level 6
  22000,   // level 7
  55000,   // level 8
  130000,  // level 9
  300000,  // level 10
  700000,  // level 11
  1500000, // level 12
];

// ── Daily fight limits ────────────────────────────────────────────────────────
const BASE_FOREST_FIGHTS = 10;
const BASE_PVP_FIGHTS    = 5;

// ── Gem healing ───────────────────────────────────────────────────────────────
const GEM_HEAL = 10; // HP restored per gem

// ── Inn cost ──────────────────────────────────────────────────────────────────
const INN_COST = 15; // gold per night

// ── Healer rates ──────────────────────────────────────────────────────────────
const HEALER_RATE = 3; // gold per HP

// ── Max players ───────────────────────────────────────────────────────────────
const MAX_PLAYERS = 150;

// ── Dragon (end-game boss) ────────────────────────────────────────────────────
const DRAGON = {
  name:     'The Red Dragon',
  strength: 2000,
  hp:       1000,
  gold:     0,
  exp:      0,
};

// ── Violet (daily romance NPC) ────────────────────────────────────────────────
const VIOLET_CHARM_BONUS = 1;

// ── Seth's master (level-up trainer) ─────────────────────────────────────────
const MASTER_STAT_GAIN = {
  1: { strength:  8, hp: 25 }, // DK: trimmed slightly — still strongest raw stats
  2: { strength:  8, hp: 22 }, // Mage: matched DK STR gain — Magic Blast and gems compensate lower HP
  3: { strength:  9, hp: 26 }, // Thief: slight STR edge over Mage — Backstab and flee bonus add value
};

module.exports = {
  WEAPONS,
  ARMOUR,
  CLASSES,
  CLASS_START,
  LEVEL_EXP,
  BASE_FOREST_FIGHTS,
  BASE_PVP_FIGHTS,
  GEM_HEAL,
  INN_COST,
  HEALER_RATE,
  MAX_PLAYERS,
  DRAGON,
  VIOLET_CHARM_BONUS,
  MASTER_STAT_GAIN,
};
