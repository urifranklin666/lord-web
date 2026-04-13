'use strict';

// Forest random events, ported from EVENTS.LDY / LORD.LDY
// Each event function receives (player, out) where out(text) sends to terminal.
// Returns { changed: bool, endFight: bool } — endFight=true costs a fight slot.

const { C, rnd, commas } = require('./text');
const storage = require('./storage');

const GEM_HEAL = 10;

// ── Individual events ─────────────────────────────────────────────────────────

function eventGem(player, out) {
  player.gem++;
  out(C.cyan + `  You find a glittering gem lying in the path!` + C.reset);
  out(`\r\n  ${C.white}+1 Gem${C.gray} (total: ${player.gem})` + C.reset);
  storage.savePlayer(player);
  return { changed: true, endFight: false };
}

function eventBagOfGold(player, out) {
  const gold = player.level * player.level * rnd(15, 25);
  player.gold += gold;
  out(C.yellow + `  You stumble upon a tattered bag of gold!` + C.reset);
  out(`\r\n  ${C.yellow}+${commas(gold)} gold` + C.reset);
  storage.savePlayer(player);
  return { changed: true, endFight: false };
}

function eventHammerstone(player, out) {
  player.strength++;
  out(C.white + `  You find a mystical Hammer Stone!` + C.reset);
  out(`\r\n  ${C.green}+1 Strength${C.gray} (now ${player.strength})` + C.reset);
  storage.savePlayer(player);
  return { changed: true, endFight: false };
}

function eventMerryMen(player, out) {
  if (player.hp >= player.hpMax) {
    out(C.green + `  The Merry Men appear and offer ale — but you are already at full health.` + C.reset);
    return { changed: false, endFight: false };
  }
  const healed = player.hpMax - player.hp;
  player.hp = player.hpMax;
  out(C.green + `  The Merry Men burst from the trees! "Drink with us, friend!"` + C.reset);
  out(`\r\n  ${C.green}Fully healed! +${healed} HP` + C.reset);
  storage.savePlayer(player);
  return { changed: true, endFight: false };
}

function eventOldMan(player, out) {
  if (player.fightsLeft <= 0) {
    out(C.gray + `  An old man waves from the roadside, but you have no time today.` + C.reset);
    return { changed: false, endFight: false };
  }
  const gold = player.level * rnd(100, 300);
  player.charm++;
  player.gold  += gold;
  player.fightsLeft--;
  out(C.brown + `  A frail old man stumbles from the forest.` + C.reset);
  out(`\r\n  ${C.gray}"Please, help me find my way home!"${C.reset}`);
  out(`\r\n  ${C.green}You escort him safely. +1 Charm, +${commas(gold)} gold${C.gray} (-1 forest fight)` + C.reset);
  storage.savePlayer(player);
  return { changed: true, endFight: false };
}

function eventHag(player, out) {
  // Hag offers gem trade: each gem = GEM_HEAL HP or, if full health, +1 max HP
  if (player.gem <= 0) {
    out(C.gray + `  A hunched hag beckons. "Gems for healing!" — but you have none.` + C.reset);
    return { changed: false, endFight: false };
  }
  out(C.dkgray + `  A wizened hag emerges from the shadows.` + C.reset);
  out(`\r\n  ${C.gray}"One gem and I heal your wounds — or boost your limits if you're well!"` + C.reset);
  player.gem--;
  if (player.hp < player.hpMax) {
    const healed = Math.min(GEM_HEAL, player.hpMax - player.hp);
    player.hp += healed;
    out(`\r\n  ${C.green}The hag heals you for ${healed} HP. (-1 gem)` + C.reset);
  } else {
    player.hpMax++;
    player.hp++;
    out(`\r\n  ${C.green}The hag expands your life force. +1 Max HP! (-1 gem)` + C.reset);
  }
  storage.savePlayer(player);
  return { changed: true, endFight: false };
}

