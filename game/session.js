'use strict';

const storage  = require('./storage');
const combat   = require('./combat');
const monsters = require('./monsters');
const { C, colorize, commas, titleBar, rnd } = require('./text');
const { WEAPONS, ARMOUR, CLASSES, LEVEL_EXP, INN_COST, HEALER_RATE, GEM_HEAL,
        BASE_FOREST_FIGHTS, BASE_PVP_FIGHTS } = require('./constants');

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const CRLF  = '\r\n';
const CLRSCR = '\x1b[2J\x1b[H';

function line(text = '') { return text + CRLF; }
function bold(t) { return C.white + t + C.reset; }
function hi(t)   { return C.yellow + t + C.reset; }

// ── Divider lines ─────────────────────────────────────────────────────────────
const DIV_RED  = C.dkred  + '─'.repeat(79) + C.reset + CRLF;
const DIV_BLUE = C.dkblue + '─'.repeat(79) + C.reset + CRLF;

// ── GameSession class ─────────────────────────────────────────────────────────
class GameSession {
  constructor(send) {
    this._send    = send;  // fn(text) — writes raw bytes to socket
    this.player   = null;
    this.state    = 'login_name';
    this._buf     = '';    // pending input line
    this._context = {};   // state-specific scratch space
  }

  // ── Output helpers ──────────────────────────────────────────────────────────
  out(text)     { this._send(text); }
  ln(text = '') { this._send(text + CRLF); }
  cls()         { this._send(CLRSCR); }

