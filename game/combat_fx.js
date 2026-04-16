'use strict';
/**
 * combat_fx.js — ANSI combat event banners for LORD-WEB
 * deadplug.digital red/black aesthetic
 *
 * Usage in session.js:
 *   const fx = require('./combat_fx');
 *   this.out(fx.criticalHit());
 *   this.out(fx.killingBlow(monster.name));
 */

const R  = '\x1b[0m';
const BR = '\x1b[1;31m';   // bright red
const DR = '\x1b[0;31m';   // dark red
const YL = '\x1b[1;33m';   // yellow
const WH = '\x1b[1;37m';   // bright white
const DG = '\x1b[1;30m';   // dark gray
const GN = '\x1b[1;32m';   // bright green

/**
 * Critical hit banner — shown on max-roll player attacks.
 * 3 lines × ~23 wide, indented 2 spaces.
 */
function criticalHit() {
  return (
    DR  + '  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\r\n' +
    DR  + '  \u2502 ' + BR + '** CRITICAL HIT! **  ' + DR + '\u2502\r\n' +
    DR  + '  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518' + R + '\r\n'
  );
}

/**
 * Miss banner — shown when attack roll fails completely.
 * 1 line, inline.
 */
function miss() {
  return DG + '  -- miss --' + R + '\r\n';
}

/**
 * Dodge banner — shown when dodge roll beats incoming attack.
 */
function dodge() {
  return YL + '  ~~ dodged ~~' + R + '\r\n';
}

/**
 * Killing blow — enemy defeated.
 * 1 bold line.
 */
function killingBlow(targetName) {
  return YL + '  *** KILLING BLOW -- ' + WH + targetName + YL + ' falls! ***' + R + '\r\n';
}

/**
 * Dragon roar — shown each combat round in the dragon fight.
 * 3 lines of atmospheric red text.
 */
function dragonRoar() {
  return (
    BR + '  ' + '~'.repeat(37) + '\r\n' +
    BR + '  The Red Dragon ROARS! The cavern shakes!\r\n' +
    BR + '  ' + '~'.repeat(37) + R + '\r\n'
  );
}

/**
 * Level-up banner — shown when the player levels up.
 * 3 lines with a yellow double-box frame.
 */
function levelUp(newLevel) {
  const lvl  = String(newLevel).padEnd(2);
  const line = '  LEVEL ' + lvl + ' ACHIEVED! ';
  const inner = line.length + 2; // 2 for border padding chars
  const top  = '  \u2554' + '\u2550'.repeat(inner) + '\u2557';
  const mid  = '  \u2551' + YL + line + DR + '\u2551';
  const bot  = '  \u255a' + '\u2550'.repeat(inner) + '\u255d';
  return DR + top + '\r\n' + DR + mid + '\r\n' + DR + bot + R + '\r\n';
}

module.exports = { criticalHit, miss, dodge, killingBlow, dragonRoar, levelUp };