function eventHorse(player, out) {
  if (player.extra === 1) {
    // Already has horse — offer to sell
    const sellPrice = 5000 * player.level;
    out(C.brown + `  A merchant eyes your horse hungrily.` + C.reset);
    out(`\r\n  ${C.gray}"I'll give you ${commas(sellPrice)} gold for that fine beast!"` + C.reset);
    out(`\r\n  ${C.green}(A)ccept  ${C.red}(D)ecline` + C.reset);
    // Can't do async choice here — return a marker for session to handle
    return { changed: false, endFight: false, horseSell: sellPrice };
  }
  const buyPrice = 10000 * player.level;
  out(C.brown + `  A horse trader leads a magnificent steed.` + C.reset);
  out(`\r\n  ${C.gray}"She's yours for ${commas(buyPrice)} gold. Worth every coin — +10 fights a day!"` + C.reset);
  if (player.gold < buyPrice) {
    out(`\r\n  ${C.red}You cannot afford it. (Need ${commas(buyPrice)}g)` + C.reset);
    return { changed: false, endFight: false };
  }
  player.gold -= buyPrice;
  player.extra = 1;
  player.fightsLeft += 10;
  out(`\r\n  ${C.green}You buy the horse! +10 forest fights today, and every day henceforth.` + C.reset);
  storage.savePlayer(player);
  return { changed: true, endFight: false };
}

function eventUglyStick(player, out) {
  // 50% chance: lose 2 charm, 50%: gain 2-5 charm
  if (rnd(1, 2) === 1) {
    const gain = rnd(2, 5);
    player.charm = Math.min(100, player.charm + gain);
    out(C.magenta + `  You find a mystical Ugly Stick — wait, it's a Beauty Stick!` + C.reset);
    out(`\r\n  ${C.green}+${gain} Charm${C.gray} (now ${player.charm})` + C.reset);
  } else {
    player.charm = Math.max(0, player.charm - 2);
    out(C.dkgray + `  Someone hits you with an Ugly Stick!` + C.reset);
    out(`\r\n  ${C.red}-2 Charm${C.gray} (now ${player.charm})` + C.reset);
  }
  storage.savePlayer(player);
  return { changed: true, endFight: false };
}

function eventTroll(player, out) {
  // Thieves (class 3) are immune
  if (player.class === 3) {
    out(C.dkgray + `  A lumbering troll spots you — then slinks away.` + C.reset);
    out(`\r\n  ${C.green}Your thieving instincts saved you from the troll!` + C.reset);
    return { changed: false, endFight: false };
  }
  const damage = rnd(1, 10);
  out(C.red + `  A massive troll drops from a tree!` + C.reset);
  out(`\r\n  ${C.red}It smashes you for ${damage} HP!` + C.reset);
  player.hp -= damage;
  if (player.hp <= 0) {
    player.hp = 0;
    // Troll kills: steal gold and gems
    const stolen = player.gold;
    player.gold = 0;
    player.gem  = 0;
    out(`\r\n  ${C.red}You are slain! The troll steals all your gold (${commas(stolen)}g) and gems!` + C.reset);
    player.dead = true;
    storage.savePlayer(player);
    return { changed: true, endFight: false, dead: true };
  }
  out(`\r\n  ${C.gray}HP: ${player.hp}/${player.hpMax}` + C.reset);
  // 33% chance troll also steals gems
  if (player.gem > 0 && rnd(1, 3) === 1) {
    const lostGems = player.gem;
    player.gem = 0;
    out(`\r\n  ${C.red}The troll swipes your ${lostGems} gem(s) and flees!` + C.reset);
  }
  storage.savePlayer(player);
  return { changed: true, endFight: false };
}

// ── Amulet of Accuracy (bank leave event) ────────────────────────────────────
function eventAmulet(player, out) {
  if (player.hasAmulet) return { changed: false, endFight: false };
  const cost = 1000 * player.level;
  out(C.dkgray + `\r\n  A cloaked stranger accosts you as you leave the bank.` + C.reset);
  out(`\r\n  ${C.gray}"Psst! I have an Amulet of Accuracy — guaranteed to sharpen your aim."`);
  out(`\r\n  ${C.gray}Only ${C.yellow}${commas(cost)}g${C.gray} — a steal!`);
  if (player.gold >= cost) {
    return { changed: false, endFight: false, amuletOffer: cost };
  }
  out(`\r\n  ${C.red}You cannot afford it.` + C.reset);
  return { changed: false, endFight: false };
}

// ── Bard songs ────────────────────────────────────────────────────────────────
const UNISEX_SONGS = [
  (p) => { p.fightsLeft++;              return { msg: `The bard's children's lament stirs your heart. +1 forest fight!`,        charm: 0 }; },
  (p) => { const g = rnd(100,500);
            p.gold += g;                return { msg: `The gods smile on you through the bard's song. +${commas(g)} gold!`,     charm: 0 }; },
  (p) => { p.fightsLeft += 2;           return { msg: `The bard's stirring tale fills you with energy. +2 forest fights!`,      charm: 0 }; },
  (p) => { p.fightsLeft++;              return { msg: `The Legend of the Red Dragon — you feel inspired! +1 forest fight!`,     charm: 0 }; },
  (p) => { p.hpMax++; p.hp = Math.min(p.hp+1, p.hpMax);
                                        return { msg: `The hero's tale expands your life force. +1 Max HP!`,                    charm: 0 }; },
];

