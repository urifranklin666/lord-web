'use strict';

const storage    = require('./storage');
const combat     = require('./combat');
const monsters   = require('./monsters');
const events     = require('./events');
const trainers   = require('./trainers');
const appearance = require('./appearance');
const { getWeapons, getArmour } = require('./weapons');
const { C, colorize, commas, titleBar, rnd } = require('./text');
const { CLASSES, LEVEL_EXP, INN_COST, HEALER_RATE, GEM_HEAL,
        BASE_FOREST_FIGHTS } = require('./constants');

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const CRLF   = '\r\n';
const CLRSCR = '\x1b[2J\x1b[H';

function line(text = '') { return text + CRLF; }

const DIV_RED  = C.dkred  + '─'.repeat(79) + C.reset + CRLF;
const DIV_BLUE = C.dkblue + '─'.repeat(79) + C.reset + CRLF;

// ── GameSession ───────────────────────────────────────────────────────────────
class GameSession {
  constructor(send) {
    this._send    = send;
    this.player   = null;
    this.state    = 'login_name';
    this._buf     = '';
    this._context = {};
  }

  out(text)     { this._send(text); }
  ln(text = '') { this._send(text + CRLF); }
  cls()         { this._send(CLRSCR); }

  onKey(ch) {
    const singleKey = [
      'main_menu','forest_menu','fight_choice',
      'shop_weapon','shop_armor','bank_menu',
      'healer_menu','inn_menu','tavern_menu',
      'master_menu','pvp_list_page','pvp_confirm',
      'players_list','any_key','death_screen',
      'blackjack_menu','register_sex','register_class',
      'horse_offer','amulet_offer',
    ];

    if (singleKey.includes(this.state)) {
      this._dispatch(ch.toLowerCase());
      return;
    }

    if (ch === '\r' || ch === '\n') {
      const input = this._buf.trim();
      this._buf = '';
      this.out(CRLF);
      this._dispatch(input);
    } else if (ch === '\x08' || ch === '\x7f') {
      if (this._buf.length > 0) {
        this._buf = this._buf.slice(0, -1);
        this.out('\x08 \x08');
      }
    } else if (ch >= ' ' && this._buf.length < 50) {
      this._buf += ch;
      const echo = (this.state === 'login_pass' ||
                    this.state === 'register_pass' ||
                    this.state === 'register_pass2') ? '*' : ch;
      this.out(echo);
    }
  }

  _dispatch(input) {
    const handler = `_state_${this.state}`;
    if (typeof this[handler] === 'function') {
      this[handler](input);
    } else {
      this.ln(C.red + `Unknown state: ${this.state}` + C.reset);
      this.state = 'main_menu';
      this._renderMain();
    }
  }

  // ── "Press any key" helper ────────────────────────────────────────────────
  _anyKey(nextFn) {
    this._context.anyKeyNext = nextFn;
    this.out(C.gray + '\r\n  [Press any key]' + C.reset);
    this.state = 'any_key';
  }

