'use strict';

const { rnd } = require('./text');
const { C }   = require('./text');
const { CLASSES } = require('./constants');

// ── Combat calculation helpers ────────────────────────────────────────────────

/**
 * One round of combat between attacker and defender.
 * Returns { damage, hit, crit }
 */
function calcHit(atkStr, defDef) {
  const roll = rnd(Math.floor(atkStr * 0.5), atkStr);
  const damage = Math.max(1, roll - defDef);
  const crit = roll >= atkStr * 0.9;
  return { damage, hit: roll, crit };
}

/**
 * Player attacks monster for one round.
 * Monsters at higher levels have natural hide/scale defense (10% of their STR).
 * Returns { damage, crit, text }
 */
function playerAttack(player, monster) {
  const monsterDef = Math.floor((monster.strength || 0) * 0.10);
  const { damage, crit } = calcHit(player.strength, monsterDef);
  let text = '';
  if (crit) {
    text += C.yellow + `Critical hit! `;
  }
  text += C.green + `You attack the ${monster.name} with your ${player.weapon} `;
  text += C.white + `for ${C.yellow}${damage}${C.white} damage!` + C.reset;
  return { damage, crit, text };
}

/**
 * Monster attacks player for one round.
 * Returns { damage, crit, text }
 */
function monsterAttack(player, monster) {
  const { damage, crit } = calcHit(monster.strength, player.def);
  let text = '';
  if (crit) {
    text += C.red + `Critical blow! `;
  }
  text += C.dkred + `The ${monster.name} hits you with ${monster.weapon} `;
  text += C.white + `for ${C.red}${damage}${C.white} damage!` + C.reset;
  return { damage, crit, text };
}

/**
 * Use class special ability.
 * Returns { damage, text, used: bool }
 */
function useSpecial(player, monster) {
  const cls = player.class;
  let skillKey, levelKey;
  if (cls === 1) { skillKey = 'skillw'; levelKey = 'levelw'; }
  if (cls === 2) { skillKey = 'skillm'; levelKey = 'levelm'; }
  if (cls === 3) { skillKey = 'skillt'; levelKey = 'levelt'; }

  if (player[levelKey] <= 0) {
    return { damage: 0, text: C.gray + `You have no special uses left today.` + C.reset, used: false };
  }

  player[levelKey]--;
  const info = CLASSES[cls];
  let damage = 0;
  let text = '';

  if (cls === 1) {
    // Death Knight: Deadly Strike — 2× strength, costs 10% of max HP
    damage = rnd(player.strength, player.strength * 2);
    const cost = Math.max(1, Math.floor(player.hpMax * 0.1));
    player.hp = Math.max(1, player.hp - cost);
    text = C.red + `You channel dark energy into a Deadly Strike! ` +
           C.white + `[costs ${cost} HP] ` +
           C.yellow + `${damage} damage!` + C.reset;
  } else if (cls === 2) {
    // Mage: Magic Blast — ignores defense, fixed damage based on skill
    damage = rnd(player.strength, player.strength + player.skillm * 5);
    text = C.cyan + `You unleash a Magic Blast! ` +
           C.white + `(ignores armour) ` +
           C.yellow + `${damage} damage!` + C.reset;
  } else if (cls === 3) {
    // Thief: Backstab — 1.5× damage + steal some gold if alive after fight
    damage = Math.floor(rnd(player.strength * 0.8, player.strength * 1.5));
    text = C.dkgray + `You slip into the shadows and Backstab! ` +
           C.yellow + `${damage} damage!` + C.reset;
  }

  return { damage, text, used: true };
}

/**
 * Full forest fight simulation.
 * Returns fight log lines + result: { won, fled, dead, goldGained, expGained, monsterGold }
 */