const MALE_SONGS = [
  (p) => { p.hp = p.hpMax;             return { msg: `The warrior's anthem surges through you — fully healed!`,               charm: 0 }; },
  (p) => { p.fightsLeft += 3;           return { msg: `The bard's power song fills you with vigor. +3 forest fights!`,        charm: 0 }; },
  (p) => { p.fightsLeft += 3;           return { msg: `The battle hymn drives you onward. +3 forest fights!`,                 charm: 0 }; },
  (p) => { p.fightsLeft += 2;           return { msg: `A song about Violet — you fight harder thinking of her. +2 fights!`,   charm: 0 }; },
];

const FEMALE_SONGS = [
  (p) => { p.charm = Math.min(100, p.charm + 1);
                                        return { msg: `The bard sings of your beauty. +1 Charm!`,                              charm: 1 }; },
  (p) => { p.fightsLeft += 3;           return { msg: `The power song fills you with righteous fury. +3 forest fights!`,      charm: 0 }; },
];

function eventBardSong(player, out) {
  if (player.seenBard) {
    out(C.gray + `  The bard winks — you have already heard his songs today.` + C.reset);
    return { changed: false, endFight: false };
  }
  player.seenBard = true;
  out(C.brown + `  Seth Able the Bard strums a haunting melody...` + C.reset);

  let result;
  if (rnd(1, 2) === 1) {
    // Unisex
    const song = UNISEX_SONGS[rnd(0, UNISEX_SONGS.length - 1)];
    result = song(player);
  } else if (player.sex === 5) {
    const song = FEMALE_SONGS[rnd(0, FEMALE_SONGS.length - 1)];
    result = song(player);
  } else {
    const song = MALE_SONGS[rnd(0, MALE_SONGS.length - 1)];
    result = song(player);
  }

  out(`\r\n  ${C.yellow}${result.msg}` + C.reset);
  storage.savePlayer(player);
  return { changed: true, endFight: false };
}

// ── NORMSAY.DAT — killer taunts ───────────────────────────────────────────────
let _normsay = null;

function loadNormsay() {
  if (_normsay) return _normsay;
  const p = require('path').join(__dirname, '..', 'data', 'NORMSAY.DAT');
  if (!require('fs').existsSync(p)) { _normsay = []; return _normsay; }
  const lines = require('fs').readFileSync(p, 'latin1').split(/\r?\n/);
  // Line 0: comment, Line 1: count, Lines 2+: messages
  _normsay = lines.slice(2).map(l => l.trim()).filter(l => l.length > 0);
  return _normsay;
}

function getKillTaunt(killer, loser) {
  const lines = loadNormsay();
  if (!lines.length) return '';
  const template = lines[rnd(0, lines.length - 1)];
  return template
    .replace(/`g/g, killer)
    .replace(/`e/g, loser)
    .replace(/`n/g, '\r\n  ');
}

// ── Random event dispatcher ───────────────────────────────────────────────────
// LORD.LDY has 9 forest events: GEM, HORSE, OLDMAN, BAGOGOLD, HAMMERSTONE,
// MERRYMEN, HAG, TROLL, UGLYSTICK
const FOREST_EVENTS = [
  eventGem,
  eventHorse,
  eventOldMan,
  eventBagOfGold,
  eventHammerstone,
  eventMerryMen,
  eventHag,
  eventTroll,
  eventUglyStick,
];

/**
 * 30% chance of a random event on forest entry.
 * Returns event result or null if no event fired.
 */
function rollForestEvent(player, out) {
  if (rnd(1, 100) > 30) return null;
  const fn = FOREST_EVENTS[rnd(0, FOREST_EVENTS.length - 1)];
  return fn(player, out);
}

/**
 * 20% chance of an amulet offer on bank exit.
 */
function rollBankEvent(player, out) {
  if (rnd(1, 100) > 20) return null;
  return eventAmulet(player, out);
}

module.exports = {
  rollForestEvent,
  rollBankEvent,
  eventBardSong,
  getKillTaunt,
  eventHorse,
  // Exports for session direct use
  FOREST_EVENTS,
};
