'use strict';

const fs   = require('fs');
const path = require('path');
const { colorize } = require('./text');

const DATA = path.join(__dirname, '..', 'data');

// Trainer names per level (1-indexed, levels 1-11)
const TRAINER_NAMES = [
  null,
  'Halder',
  'Barak',
  'Aragorn',
  'Olodrin',
  'Sandtiger',
  'Sparkhawk',
  'Atsuko Sensei',
  'Aladdin Sensei',
  'Prince Caspian',
  'Gandalf',
  'Turgon',
];

let _sections = null;

function loadTrainerText() {
  if (_sections) return _sections;
  const p = path.join(DATA, 'TRAINTXT.DAT');
  if (!fs.existsSync(p)) { _sections = {}; return _sections; }

  _sections = {};
  let current = null;
  const lines = fs.readFileSync(p, 'latin1').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^@#(\w+)/);
    if (m) {
      current = m[1].toUpperCase();
      _sections[current] = [];
    } else if (current) {
      _sections[current].push(line);
    }
  }
  return _sections;
}

/**
 * Get the trainer name for a given player level (1-11).
 * Level 12 has no trainer — the dragon awaits.
 */
function getTrainerName(level) {
  return TRAINER_NAMES[Math.min(level, 11)] || 'Turgon';
}

/**
 * Get the trainer's dialogue for a given level and gender.
 * Returns ANSI-colorized string.
 */
function getTrainerDialogue(level, sex) {
  const sections = loadTrainerText();
  const genderKey = sex === 5 ? 'FEMALE' : 'MALE';
  const key = `LEVEL${Math.min(level, 11)}${genderKey}`;
  const lines = sections[key];
  if (!lines || lines.length === 0) return null;
  return colorize(lines.join('\r\n'));
}

/**
 * Get trainer challenge text (when you enter the training hall).
 * Level = player's CURRENT level (trainer to beat).
 */
function getTrainerIntro(level, sex) {
  return getTrainerDialogue(level, sex);
}

module.exports = { TRAINER_NAMES, getTrainerName, getTrainerDialogue, getTrainerIntro };
