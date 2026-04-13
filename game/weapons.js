'use strict';

// Parse WEAPONS.DAT and ARMOR.DAT
// Record layout: 264 bytes each
//   offset 0:   1 byte  — Pascal string length
//   offset 1:   127 bytes — name data (padded with nulls)
//   offset 256: 4 bytes int32LE — price
//   offset 260: 4 bytes int32LE — stat (strength for weapons, defense for armor)

const fs   = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const REC  = 264;

function parseDat(file, statField) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  const items = [null]; // index 0 unused (weapons are 1-indexed)
  for (let i = 0; i < 15; i++) {
    const base  = i * REC;
    const len   = buf[base];
    const name  = buf.slice(base + 1, base + 1 + len).toString('latin1').trim();
    const price = buf.readInt32LE(base + 256);
    const stat  = buf.readInt32LE(base + 260);
    items.push({ name, price, [statField]: stat });
  }
  return items;
}

// Armour index 0 = no armour (free, 0 def)
function parseArmor(file) {
  const items = parseDat(file, 'defense');
  if (!items) return null;
  items[0] = { name: 'nothing', price: 0, defense: 0 };
  return items;
}

let _weapons = null;
let _armour  = null;

function getWeapons() {
  if (!_weapons) {
    _weapons = parseDat('WEAPONS.DAT', 'strength');
    if (!_weapons) {
      // Fallback to hardcoded constants
      _weapons = require('./constants').WEAPONS;
    }
  }
  return _weapons;
}

function getArmour() {
  if (!_armour) {
    _armour = parseArmor('ARMOR.DAT');
    if (!_armour) {
      _armour = require('./constants').ARMOUR;
    }
  }
  return _armour;
}

module.exports = { getWeapons, getArmour };