  // ── Input entry point ───────────────────────────────────────────────────────
  onKey(ch) {
    // Printable chars go into line buffer; Enter dispatches.
    // Some states (single-key menus) don't buffer.

    const singleKey = [
      'main_menu','forest_menu','fight_choice',
      'shop_weapon','shop_armor','bank_menu',
      'healer_menu','inn_menu','tavern_menu',
      'master_menu','pvp_list_page','pvp_confirm',
      'players_list','game_over','death_screen',
    ];

    if (singleKey.includes(this.state)) {
      this._dispatch(ch.toLowerCase());
      return;
    }

    // Line-buffered input
    if (ch === '\r' || ch === '\n') {
      const input = this._buf.trim();
      this._buf = '';
      this.out(CRLF);
      this._dispatch(input);
    } else if (ch === '\x08' || ch === '\x7f') {
      // Backspace
      if (this._buf.length > 0) {
        this._buf = this._buf.slice(0, -1);
        this.out('\x08 \x08');
      }
    } else if (ch >= ' ' && this._buf.length < 50) {
      this._buf += ch;
      const echo = (this.state === 'login_pass' || this.state === 'register_pass' || this.state === 'register_pass2')
        ? '*' : ch;
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

  // ══════════════════════════════════════════════════════════════════════════
  // LOGIN FLOW
  // ══════════════════════════════════════════════════════════════════════════

  start() {
    this.cls();
    this._renderBanner();
    this.ln(C.yellow + 'Enter your name (or NEW to create account):' + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'login_name';
  }

  _renderBanner() {
    this.ln(C.red   + '╔═══════════════════════════════════════════════════════════════════════════╗');
    this.ln(C.red   + '║' + C.yellow + '      ██╗      ██████╗ ██████╗ ██████╗      ' + C.red + '                           ║');
    this.ln(C.red   + '║' + C.yellow + '      ██║     ██╔═══██╗██╔══██╗██╔══██╗     ' + C.red + '                           ║');
    this.ln(C.red   + '║' + C.yellow + '      ██║     ██║   ██║██████╔╝██║  ██║     ' + C.red + '                           ║');
    this.ln(C.red   + '║' + C.yellow + '      ██║     ██║   ██║██╔══██╗██║  ██║     ' + C.red + '                           ║');
    this.ln(C.red   + '║' + C.yellow + '      ███████╗╚██████╔╝██║  ██║██████╔╝     ' + C.red + '                           ║');
    this.ln(C.red   + '║' + C.dkred  + '   Legend of the Red Dragon  ' + C.gray + '— Browser Edition  ' + C.red + '                    ║');
    this.ln(C.red   + '╚═══════════════════════════════════════════════════════════════════════════╝');
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
      this.ln(C.red + 'Player not found. Type NEW to create an account.' + C.reset);
      this.out(C.white + '> ' + C.reset);
      return;
    }
    this.ln(C.yellow + 'Password:' + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'login_pass';
  }

  async _state_login_pass(pw) {
    const player = storage.findByName(this._context.loginName);
    if (!player) { this.start(); return; }
    const ok = await storage.checkPassword(pw, player.passwordHash);
    if (!ok) {
      this.ln(C.red + 'Wrong password.' + C.reset);
      this.ln(C.yellow + 'Name:' + C.reset);
      this.out(C.white + '> ' + C.reset);
      this.state = 'login_name';
      return;
    }
    this.player = player;
    this._enterGame();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REGISTRATION FLOW
  // ══════════════════════════════════════════════════════════════════════════

  _state_register_name(name) {
    name = name.slice(0, 20).trim();
    if (!name) { this.out(C.white + '> '); return; }
    if (storage.findByName(name)) {
      this.ln(C.red + 'That name is taken.' + C.reset);
      this.out(C.white + '> ' + C.reset);
      return;
    }
    this._context.regName = name;
    this.ln(C.yellow + 'Enter your real name (BBS handle):' + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'register_realname';
  }

  _state_register_realname(name) {
    this._context.regRealName = name.slice(0, 50).trim() || this._context.regName;
    this.ln(C.yellow + 'Choose a password:' + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'register_pass';
  }

  _state_register_pass(pw) {
    if (pw.length < 4) {
      this.ln(C.red + 'Password must be at least 4 characters.' + C.reset);
      this.out(C.white + '> ');
      return;
    }
    this._context.regPass = pw;
    this.ln(C.yellow + 'Confirm password:' + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'register_pass2';
  }

  async _state_register_pass2(pw) {
    if (pw !== this._context.regPass) {
      this.ln(C.red + 'Passwords do not match.' + C.reset);
      this.ln(C.yellow + 'Choose a password:' + C.reset);
      this.out(C.white + '> ');
      this.state = 'register_pass';
      return;
    }
    this.ln();
    this.ln(C.yellow + 'Choose your gender:' + C.reset);
    this.ln(C.green + '  (M)ale   (F)emale' + C.reset);
    this.out(C.white + '> ');
    this.state = 'register_sex';
  }

  _state_register_sex(ch) {
    ch = ch.toLowerCase();
    if (ch !== 'm' && ch !== 'f') {
      this.out(C.white + '> '); return;
    }
    this._context.regSex = ch === 'f' ? 5 : 0;
    this.ln();
    this.ln(C.yellow + 'Choose your class:' + C.reset);
    this.ln(C.green  + '  (1) Death Knight  — strong warrior, deadly strikes');
    this.ln(C.cyan   + '  (2) Mystical      — uses magic, starts with gems');
    this.ln(C.dkgray + '  (3) Thief         — fast, steals gold, extra starting cash' + C.reset);
    this.out(C.white + '> ');
    this.state = 'register_class';
  }

  async _state_register_class(ch) {
    const cls = parseInt(ch);
    if (cls < 1 || cls > 3 || isNaN(cls)) {
      this.out(C.white + '> '); return;
    }
    this._context.regClass = cls;
    const hash = await storage.hashPassword(this._context.regPass);
    const player = storage.newPlayer(
      this._context.regName,
      this._context.regRealName,
      hash,
      this._context.regSex,
      cls,
    );
    this.player = player;
    this.ln();
    this.ln(C.green + `Welcome, ${player.name}! Your adventure begins...` + C.reset);
    this.ln(C.gray  + `Class: ${CLASSES[cls].name}  ` +
            `HP: ${player.hp}  STR: ${player.strength}  Gold: ${commas(player.gold)}` + C.reset);
    this._enterGame();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GAME ENTRY
  // ══════════════════════════════════════════════════════════════════════════

  _enterGame() {
    const p = this.player;
    // Daily reset check
    const newDay = storage.resetPlayerDay(p);
    storage.savePlayer(p);

    this.cls();
    if (newDay) {
      this.ln(C.yellow + '*** A new day has dawned in the realm! ***' + C.reset);
      this.ln(C.green  + 'Your fight counts have been restored.' + C.reset);
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

    // Status bar
    this.ln(DIV_RED.trimEnd());
    this.ln(
      C.white + ` ${p.name}` +
      C.gray  + `  Lv${p.level} ${CLASSES[p.class].name}` +
      C.gray  + `  HP: ` + (p.hp < p.hpMax * 0.3 ? C.red : C.green) + `${p.hp}/${p.hpMax}` +
      C.gray  + `  STR: ${p.strength}  DEF: ${p.def}` +
      C.yellow+ `  Gold: ${commas(p.gold)}` +
      C.gray  + `  EXP: ${commas(p.exp)}` +
      C.reset
    );
    this.ln(
      C.gray + `  Fights: ${C.white}${p.fightsLeft}${C.gray}  PvP: ${C.white}${p.humanLeft}` +
      C.gray + `  Gems: ${C.white}${p.gem}` +
      (p.extra ? C.gray + `  ${C.yellow}[Horse]` : '') + C.reset
    );
    this.ln(DIV_RED.trimEnd());
    this.ln();

    // Main menu
    this.ln(C.yellow + '  `%Legend of the Red Dragon' + C.gray + '   — Main Menu' + C.reset);
    this.ln();
    this.ln(C.dkgreen + '  (F)' + C.green  + 'orest               ' + C.dkgreen + '(P)' + C.green  + 'layer Battle');
    this.ln(C.dkgreen + '  (H)' + C.green  + 'ealer               ' + C.dkgreen + '(I)' + C.green  + 'nn — Rest & Recover');
    this.ln(C.dkgreen + '  (W)' + C.green  + 'eapons Shop         ' + C.dkgreen + '(A)' + C.green  + 'rmour Shop');
    this.ln(C.dkgreen + '  (B)' + C.green  + 'ank                 ' + C.dkgreen + '(V)' + C.green  + 'iew Players');
    this.ln(C.dkgreen + '  (T)' + C.green  + 'avern               ' + C.dkgreen + '(S)' + C.green  + 'tats');
    if (combat.canLevelUp(this.player)) {
      this.ln(C.red + '  (L)evel Up! *** You are ready! ***' + C.reset);
    } else {
      this.ln(C.gray + '  (L)evel Up? (visit Master when ready)');
    }
    this.ln(C.dkred  + '  (Q)' + C.red + 'uit' + C.reset);
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
      default:
        this.out(C.white + 'Choice: ');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FOREST
  // ══════════════════════════════════════════════════════════════════════════

  _enterForest() {
    const p = this.player;
    this.cls();
    this.ln(DIV_BLUE.trimEnd());
    this.ln(C.dkgreen + '  `2Dark Forest' + C.gray + '  —  A dense tangle of shadow and menace.' + C.reset);
    this.ln(DIV_BLUE.trimEnd());
    this.ln();

    if (p.fightsLeft <= 0) {
      this.ln(C.red + '  You have no forest fights remaining today.' + C.reset);
      this.ln(C.gray + '  Return tomorrow, or rest at the Inn.' + C.reset);
      this.ln();
      this._promptReturn();
      return;
    }

    // Pick a monster
    const monster = monsters.randomMonster(p.level);
    this._context.monster = monster;

    this.ln(C.gray + `  Fights remaining today: ${C.white}${p.fightsLeft}` + C.reset);
    this.ln();
    this.ln(C.yellow + `  You venture into the dark forest...` + C.reset);
    this.ln(C.red    + `  A ${monster.name} leaps out at you!` + C.reset);
    this.ln(C.gray   + `  It wields: ${C.white}${monster.weapon}${C.gray}  HP: ${C.white}${monster.hp}${C.gray}  STR: ${C.white}${monster.strength}` + C.reset);
    this.ln();

    const hasSpecial = (p.class === 1 && p.levelw > 0) ||
                       (p.class === 2 && p.levelm > 0) ||
                       (p.class === 3 && p.levelt > 0);
    const specialKey = ['', 'W', 'M', 'T'][p.class];
    const specialName = CLASSES[p.class].skillName;

    this.ln(C.green + `  (A)ttack      (F)lee`);
    if (hasSpecial) {
      this.ln(C.cyan + `  (${specialKey})${specialName}`);
    }
    this.ln(C.gray + `  (G)em healing (${p.gem} gems, ${p.gem * GEM_HEAL} HP)` + C.reset);
    this.ln();
    this.out(C.white + 'Choice: ' + C.reset);

    this.state = 'forest_menu';
  }

  _state_forest_menu(ch) {
    const p = this.player;
    const monster = this._context.monster;

    if (ch === 'g') {
      // Gem healing
      if (p.gem <= 0) {
        this.ln(C.red + '  You have no gems!' + C.reset);
        this.out(C.white + 'Choice: ');
        return;
      }
      p.gem--;
      const healed = Math.min(GEM_HEAL, p.hpMax - p.hp);
      p.hp = Math.min(p.hpMax, p.hp + GEM_HEAL);
      this.ln(C.green + `  You use a gem and restore ${healed} HP. (HP: ${p.hp}/${p.hpMax})` + C.reset);
      this.out(C.white + 'Choice: ');
      return;
    }

    if (ch === 'f') {
      // Flee — 60% success rate (thief gets +20%)
      const fleeChance = p.class === 3 ? 80 : 60;
      if (rnd(1, 100) <= fleeChance) {
        this.ln(C.yellow + '  You flee from battle!' + C.reset);
      } else {
        this.ln(C.red + '  You tried to flee but the monster blocks your path!' + C.reset);
        // Monster gets a free hit
        const ma = combat.monsterAttack(p, monster);
        this.ln('  ' + ma.text);
        p.hp -= ma.damage;
        if (p.hp <= 0) {
          p.hp = 0;
          return this._playerDeath(monster.name);
        }
        this.ln(C.gray + `  HP: ${p.hp}/${p.hpMax}` + C.reset);
      }
      p.fightsLeft--;
      storage.savePlayer(p);
      this._promptReturn();
      return;
    }

    // Special ability keys
    const specials = { w: 1, m: 2, t: 3 };
    if (specials[ch] && specials[ch] === p.class) {
      const result = combat.useSpecial(p, monster);
      this.ln('  ' + result.text);
      if (result.used) {
        monster.hp -= result.damage;
        if (monster.hp <= 0) {
          return this._fightWon(monster, result.damage);
        }
        // Monster retaliates
        const ma = combat.monsterAttack(p, monster);
        this.ln('  ' + ma.text);
        p.hp -= ma.damage;
        if (p.hp <= 0) {
          p.hp = 0;
          return this._playerDeath(monster.name);
        }
        this.ln(C.gray + `  Monster HP: ${Math.max(0,monster.hp)}  Your HP: ${p.hp}/${p.hpMax}` + C.reset);
        this.out(C.white + 'Choice: ');
      } else {
        this.out(C.white + 'Choice: ');
      }
      return;
    }

    if (ch !== 'a') {
      this.out(C.white + 'Choice: ');
      return;
    }

    // Full fight
    this.ln();
    const result = combat.fightMonster(p, monster);
    for (const l of result.log) this.ln('  ' + l);
    this.ln();

    p.fightsLeft--;

    if (result.dead) {
      return this._playerDeath(monster.name);
    }

    // Check level up
    if (combat.canLevelUp(p)) {
      this.ln(C.yellow + '  *** You have enough experience to level up! Visit the Master! ***' + C.reset);
    }

    storage.savePlayer(p);
    this._promptReturn();
  }

  _fightWon(monster, extraDamage = 0) {
    const p = this.player;
    p.exp   += monster.exp;
    p.gold  += monster.gold;
    p.fightsLeft--;
    if (monster.deathMsg) this.ln(C.dkgreen + '  ' + monster.deathMsg + C.reset);
    this.ln(C.green  + `  You defeated the ${monster.name}!` + C.reset);
    this.ln(C.yellow + `  +${monster.gold} gold  +${monster.exp} exp` + C.reset);
    if (combat.canLevelUp(p)) {
      this.ln(C.yellow + '  *** Level up ready! Visit the Master! ***' + C.reset);
    }
    storage.savePlayer(p);
    this._promptReturn();
  }

  _playerDeath(killerName) {
    const p = this.player;
    p.dead = true;
    storage.savePlayer(p);
    this.cls();
    this.ln(C.red + DIV_RED.trimEnd());
    this.ln(C.red + '  *** YOU HAVE DIED ***' + C.reset);
    this.ln(C.red + DIV_RED.trimEnd());
    this.ln();
    this.ln(C.dkred + `  You were slain by ${killerName}.` + C.reset);
    this.ln(C.gray  + '  You lost half your gold and all your gems.' + C.reset);
    this.ln(C.gray  + '  You may be resurrected by the Healer for a fee.' + C.reset);
    this.ln();
    this.out(C.white + '  Press any key to continue...' + C.reset);
    this.state = 'death_screen';
  }

  _state_death_screen(_ch) {
    this._renderMain();
  }

  _promptReturn() {
    this.ln(C.gray + '  (R)eturn to town   (A)nother fight' + C.reset);
    this.out(C.white + 'Choice: ' + C.reset);
    this.state = 'fight_choice';
  }

  _state_fight_choice(ch) {
    if (ch === 'a') return this._enterForest();
    this._renderMain();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HEALER
  // ══════════════════════════════════════════════════════════════════════════

  _enterHealer() {
    const p = this.player;
    this.cls();
    this.ln(C.white  + titleBar('Healer\'s Hut') + C.reset);
    this.ln();
    this.ln(C.green  + '  A kindly healer greets you.' + C.reset);
    this.ln(C.gray   + `  HP: ${C.green}${p.hp}/${p.hpMax}${C.gray}   Gold: ${C.yellow}${commas(p.gold)}` + C.reset);
    this.ln();

    if (p.dead) {
      const resurrectCost = 1000 * p.level;
      this.ln(C.red   + '  "You are dead, adventurer!"' + C.reset);
      this.ln(C.gray  + `  Resurrection costs ${C.yellow}${commas(resurrectCost)}${C.gray} gold.` + C.reset);
      this.ln(C.green + `  (R)esurrect (${commas(resurrectCost)}g)   (L)eave` + C.reset);
      this._context.resurrectCost = resurrectCost;
      this.out(C.white + 'Choice: ');
      this.state = 'healer_menu';
      return;
    }

    const hpNeeded = p.hpMax - p.hp;
    const healCost = hpNeeded * HEALER_RATE;
    this.ln(C.green + `  (H)eal to full  (${commas(healCost)}g — ${hpNeeded} HP needed)`);
    this.ln(C.green + `  (L)eave` + C.reset);
    this.ln();
    this._context.healCost = healCost;
    this.out(C.white + 'Choice: ');
    this.state = 'healer_menu';
  }

  _state_healer_menu(ch) {
    const p = this.player;
    if (ch === 'l') return this._renderMain();

    if (p.dead && ch === 'r') {
      const cost = this._context.resurrectCost;
      if (p.gold < cost) {
        this.ln(C.red + '  "You cannot afford resurrection!"' + C.reset);
        this.ln(C.gray + '  Check back when you have enough gold in hand.' + C.reset);
      } else {
        p.gold -= cost;
        p.dead  = false;
        p.hp    = Math.floor(p.hpMax / 2);
        storage.savePlayer(p);
        this.ln(C.green + '  The healer chants and you are restored to life!' + C.reset);
        this.ln(C.gray  + `  HP: ${p.hp}/${p.hpMax}` + C.reset);
      }
      this.ln();
      this.out(C.white + '  Press any key...' + C.reset);
      this.state = 'death_screen'; // reuse "press any key" handler
      return;
    }

    if (!p.dead && ch === 'h') {
      const cost = this._context.healCost;
      if (p.gold < cost && cost > 0) {
        // Partial heal with available gold
        const affordable = Math.floor(p.gold / HEALER_RATE);
        if (affordable <= 0) {
          this.ln(C.red + '  You cannot afford any healing.' + C.reset);
        } else {
          p.hp   = Math.min(p.hpMax, p.hp + affordable);
          p.gold -= affordable * HEALER_RATE;
          this.ln(C.green + `  Partially healed to ${p.hp} HP.` + C.reset);
          storage.savePlayer(p);
        }
      } else if (cost === 0) {
        this.ln(C.green + '  You are already at full health!' + C.reset);
      } else {
        p.gold -= cost;
        p.hp    = p.hpMax;
        storage.savePlayer(p);
        this.ln(C.green + `  Fully healed! HP: ${p.hp}/${p.hpMax}` + C.reset);
      }
    }

    this.ln();
    this.out(C.white + '  Press any key...' + C.reset);
    this.state = 'death_screen';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INN
  // ══════════════════════════════════════════════════════════════════════════

  _enterInn() {
    const p = this.player;
    this.cls();
    this.ln(C.white + titleBar('The Inn') + C.reset);
    this.ln();
    this.ln(C.brown + '  A warm fire crackles. The innkeeper nods.' + C.reset);
    this.ln(C.gray  + `  HP: ${p.hp}/${p.hpMax}   Gold: ${commas(p.gold)}` + C.reset);
    this.ln();
    this.ln(C.green + `  (S)leep (${INN_COST}g — wake fully healed)`);
    this.ln(C.green + `  (L)eave` + C.reset);
    this.ln();
    this.out(C.white + 'Choice: ');
    this.state = 'inn_menu';
  }

  _state_inn_menu(ch) {
    const p = this.player;
    if (ch === 's') {
      if (p.gold < INN_COST) {
        this.ln(C.red + `  "You can't afford a room!" (Need ${INN_COST}g)` + C.reset);
      } else {
        p.gold -= INN_COST;
        p.hp    = p.hpMax;
        p.inn   = false; // immediate heal (true inn-flag is for overnight reset)
        storage.savePlayer(p);
        this.ln(C.green + '  You sleep soundly and wake fully healed.' + C.reset);
        this.ln(C.gray  + `  HP: ${p.hp}/${p.hpMax}` + C.reset);
      }
      this.ln();
      this.out(C.white + '  Press any key...' + C.reset);
      this.state = 'death_screen';
      return;
    }
    this._renderMain();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WEAPON SHOP
  // ══════════════════════════════════════════════════════════════════════════

  _enterWeaponShop() {
    const p = this.player;
    this.cls();
    this.ln(C.white + titleBar("Weapon Shop") + C.reset);
    this.ln(C.gray  + `  Current weapon: ${C.white}${p.weapon}${C.gray}  Gold: ${C.yellow}${commas(p.gold)}` + C.reset);
    this.ln();
    WEAPONS.forEach((w, i) => {
      if (!w) return;
      const owned = p.weaponNum === i ? C.yellow + ' ◄ yours' : '';
      const canAfford = p.gold >= w.price ? C.green : C.gray;
      this.ln(`  ${canAfford}(${i}) ${w.name.padEnd(16)} ${C.white}+${w.strength} STR${C.gray}  ${commas(w.price)}g${owned}${C.reset}`);
    });
    this.ln();
    this.ln(C.gray + '  Enter weapon number to buy, or (R)eturn:' + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'shop_weapon';
  }

  _state_shop_weapon(ch) {
    if (ch === 'r') return this._renderMain();
    const n = parseInt(ch);
    const p = this.player;
    if (!isNaN(n) && n >= 1 && n <= 15 && WEAPONS[n]) {
      const w = WEAPONS[n];
      if (n <= p.weaponNum) {
        this.ln(C.red + '  You already have a better or equal weapon.' + C.reset);
      } else if (p.gold < w.price) {
        this.ln(C.red + `  You cannot afford that. (Need ${commas(w.price)}g)` + C.reset);
      } else {
        // Sell current weapon
        const oldW = WEAPONS[p.weaponNum];
        const sellPrice = oldW ? Math.floor(oldW.price * 0.5) : 0;
        p.gold -= w.price;
        if (sellPrice > 0) {
          p.gold += sellPrice;
          this.ln(C.gray + `  Sold ${oldW.name} for ${commas(sellPrice)}g.` + C.reset);
        }
        // Adjust strength
        if (oldW) p.strength -= oldW.strength;
        p.strength  += w.strength;
        p.weaponNum  = n;
        p.weapon     = w.name;
        storage.savePlayer(p);
        this.ln(C.green + `  You purchased the ${w.name}!` + C.reset);
      }
    }
    this.ln();
    this.out(C.white + '  Press any key...');
    this.state = 'death_screen';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ARMOUR SHOP
  // ══════════════════════════════════════════════════════════════════════════

  _enterArmourShop() {
    const p = this.player;
    this.cls();
    this.ln(C.white + titleBar("Abdul's Armour Shop") + C.reset);
    this.ln(C.gray  + `  Current armour: ${C.white}${p.arm}${C.gray}  Gold: ${C.yellow}${commas(p.gold)}` + C.reset);
    this.ln();
    ARMOUR.forEach((a, i) => {
      const owned = p.armNum === i ? C.yellow + ' ◄ yours' : '';
      const canAfford = i === 0 || p.gold >= a.price ? C.green : C.gray;
      this.ln(`  ${canAfford}(${i}) ${a.name.padEnd(18)} ${C.white}+${a.defense} DEF${C.gray}  ${i === 0 ? 'free' : commas(a.price) + 'g'}${owned}${C.reset}`);
    });
    this.ln();
    this.ln(C.gray + '  Enter armour number to buy, or (R)eturn:' + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'shop_armor';
  }

  _state_shop_armor(ch) {
    if (ch === 'r') return this._renderMain();
    const n = parseInt(ch);
    const p = this.player;
    if (!isNaN(n) && n >= 0 && n <= 15 && ARMOUR[n]) {
      const a = ARMOUR[n];
      if (n <= p.armNum) {
        this.ln(C.red + '  You already have better or equal armour.' + C.reset);
      } else if (n > 0 && p.gold < a.price) {
        this.ln(C.red + `  Cannot afford that. (Need ${commas(a.price)}g)` + C.reset);
      } else {
        const oldA = ARMOUR[p.armNum];
        const sellPrice = oldA && p.armNum > 0 ? Math.floor(oldA.price * 0.5) : 0;
        if (n > 0) p.gold -= a.price;
        if (sellPrice > 0) {
          p.gold += sellPrice;
          this.ln(C.gray + `  Sold ${oldA.name} for ${commas(sellPrice)}g.` + C.reset);
        }
        if (oldA) p.def -= oldA.defense;
        p.def   += a.defense;
        p.armNum = n;
        p.arm    = a.name;
        storage.savePlayer(p);
        this.ln(C.green + `  You are now wearing ${a.name}!` + C.reset);
      }
    }
    this.ln();
    this.out(C.white + '  Press any key...');
    this.state = 'death_screen';
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
    this.ln(C.green + '  (D)eposit   (W)ithdraw   (R)eturn' + C.reset);
    this.out(C.white + 'Choice: ');
    this.state = 'bank_menu';
  }

  _state_bank_menu(ch) {
    if (ch === 'r') return this._renderMain();
    const p = this.player;
    if (ch === 'd') {
      if (p.gold <= 0) {
        this.ln(C.red + '  You have no gold to deposit.' + C.reset);
        this.ln(); this.out(C.white + '  Press any key...'); this.state = 'death_screen';
        return;
      }
      this._context.bankMode = 'deposit';
      this.ln(C.yellow + `  Deposit how much? (max ${commas(p.gold)}):` + C.reset);
      this.out(C.white + '> ');
      this.state = 'bank_amount';
      return;
    }
    if (ch === 'w') {
      if (p.bank <= 0) {
        this.ln(C.red + '  Nothing in your bank account.' + C.reset);
        this.ln(); this.out(C.white + '  Press any key...'); this.state = 'death_screen';
        return;
      }
      this._context.bankMode = 'withdraw';
      this.ln(C.yellow + `  Withdraw how much? (max ${commas(p.bank)}):` + C.reset);
      this.out(C.white + '> ');
      this.state = 'bank_amount';
      return;
    }
    this.out(C.white + 'Choice: ');
  }

  _state_bank_amount(input) {
    const p = this.player;
    const amt = parseInt(input.replace(/,/g, ''));
    if (isNaN(amt) || amt <= 0) {
      this.ln(C.red + '  Invalid amount.' + C.reset);
      this.ln(); this.out(C.white + '  Press any key...'); this.state = 'death_screen';
      return;
    }
    if (this._context.bankMode === 'deposit') {
      const actual = Math.min(amt, p.gold);
      p.gold -= actual;
      p.bank += actual;
      storage.savePlayer(p);
      this.ln(C.green + `  Deposited ${commas(actual)}g.  Bank: ${commas(p.bank)}g` + C.reset);
    } else {
      const actual = Math.min(amt, p.bank);
      p.bank -= actual;
      p.gold += actual;
      storage.savePlayer(p);
      this.ln(C.green + `  Withdrew ${commas(actual)}g.  In hand: ${commas(p.gold)}g` + C.reset);
    }
    this.ln(); this.out(C.white + '  Press any key...'); this.state = 'death_screen';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MASTER (Level Up)
  // ══════════════════════════════════════════════════════════════════════════

  _enterMaster() {
    const p = this.player;
    this.cls();
    this.ln(C.white + titleBar("Turgon's Training Hall") + C.reset);
    this.ln();

    if (!combat.canLevelUp(p)) {
      const nextLvl = p.level;
      const need = nextLvl < LEVEL_EXP.length ? LEVEL_EXP[nextLvl] : Infinity;
      this.ln(C.dkred + '  "You are not ready, young one."' + C.reset);
      this.ln(C.gray + `  Need ${commas(need)} exp for level ${p.level + 1}.  Current: ${commas(p.exp)}` + C.reset);
      this.ln(C.gray + `  Gap: ${commas(need - p.exp)} exp remaining.` + C.reset);
      this.ln();
      this.out(C.white + '  Press any key...');
      this.state = 'death_screen';
      return;
    }

    this.ln(C.yellow + `  "You have proven yourself! Ready to advance to Level ${p.level + 1}!"` + C.reset);
    this.ln();
    this.ln(C.green + '  (A)dvance   (L)eave' + C.reset);
    this.out(C.white + 'Choice: ');
    this.state = 'master_menu';
  }

  _state_master_menu(ch) {
    if (ch === 'l') return this._renderMain();
    if (ch === 'a') {
      const p = this.player;
      const gains = combat.doLevelUp(p);
      storage.savePlayer(p);
      this.ln();
      this.ln(C.yellow + `  *** You are now Level ${p.level}! ***` + C.reset);
      for (const g of gains) this.ln(C.green + `  ${g}` + C.reset);
      this.ln();
      // Award a skill point
      if (p.class === 1 && p.skillw < 40) { p.skillw++; this.ln(C.cyan + '  +1 Death Knight Skill point!' + C.reset); }
      if (p.class === 2 && p.skillm < 40) { p.skillm++; this.ln(C.cyan + '  +1 Mystical Skill point!' + C.reset); }
      if (p.class === 3 && p.skillt < 40) { p.skillt++; this.ln(C.cyan + '  +1 Thieving Skill point!' + C.reset); }
      storage.savePlayer(p);
      this.ln();
      this.out(C.white + '  Press any key...');
      this.state = 'death_screen';
      return;
    }
    this.out(C.white + 'Choice: ');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER LIST / PVP
  // ══════════════════════════════════════════════════════════════════════════

  _enterPlayerList() {
    const p = this.player;
    const players = storage.getLivePlayers().filter(pl => pl.id !== p.id);
    this.cls();
    this.ln(C.white + titleBar('Other Adventurers') + C.reset);
    this.ln();
    if (players.length === 0) {
      this.ln(C.gray + '  No other adventurers in the realm yet.' + C.reset);
    } else {
      this.ln(C.gray + `  ${'#'.padEnd(4)} ${'Name'.padEnd(20)} ${'Lv'.padEnd(4)} ${'Class'.padEnd(14)} ${'HP'.padEnd(10)} Kills` + C.reset);
      this.ln(C.dkblue + '  ' + '─'.repeat(70) + C.reset);
      players.forEach((pl, i) => {
        const cls = CLASSES[pl.class]?.name || '?';
        this.ln(C.gray + `  ${String(i + 1).padEnd(4)} ${C.white}${pl.name.padEnd(20)}${C.gray} ${String(pl.level).padEnd(4)} ${cls.padEnd(14)} ${String(pl.hp + '/' + pl.hpMax).padEnd(10)} ${pl.kills}` + C.reset);
      });
    }
    this.ln();
    this.out(C.white + '  Press any key to return...' + C.reset);
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

    if (p.humanLeft <= 0) {
      this.ln(C.red + '  You have no PvP fights remaining today.' + C.reset);
      this.ln(); this.out(C.white + '  Press any key...'); this.state = 'death_screen';
      return;
    }

    const targets = storage.getLivePlayers().filter(pl => pl.id !== p.id);
    if (targets.length === 0) {
      this.ln(C.gray + '  No other players to battle.' + C.reset);
      this.ln(); this.out(C.white + '  Press any key...'); this.state = 'death_screen';
      return;
    }

    this.ln(C.gray + `  PvP fights remaining: ${C.white}${p.humanLeft}` + C.reset);
    this.ln();
    targets.forEach((pl, i) => {
      const cls = CLASSES[pl.class]?.name || '?';
      this.ln(C.gray + `  (${i + 1}) ${C.white}${pl.name.padEnd(20)}${C.gray} Lv${pl.level} ${cls}  HP:${pl.hp}/${pl.hpMax}  STR:${pl.strength}` + C.reset);
    });
    this.ln();
    this.ln(C.gray + '  Enter number to attack, or (R)eturn:' + C.reset);
    this._context.pvpTargets = targets;
    this.out(C.white + '> ');
    this.state = 'pvp_list_page';
  }

  _state_pvp_list_page(ch) {
    if (ch === 'r') return this._renderMain();
    const n = parseInt(ch);
    const targets = this._context.pvpTargets || [];
    if (isNaN(n) || n < 1 || n > targets.length) {
      this.out(C.white + '> '); return;
    }
    const target = targets[n - 1];
    this.ln();
    this.ln(C.red + `  Attack ${target.name}? (Y/N)` + C.reset);
    this._context.pvpTarget = target;
    this.out(C.white + '> ');
    this.state = 'pvp_confirm';
  }

  _state_pvp_confirm(ch) {
    if (ch !== 'y') return this._renderMain();
    const p = this.player;
    const target = this._context.pvpTarget;
    if (!target) return this._renderMain();

    const fresh = storage.findById(target.id);
    if (!fresh || fresh.dead) {
      this.ln(C.gray + '  That player is unavailable.' + C.reset);
      this.ln(); this.out(C.white + '  Press any key...'); this.state = 'death_screen';
      return;
    }

    const result = combat.fightPlayer(p, fresh);
    p.humanLeft--;
    for (const l of result.log) this.ln('  ' + l);
    storage.savePlayer(p);
    storage.savePlayer(fresh);
    this.ln();
    this.out(C.white + '  Press any key...');
    this.state = 'death_screen';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAVERN
  // ══════════════════════════════════════════════════════════════════════════

  _enterTavern() {
    const p = this.player;
    this.cls();
    this.ln(C.brown  + titleBar('The Dark Cloak Tavern') + C.reset);
    this.ln(C.brown  + '  A blazing fire warms your heart as well as your body.' + C.reset);
    this.ln(C.brown  + '  Many a wary traveler has found refuge here.' + C.reset);
    this.ln();
    this.ln(C.green  + '  (C)onverse with the Patrons');
    this.ln(C.green  + '  (D)aily News');
    this.ln(C.green  + '  (G)amble with the Locals');
    this.ln(C.green  + '  (Y)our Stats');
    this.ln(C.green  + '  (R)eturn to Forest' + C.reset);
    this.ln();
    this.out(C.white + 'Choice: ');
    this.state = 'tavern_menu';
  }

  _state_tavern_menu(ch) {
    const p = this.player;
    switch (ch) {
      case 'r': return this._renderMain();
      case 'y': return this._showStats();
      case 'd': {
        this.ln();
        const gs = storage.getGameState();
        this.ln(C.yellow + '  *** Daily News ***' + C.reset);
        this.ln(C.gray   + `  Day: ${gs.currentDay}  Champion: ${C.white}${gs.championName}` + C.reset);
        this.ln(C.gray   + `  Players in realm: ${C.white}${storage.getAll().length}` + C.reset);
        this.ln();
        this.out(C.white + '  Press any key...');
        this.state = 'death_screen';
        return;
      }
      case 'g': {
        // Simple gambling mini-game
        const bet = Math.min(100, p.gold);
        if (bet <= 0) {
          this.ln(C.red + '  You have no gold to gamble!' + C.reset);
          this.ln(); this.out(C.white + '  Press any key...'); this.state = 'death_screen';
          return;
        }
        if (rnd(1, 2) === 1) {
          p.gold += bet;
          this.ln(C.green + `  You won the gamble! +${bet}g` + C.reset);
        } else {
          p.gold -= bet;
          this.ln(C.red + `  You lost the gamble! -${bet}g` + C.reset);
        }
        storage.savePlayer(p);
        this.ln(); this.out(C.white + '  Press any key...'); this.state = 'death_screen';
        return;
      }
      case 'c': {
        const players = storage.getAll();
        this.ln();
        this.ln(C.yellow + '  Overheard in the tavern:' + C.reset);
        if (players.length > 0) {
          const sample = players[Math.floor(Math.random() * players.length)];
          const quips = [
            `"${sample.name} was seen near the forest edge last night..."`,
            `"They say ${sample.name} has slain over ${sample.kills} opponents!"`,
            `"I heard ${sample.name} is ${sample.married >= 0 ? 'married' : 'looking for love'}..."`,
            `"${sample.name}? Level ${sample.level}? Impressive."`,
          ];
          this.ln(C.gray + '  ' + quips[Math.floor(Math.random() * quips.length)] + C.reset);
        } else {
          this.ln(C.gray + '  The patrons speak of monsters in the forest...' + C.reset);
        }
        this.ln(); this.out(C.white + '  Press any key...'); this.state = 'death_screen';
        return;
      }
      default:
        this.out(C.white + 'Choice: ');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATS
  // ══════════════════════════════════════════════════════════════════════════

  _showStats() {
    const p = this.player;
    this.cls();
    this.ln(C.white + titleBar(`${p.name} — Character Stats`) + C.reset);
    this.ln();
    this.ln(C.gray + `  Class:     ${C.white}${CLASSES[p.class]?.name || '?'}${C.gray}  (${p.sex === 5 ? 'Female' : 'Male'})`);
    this.ln(C.gray + `  Level:     ${C.white}${p.level}${C.gray}  Exp: ${C.white}${commas(p.exp)}`);
    this.ln(C.gray + `  HP:        ${C.green}${p.hp}${C.gray}/${p.hpMax}`);
    this.ln(C.gray + `  Strength:  ${C.white}${p.strength}${C.gray}  (weapon: ${C.white}${p.weapon}${C.gray})`);
    this.ln(C.gray + `  Defense:   ${C.white}${p.def}${C.gray}  (armour: ${C.white}${p.arm}${C.gray})`);
    this.ln(C.gray + `  Charm:     ${C.white}${p.charm}`);
    this.ln(C.gray + `  Gold:      ${C.yellow}${commas(p.gold)}${C.gray}  Bank: ${C.yellow}${commas(p.bank)}`);
    this.ln(C.gray + `  Gems:      ${C.white}${p.gem}`);
    this.ln(C.gray + `  Kills:     ${C.white}${p.kills}${C.gray}  Times won game: ${C.white}${p.king}`);
    this.ln(C.gray + `  Married:   ${C.white}${p.married >= 0 ? 'Yes' : 'No'}${C.gray}  Kids: ${C.white}${p.kids}`);
    const nextLvl = p.level;
    if (nextLvl < LEVEL_EXP.length) {
      const needed = LEVEL_EXP[nextLvl] - p.exp;
      this.ln(C.gray + `  To level:  ${C.white}${commas(Math.max(0, needed))}${C.gray} exp needed`);
    } else {
      this.ln(C.gray + `  Level:     ${C.yellow}MAX${C.gray}`);
    }
    this.ln();
    this.ln(C.gray + `  Daily forest fights: ${C.white}${p.fightsLeft}  ${C.gray}PvP: ${C.white}${p.humanLeft}`);
    this.ln(C.gray + `  Skills — DK:${p.skillw} Mage:${p.skillm} Thief:${p.skillt}` + C.reset);
    this.ln();
    this.out(C.white + '  Press any key...');
    this.state = 'death_screen'; // reuse "press any key → main_menu" handler
  }

  // ══════════════════════════════════════════════════════════════════════════
  // QUIT
  // ══════════════════════════════════════════════════════════════════════════

  _quit() {
    storage.savePlayer(this.player);
    this.cls();
    this.ln(C.red + '  Farewell, adventurer. May your sword stay sharp.' + C.reset);
    this.ln();
    this._send('\x04'); // EOT — signals server to close connection
  }
}

module.exports = { GameSession };
