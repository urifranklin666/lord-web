'use strict';

const fs   = require('fs');
const path = require('path');

// CP437 → Unicode for bytes 0x80–0xFF
// Indices map byte value minus 0x80
const CP437 = [
  // 0x80–0x8F
  'Ç','ü','é','â','ä','à','å','ç','ê','ë','è','ï','î','ì','Ä','Å',
  // 0x90–0x9F
  'É','æ','Æ','ô','ö','ò','û','ù','ÿ','Ö','Ü','¢','£','¥','₧','ƒ',
  // 0xA0–0xAF
  'á','í','ó','ú','ñ','Ñ','ª','º','¿','⌐','¬','½','¼','¡','«','»',
  // 0xB0–0xBF  (shading + box-drawing)
  '░','▒','▓','│','┤','╡','╢','╖','╕','╣','║','╗','╝','╜','╛','┐',
  // 0xC0–0xCF
  '└','┴','┬','├','─','┼','╞','╟','╚','╔','╩','╦','╠','═','╬','╧',
  // 0xD0–0xDF  (more box-drawing + block elements)
  '╨','╤','╥','╙','╘','╒','╓','╫','╪','┘','┌','█','▄','▌','▐','▀',
  // 0xE0–0xEF  (Greek / math)
  'α','ß','Γ','π','Σ','σ','µ','τ','Φ','Θ','Ω','δ','∞','φ','ε','∩',
  // 0xF0–0xFF
  '≡','±','≥','≤','⌠','⌡','÷','≈','°','·','·','√','ⁿ','²','■','\u00a0',
];

/**
 * Convert a Buffer (CP437-encoded ANSI art) to a UTF-8 string.
 * Strips the DOS EOF marker (0x1A) and any trailing SAUCE record.
 */
function cp437ToUtf8(buf) {
  // Strip SAUCE record: look for "SAUCE00" up to 128+5 bytes from the end
  let len = buf.length;
  const sauceOffset = buf.lastIndexOf(Buffer.from('SAUCE00'));
  if (sauceOffset !== -1 && sauceOffset >= len - 512) len = sauceOffset;

  const parts = [];
  for (let i = 0; i < len; i++) {
    const b = buf[i];
    if (b === 0x1a) break; // Ctrl-Z DOS EOF
    if (b < 0x80) {
      parts.push(String.fromCharCode(b));
    } else {
      parts.push(CP437[b - 0x80]);
    }
  }
  return parts.join('');
}

const ART_DIR = path.join(__dirname, '..', 'art');
const _cache  = {};

/**
 * Load a named .ans file from the art/ directory, converted to UTF-8.
 * Returns null if the file doesn't exist.
 * Results are cached in memory after first load.
 */
function loadArt(name) {
  if (_cache[name] !== undefined) return _cache[name];
  const filePath = path.join(ART_DIR, name);
  if (!fs.existsSync(filePath)) { _cache[name] = null; return null; }
  const buf = fs.readFileSync(filePath);
  _cache[name] = cp437ToUtf8(buf);
  return _cache[name];
}

// ── LORDTXT.DAT parser ───────────────────────────────────────────────────────

// LORD color-code character → ANSI escape sequence
// Format in the dat file: backtick + one character
const LORD_COLOR = {
  '0': '\x1b[30m',      // black
  '1': '\x1b[34m',      // dark blue
  '2': '\x1b[32m',      // dark green
  '3': '\x1b[36m',      // dark cyan
  '4': '\x1b[31m',      // dark red
  '5': '\x1b[35m',      // dark magenta
  '6': '\x1b[33m',      // brown
  '7': '\x1b[37m',      // light gray
  '8': '\x1b[1;30m',    // dark gray
  '9': '\x1b[1;34m',    // bright blue
  '!': '\x1b[1;32m',    // bright green
  '@': '\x1b[1;36m',    // bright cyan
  '#': '\x1b[1;31m',    // bright red
  '$': '\x1b[1;35m',    // bright magenta
  '%': '\x1b[1;33m',    // yellow
  '&': '\x1b[1;37m',    // bright white
  'c': '\x1b[40m\x1b[2J\x1b[H', // clear screen (black bg)
  '.': '\x1b[37m│',     // left border character
  'r': '\x1b[0m',       // reset
};

/**
 * Convert LORD backtick color codes to ANSI escape sequences.
 * Unknown codes (variable substitutions like `N, `Z, etc.) are dropped.
 */
function lordToAnsi(str) {
  return str.replace(/`(.)/g, (_, ch) => LORD_COLOR[ch] !== undefined ? LORD_COLOR[ch] : '');
}

const DAT_PATH = path.join(ART_DIR, 'LORDTXT.DAT');
let _lordScreens = null;

function _loadLordDat() {
  _lordScreens = new Map();
  if (!fs.existsSync(DAT_PATH)) return;

  const buf = fs.readFileSync(DAT_PATH);
  let i = 0;

  while (i < buf.length - 1) {
    if (buf[i] !== 0x40 || buf[i + 1] !== 0x23) { i++; continue; } // not @#

    // Read screen name up to CR/LF
    let nameEnd = i + 2;
    while (nameEnd < buf.length && buf[nameEnd] !== 0x0d && buf[nameEnd] !== 0x0a) nameEnd++;
    const name = buf.slice(i + 2, nameEnd).toString('ascii').trim().toUpperCase();

    // Skip the CR/LF after the marker line
    let start = nameEnd;
    while (start < buf.length && (buf[start] === 0x0d || buf[start] === 0x0a)) start++;

    // Find the next @# marker (start of next screen)
    let end = start;
    while (end < buf.length - 1) {
      if (buf[end] === 0x40 && buf[end + 1] === 0x23) break;
      end++;
    }

    // Decode CP437 bytes, then convert LORD color codes to ANSI
    const raw   = cp437ToUtf8(buf.slice(start, end));
    const hasOwnClear = raw.includes('`c') || raw.includes('\x1b[2J');
    const prefix = hasOwnClear ? '' : '\x1b[2J\x1b[H';
    _lordScreens.set(name, prefix + lordToAnsi(raw) + '\x1b[0m');

    i = end;
  }
}

/**
 * Return a named screen from LORDTXT.DAT as a ready-to-send ANSI+UTF-8 string.
 * Loads and parses the DAT file on first call; subsequent calls use the cache.
 * Returns null if the DAT file is missing or the screen name is not found.
 */
function getLordScreen(name) {
  if (!_lordScreens) _loadLordDat();
  return _lordScreens.get(name.toUpperCase()) || null;
}

module.exports = { cp437ToUtf8, loadArt, lordToAnsi, getLordScreen };