function fightMonster(player, monster) {
  const log = [];
  let monsterHp = monster.hp;
  const pHpStart = player.hp;

  log.push(C.dkblue + `─`.repeat(60) + C.reset);
  log.push(`${C.yellow}You encounter a ${C.white}${monster.name}${C.yellow}!${C.reset}`);
  log.push(`${C.gray}${monster.name} wields a ${monster.weapon}.${C.reset}`);
  log.push(`${C.gray}HP: ${player.hp}/${player.hpMax}  STR: ${player.strength}  DEF: ${player.def}${C.reset}`);

  // Combat loop — player goes first each round
  let rounds = 0;
  while (player.hp > 0 && monsterHp > 0 && rounds < 50) {
    rounds++;

    // Player attacks
    const pa = playerAttack(player, monster);
    log.push(pa.text);
    monsterHp -= pa.damage;

    if (monsterHp <= 0) break;

    // Monster attacks back
    const ma = monsterAttack(player, monster);
    log.push(ma.text);
    player.hp -= ma.damage;

    if (player.hp <= 0) {
      player.hp = 0;
      break;
    }
  }

  if (player.hp <= 0) {
    // Player died
    log.push(C.red + `\r\nYou have been slain by ${monster.name}!` + C.reset);
    log.push(C.dkred + `You lose half your gold and all your gems!` + C.reset);
    const goldLost = Math.floor(player.gold / 2);
    player.gold -= goldLost;
    player.gem  = 0;
    player.dead = true;
    return { log, won: false, fled: false, dead: true, goldGained: 0, expGained: 0 };
  }

  // Monster died
  const expGained  = monster.exp;
  const goldGained = monster.gold;
  player.exp  += expGained;
  player.gold += goldGained;

  if (monster.deathMsg) {
    log.push(C.dkgreen + monster.deathMsg + C.reset);
  }
  log.push(`${C.green}You defeated the ${monster.name}!${C.reset}`);
  log.push(`${C.yellow}+${goldGained} gold  +${expGained} exp${C.reset}`);
  log.push(`${C.gray}HP remaining: ${player.hp}/${player.hpMax}${C.reset}`);

  return { log, won: true, fled: false, dead: false, goldGained, expGained };
}

/**
 * Player vs Player combat (attacker attacks defender).
 * Modifies attacker and defender objects in place.
 * Returns { log, won }
 */
function fightPlayer(attacker, defender) {
  const log = [];
  let atkHp  = attacker.hp;
  let defHp  = defender.hp;

  log.push(C.red + `\r\n⚔  PvP Battle: ${attacker.name} vs ${defender.name}!` + C.reset);

  let rounds = 0;
  while (atkHp > 0 && defHp > 0 && rounds < 50) {
    rounds++;
    const ad = calcHit(attacker.strength, defender.def);
    defHp -= ad.damage;
    log.push(`${C.green}${attacker.name} hits for ${ad.damage}!${C.reset}`);
    if (defHp <= 0) break;

    const dd = calcHit(defender.strength, attacker.def);
    atkHp -= dd.damage;
    log.push(`${C.red}${defender.name} hits back for ${dd.damage}!${C.reset}`);
  }

  const won = defHp <= 0;
  if (won) {
    const stolen = Math.floor(defender.gold * 0.1);
    attacker.gold += stolen;
    defender.gold -= stolen;
    attacker.kills++;
    attacker.hp = Math.max(1, atkHp);
    defender.hp = Math.max(1, defHp <= 0 ? 1 : defHp);
    log.push(`${C.yellow}${attacker.name} wins! Steals ${stolen} gold!${C.reset}`);
  } else {
    attacker.hp = Math.max(1, atkHp);
    defender.hp = Math.max(1, defHp);
    log.push(`${C.cyan}${defender.name} repels the attack!${C.reset}`);
  }

  return { log, won };
}

/**
 * Check if player can level up; returns true/false.
 */
function canLevelUp(player) {
  const { LEVEL_EXP } = require('./constants');
  const nextLevel = player.level; // index is 0-based; level 2 needs LEVEL_EXP[1]
  if (nextLevel >= LEVEL_EXP.length) return false;
  return player.exp >= LEVEL_EXP[nextLevel];
}

/**
 * Level player up once, applying stat bonuses.
 * Returns list of stat gain strings.
 */
function doLevelUp(player) {
  const { MASTER_STAT_GAIN } = require('./constants');
  const gains = MASTER_STAT_GAIN[player.class] || { strength: 8, hp: 8 };
  player.level++;
  player.strength += gains.strength;
  player.hpMax    += gains.hp;
  player.hp        = player.hpMax; // full heal on level up
  player.seenMaster = false;
  return [
    `+${gains.strength} Strength`,
    `+${gains.hp} Max HP  (fully restored)`,
  ];
}

module.exports = { calcHit, playerAttack, monsterAttack, useSpecial, fightMonster, fightPlayer, canLevelUp, doLevelUp };
