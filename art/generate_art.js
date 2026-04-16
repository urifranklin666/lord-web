'use strict';
/**
 * LORD-WEB Art Generator — deadplug.digital red/black BBS aesthetic
 *
 * Generates CP437-encoded binary .ans files and a combat_fx.js module.
 * Run once:  node art/generate_art.js
 *
 * CP437 bytes used for block/box chars (not available as ASCII):
 *   0xDB = █   0xDC = ▄   0xDF = ▀   0xDD = ▌   0xDE = ▐
 *   0xB0 = ░   0xB1 = ▒   0xB2 = ▓
 *   0xC9 = ╔   0xCD = ═   0xBB = ╗
 *   0xBA = ║   0xC8 = ╚   0xBC = ╝
 *   0xCC = ╠   0xB9 = ╣
 */

const fs   = require('fs');
const path = require('path');

// ── ANSI color constants (pure ASCII, safe in .ans) ───────────────────────────
const R   = '\x1b[0m';
const BR  = '\x1b[1;31m';   // bright red
const DR  = '\x1b[0;31m';   // dark red
const YL  = '\x1b[1;33m';   // yellow
const WH  = '\x1b[1;37m';   // bright white
const GR  = '\x1b[0;37m';   // gray
const DG  = '\x1b[1;30m';   // dark gray
const DGN = '\x1b[0;32m';   // dark green
const GN  = '\x1b[1;32m';   // bright green

// ── CP437 byte values ─────────────────────────────────────────────────────────
const BLK = 0xDB; // █  full block
const LHF = 0xDC; // ▄  lower half
const UHF = 0xDF; // ▀  upper half
const SH1 = 0xB0; // ░  light shade
const SH2 = 0xB1; // ▒  medium shade
const SH3 = 0xB2; // ▓  dark shade
const TL  = 0xC9; // ╔
const TR  = 0xBB; // ╗
const BLC = 0xC8; // ╚
const BRC = 0xBC; // ╝
const VL  = 0xBA; // ║
const HL  = 0xCD; // ═

// ── Buffer builder ────────────────────────────────────────────────────────────

/** Convert any mix of strings and byte arrays into a Buffer. */
function b(...parts) {
  const bufs = parts.map(p => {
    if (typeof p === 'string')  return Buffer.from(p, 'ascii');
    if (Array.isArray(p))       return Buffer.from(p);
    if (Buffer.isBuffer(p))     return p;
    throw new Error(`Unexpected part type: ${typeof p}`);
  });
  return Buffer.concat(bufs);
}

/** Repeat a byte n times → Array */
function rep(byte, n) {
  return Array(Math.max(0, n)).fill(byte);
}

/** Append CRLF to a Buffer */
function crlf(buf) {
  return Buffer.concat([buf, Buffer.from('\r\n', 'ascii')]);
}

/** One full row: content buffer + CRLF */
function row(...parts) {
  return crlf(b(...parts));
}

