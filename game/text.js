'use strict';

// ── LORD color code → ANSI escape sequence ────────────────────────────────────
// LORD uses backtick + char: `1-`9, `0, `!-`%
// Maps to CGA colors 1-15 (black foreground `^ was removed)
const BACKTICK_MAP = {
  '1': '\x1b[0;34m',  // Dark Blue
  '2': '\x1b[0;32m',  // Dark Green
  '3': '\x1b[0;36m',  // Dark Cyan
  '4': '\x1b[0;31m',  // Dark Red
  '5': '\x1b[0;35m',  // Dark Magenta
  '6': '\x1b[0;33m',  // Brown
  '7': '\x1b[0;37m',  // Light Gray
  '8': '\x1b[1;30m',  // Dark Gray
  '9': '\x1b[1;34m',  // Light Blue
  '0': '\x1b[1;32m',  // Light Green  (color 10 in LORD's sequence)
  '!': '\x1b[1;36m',  // Light Cyan
  '@': '\x1b[1;31m',  // Light Red
  '#': '\x1b[1;35m',  // Light Magenta
  '$': '\x1b[1;33m',  // Yellow
  '%': '\x1b[1;37m',  // White (bright)
  '.': '\x1b[0;37m',  // Reset to light gray (used as newline/normal)
};

// ANSI shortcuts for our own output
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  red:     '\x1b[1;31m',
  green:   '\x1b[1;32m',
  yellow:  '\x1b[1;33m',
  blue:    '\x1b[1;34m',
  magenta: '\x1b[1;35m',
  cyan:    '\x1b[1;36m',
  white:   '\x1b[1;37m',
  dkred:   '\x1b[0;31m',
  dkgreen: '\x1b[0;32m',
  brown:   '\x1b[0;33m',
  dkblue:  '\x1b[0;34m',
  gray:    '\x1b[0;37m',
  dkgray:  '\x1b[1;30m',
  clrscr:  '\x1b[2J\x1b[H',
  clearln: '\x1b[2K\r',
};

/**
 * Convert LORD backtick color codes + `c (clear) to ANSI sequences.
 * Leaves existing ANSI escapes intact.
 */
function colorize(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '`') {
      const ch = text[i + 1];
      if (ch === 'c') {
        out += '\x1b[2J\x1b[H';  // `c = clear + home
        i += 2;
        continue;
      }
      const ansi = BACKTICK_MAP[ch];
      if (ansi) {
        out += ansi;
        i += 2;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

/**
 * Parse LORDTXT.DAT into a map of section_name → lines[].
 * Sections start with @#SECTIONNAME on their own line.
 * Returns raw text (still contains backtick codes).
 */
function parseLordTxt(buf) {
  const sections = {};
  const lines = buf.toString('latin1').split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const m = line.match(/^@#(\w+)/);
    if (m) {
      current = m[1].toUpperCase();
      sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  }
  return sections;
}

/**
 * Get a rendered section from parsed LORDTXT sections.
 * Returns ANSI-colorized string ready to write to terminal.
 */
function getSection(sections, name) {
  const key = name.toUpperCase();
  if (!sections[key]) return null;
  return colorize(sections[key].join('\r\n'));
}

/**
 * Parse GOODSAY.DAT or BADSAY.DAT — one message per line,
 * with `g = winner name, `e = loser name.
 */
function parseSayFile(buf) {
  return buf.toString('latin1')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

/**
 * Substitute `g and `e in a say-file line.
 */
function formatSay(template, winner, loser) {
  return colorize(
    template
      .replace(/`g/g, winner)
      .replace(/`e/g, loser)
  );
}

/**
 * Build a centered title bar like LORD's section headers.
 *   ─────────────── TITLE ───────────────
 */
function titleBar(title, width = 79) {
  const inner = ` ${title} `;
  const dashes = Math.max(0, width - inner.length);
  const left  = Math.floor(dashes / 2);
  const right = dashes - left;
  return C.dkblue + '─'.repeat(left) + C.cyan + inner + C.dkblue + '─'.repeat(right) + C.reset;
}

/**
 * Format a number with commas: 1234567 → "1,234,567"
 */
function commas(n) {
  return Math.floor(n).toLocaleString('en-US');
}

/**
 * Pad string to width, truncating if necessary.
 */
function pad(s, w, right = false) {
  s = String(s).slice(0, w);
  return right ? s.padStart(w) : s.padEnd(w);
}

/**
 * LORD-style prompt: colored arrow + text
 */
function prompt(text) {
  return C.dkblue + '`' + C.yellow + ' ' + text;
}

/**
 * Simple random integer [min, max] inclusive.
 */
function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
  C,
  colorize,
  parseLordTxt,
  getSection,
  parseSayFile,
  formatSay,
  titleBar,
  commas,
  pad,
  prompt,
  rnd,
};
