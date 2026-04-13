'use strict';

const fs   = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');

function loadLines(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'latin1')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

let _female = null;
let _male   = null;

function getLines(sex) {
  if (sex === 5) {
    if (!_female) _female = loadLines('FLOOKS.DAT');
    return _female;
  }
  if (!_male) _male = loadLines('MLOOKS.DAT');
  return _male;
}

/**
 * Get the appearance description for a player based on charm score.
 * Charm 0 → ugliest line, Charm 100+ → prettiest line.
 */
function getAppearance(player) {
  const lines = getLines(player.sex);
  if (!lines.length) return 'looks unremarkable.';
  const clampedCharm = Math.max(0, Math.min(player.charm, 100));
  const idx = Math.min(Math.floor((clampedCharm / 100) * lines.length), lines.length - 1);
  return lines[idx];
}

/**
 * Full sentence: "<name> <description>"
 */
function describePlayer(player) {
  return `${player.name} ${getAppearance(player)}`;
}

module.exports = { getAppearance, describePlayer };