// ─────────────────────────────────────────────────────────────────────────────
// ART PIECE 1: TITLE SPLASH  →  title.ans
//
// Full-screen splash loaded at start() before login.
// 79 cols × ~24 lines. Replaces/supplements lordad.ans.
// Structure: double-box border, block-letter "LEGEND OF THE RED DRAGON"
// split into three stacked logo blocks (LEGEND / OF THE RED / DRAGON).
// ─────────────────────────────────────────────────────────────────────────────
function makeTitleSplash() {
  const W     = 79;
  const INNER = W - 2; // 77 chars inside ║ borders

  const out = [];

  // Clear screen
  out.push(b('\x1b[2J\x1b[H'));

  // ── Top border ──
  out.push(row(DR, [TL], rep(HL, INNER), [TR], R));

  // ── Empty padding ──
  const vpad = () => out.push(row(DR, [VL], ' '.repeat(INNER), [VL], R));
  vpad();

  // ── Block-letter LEGEND (6 lines, centered in 77) ──
  // Measured visible width: 51 chars. lpad = floor((77-51)/2) = 13
  const LEGEND = [
    '██╗     ███████╗ ██████╗ ███████╗███╗  ██╗██████╗ ',
    '██║     ██╔════╝██╔════╝ ██╔════╝████╗ ██║██╔══██╗',
    '██║     █████╗  ██║  ███╗█████╗  ██╔██╗██║██║  ██║',
    '██║     ██╔══╝  ██║   ██║██╔══╝  ██║╚██╗██║██║  ██║',
    '███████╗███████╗╚██████╔╝███████╗██║ ╚████║██████╔╝',
    '╚══════╝╚══════╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚═════╝ ',
  ];

  for (const line of LEGEND) {
    const vis  = line.length;
    const lpad = Math.floor((INNER - vis) / 2);
    const rpad = Math.max(0, INNER - vis - lpad);
    out.push(row(DR, [VL], BR, ' '.repeat(lpad), line, ' '.repeat(rpad), DR, [VL], R));
  }

  vpad();

  // ── Block-letter "OF THE" (6 lines, centered) ──
  // Measured: 40 chars. lpad = 18
  const OFTHE = [
    ' ██████╗ ███████╗  ████████╗██╗  ██╗███████╗',
    '██╔═══██╗██╔════╝     ██╔══╝██║  ██║██╔════╝',
    '██║   ██║█████╗       ██║   ███████║█████╗  ',
    '██║   ██║██╔══╝       ██║   ██╔══██║██╔══╝  ',
    '╚██████╔╝██║          ██║   ██║  ██║███████╗',
    ' ╚═════╝ ╚═╝          ╚═╝   ╚═╝  ╚═╝╚══════╝',
  ];

  for (const line of OFTHE) {
    const vis  = line.length;
    const lpad = Math.floor((INNER - vis) / 2);
    const rpad = Math.max(0, INNER - vis - lpad);
    out.push(row(DR, [VL], YL, ' '.repeat(lpad), line, ' '.repeat(rpad), DR, [VL], R));
  }

  vpad();

  // ── Block-letter "RED DRAGON" (6 lines, centered) ──
  // Measured: 51 chars. lpad = 13
  const REDDRAGON = [
    '██████╗ ███████╗██████╗     ██████╗ ██████╗  █████╗  ██████╗ ██████╗ ███╗',
    '██╔══██╗██╔════╝██╔══██╗    ██╔══██╗██╔══██╗██╔══██╗██╔════╝ ██╔══██╗████╗',
    '██████╔╝█████╗  ██║  ██║    ██║  ██║██████╔╝███████║██║  ███╗██║  ██║██╔██╗',
    '██╔══██╗██╔══╝  ██║  ██║    ██║  ██║██╔══██╗██╔══██║██║   ██║██║  ██║██║╚██╗',
    '██║  ██║███████╗██████╔╝    ██████╔╝██║  ██║██║  ██║╚██████╔╝██████╔╝██║ ╚███╗',
    '╚═╝  ╚═╝╚══════╝╚═════╝     ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚══╝',
  ];

  for (const line of REDDRAGON) {
    // Truncate to INNER if too wide
    const vis   = Math.min(line.length, INNER);
    const trunc = line.slice(0, vis);
    const rpad  = Math.max(0, INNER - vis);
    out.push(row(DR, [VL], BR, trunc, ' '.repeat(rpad), DR, [VL], R));
  }

  vpad();

  // ── Tagline ──
  const tag  = 'deadplug.digital  \u00b7\u00b7  Browser Edition  \u00b7\u00b7  v4.07';
  // \u00b7 is outside ASCII — use plain dashes instead
  const tagA = 'deadplug.digital  --  Browser Edition  --  v4.07';
  const tl   = tagA.length;
  const tp   = Math.floor((INNER - tl) / 2);
  const tr   = Math.max(0, INNER - tl - tp);
  out.push(row(DR, [VL], DG, ' '.repeat(tp), tagA, ' '.repeat(tr), DR, [VL], R));

  vpad();

  // ── Bottom border ──
  out.push(row(DR, [BLC], rep(HL, INNER), [BRC], R));

  // ── Any-key prompt ──
  const prompt = '  [Press any key to enter]';
  out.push(b(DG, prompt, R, '\r\n'));

  return Buffer.concat(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// ART PIECE 2: MAIN MENU HEADER  →  mainheader.ans
//
// Compact 4-line header art placed at the top of _renderMain().
// Loaded via getLordScreen('MAIN_HEADER') — add to LORDTXT.DAT or inject
// directly from session.js as loadArt('mainheader.ans').
// ─────────────────────────────────────────────────────────────────────────────
function makeMainHeader() {
  const W     = 79;
  const INNER = W - 2;
  const out   = [];

  // Shaded top strip with game title — exactly 79 visible chars
  // 7 shade left + 50 text + 7 shade right + padding = 79
  // ░░▒▒▓▓▓  LEGEND OF THE RED DRAGON  -- deadplug.digital --  ▓▓▓▒▒░░
  // shade left:  SH1*2 + SH2*2 + SH3*3 = 7
  // text:        50 chars
  // shade right: SH3*3 + SH2*2 + SH1*2 = 7
  //              7 + 50 + 7 = 64... need 79, so pad text and shading
  // Recalc: text = 50. Shade each side = floor(29/2)=14, ceil=15
  // 14 left + 50 text + 15 right = 79
  // Left: SH1*5 + SH2*4 + SH3*5 = 14  Right: SH3*5 + SH2*4 + SH1*6 = 15
  out.push(row(
    DR, rep(SH1, 5), rep(SH2, 4), rep(SH3, 5),
    BR, '  LEGEND OF THE RED DRAGON  ',
    DG, '-- deadplug.digital --',
    DR, rep(SH3, 5), rep(SH2, 4), rep(SH1, 6),
    R
  ));

  // Double-rule top border
  out.push(row(DR, [TL], rep(HL, INNER), [TR], R));

  // Flavor text line — centered inside box
  const flavor = "Seth Able's realm stretches before you, dark and vast.";
  const fvis   = flavor.length;
  const fl     = Math.floor((INNER - fvis) / 2);
  const fr     = Math.max(0, INNER - fvis - fl);
  out.push(row(DR, [VL], DG, ' '.repeat(fl), flavor, ' '.repeat(fr), DR, [VL], R));

  // Bottom border
  out.push(row(DR, [BLC], rep(HL, INNER), [BRC], R));

  return Buffer.concat(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// ART PIECE 3: DRAGON LAIR  →  dragonlair.ans
//
// Full-screen intro splash for the dragon's lair. Shown before _renderDragonLair().
// Replaces lairans.ans (or use alongside it). 20 lines × 79 wide.
// Structure: shading gradients top/bottom, ASCII dragon face centered, title band.
// ─────────────────────────────────────────────────────────────────────────────
function makeDragonLair() {
  const W   = 79;
  const out = [];

  out.push(b('\x1b[2J\x1b[H'));

  // Gradient header — 3 shading rows
  out.push(row(DR, rep(SH1, W), R));
  out.push(row(DR, rep(SH2, W), R));
  out.push(row(DR, rep(SH3, W), R));

  // Interior rows: '  ' + BLK + [73 printable] + BLK + '  '
  // Visible: 2 + 1 + 73 + 1 + 2 = 79
  function drRow(colCode, content) {
    // content must print as exactly 73 visible chars (color codes don't count)
    // Caller is responsible for padding. We just frame it.
    return row(DR, '  ', [BLK], colCode, content, DR, [BLK], '  ', R);
  }

  // Blank interior rows
  const blank = drRow(R, ' '.repeat(73));

  out.push(blank);

  // Dragon face ASCII art — each content string = 73 visible chars
  // Wing span lines
  out.push(drRow(BR, '              /\\                        /\\              '));
  out.push(drRow(BR, '             /  \\                      /  \\             '));
  out.push(drRow(BR, '         ___/   \\______________________/   \\___         '));
  // Eyes line — O eyes with color accents (color codes are zero printable width)
  out.push(drRow(DR, '        | ' + YL + 'O' + DR + '   /                    \\   ' + YL + 'O' + DR + ' |        '));
  // Snout
  out.push(drRow(DR, '        |      ' + BR + '/\\' + DR + '   ==========   ' + BR + '/\\' + DR + '      |        '));
  out.push(drRow(DR, '        |      ' + BR + '\\/' + DR + '   ( . . . . )   ' + BR + '\\/' + DR + '      |        '));
  // Jaw
  out.push(drRow(DR, '         \\______' + YL + '|_._._._._._.|' + DR + '______/          '));
  // Neck
  out.push(drRow(DR, '                ' + YL + '|           |' + DR + '                  '));

  // Mid divider — full shade bar
  out.push(row(DR, '  ', [BLK], rep(SH2, 73), [BLK], '  ', R));

  // Title band
  out.push(drRow(YL, '         ' + BR + '~~  ' + YL + 'T H E   R E D   D R A G O N' + BR + '  ~~' + YL + '         '));
  out.push(drRow(DG, '          He waits.  He watches.  He hungers.           '));

  // Bottom shade bar
  out.push(row(DR, '  ', [BLK], rep(SH2, 73), [BLK], '  ', R));

  out.push(blank);

  // Gradient footer — 3 shading rows
  out.push(row(DR, rep(SH3, W), R));
  out.push(row(DR, rep(SH2, W), R));
  out.push(row(DR, rep(SH1, W), R));

  return Buffer.concat(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// ART PIECE 4: FOREST ENTRANCE  →  forest.ans
//
// Dark forest header. 6 lines × 79 wide. Loaded via getLordScreen('FOREST')
// or can be injected as loadArt('forest.ans') in _enterForest().
// ─────────────────────────────────────────────────────────────────────────────
function makeForest() {
  const W   = 79;
  const out = [];

  out.push(b('\x1b[2J\x1b[H'));

  // Canopy row 1 — upper half-block treetops on dark background
  // Pattern: [shading gap] [UHF cluster] repeated across 79 chars
  out.push(row(
    DGN,
    rep(SH1, 3), [UHF, UHF, UHF, UHF],
    rep(SH1, 2), [UHF, UHF, UHF, UHF, UHF],
    rep(SH1, 2), [UHF, UHF, UHF],
    rep(SH1, 3), [UHF, UHF, UHF, UHF, UHF, UHF],
    rep(SH1, 2), [UHF, UHF, UHF, UHF],
    rep(SH1, 2), [UHF, UHF, UHF, UHF, UHF],
    rep(SH1, 2), [UHF, UHF, UHF],
    rep(SH1, 3), [UHF, UHF, UHF, UHF],
    rep(SH1, 2), [UHF, UHF, UHF, UHF, UHF],
    rep(SH1, 2), [UHF, UHF],
    R
  ));

  // Canopy row 2 — full block trunks + canopy bulk
  out.push(row(
    DGN,
    [BLK, BLK], rep(SH2, 2), [BLK, BLK, BLK],
    rep(SH1, 2), [BLK, BLK], rep(SH2, 2), [BLK, BLK, BLK, BLK],
    rep(SH1, 1), [BLK, BLK], rep(SH2, 1), [BLK, BLK],
    rep(SH1, 2), [BLK, BLK], rep(SH2, 2), [BLK, BLK, BLK, BLK, BLK],
    rep(SH1, 1), [BLK, BLK], rep(SH2, 2), [BLK, BLK, BLK],
    rep(SH1, 2), [BLK, BLK], rep(SH2, 1), [BLK, BLK, BLK, BLK],
    rep(SH1, 2), [BLK, BLK], rep(SH2, 2), [BLK, BLK],
    rep(SH1, 1), [BLK, BLK], rep(SH2, 2), [BLK],
    R
  ));

  // Title banner — shading background with centered title text
  const title = '  ~ THE DARK FOREST ~  ';
  const tpad  = Math.floor((W - title.length - 2) / 2);
  const trem  = W - title.length - tpad;
  out.push(row(
    DGN, rep(SH3, tpad),
    GN, title,
    DGN, rep(SH3, trem),
    R
  ));

  // Mood text line — dark gray, centered
  const mood = 'Shadows shift between the trees. Something watches.';
  const mpad = Math.floor((W - mood.length) / 2);
  const mrem = Math.max(0, W - mood.length - mpad);
  out.push(row(DG, ' '.repeat(mpad), mood, ' '.repeat(mrem), R));

  // Root/ground row — lower half-block stumps on shading
  out.push(row(
    DGN,
    rep(SH2, 3), [LHF, LHF, LHF],
    rep(SH2, 2), [LHF, LHF, LHF, LHF],
    rep(SH2, 2), [LHF, LHF, LHF],
    rep(SH2, 3), [LHF, LHF, LHF, LHF, LHF],
    rep(SH2, 2), [LHF, LHF, LHF],
    rep(SH2, 2), [LHF, LHF, LHF, LHF],
    rep(SH2, 2), [LHF, LHF, LHF],
    rep(SH2, 3), [LHF, LHF, LHF],
    rep(SH2, 2), [LHF, LHF, LHF, LHF],
    rep(SH2, 2), [LHF, LHF],
    R
  ));

  // Double-rule divider
  out.push(row(DR, [TL], rep(HL, W - 2), [TR], R));

  return Buffer.concat(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// ART PIECE 5: DEATH SCREEN  →  death.ans
//
// Skull + tombstone art. 14 lines × 79. Shown on _playerDeath().
// Inject in session.js: const deathArt = loadArt('death.ans'); if (deathArt) this.out(deathArt);
// ─────────────────────────────────────────────────────────────────────────────
function makeDeathScreen() {
  const W   = 79;
  const out = [];

  out.push(b('\x1b[2J\x1b[H'));

  // Red shading header
  out.push(row(BR, rep(SH3, W), R));
  out.push(row(BR, rep(SH2, W), R));

  // Skull + flanking tombstones — 7 content rows of exactly 79 visible chars
  // Layout (visible):
  //  [8 pad] [tombstone L: 14] [4 gap] [skull: 13] [4 gap] [tombstone R: 14] [8 pad]  = 65
  // Actually: 5 + 15 + 3 + 13 + 3 + 15 + 5 = 59 ... pad to 79
  // Simpler: just measure and pad each row to 79 exactly.

  const skullRows = [
    // col 1234567890123456789012345678901234567890123456789012345678901234567890123456789
    '   _________          .----.         _________                                ',
    '  |         |        /  ()  \\        |         |                               ',
    '  |  R.I.P. |       | (( )) |        |  R.I.P. |                               ',
    '  |_________|        \\  ..  /        |_________|                               ',
    '  |         |    ____| ____ |____    |         |                               ',
    '  |_________|   |    |      |    |   |_________|                               ',
    '...|_________....|____|______|____|....|_________|...............................',
  ];
  const skullColors = [DG, GR, GR, GR, WH, WH, DG];

  for (let i = 0; i < skullRows.length; i++) {
    const line = skullRows[i].padEnd(W).slice(0, W);
    out.push(row(skullColors[i], line, R));
  }

  // Death banner
  out.push(row(BR, rep(SH2, W), R));

  const died = '*** YOU HAVE DIED ***';
  const dp   = Math.floor((W - died.length) / 2);
  const dr2  = Math.max(0, W - died.length - dp);
  out.push(row(BR, ' '.repeat(dp), died, ' '.repeat(dr2), R));

  const sub  = 'Visit the Healer to be resurrected.';
  const sp   = Math.floor((W - sub.length) / 2);
  const sr   = Math.max(0, W - sub.length - sp);
  out.push(row(DG, ' '.repeat(sp), sub, ' '.repeat(sr), R));

  out.push(row(BR, rep(SH2, W), R));
  out.push(row(BR, rep(SH3, W), R));

  return Buffer.concat(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// ART PIECE 6: COMBAT FX MODULE  →  game/combat_fx.js
//
// Pure ANSI strings (no CP437 bytes) for combat event banners.
// Import in session.js: const fx = require('./combat_fx');
// ─────────────────────────────────────────────────────────────────────────────
function makeCombatFX() {
  return `'use strict';
/**
 * combat_fx.js — ANSI combat event banners for LORD-WEB
 * deadplug.digital red/black aesthetic
 *
 * Usage in session.js:
 *   const fx = require('./combat_fx');
 *   this.out(fx.criticalHit());
 *   this.out(fx.killingBlow(monster.name));
 */

const R  = '\\x1b[0m';
const BR = '\\x1b[1;31m';   // bright red
const DR = '\\x1b[0;31m';   // dark red
const YL = '\\x1b[1;33m';   // yellow
const WH = '\\x1b[1;37m';   // bright white
const DG = '\\x1b[1;30m';   // dark gray
const GN = '\\x1b[1;32m';   // bright green

/**
 * Critical hit banner — shown on max-roll player attacks.
 * 3 lines × ~23 wide, indented 2 spaces.
 */
function criticalHit() {
  return (
    DR  + '  \\u250c\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2510\\r\\n' +
    DR  + '  \\u2502 ' + BR + '** CRITICAL HIT! **  ' + DR + '\\u2502\\r\\n' +
    DR  + '  \\u2514\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2518' + R + '\\r\\n'
  );
}

/**
 * Miss banner — shown when attack roll fails completely.
 * 1 line, inline.
 */
function miss() {
  return DG + '  -- miss --' + R + '\\r\\n';
}

/**
 * Dodge banner — shown when dodge roll beats incoming attack.
 */
function dodge() {
  return YL + '  ~~ dodged ~~' + R + '\\r\\n';
}

/**
 * Killing blow — enemy defeated.
 * 1 bold line.
 */
function killingBlow(targetName) {
  return YL + '  *** KILLING BLOW -- ' + WH + targetName + YL + ' falls! ***' + R + '\\r\\n';
}

/**
 * Dragon roar — shown each combat round in the dragon fight.
 * 3 lines of atmospheric red text.
 */
function dragonRoar() {
  return (
    BR + '  ' + '~'.repeat(37) + '\\r\\n' +
    BR + '  The Red Dragon ROARS! The cavern shakes!\\r\\n' +
    BR + '  ' + '~'.repeat(37) + R + '\\r\\n'
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
  const top  = '  \\u2554' + '\\u2550'.repeat(inner) + '\\u2557';
  const mid  = '  \\u2551' + YL + line + DR + '\\u2551';
  const bot  = '  \\u255a' + '\\u2550'.repeat(inner) + '\\u255d';
  return DR + top + '\\r\\n' + DR + mid + '\\r\\n' + DR + bot + R + '\\r\\n';
}

module.exports = { criticalHit, miss, dodge, killingBlow, dragonRoar, levelUp };
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE FILES
// ─────────────────────────────────────────────────────────────────────────────
const ART_DIR  = path.resolve(__dirname);
const GAME_DIR = path.resolve(__dirname, '..', 'game');

const ansFiles = [
  { name: 'title.ans',       fn: makeTitleSplash  },
  { name: 'mainheader.ans',  fn: makeMainHeader   },
  { name: 'dragonlair.ans',  fn: makeDragonLair   },
  { name: 'forest.ans',      fn: makeForest       },
  { name: 'death.ans',       fn: makeDeathScreen  },
];

for (const { name, fn } of ansFiles) {
  const buf = fn();
  const dest = path.join(ART_DIR, name);
  fs.writeFileSync(dest, buf);
  console.log(`  wrote  ${dest}  (${buf.length} bytes)`);
}

const fxPath = path.join(GAME_DIR, 'combat_fx.js');
fs.writeFileSync(fxPath, makeCombatFX());
console.log(`  wrote  ${fxPath}`);

console.log('\nAll art generated.');