  _state_any_key(_ch) {
    const fn = this._context.anyKeyNext;
    this._context.anyKeyNext = null;
    if (fn) fn();
    else this._renderMain();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOGIN / REGISTER
  // ══════════════════════════════════════════════════════════════════════════

  start() {
    this.cls();
    this._renderBanner();
    this.ln(C.yellow + 'Enter your name, or ' + C.white + 'NEW' + C.yellow + ' to create an account:' + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'login_name';
  }

  _renderBanner() {
    this.ln(C.dkred  + '╔' + '═'.repeat(77) + '╗');
    this.ln(C.dkred  + '║' + C.red    + '  ██╗      ██████╗ ██████╗ ██████╗'.padEnd(77)   + C.dkred + '║');
    this.ln(C.dkred  + '║' + C.red    + '  ██║     ██╔═══██╗██╔══██╗██╔══██╗'.padEnd(77)  + C.dkred + '║');
    this.ln(C.dkred  + '║' + C.red    + '  ██║     ██║   ██║██████╔╝██║  ██║'.padEnd(77)  + C.dkred + '║');
    this.ln(C.dkred  + '║' + C.red    + '  ██║     ██║   ██║██╔══██╗██║  ██║'.padEnd(77)  + C.dkred + '║');
    this.ln(C.dkred  + '║' + C.red    + '  ███████╗╚██████╔╝██║  ██║██████╔╝'.padEnd(77)  + C.dkred + '║');
    this.ln(C.dkred  + '║' + C.yellow + '     Legend of the Red Dragon  —  Browser Edition v4.07'.padEnd(77) + C.dkred + '║');
    this.ln(C.dkred  + '╚' + '═'.repeat(77) + '╝');
    this.ln();
  }

  _state_login_name(name) {
    if (!name) { this.out(C.white + '> '); return; }
    if (name.toLowerCase() === 'new') {
      this.state = 'register_name';
      this.ln(CRLF + C.yellow + 'Enter your game handle (up to 20 chars):' + C.reset);
      this.out(C.white + '> ' + C.reset);
      return;
    }
    this._context.loginName = name;
    const player = storage.findByName(name);
    if (!player) {
      this.ln(C.red + '  Player not found. Type NEW to create an account.' + C.reset);
      this.out(C.white + '> ' + C.reset);
      return;
    }
    this.ln(C.yellow + '  Password:' + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'login_pass';
  }

  async _state_login_pass(pw) {
    const player = storage.findByName(this._context.loginName);
    if (!player) { this.start(); return; }
    const ok = await storage.checkPassword(pw, player.passwordHash);
    if (!ok) {
      this.ln(C.red + '  Wrong password.' + C.reset);
      this.ln(C.yellow + '  Name:' + C.reset);
      this.out(C.white + '> ' + C.reset);
      this.state = 'login_name';
      return;
    }
    this.player = player;
    this._enterGame();
  }

  _state_register_name(name) {
    name = name.slice(0, 20).trim();
    if (!name) { this.out(C.white + '> '); return; }
    if (storage.findByName(name)) {
      this.ln(C.red + '  That name is taken.' + C.reset);
      this.out(C.white + '> ' + C.reset);
      return;
    }
    this._context.regName = name;
    this.ln(C.yellow + '  Enter your real name / BBS handle:' + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'register_realname';
  }

  _state_register_realname(name) {
    this._context.regRealName = name.slice(0, 50).trim() || this._context.regName;
    this.ln(C.yellow + '  Choose a password (min 4 chars):' + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'register_pass';
  }

  _state_register_pass(pw) {
    if (pw.length < 4) {
      this.ln(C.red + '  Password must be at least 4 characters.' + C.reset);
      this.out(C.white + '> ');
      return;
    }
    this._context.regPass = pw;
    this.ln(C.yellow + '  Confirm password:' + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'register_pass2';
  }

  async _state_register_pass2(pw) {
    if (pw !== this._context.regPass) {
      this.ln(C.red + '  Passwords do not match.' + C.reset);
      this.out(C.white + '> ');
      this.state = 'register_pass';
      return;
    }
    this.ln();
    this.ln(C.yellow + '  Gender:' + C.reset);
    this.ln(C.green + '  (M)ale   (F)emale' + C.reset);
    this.out(C.white + '> ');
    this.state = 'register_sex';
  }

  _state_register_sex(ch) {
    if (ch !== 'm' && ch !== 'f') { this.out(C.white + '> '); return; }
    this._context.regSex = ch === 'f' ? 5 : 0;
    this.ln();
    this.ln(C.yellow + '  Choose your class:' + C.reset);
    this.ln(C.green  + '  (1) Death Knight  — brutal strength, Deadly Strikes');
    this.ln(C.cyan   + '  (2) Mystical      — harnesses magic, starts with gems');
    this.ln(C.dkgray + '  (3) Thief         — quick and cunning, troll-immune, steals gold' + C.reset);
    this.out(C.white + '> ');
    this.state = 'register_class';
  }

  async _state_register_class(ch) {
    const cls = parseInt(ch);
    if (cls < 1 || cls > 3 || isNaN(cls)) { this.out(C.white + '> '); return; }
    this._context.regClass = cls;
    const hash = await storage.hashPassword(this._context.regPass);
    const player = storage.newPlayer(
      this._context.regName, this._context.regRealName,
      hash, this._context.regSex, cls,
    );
    this.player = player;
    this.ln();
    this.ln(C.green  + `  Welcome, ${player.name}! Your adventure begins!` + C.reset);
    this.ln(C.gray   + `  Class: ${CLASSES[cls].name}  HP: ${player.hp}  STR: ${player.strength}  Gold: ${commas(player.gold)}` + C.reset);
    this._enterGame();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GAME ENTRY
  // ══════════════════════════════════════════════════════════════════════════

  _enterGame() {
    const newDay = storage.resetPlayerDay(this.player);
    storage.savePlayer(this.player);
    this.cls();
    if (newDay) {
      this.ln(C.yellow + '  *** A new day has dawned! Your fight counts are restored. ***' + C.reset);
      this.ln();
    }
    this._renderMain();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN MENU
  // ══════════════════════════════════════════════════════════════════════════

  _renderMain() {
    const p = this.player;
    this.state = 'main_menu';

    this.ln(DIV_RED.trimEnd());
    const hpColor = p.hp < p.hpMax * 0.3 ? C.red : C.green;
    this.ln(
      C.white + ` ${p.name}` +
      C.gray  + `  Lv${p.level} ${CLASSES[p.class]?.name}` +
      C.gray  + `  HP:` + hpColor + `${p.hp}/${p.hpMax}` +
      C.gray  + `  STR:${p.strength}  DEF:${p.def}  CHM:${p.charm}` +
      C.yellow+ `  Gold:${commas(p.gold)}` +
      C.gray  + `  EXP:${commas(p.exp)}` + C.reset
    );
    this.ln(
      C.gray + `  Fights:${C.white}${p.fightsLeft}  ${C.gray}PvP:${C.white}${p.humanLeft}` +
      C.gray + `  Gems:${C.white}${p.gem}` +
      (p.extra  ? C.yellow + `  [Horse]` : '') +
      (p.hasAmulet ? C.cyan + `  [Amulet]` : '') +
      (p.dead   ? C.red + `  [DEAD — visit Healer]` : '') + C.reset
    );
    this.ln(DIV_RED.trimEnd());
    this.ln();
    this.ln(C.brown  + `  `  + C.yellow + `Legend of the Red Dragon` + C.gray + ` — Main Menu` + C.reset);
    this.ln();
    this.ln(C.dkgreen + `  (F)` + C.green + `orest               ` + C.dkgreen + `(P)` + C.green + `layer Battle`);
    this.ln(C.dkgreen + `  (H)` + C.green + `ealer               ` + C.dkgreen + `(I)` + C.green + `nn — Rest & Recover`);
    this.ln(C.dkgreen + `  (W)` + C.green + `eapons Shop         ` + C.dkgreen + `(A)` + C.green + `rmour Shop`);
    this.ln(C.dkgreen + `  (B)` + C.green + `ank                 ` + C.dkgreen + `(V)` + C.green + `iew Players`);
    this.ln(C.dkgreen + `  (T)` + C.green + `avern               ` + C.dkgreen + `(S)` + C.green + `tats`);
    if (combat.canLevelUp(p)) {
      this.ln(C.red + `  (L)evel Up! *** You are ready for the next Master! ***` + C.reset);
    } else {
      this.ln(C.gray + `  (L)evel Up? (visit Master when ready)` + C.reset);
    }
    this.ln(C.dkred  + `  (Q)` + C.red + `uit` + C.reset);
    this.ln();
    this.out(C.white + 'Choice: ' + C.reset);
  }

  _state_main_menu(ch) {
    switch (ch) {
      case 'f': return this._enterForest();
      case 'p': return this._enterPvP();
      case 'h': return this._enterHealer();
      case 'i': return this._enterInn();
      case 'w': return this._enterWeaponShop();
      case 'a': return this._enterArmourShop();
      case 'b': return this._enterBank();
      case 'v': return this._enterPlayerList();
      case 't': return this._enterTavern();
      case 's': return this._showStats();
      case 'l': return this._enterMaster();
      case 'q': return this._quit();
      default:  this.out(C.white + 'Choice: ');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FOREST
  // ══════════════════════════════════════════════════════════════════════════

  _enterForest() {
    const p = this.player;
    this.cls();
    this.ln(DIV_BLUE.trimEnd());
    this.ln(C.dkgreen + `  Dark Forest` + C.gray + ` — A dense tangle of shadow and menace.` + C.reset);
    this.ln(DIV_BLUE.trimEnd());
    this.ln();

    if (p.dead) {
      this.ln(C.red + `  You are dead! Visit the Healer to be resurrected.` + C.reset);
      this._anyKey(() => this._renderMain());
      return;
    }

    if (p.fightsLeft <= 0) {
      this.ln(C.red + `  You have no forest fights remaining today.` + C.reset);
      this.ln(C.gray + `  Return tomorrow, or rest at the Inn.` + C.reset);
      this._anyKey(() => this._renderMain());
      return;
    }

    // Random event (30% chance)
    const lines = [];
    const eventOut = (t) => lines.push(t);
    const ev = events.rollForestEvent(p, eventOut);

    if (ev) {
      for (const l of lines) this.ln(l);
      if (ev.dead) { this.ln(); return this._playerDeath('the forest'); }
      if (ev.horseSell !== undefined) {
        // Async sell prompt
        this._context.horseSellPrice = ev.horseSell;
        this.ln(C.green + `\r\n  (A)ccept  (D)ecline` + C.reset);
        this.out(C.white + 'Choice: ');
        this.state = 'horse_offer';
        return;
      }
      this.ln();
    }

    // Spawn monster
    const monster = monsters.randomMonster(p.level);
    this._context.monster = monster;

    this.ln(C.gray + `  Fights remaining: ${C.white}${p.fightsLeft}${C.gray}  HP: ${C.white}${p.hp}/${p.hpMax}` + C.reset);
    this.ln();
    this.ln(C.yellow + `  You venture deeper into the forest...`);
    this.ln(C.red    + `  A ${C.white}${monster.name}${C.red} leaps out!`);
    this.ln(C.gray   + `  Wields: ${C.white}${monster.weapon}${C.gray}  HP:${C.white}${monster.hp}${C.gray}  STR:${C.white}${monster.strength}` + C.reset);
    this.ln();

    const hasSpecial = (p.class === 1 && p.levelw > 0) ||
                       (p.class === 2 && p.levelm > 0) ||
                       (p.class === 3 && p.levelt > 0);
    const specialKey  = ['', 'W', 'M', 'T'][p.class];
    const specialName = CLASSES[p.class].skillName;

    this.ln(C.green + `  (A)ttack   (F)lee   (G)em heal (${p.gem} gems)`);
    if (hasSpecial) {
      this.ln(C.cyan + `  (${specialKey}) ${specialName}  [${['', p.levelw, p.levelm, p.levelt][p.class]} uses left]`);
    }
    this.ln();
    this.out(C.white + 'Choice: ' + C.reset);
    this.state = 'forest_menu';
  }

  _state_horse_offer(ch) {
    const p = this.player;
    if (ch === 'a') {
      const price = this._context.horseSellPrice;
      p.gold += price;
      p.extra  = 0;
      p.fightsLeft = Math.max(0, p.fightsLeft - 10);
      storage.savePlayer(p);
      this.ln(C.yellow + `\r\n  You sold your horse for ${commas(price)} gold.` + C.reset);
    } else {
      this.ln(C.gray + `\r\n  You keep your horse.` + C.reset);
    }
    this._anyKey(() => this._enterForest());
  }

  _state_forest_menu(ch) {
    const p = this.player;
    const monster = this._context.monster;

    if (ch === 'g') {
      if (p.gem <= 0) { this.ln(C.red + `\r\n  No gems!` + C.reset); this.out(C.white + 'Choice: '); return; }
      p.gem--;
      const healed = Math.min(GEM_HEAL, p.hpMax - p.hp);
      p.hp = Math.min(p.hpMax, p.hp + GEM_HEAL);
      this.ln(C.green + `\r\n  You use a gem: +${healed} HP (${p.hp}/${p.hpMax})` + C.reset);
      this.out(C.white + 'Choice: ');
      return;
    }

    if (ch === 'f') {
      const fleeChance = p.class === 3 ? 80 : 60;
      if (rnd(1, 100) <= fleeChance) {
        this.ln(C.yellow + `\r\n  You flee from battle!` + C.reset);
      } else {
        this.ln(C.red + `\r\n  You tried to flee but the monster blocks your path!` + C.reset);
        const ma = combat.monsterAttack(p, monster);
        this.ln(`  ` + ma.text);
        p.hp -= ma.damage;
        if (p.hp <= 0) { p.hp = 0; return this._playerDeath(monster.name); }
        this.ln(C.gray + `  HP: ${p.hp}/${p.hpMax}` + C.reset);
      }
      p.fightsLeft--;
      storage.savePlayer(p);
      this._postFight();
      return;
    }

    // Special ability
    const specialMap = { w: 1, m: 2, t: 3 };
    if (specialMap[ch] === p.class) {
      const result = combat.useSpecial(p, monster);
      this.ln(`\r\n  ` + result.text);
      if (result.used) {
        monster.hp -= result.damage;
        if (monster.hp <= 0) return this._monsterDied(monster);
        const ma = combat.monsterAttack(p, monster);
        this.ln(`  ` + ma.text);
        p.hp -= ma.damage;
        if (p.hp <= 0) { p.hp = 0; return this._playerDeath(monster.name); }
        this.ln(C.gray + `  Monster HP:${Math.max(0, monster.hp)}  Your HP:${p.hp}/${p.hpMax}` + C.reset);
      }
      this.out(C.white + 'Choice: ');
      return;
    }

    if (ch !== 'a') { this.out(C.white + 'Choice: '); return; }

    // Full fight
    this.ln();
    const result = combat.fightMonster(p, monster);
    for (const l of result.log) this.ln(`  ` + l);
    this.ln();
    p.fightsLeft--;

    if (result.dead) return this._playerDeath(monster.name);
    this._monsterDied(monster, true);
  }

  _monsterDied(monster, alreadyLogged = false) {
    const p = this.player;
    if (!alreadyLogged) {
      if (monster.deathMsg) this.ln(C.dkgreen + `\r\n  ` + monster.deathMsg + C.reset);
      this.ln(C.green  + `  You defeated the ${monster.name}!`);
      this.ln(C.yellow + `  +${commas(monster.gold)} gold  +${commas(monster.exp)} exp` + C.reset);
      p.exp  += monster.exp;
      p.gold += monster.gold;
      if (!alreadyLogged) p.fightsLeft--;
    }

    // Kill taunt
    const taunt = events.getKillTaunt(monster.name, p.name);
    if (taunt) this.ln(C.gray + `  ` + taunt + C.reset);

    if (combat.canLevelUp(p)) {
      this.ln(C.yellow + `\r\n  *** You are ready to level up! Visit the Master! ***` + C.reset);
    }
    storage.savePlayer(p);
    this._postFight();
  }

  _postFight() {
    this.ln();
    this.ln(C.gray + `  (R)eturn to town   (A)nother fight` + C.reset);
    this.out(C.white + 'Choice: ' + C.reset);
    this.state = 'fight_choice';
  }

  _state_fight_choice(ch) {
    if (ch === 'a') return this._enterForest();
    this._renderMain();
  }

  _playerDeath(killerName) {
    const p = this.player;
    p.dead  = true;
    const goldLost = Math.floor(p.gold / 2);
    p.gold -= goldLost;
    p.gem   = 0;
    storage.savePlayer(p);
    this.cls();
    this.ln(C.red + `  ` + DIV_RED.trimEnd());
    this.ln(C.red + `  *** YOU HAVE DIED ***` + C.reset);
    this.ln(C.red + `  ` + DIV_RED.trimEnd());
    this.ln();
    this.ln(C.dkred + `  You were slain by ${killerName}.` + C.reset);
    this.ln(C.gray  + `  Lost ${commas(goldLost)} gold and all gems.` + C.reset);
    this.ln(C.gray  + `  Visit the Healer to be resurrected.` + C.reset);
    this._anyKey(() => this._renderMain());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HEALER
  // ══════════════════════════════════════════════════════════════════════════

  _enterHealer() {
    const p = this.player;
    this.cls();
    this.ln(C.white + titleBar(`Healer's Hut`) + C.reset);
    this.ln();
    this.ln(C.green + `  A kindly healer greets you.` + C.reset);
    this.ln(C.gray  + `  HP: ${C.green}${p.hp}/${p.hpMax}${C.gray}   Gold: ${C.yellow}${commas(p.gold)}` + C.reset);
    this.ln();

    if (p.dead) {
      const cost = 1000 * p.level;
      this._context.resurrectCost = cost;
      this.ln(C.red   + `  "You are dead, adventurer!"` + C.reset);
      this.ln(C.gray  + `  Resurrection costs ${C.yellow}${commas(cost)}g${C.reset}`);
      this.ln(C.green + `  (R)esurrect   (L)eave` + C.reset);
      this.out(C.white + 'Choice: ');
      this.state = 'healer_menu';
      return;
    }

    const hpNeeded = p.hpMax - p.hp;
    const healCost = hpNeeded * HEALER_RATE;
    this._context.healCost = healCost;
    this.ln(C.green + `  (H)eal to full  (${commas(healCost)}g — ${hpNeeded} HP needed)`);
    this.ln(C.green + `  (L)eave` + C.reset);
    this.ln();
    this.out(C.white + 'Choice: ');
    this.state = 'healer_menu';
  }

  _state_healer_menu(ch) {
    const p = this.player;
    if (ch === 'l') return this._renderMain();

    if (p.dead && ch === 'r') {
      const cost = this._context.resurrectCost;
      if (p.gold < cost) {
        this.ln(C.red + `\r\n  "You cannot afford resurrection!"` + C.reset);
      } else {
        p.gold -= cost; p.dead = false; p.hp = Math.floor(p.hpMax / 2);
        storage.savePlayer(p);
        this.ln(C.green + `\r\n  The healer chants and you are restored to life!` + C.reset);
        this.ln(C.gray  + `  HP: ${p.hp}/${p.hpMax}` + C.reset);
      }
      this._anyKey(() => this._renderMain());
      return;
    }

    if (!p.dead && ch === 'h') {
      const cost = this._context.healCost;
      if (cost === 0) {
        this.ln(C.green + `\r\n  You are already at full health!` + C.reset);
      } else {
        const affordable = Math.min(cost, p.gold);
        const hpGained   = Math.floor(affordable / HEALER_RATE);
        p.gold -= hpGained * HEALER_RATE;
        p.hp    = Math.min(p.hpMax, p.hp + hpGained);
        storage.savePlayer(p);
        this.ln(C.green + `\r\n  Healed to ${p.hp}/${p.hpMax} HP.` + C.reset);
      }
      this._anyKey(() => this._renderMain());
      return;
    }
    this.out(C.white + 'Choice: ');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INN
  // ══════════════════════════════════════════════════════════════════════════

  _enterInn() {
    const p = this.player;
    this.cls();
    this.ln(C.white + titleBar('The Inn') + C.reset);
    this.ln();
    this.ln(C.brown + `  A warm fire crackles. The innkeeper nods.` + C.reset);
    this.ln(C.gray  + `  HP: ${p.hp}/${p.hpMax}   Gold: ${commas(p.gold)}` + C.reset);
    this.ln();
    this.ln(C.green + `  (S)leep (${INN_COST}g — wake fully healed next visit)`);
    this.ln(C.green + `  (L)eave` + C.reset);
    this.ln();
    this.out(C.white + 'Choice: ');
    this.state = 'inn_menu';
  }

  _state_inn_menu(ch) {
    const p = this.player;
    if (ch === 's') {
      if (p.gold < INN_COST) {
        this.ln(C.red + `\r\n  "You can't afford a room!"` + C.reset);
      } else {
        p.gold -= INN_COST;
        p.hp    = p.hpMax;
        storage.savePlayer(p);
        this.ln(C.green + `\r\n  You sleep soundly and wake fully healed.` + C.reset);
        this.ln(C.gray  + `  HP: ${p.hp}/${p.hpMax}` + C.reset);
      }
      this._anyKey(() => this._renderMain());
      return;
    }
    this._renderMain();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WEAPON SHOP
  // ══════════════════════════════════════════════════════════════════════════

  _enterWeaponShop() {
    const p = this.player;
    const WEAPONS = getWeapons();
    this.cls();
    this.ln(C.white + titleBar('Weapons Shop') + C.reset);
    this.ln(C.gray  + `  Current: ${C.white}${p.weapon}${C.gray}  Gold: ${C.yellow}${commas(p.gold)}` + C.reset);
    this.ln();
    WEAPONS.forEach((w, i) => {
      if (!w) return;
      const owned     = p.weaponNum === i ? C.yellow + ` ◄ yours` : '';
      const canAfford = p.gold >= w.price ? C.green : C.gray;
      this.ln(`  ${canAfford}(${i}) ${w.name.padEnd(18)} +${String(w.strength).padEnd(5)} STR  ${commas(w.price)}g${owned}${C.reset}`);
    });
    this.ln();
    this.ln(C.gray + `  Number to buy, or (R)eturn:` + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'shop_weapon';
  }

  _state_shop_weapon(ch) {
    if (ch === 'r') return this._renderMain();
    const WEAPONS = getWeapons();
    const n = parseInt(ch);
    const p = this.player;
    if (!isNaN(n) && n >= 1 && n <= 15 && WEAPONS[n]) {
      const w = WEAPONS[n];
      if (n <= p.weaponNum) {
        this.ln(C.red + `\r\n  You already have an equal or better weapon.` + C.reset);
      } else if (p.gold < w.price) {
        this.ln(C.red + `\r\n  You cannot afford that. (Need ${commas(w.price)}g)` + C.reset);
      } else {
        const oldW = WEAPONS[p.weaponNum];
        if (oldW) { p.gold += Math.floor(oldW.price * 0.5); p.strength -= oldW.strength; }
        p.gold      -= w.price;
        p.strength  += w.strength;
        p.weaponNum  = n;
        p.weapon     = w.name;
        storage.savePlayer(p);
        this.ln(C.green + `\r\n  You bought the ${w.name}!` + C.reset);
      }
    }
    this._anyKey(() => this._renderMain());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ARMOUR SHOP
  // ══════════════════════════════════════════════════════════════════════════

  _enterArmourShop() {
    const p = this.player;
    const ARMOUR = getArmour();
    this.cls();
    this.ln(C.white + titleBar(`Abdul's Armour Shop`) + C.reset);
    this.ln(C.gray  + `  Current: ${C.white}${p.arm}${C.gray}  Gold: ${C.yellow}${commas(p.gold)}` + C.reset);
    this.ln();
    ARMOUR.forEach((a, i) => {
      if (!a) return;
      const owned     = p.armNum === i ? C.yellow + ` ◄ yours` : '';
      const canAfford = i === 0 || p.gold >= a.price ? C.green : C.gray;
      this.ln(`  ${canAfford}(${i}) ${a.name.padEnd(18)} +${String(a.defense).padEnd(5)} DEF  ${i === 0 ? 'free' : commas(a.price) + 'g'}${owned}${C.reset}`);
    });
    this.ln();
    this.ln(C.gray + `  Number to buy, or (R)eturn:` + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'shop_armor';
  }

  _state_shop_armor(ch) {
    if (ch === 'r') return this._renderMain();
    const ARMOUR = getArmour();
    const n = parseInt(ch);
    const p = this.player;
    if (!isNaN(n) && n >= 0 && n <= 15 && ARMOUR[n]) {
      const a = ARMOUR[n];
      if (n <= p.armNum) {
        this.ln(C.red + `\r\n  You already have equal or better armour.` + C.reset);
      } else if (n > 0 && p.gold < a.price) {
        this.ln(C.red + `\r\n  Cannot afford that. (Need ${commas(a.price)}g)` + C.reset);
      } else {
        const oldA = ARMOUR[p.armNum];
        if (oldA && p.armNum > 0) { p.gold += Math.floor(oldA.price * 0.5); p.def -= oldA.defense; }
        if (n > 0) p.gold -= a.price;
        p.def   += a.defense;
        p.armNum = n;
        p.arm    = a.name;
        storage.savePlayer(p);
        this.ln(C.green + `\r\n  You are now wearing ${a.name}!` + C.reset);
      }
    }
    this._anyKey(() => this._renderMain());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BANK
  // ══════════════════════════════════════════════════════════════════════════

  _enterBank() {
    const p = this.player;
    this.cls();
    this.ln(C.white + titleBar('Town Bank') + C.reset);
    this.ln();
    this.ln(C.gray + `  Gold in hand: ${C.yellow}${commas(p.gold)}` + C.reset);
    this.ln(C.gray + `  Gold in bank: ${C.yellow}${commas(p.bank)}` + C.reset);
    this.ln();
    this.ln(C.green + `  (D)eposit   (W)ithdraw   (R)eturn` + C.reset);
    this.out(C.white + 'Choice: ');
    this.state = 'bank_menu';
  }

  _state_bank_menu(ch) {
    if (ch === 'r') return this._afterBank();
    const p = this.player;
    if (ch === 'd') {
      if (p.gold <= 0) { this.ln(C.red + `\r\n  No gold to deposit.` + C.reset); this._anyKey(() => this._afterBank()); return; }
      this._context.bankMode = 'deposit';
      this.ln(C.yellow + `\r\n  Deposit how much? (max ${commas(p.gold)}):` + C.reset);
      this.out(C.white + '> ');
      this.state = 'bank_amount';
      return;
    }
    if (ch === 'w') {
      if (p.bank <= 0) { this.ln(C.red + `\r\n  Nothing in your account.` + C.reset); this._anyKey(() => this._afterBank()); return; }
      this._context.bankMode = 'withdraw';
      this.ln(C.yellow + `\r\n  Withdraw how much? (max ${commas(p.bank)}):` + C.reset);
      this.out(C.white + '> ');
      this.state = 'bank_amount';
      return;
    }
    this.out(C.white + 'Choice: ');
  }

  _state_bank_amount(input) {
    const p   = this.player;
    const amt = parseInt(input.replace(/,/g, ''));
    if (isNaN(amt) || amt <= 0) {
      this.ln(C.red + `  Invalid amount.` + C.reset);
      this._anyKey(() => this._afterBank());
      return;
    }
    if (this._context.bankMode === 'deposit') {
      const actual = Math.min(amt, p.gold);
      p.gold -= actual; p.bank += actual;
      this.ln(C.green + `  Deposited ${commas(actual)}g. Bank: ${commas(p.bank)}g` + C.reset);
    } else {
      const actual = Math.min(amt, p.bank);
      p.bank -= actual; p.gold += actual;
      this.ln(C.green + `  Withdrew ${commas(actual)}g. In hand: ${commas(p.gold)}g` + C.reset);
    }
    storage.savePlayer(p);
    this._anyKey(() => this._afterBank());
  }

  _afterBank() {
    // Roll for amulet event on bank exit
    const p    = this.player;
    const lines = [];
    const ev    = events.rollBankEvent(p, t => lines.push(t));
    if (ev && ev.amuletOffer) {
      for (const l of lines) this.ln(l);
      this.ln();
      this.ln(C.green + `  (B)uy   (D)ecline` + C.reset);
      this._context.amuletCost = ev.amuletOffer;
      this.out(C.white + 'Choice: ');
      this.state = 'amulet_offer';
      return;
    }
    if (lines.length) { for (const l of lines) this.ln(l); this.ln(); }
    this._renderMain();
  }

  _state_amulet_offer(ch) {
    const p = this.player;
    if (ch === 'b') {
      const cost = this._context.amuletCost;
      p.gold -= cost;
      p.hasAmulet = true;
      storage.savePlayer(p);
      this.ln(C.cyan + `\r\n  You purchase the Amulet of Accuracy! Your strikes are now sharper.` + C.reset);
    } else {
      this.ln(C.gray + `\r\n  You decline the stranger's offer.` + C.reset);
    }
    this._anyKey(() => this._renderMain());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MASTER / LEVEL UP
  // ══════════════════════════════════════════════════════════════════════════

  _enterMaster() {
    const p = this.player;
    this.cls();
    const trainerName = trainers.getTrainerName(p.level);
    this.ln(C.white + titleBar(`${trainerName}'s Training Hall`) + C.reset);
    this.ln();

    if (!combat.canLevelUp(p)) {
      const need = p.level < LEVEL_EXP.length ? LEVEL_EXP[p.level] : Infinity;
      this.ln(C.dkred + `  "${trainerName} eyes you coolly."` + C.reset);
      this.ln(C.gray  + `  "You are not ready yet."` + C.reset);
      this.ln(C.gray  + `  Need ${commas(need)} exp for level ${p.level + 1}. Have ${commas(p.exp)}.` + C.reset);
      this.ln(C.gray  + `  Gap: ${commas(Math.max(0, need - p.exp))} exp.` + C.reset);
      this._anyKey(() => this._renderMain());
      return;
    }

    // Show trainer dialogue
    const dialogue = trainers.getTrainerDialogue(p.level, p.sex);
    if (dialogue) this.ln(colorize(dialogue));
    this.ln();
    this.ln(C.green + `  (A)dvance to Level ${p.level + 1}   (L)eave` + C.reset);
    this.out(C.white + 'Choice: ');
    this.state = 'master_menu';
  }

  _state_master_menu(ch) {
    if (ch === 'l') return this._renderMain();
    if (ch === 'a') {
      const p     = this.player;
      const gains = combat.doLevelUp(p);
      // Skill point per level-up
      const skillKeys = { 1: 'skillw', 2: 'skillm', 3: 'skillt' };
      const sk = skillKeys[p.class];
      if (p[sk] < 40) { p[sk]++; p[`level${sk.slice(-1)}`]++; }
      storage.savePlayer(p);
      this.ln();
      this.ln(C.yellow + `  *** You are now Level ${p.level}! ***` + C.reset);
      for (const g of gains) this.ln(C.green + `  ${g}` + C.reset);
      this.ln(C.cyan + `  +1 ${CLASSES[p.class].skillName} skill point!` + C.reset);
      this._anyKey(() => this._renderMain());
      return;
    }
    this.out(C.white + 'Choice: ');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER LIST / PVP
  // ══════════════════════════════════════════════════════════════════════════

  _enterPlayerList() {
    const p       = this.player;
    const players = storage.getLivePlayers().filter(pl => pl.id !== p.id);
    this.cls();
    this.ln(C.white + titleBar('Other Adventurers') + C.reset);
    this.ln();
    if (players.length === 0) {
      this.ln(C.gray + `  No other adventurers in the realm yet.` + C.reset);
    } else {
      this.ln(C.gray + `  ${'#'.padEnd(3)} ${'Name'.padEnd(18)} ${'Lv'.padEnd(4)} ${'Class'.padEnd(13)} ${'HP'.padEnd(8)} Description` + C.reset);
      this.ln(C.dkblue + `  ` + `─`.repeat(74) + C.reset);
      players.forEach((pl, i) => {
        const cls  = CLASSES[pl.class]?.name || '?';
        const desc = appearance.getAppearance(pl);
        this.ln(
          C.gray  + `  ${String(i + 1).padEnd(3)} ` +
          C.white + pl.name.padEnd(18) +
          C.gray  + String(pl.level).padEnd(4) + cls.padEnd(13) +
          (pl.hp < pl.hpMax * 0.3 ? C.red : C.green) + `${pl.hp}/${pl.hpMax}`.padEnd(8) +
          C.gray  + desc + C.reset
        );
      });
    }
    this.ln();
    this._anyKey(() => this._renderMain());
    this.state = 'players_list';
  }

  _state_players_list(_ch) {
    this._renderMain();
  }

  _enterPvP() {
    const p = this.player;
    this.cls();
    this.ln(C.white + titleBar('Player Battle') + C.reset);
    this.ln();

    if (p.dead) { this.ln(C.red + `  You are dead!` + C.reset); this._anyKey(() => this._renderMain()); return; }
    if (p.humanLeft <= 0) { this.ln(C.red + `  No PvP fights remaining today.` + C.reset); this._anyKey(() => this._renderMain()); return; }

    const targets = storage.getLivePlayers().filter(pl => pl.id !== p.id);
    if (targets.length === 0) { this.ln(C.gray + `  No other players to battle.` + C.reset); this._anyKey(() => this._renderMain()); return; }

    this.ln(C.gray + `  PvP fights remaining: ${C.white}${p.humanLeft}` + C.reset);
    this.ln();
    targets.forEach((pl, i) => {
      const cls  = CLASSES[pl.class]?.name || '?';
      const desc = appearance.getAppearance(pl);
      this.ln(C.gray + `  (${i + 1}) ${C.white}${pl.name.padEnd(18)}${C.gray} Lv${pl.level} ${cls}  HP:${pl.hp}/${pl.hpMax}  ${desc}` + C.reset);
    });
    this.ln();
    this.ln(C.gray + `  Enter number to attack, or (R)eturn:` + C.reset);
    this._context.pvpTargets = targets;
    this.out(C.white + '> ');
    this.state = 'pvp_list_page';
  }

  _state_pvp_list_page(ch) {
    if (ch === 'r') return this._renderMain();
    const n = parseInt(ch);
    const targets = this._context.pvpTargets || [];
    if (isNaN(n) || n < 1 || n > targets.length) { this.out(C.white + '> '); return; }
    this._context.pvpTarget = targets[n - 1];
    this.ln(C.red + `\r\n  Attack ${this._context.pvpTarget.name}? (Y/N)` + C.reset);
    this.out(C.white + '> ');
    this.state = 'pvp_confirm';
  }

  _state_pvp_confirm(ch) {
    if (ch !== 'y') return this._renderMain();
    const p      = this.player;
    const target = this._context.pvpTarget;
    const fresh  = storage.findById(target.id);
    if (!fresh || fresh.dead) {
      this.ln(C.gray + `\r\n  That player is unavailable.` + C.reset);
      this._anyKey(() => this._renderMain());
      return;
    }
    const result = combat.fightPlayer(p, fresh);
    p.humanLeft--;
    for (const l of result.log) this.ln(`  ` + l);
    // Kill taunt
    if (result.won) {
      const taunt = events.getKillTaunt(p.name, fresh.name);
      if (taunt) this.ln(C.gray + `  ` + taunt + C.reset);
    }
    storage.savePlayer(p);
    storage.savePlayer(fresh);
    this._anyKey(() => this._renderMain());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAVERN
  // ══════════════════════════════════════════════════════════════════════════

  _enterTavern() {
    this.cls();
    this.ln(C.brown + titleBar('The Dark Cloak Tavern') + C.reset);
    this.ln(C.brown + `  A blazing fire warms your heart as well as your body in this fragrant` + C.reset);
    this.ln(C.brown + `  roadhouse. Many a wary traveler has found refuge here.` + C.reset);
    this.ln();
    this.ln(C.green + `  (C)onverse with the Patrons`);
    this.ln(C.green + `  (D)aily News`);
    this.ln(C.green + `  (G)amble with the Locals`);
    this.ln(C.green + `  (J)oin the Blackjack Table`);
    this.ln(C.green + `  (B)ard's Song`);
    this.ln(C.green + `  (Y)our Stats`);
    this.ln(C.green + `  (R)eturn` + C.reset);
    this.ln();
    this.out(C.white + 'Choice: ');
    this.state = 'tavern_menu';
  }

  _state_tavern_menu(ch) {
    const p = this.player;
    switch (ch) {
      case 'r': return this._renderMain();
      case 'y': return this._showStats();
      case 'b': {
        this.ln();
        const lines = [];
        events.eventBardSong(p, t => lines.push(t));
        for (const l of lines) this.ln(l);
        this._anyKey(() => this._enterTavern());
        return;
      }
      case 'd': {
        const gs = storage.getGameState();
        this.ln();
        this.ln(C.yellow + `  *** Daily News ***` + C.reset);
        this.ln(C.gray   + `  Day: ${gs.currentDay}   Champion: ${C.white}${gs.championName}` + C.reset);
        this.ln(C.gray   + `  Players in the realm: ${C.white}${storage.getAll().length}` + C.reset);
        this._anyKey(() => this._enterTavern());
        return;
      }
      case 'c': {
        const players = storage.getAll();
        this.ln();
        this.ln(C.yellow + `  Overheard in the tavern:` + C.reset);
        if (players.length > 0) {
          const s = players[Math.floor(Math.random() * players.length)];
          const quips = [
            `"${s.name} was seen near the forest edge last night..."`,
            `"I hear ${s.name} ${appearance.getAppearance(s)}"`,
            `"${s.name} has slain ${s.kills} opponents. Bold."`,
            `"${s.name}? Level ${s.level}? That's something."`,
            `"${s.name} is ${s.married >= 0 ? 'taken' : 'available'}, they say."`,
          ];
          this.ln(C.gray + `  ` + quips[Math.floor(Math.random() * quips.length)] + C.reset);
        } else {
          this.ln(C.gray + `  "The forest grows darker each night..."` + C.reset);
        }
        this._anyKey(() => this._enterTavern());
        return;
      }
      case 'g': {
        // Simple dice gamble
        const bet = Math.min(Math.floor(p.gold * 0.1), 500);
        if (bet <= 0) {
          this.ln(C.red + `\r\n  You have no gold to gamble!` + C.reset);
          this._anyKey(() => this._enterTavern()); return;
        }
        if (rnd(1, 2) === 1) {
          p.gold += bet;
          this.ln(C.green + `\r\n  The dice are with you! +${commas(bet)}g` + C.reset);
        } else {
          p.gold -= bet;
          this.ln(C.red + `\r\n  Luck was not on your side. -${commas(bet)}g` + C.reset);
        }
        storage.savePlayer(p);
        this._anyKey(() => this._enterTavern());
        return;
      }
      case 'j': return this._enterBlackjack();
      default:  this.out(C.white + 'Choice: ');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BLACKJACK
  // ══════════════════════════════════════════════════════════════════════════

  _enterBlackjack() {
    const p = this.player;
    if (p.gold < 10) {
      this.ln(C.red + `\r\n  "You need at least 10 gold to play!"` + C.reset);
      this._anyKey(() => this._enterTavern()); return;
    }
    this.cls();
    this.ln(C.white + titleBar('Blackjack Table') + C.reset);
    this.ln();
    const bet = Math.min(Math.max(10, Math.floor(p.gold * 0.1)), 1000);
    this._context.bjBet = bet;

    const deck = this._bjNewDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];
    this._context.bjDeck     = deck;
    this._context.bjPlayer   = playerHand;
    this._context.bjDealer   = dealerHand;

    this._renderBlackjack(false);
  }

  _bjCard()  { return Math.min(rnd(1, 13), 10); }
  _bjNewDeck() {
    const deck = [];
    for (let i = 0; i < 4; i++)
      for (let v = 1; v <= 13; v++) deck.push(Math.min(v, 10));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
  _bjTotal(hand) {
    let total = hand.reduce((s, c) => s + c, 0);
    const aces = hand.filter(c => c === 1).length;
    for (let i = 0; i < aces && total + 10 <= 21; i++) total += 10;
    return total;
  }
  _bjFmt(hand, hideSecond = false) {
    return hand.map((c, i) => (i === 1 && hideSecond) ? `[?]` : `[${c === 1 ? 'A' : c}]`).join(' ');
  }

  _renderBlackjack(reveal) {
    const { bjPlayer: ph, bjDealer: dh, bjBet: bet } = this._context;
    const p = this.player;
    const pt = this._bjTotal(ph);
    const dt = this._bjTotal(dh);

    this.ln(C.gray   + `  Your gold: ${C.yellow}${commas(p.gold)}${C.gray}   Bet: ${C.white}${commas(bet)}` + C.reset);
    this.ln();
    this.ln(C.white  + `  Dealer: ` + C.yellow + this._bjFmt(dh, !reveal) + (reveal ? C.gray + ` (${dt})` : '') + C.reset);
    this.ln(C.white  + `  You:    ` + C.green  + this._bjFmt(ph) + C.gray + ` (${pt})` + C.reset);
    this.ln();

    if (!reveal) {
      if (pt === 21) {
        this.ln(C.yellow + `  Blackjack!` + C.reset);
        return this._bjEnd(true);
      }
      this.ln(C.green + `  (H)it   (S)tand` + C.reset);
      this.out(C.white + 'Choice: ');
      this.state = 'blackjack_menu';
    } else {
      this._bjEnd(null);
    }
  }

  _state_blackjack_menu(ch) {
    const deck = this._context.bjDeck;
    const ph   = this._context.bjPlayer;
    const dh   = this._context.bjDealer;
    const p    = this.player;

    if (ch === 'h') {
      ph.push(deck.pop() || this._bjCard());
      const pt = this._bjTotal(ph);
      this.ln();
      if (pt > 21) {
        this.ln(C.white + `  You:    ` + C.red + this._bjFmt(ph) + C.gray + ` (${pt}) — BUST!` + C.reset);
        return this._bjEnd(false);
      }
      this._renderBlackjack(false);
      return;
    }
    if (ch === 's') {
      // Dealer draws to 17
      while (this._bjTotal(dh) < 17) dh.push(deck.pop() || this._bjCard());
      this._renderBlackjack(true);
      return;
    }
    this.out(C.white + 'Choice: ');
  }

  _bjEnd(won) {
    const p   = this.player;
    const bet = this._context.bjBet;
    const ph  = this._context.bjPlayer;
    const dh  = this._context.bjDealer;
    const pt  = this._bjTotal(ph);
    const dt  = this._bjTotal(dh);

    if (won === null) {
      // Dealer done — compare
      won = (pt <= 21) && (dt > 21 || pt > dt);
      if (pt === dt) won = null; // push
    }

    if (won === true) {
      p.gold += bet;
      this.ln(C.green + `\r\n  You win! +${commas(bet)} gold!` + C.reset);
    } else if (won === false) {
      p.gold -= bet;
      this.ln(C.red + `\r\n  You lose. -${commas(bet)} gold.` + C.reset);
    } else {
      this.ln(C.yellow + `\r\n  Push — your bet is returned.` + C.reset);
    }

    storage.savePlayer(p);
    this.ln();
    this.ln(C.gray + `  (P)lay again   (L)eave` + C.reset);
    this.out(C.white + 'Choice: ');
    this.state = 'blackjack_menu';
    this._context.bjEnded = true;
  }

  // Override blackjack_menu to handle post-game input
  _state_blackjack_menu_orig = this._state_blackjack_menu;

  // ── patch: after end, P=play again, L=leave
  _patchBlackjack() {
    const orig = this._state_blackjack_menu.bind(this);
    this._state_blackjack_menu = (ch) => {
      if (this._context.bjEnded) {
        this._context.bjEnded = false;
        if (ch === 'p') return this._enterBlackjack();
        return this._enterTavern();
      }
      orig(ch);
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATS
  // ══════════════════════════════════════════════════════════════════════════

  _showStats() {
    const p = this.player;
    this.cls();
    this.ln(C.white + titleBar(`${p.name} — Character Stats`) + C.reset);
    this.ln();
    this.ln(C.gray + `  ${appearance.describePlayer(p)}` + C.reset);
    this.ln();
    this.ln(C.gray + `  Class:     ${C.white}${CLASSES[p.class]?.name}${C.gray}  (${p.sex === 5 ? 'Female' : 'Male'})`);
    this.ln(C.gray + `  Level:     ${C.white}${p.level}${C.gray}  EXP: ${C.white}${commas(p.exp)}`);
    this.ln(C.gray + `  HP:        ${C.green}${p.hp}${C.gray}/${p.hpMax}`);
    this.ln(C.gray + `  Strength:  ${C.white}${p.strength}${C.gray}  (${p.weapon})`);
    this.ln(C.gray + `  Defense:   ${C.white}${p.def}${C.gray}  (${p.arm})`);
    this.ln(C.gray + `  Charm:     ${C.white}${p.charm}`);
    this.ln(C.gray + `  Gold:      ${C.yellow}${commas(p.gold)}${C.gray}  Bank: ${C.yellow}${commas(p.bank)}`);
    this.ln(C.gray + `  Gems:      ${C.white}${p.gem}` +
      (p.hasAmulet ? C.cyan + `   [Amulet of Accuracy]` : '') + C.reset);
    this.ln(C.gray + `  Kills:     ${C.white}${p.kills}${C.gray}  Game wins: ${C.white}${p.king}`);
    this.ln(C.gray + `  Horse:     ${C.white}${p.extra ? 'Yes (+10 fights/day)' : 'No'}`);
    const nextLvl = p.level;
    if (nextLvl < LEVEL_EXP.length) {
      const needed = LEVEL_EXP[nextLvl] - p.exp;
      this.ln(C.gray + `  To level:  ${C.white}${commas(Math.max(0, needed))}${C.gray} exp needed`);
    } else {
      this.ln(C.gray + `  Level:     ${C.yellow}MAX`);
    }
    this.ln();
    this.ln(C.gray + `  Forest fights: ${C.white}${p.fightsLeft}  ${C.gray}PvP: ${C.white}${p.humanLeft}`);
    this.ln(C.gray + `  Skills — DK:${p.skillw} (${p.levelw} uses)  Mage:${p.skillm} (${p.levelm} uses)  Thief:${p.skillt} (${p.levelt} uses)` + C.reset);
    this.ln();
    this._anyKey(() => this._renderMain());
    this.state = 'any_key';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // QUIT
  // ══════════════════════════════════════════════════════════════════════════

  _quit() {
    storage.savePlayer(this.player);
    this.cls();
    this.ln(C.red + `  Farewell, ${this.player.name}. May your sword stay sharp.` + C.reset);
    this.ln();
    this._send('\x04');
  }
}

// Fix blackjack post-game state on construction
const _origConstructor = GameSession;
class GameSessionPatched extends GameSession {
  constructor(send) {
    super(send);
    const orig = this._state_blackjack_menu.bind(this);
    this._state_blackjack_menu = (ch) => {
      if (this._context.bjEnded) {
        this._context.bjEnded = false;
        if (ch === 'p') return this._enterBlackjack();
        return this._enterTavern();
      }
      orig(ch);
    };
  }
}

module.exports = { GameSession: GameSessionPatched };
