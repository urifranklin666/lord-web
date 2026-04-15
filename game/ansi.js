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

module.exports = { cp437ToUtf8, loadArt };
