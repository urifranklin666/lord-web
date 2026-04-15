'use strict';

const storage    = require('./storage');
const combat     = require('./combat');
const monsters   = require('./monsters');
const events     = require('./events');
const trainers   = require('./trainers');
const appearance = require('./appearance');
const { getWeapons, getArmour } = require('./weapons');
const { C, colorize, commas, titleBar, rnd } = require('./text');
const { CLASSES, LEVEL_EXP } = require('./constants');
const { getSetting } = require('./storage');
const { loadArt, getLordScreen } = require('./ansi');

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
      'main_menu','forest_menu','encounter_menu','fight_choice',
      'bank_menu',
      'healer_menu','inn_menu','tavern_menu',
      'master_menu','pvp_list_page','pvp_confirm',
      'players_list','any_key','death_screen',
      'blackjack_menu','register_sex','register_class',
      'horse_offer','amulet_offer',
      'bartender_menu','gem_trade',
      'dragon_fight','marriage_reply','mail_read','propose_confirm',
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
    const splash = loadArt('lordad.ans');
    if (splash) {
      this.out(splash);
      this._anyKey(() => this._showLogin());
    } else {
      this._showLogin();
    }
  }

  _showLogin() {
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
    const p = this.player;
    const isNewPlayer = !p.lastPlayed || (Date.now() - new Date(p.createdAt).getTime()) < 5000;
    const newDay = storage.resetPlayerDay(p);
    storage.savePlayer(p);
    this.cls();
    if (newDay) {
      this.ln(C.yellow + '  *** A new day has dawned! Your fight counts are restored. ***' + C.reset);
      this.ln();
    }
    // Show intro story for brand-new players
    if (isNewPlayer && !p._sawIntro) {
      p._sawIntro = true;
      return this._showIntro();
    }
    // Check mailbox
    const mail = storage.getMail(p.id);
    if (mail.length > 0) {
      this._context.pendingMail = [...mail];
      storage.clearMail(p.id);
      return this._readNextMail();
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
      (p.extra     ? C.yellow  + `  [Horse]`   : '') +
      (p.hasAmulet ? C.cyan   + `  [Amulet]`  : '') +
      (p.married >= 0 ? C.magenta + `  [Married]` : '') +
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
    this.ln(C.dkred   + `  (D)` + C.red   + `ragon's Lair        ` + C.dkgreen + `(?)` + C.green + `Help`);
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
      case 'd': return this._enterDragonLair();
      case '?': return this._enterHints();
      case 'q': return this._quit();
      default:  this.out(C.white + 'Choice: ');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FOREST
  // ══════════════════════════════════════════════════════════════════════════

  _enterForest() {
    const p = this.player;
    const forestArt = getLordScreen('FOREST');
    if (forestArt) {
      this.out(forestArt);
    } else {
      this.cls();
      this.ln(DIV_BLUE.trimEnd());
      this.ln(C.dkgreen + `  Dark Forest` + C.gray + ` — A dense tangle of shadow and menace.` + C.reset);
      this.ln(DIV_BLUE.trimEnd());
    }

    if (p.dead) {
      this.ln(C.red + `\r\n  You are dead! Visit the Healer to be resurrected.` + C.reset);
      this._anyKey(() => this._renderMain());
      return;
    }

    this.ln(C.gray + `\r\n  Fights remaining: ${C.white}${p.fightsLeft}${C.gray}  HP: ${C.white}${p.hp}/${p.hpMax}` + C.reset);
    this.ln();
    this.ln(C.green + `  (L)ook for something to kill`);
    this.ln(C.green + `  (H)ealers hut`);
    this.ln(C.green + `  (R)eturn to town` + C.reset);
    this.ln();
    this.out(C.white + 'Choice: ');
    this.state = 'forest_menu';
  }

  _state_forest_menu(ch) {
    if (ch === 'h') return this._enterHealer();
    if (ch === 'r') return this._renderMain();
    if (ch !== 'l') { this.out(C.white + 'Choice: '); return; }

    const p = this.player;
    if (p.fightsLeft <= 0) {
      this.ln(C.red + `\r\n  You have no forest fights remaining today.` + C.reset);
      this.ln(C.gray + `  Return tomorrow, or rest at the Inn.` + C.reset);
      this._anyKey(() => this._renderMain());
      return;
    }

    this._lookForFight();
  }

  _lookForFight() {
    const p = this.player;

    // Random event (30% chance)
    const lines = [];
    const ev = events.rollForestEvent(p, t => lines.push(t));
    if (ev) {
      this.ln();
      for (const l of lines) this.ln(l);
      if (ev.dead) { this.ln(); return this._playerDeath('the forest'); }
      if (ev.horseSell !== undefined) {
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

    this._renderCombatMenu();
    this.state = 'encounter_menu';
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

  _state_encounter_menu(ch) {
    const p = this.player;
    const monster = this._context.monster;

    if (ch === 'g') {
      if (p.gem <= 0) { this.ln(C.red + `\r\n  No gems!` + C.reset); this._renderCombatMenu(); return; }
      p.gem--;
      const GEM_HEAL = getSetting('gemHeal');
      const healed = Math.min(GEM_HEAL, p.hpMax - p.hp);
      p.hp = Math.min(p.hpMax, p.hp + GEM_HEAL);
      this.ln(C.green + `\r\n  You use a gem: +${healed} HP (${p.hp}/${p.hpMax})` + C.reset);
      this._renderCombatMenu();
      return;
    }

    if (ch === 'f') {
      const fleeChance = p.class === 3 ? 80 : 60;
      if (rnd(1, 100) <= fleeChance) {
        // Successful flee — costs a fight use, ends encounter
        this.ln(C.yellow + `\r\n  You flee from battle!` + C.reset);
        this.ln(C.gray   + `  HP: ${p.hp}/${p.hpMax}` + C.reset);
        p.fightsLeft--;
        storage.savePlayer(p);
        this._postFight();
      } else {
        // Failed flee — monster attacks, combat continues
        this.ln(C.red + `\r\n  You tried to flee but the monster blocks your path!` + C.reset);
        const ma = combat.monsterAttack(p, monster);
        this.ln(`  ` + ma.text);
        p.hp -= ma.damage;
        if (p.hp <= 0) { p.hp = 0; p.fightsLeft--; return this._playerDeath(monster.name); }
        this.ln(C.gray + `  Monster HP: ${Math.max(0, monster.hp)}  Your HP: ${p.hp}/${p.hpMax}` + C.reset);
        this._renderCombatMenu();
      }
      return;
    }

    // Special ability
    const specialMap = { w: 1, m: 2, t: 3 };
    if (specialMap[ch] === p.class) {
      const result = combat.useSpecial(p, monster);
      this.ln(`\r\n  ` + result.text);
      if (result.used) {
        if (p.class === 3) this._context.backstabbed = true;
        monster.hp -= result.damage;
        if (monster.hp <= 0) return this._monsterDied(monster);
        const ma = combat.monsterAttack(p, monster);
        this.ln(`  ` + ma.text);
        p.hp -= ma.damage;
        if (p.hp <= 0) { p.hp = 0; p.fightsLeft--; return this._playerDeath(monster.name); }
        this.ln(C.gray + `  Monster HP: ${Math.max(0, monster.hp)}  Your HP: ${p.hp}/${p.hpMax}` + C.reset);
      }
      this._renderCombatMenu();
      return;
    }

    if (ch !== 'a') { this.out(C.white + 'Choice: '); return; }

    // One round — player attacks first
    this.ln();
    const pa = combat.playerAttack(p, monster);
    this.ln(`  ` + pa.text);
    monster.hp -= pa.damage;

    if (monster.hp <= 0) {
      return this._monsterDied(monster);
    }

    // Monster strikes back
    const ma = combat.monsterAttack(p, monster);
    this.ln(`  ` + ma.text);
    p.hp -= ma.damage;

    if (p.hp <= 0) {
      p.hp = 0;
      p.fightsLeft--;
      return this._playerDeath(monster.name);
    }

    // Still fighting — show status and re-prompt
    this.ln(C.gray + `  Monster HP: ${Math.max(0, monster.hp)}  Your HP: ${p.hp}/${p.hpMax}` + C.reset);
    this._renderCombatMenu();
  }

  _renderCombatMenu() {
    const p = this.player;
    const monster = this._context.monster;
    const hasSpecial = (p.class === 1 && p.levelw > 0) ||
                       (p.class === 2 && p.levelm > 0) ||
                       (p.class === 3 && p.levelt > 0);
    const specialKey  = ['', 'W', 'M', 'T'][p.class];
    const specialName = CLASSES[p.class].skillName;

    this.ln();
    if (monster) {
      this.ln(C.gray + `  [ ${C.white}${monster.name}${C.gray} HP: ${C.red}${Math.max(0, monster.hp)}${C.gray} ]  [ Your HP: ${C.green}${p.hp}${C.gray}/${p.hpMax} ]` + C.reset);
    }
    this.ln(C.green + `  (A)ttack   (F)lee   (G)em heal (${p.gem} gems)`);
    if (hasSpecial) {
      this.ln(C.cyan + `  (${specialKey}) ${specialName}  [${['', p.levelw, p.levelm, p.levelt][p.class]} uses left]`);
    }
    this.ln();
    this.out(C.white + 'Choice: ' + C.reset);
  }

  _monsterDied(monster, alreadyLogged = false) {
    const p = this.player;
    if (!alreadyLogged) {
      if (monster.deathMsg) this.ln(C.dkgreen + `\r\n  ` + monster.deathMsg + C.reset);
      this.ln(C.green  + `  You defeated the ${monster.name}!`);
      p.exp  += monster.exp;
      p.gold += monster.gold;

      // Thief backstab bonus: steal extra 25–50% of the monster's gold
      if (this._context.backstabbed) {
        const stolen = Math.floor(monster.gold * (0.25 + Math.random() * 0.25));
        p.gold += stolen;
        this._context.backstabbed = false;
        this.ln(C.yellow + `  +${commas(monster.gold)} gold  +${commas(monster.exp)} exp` + C.reset);
        this.ln(C.dkgray + `  You rifle through the body and pocket ${commas(stolen)} extra gold!` + C.reset);
      } else {
        this.ln(C.yellow + `  +${commas(monster.gold)} gold  +${commas(monster.exp)} exp` + C.reset);
      }

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
    const art = getLordScreen('HEAL');
    if (art) {
      this.out(art);
    } else {
      this.cls();
      this.ln(C.white + titleBar(`Healer's Hut`) + C.reset);
      this.ln();
      this.ln(C.green + `  A kindly healer greets you.` + C.reset);
    }
    this.ln(C.gray  + `  HP: ${C.green}${p.hp}/${p.hpMax}${C.gray}   Gold: ${C.yellow}${commas(p.gold)}` + C.reset);
    this.ln();

    if (p.dead) {
      const fullCost = 1000 * p.level;
      this._context.resurrectCost = fullCost;
      this.ln(C.red + `  "You are dead, adventurer!"` + C.reset);
      this.ln();
      if (p.gold >= fullCost) {
        this.ln(C.gray  + `  Full resurrection: ${C.yellow}${commas(fullCost)}g${C.gray} → restored to ${Math.floor(p.hpMax / 2)} HP` + C.reset);
      } else if (p.gold > 0) {
        this.ln(C.gray  + `  Full resurrection: ${C.yellow}${commas(fullCost)}g${C.gray} (you have ${C.yellow}${commas(p.gold)}g${C.gray})` + C.reset);
        this.ln(C.dkgray + `  The healer will do what they can for ${commas(p.gold)}g → 1 HP` + C.reset);
      } else {
        this.ln(C.gray  + `  Full resurrection: ${C.yellow}${commas(fullCost)}g${C.gray} (you have nothing)` + C.reset);
        this.ln(C.dkgray + `  The healer takes pity on the destitute...` + C.reset);
      }
      this.ln();
      this.ln(C.green + `  (R)esurrect   (L)eave` + C.reset);
      this.out(C.white + 'Choice: ');
      this.state = 'healer_menu';
      return;
    }

    const hpNeeded = p.hpMax - p.hp;
    const healCost = hpNeeded * getSetting('healerRate');
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
      const fullCost = this._context.resurrectCost;
      if (p.gold >= fullCost) {
        p.gold -= fullCost;
        p.dead = false;
        p.hp = Math.floor(p.hpMax / 2);
        storage.savePlayer(p);
        this.ln(C.green + `\r\n  The healer chants and you are restored to life!` + C.reset);
        this.ln(C.gray  + `  HP: ${p.hp}/${p.hpMax}` + C.reset);
      } else {
        const paid = p.gold;
        p.gold = 0;
        p.dead = false;
        p.hp = 1;
        storage.savePlayer(p);
        if (paid > 0) {
          this.ln(C.green + `\r\n  The healer takes your ${commas(paid)}g and does what they can...` + C.reset);
        } else {
          this.ln(C.green + `\r\n  The healer sighs and restores a mere spark of life.` + C.reset);
        }
        this.ln(C.dkgray + `  You awaken barely breathing. HP: 1/${p.hpMax}` + C.reset);
        this.ln(C.gray   + `  Seek shelter before you face anything dangerous.` + C.reset);
      }
      this._anyKey(() => this._renderMain());
      return;
    }

    if (!p.dead && ch === 'h') {
      const cost = this._context.healCost;
      if (cost === 0) {
        this.ln(C.green + `\r\n  You are already at full health!` + C.reset);
      } else {
        const rate       = getSetting('healerRate');
        const affordable = Math.min(cost, p.gold);
        const hpGained   = Math.floor(affordable / rate);
        p.gold -= hpGained * rate;
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
    this.ln(C.green + `  (S)leep (${getSetting('innCost')}g — wake fully healed next visit)`);
    this.ln(C.green + `  (L)eave` + C.reset);
    this.ln();
    this.out(C.white + 'Choice: ');
    this.state = 'inn_menu';
  }

  _state_inn_menu(ch) {
    const p = this.player;
    if (ch === 's') {
      const INN_COST = getSetting('innCost');
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
    const art = getLordScreen('ARTHUR');
    if (art) { this.out(art); } else { this.cls(); this.ln(C.white + titleBar('Weapons Shop') + C.reset); }
    this.ln(C.gray  + `  Current: ${C.white}${p.weapon}${C.gray}  Gold: ${C.yellow}${commas(p.gold)}` + C.reset);
    this.ln();
    WEAPONS.forEach((w, i) => {
      if (!w) return;
      const owned     = p.weaponNum === i ? C.yellow + ` ◄ yours` : '';
      const canAfford = p.gold >= w.price ? C.green : C.gray;
      this.ln(`  ${canAfford}(${i}) ${w.name.slice(0,18).padEnd(18)} +${String(w.strength).padEnd(5)} STR  ${commas(w.price)}g${owned}${C.reset}`);
    });
    this.ln();
    this.ln(C.gray + `  Number to buy, or (R)eturn:` + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'shop_weapon';
  }

  _state_shop_weapon(input) {
    if (input.toLowerCase() === 'r') return this._renderMain();
    const WEAPONS = getWeapons();
    const n = parseInt(input);
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
    const art = getLordScreen('ABDUL');
    if (art) { this.out(art); } else { this.cls(); this.ln(C.white + titleBar(`Abdul's Armour Shop`) + C.reset); }
    this.ln(C.gray  + `  Current: ${C.white}${p.arm}${C.gray}  Gold: ${C.yellow}${commas(p.gold)}` + C.reset);
    this.ln();
    ARMOUR.forEach((a, i) => {
      if (!a) return;
      const owned     = p.armNum === i ? C.yellow + ` ◄ yours` : '';
      const canAfford = i === 0 || p.gold >= a.price ? C.green : C.gray;
      this.ln(`  ${canAfford}(${i}) ${a.name.slice(0,18).padEnd(18)} +${String(a.defense).padEnd(5)} DEF  ${i === 0 ? 'free' : commas(a.price) + 'g'}${owned}${C.reset}`);
    });
    this.ln();
    this.ln(C.gray + `  Number to buy, or (R)eturn:` + C.reset);
    this.out(C.white + '> ' + C.reset);
    this.state = 'shop_armor';
  }

  _state_shop_armor(input) {
    if (input.toLowerCase() === 'r') return this._renderMain();
    const ARMOUR = getArmour();
    const n = parseInt(input);
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
    const art = getLordScreen('BANK');
    if (art) {
      this.out(art);
    } else {
      this.cls();
      this.ln(C.white + titleBar('Town Bank') + C.reset);
    }
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
    const art = getLordScreen('TURGON');
    const trainerName = trainers.getTrainerName(p.level);
    if (art) {
      this.out(art);
    } else {
      this.cls();
      this.ln(C.white + titleBar(`${trainerName}'s Training Hall`) + C.reset);
    }
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
      this._anyKey(() => this._renderMain());
      this.state = 'players_list';
      return;
    }
    this.ln(C.gray + `  ${'#'.padEnd(3)} ${'Name'.padEnd(18)} ${'Lv'.padEnd(4)} ${'Class'.padEnd(13)} ${'HP'.padEnd(8)} Description` + C.reset);
    this.ln(C.dkblue + `  ` + `─`.repeat(74) + C.reset);
    players.forEach((pl, i) => {
      const cls  = CLASSES[pl.class]?.name || '?';
      const desc = appearance.getAppearance(pl);
      const markerStr = pl.married >= 0 ? C.yellow + ` ♥` : '';
      this.ln(
        C.gray  + `  ${String(i + 1).padEnd(3)} ` +
        C.white + pl.name.slice(0,18).padEnd(18) +
        C.gray  + String(pl.level).padEnd(4) + cls.padEnd(13) +
        (pl.hp < pl.hpMax * 0.3 ? C.red : C.green) + `${pl.hp}/${pl.hpMax}`.padEnd(8) +
        C.gray  + desc + markerStr + C.reset
      );
    });
    this.ln();
    if (p.married < 0) {
      this.ln(C.green + `  Enter a number to propose marriage, or any other key to return.` + C.reset);
    } else {
      this.ln(C.gray + `  You are already married. Press any key.` + C.reset);
    }
    this._context.viewPlayers = players;
    this.out(C.white + '> ');
    this.state = 'players_list';
  }

  _state_players_list(ch) {
    const p = this.player;
    const players = this._context.viewPlayers || [];
    if (p.married >= 0) { this._renderMain(); return; }
    const n = parseInt(ch);
    if (!isNaN(n) && n >= 1 && n <= players.length) {
      const target = players[n - 1];
      if (target.married >= 0) {
        this.ln(C.red + `\r\n  ${target.name} is already married.` + C.reset);
        this._anyKey(() => this._renderMain());
        return;
      }
      this._context.proposeTarget = target;
      this.ln(C.magenta + `\r\n  Propose marriage to ${C.white}${target.name}${C.magenta}? (Y/N)` + C.reset);
      this.out(C.white + '> ');
      this.state = 'propose_confirm';
      return;
    }
    this._renderMain();
  }

  _state_propose_confirm(ch) {
    if (ch !== 'y') { this._renderMain(); return; }
    const p      = this.player;
    const target = this._context.proposeTarget;
    if (!target) { this._renderMain(); return; }
    storage.sendMail(target.id, {
      type:     'proposal',
      fromId:   p.id,
      fromName: p.name,
      text:     `${p.name} has proposed marriage to you!`,
    });
    this.ln(C.magenta + `\r\n  Your proposal has been sent to ${target.name}!` + C.reset);
    this.ln(C.gray    + `  They will be asked when they next log in.` + C.reset);
    this._anyKey(() => this._renderMain());
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
      this.ln(C.gray + `  (${i + 1}) ${C.white}${pl.name.slice(0,18).padEnd(18)}${C.gray} Lv${pl.level} ${cls}  HP:${pl.hp}/${pl.hpMax}  ${desc}` + C.reset);
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
    if (result.won) {
      const taunt = events.getKillTaunt(p.name, fresh.name);
      if (taunt) this.ln(C.gray + `  ` + taunt + C.reset);
      const goodSay = events.getGoodSay(p.name, fresh.name);
      if (goodSay) this.ln(C.dkgray + `  ` + goodSay + C.reset);
      // Notify loser via mail
      storage.sendMail(fresh.id, {
        type: 'pvp_loss',
        fromName: p.name,
        text: `You were attacked by ${p.name} and defeated!`,
      });
    } else {
      const badSay = events.getBadSay(p.name, fresh.name);
      if (badSay) this.ln(C.dkgray + `  ` + badSay + C.reset);
    }
    storage.savePlayer(p);
    storage.savePlayer(fresh);
    this._anyKey(() => this._renderMain());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAVERN
  // ══════════════════════════════════════════════════════════════════════════

  _enterTavern() {
    const art = getLordScreen('CLOAK');
    if (art) {
      this.out(art);
    } else {
      this.cls();
      this.ln(C.brown + titleBar('The Dark Cloak Tavern') + C.reset);
      this.ln(C.brown + `  A blazing fire warms your heart as well as your body in this fragrant` + C.reset);
      this.ln(C.brown + `  roadhouse. Many a wary traveler has found refuge here.` + C.reset);
    }
    this.ln();
    this.ln(C.green + `  (C)onverse with the Patrons`);
    this.ln(C.green + `  (D)aily News`);
    this.ln(C.green + `  (G)amble with the Locals`);
    this.ln(C.green + `  (J)oin the Blackjack Table`);
    this.ln(C.green + `  (B)ard's Song`);
    this.ln(C.green + `  (T)alk to the Bartender`);
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
      case 't': return this._enterBartender();
      default:  this.out(C.white + 'Choice: ');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BARTENDER / VIOLET / SETH ABLE
  // ══════════════════════════════════════════════════════════════════════════

  _enterBartender() {
    const p = this.player;
    this.cls();
    this.ln(C.brown + titleBar('The Bartender') + C.reset);
    this.ln();
    if (p.sex === 0) {
      // Male player — female bartender
      this.ln(C.cyan + `  A buxom barmaid leans on the counter and winks at you.` + C.reset);
    } else {
      // Female player — male bartender
      this.ln(C.cyan + `  The rugged bartender gives you a slow, appraising smile.` + C.reset);
    }
    this.ln();
    if (p.sex === 0) {
      this.ln(C.green + `  (V)iolet - Talk to the barmaid`);
    } else {
      this.ln(C.green + `  (S)eth Able - Talk to the bard`);
    }
    this.ln(C.green + `  (G)ems - Trade gems for charm`);
    this.ln(C.green + `  (N)ame change`);
    this.ln(C.green + `  (R)eturn` + C.reset);
    this.ln();
    this.out(C.white + 'Choice: ');
    this.state = 'bartender_menu';
  }

  _state_bartender_menu(ch) {
    const p = this.player;
    switch (ch) {
      case 'r': return this._enterTavern();
      case 'v':
        if (p.sex === 0) return this._enterViolet();
        return this._enterBartender();
      case 's':
        if (p.sex !== 0) return this._enterSethAble();
        return this._enterBartender();
      case 'g': return this._bartenderGems();
      case 'n': return this._bartenderNameChange();
      default:  this.out(C.white + 'Choice: ');
    }
  }

  _enterViolet() {
    const p = this.player;
    this.cls();
    this.ln(C.magenta + titleBar('Violet') + C.reset);
    this.ln();

    if (p.seenViolet) {
      this.ln(C.gray + `  Violet smiles politely but shakes her head.` + C.reset);
      this.ln(C.gray + `  "Come back tomorrow, darling... I need my rest."` + C.reset);
      this.ln();
      this._anyKey(() => this._enterBartender());
      return;
    }

    this.ln(C.magenta + `  A violet-eyed beauty sits at the end of the bar, swirling her wine.` + C.reset);
    this.ln(C.magenta + `  She glances your way...` + C.reset);
    this.ln();

    const charm = p.charm || 0;
    const roll  = rnd(1, 100);

    if (charm < 10 || roll <= 15) {
      // Rejection / slap
      this.ln(C.red + `  She takes one look at you and turns away.` + C.reset);
      this.ln(C.red + `  "Not in a million years."` + C.reset);
      if (rnd(1, 3) === 1) {
        this.ln(C.red + `  She slaps you across the face for even trying!` + C.reset);
      }
    } else if (charm < 40 || roll <= 45) {
      // Flirt — no lasting effect
      this.ln(C.cyan + `  She smiles and chats with you for a while.` + C.reset);
      this.ln(C.cyan + `  "You're kinda cute," she says, "but I'm spoken for tonight."` + C.reset);
    } else if (charm < 70 || roll <= 70) {
      // Kiss — minor charm boost
      this.ln(C.yellow + `  Violet leans close and plants a soft kiss on your cheek.` + C.reset);
      this.ln(C.yellow + `  "You have something special," she whispers.` + C.reset);
      p.charm = Math.min(100, charm + 1);
    } else {
      // Success — full charm + lays
      this.ln(C.magenta + `  Violet takes your hand and leads you to a quiet corner of the tavern.` + C.reset);
      this.ln(C.magenta + `  Hours later you emerge, grinning like a fool.` + C.reset);
      this.ln(C.green   + `  Your charm increases!` + C.reset);
      p.charm = Math.min(100, charm + 1);
      p.lays  = (p.lays || 0) + 1;
    }

    p.seenViolet = true;
    storage.savePlayer(p);

    this.ln();
    this._anyKey(() => this._enterBartender());
  }

  _enterSethAble() {
    const p = this.player;
    this.cls();
    this.ln(C.cyan + titleBar('Seth Able the Bard') + C.reset);
    this.ln();

    if (p.seenViolet) {  // reuse flag — same daily slot
      this.ln(C.gray + `  Seth strums his lute absently and doesn't look up.` + C.reset);
      this.ln(C.gray + `  "I'll sing for you again tomorrow, m'lady."` + C.reset);
      this.ln();
      this._anyKey(() => this._enterBartender());
      return;
    }

    this.ln(C.cyan + `  A handsome bard sits on a stool, dark eyes scanning the room.` + C.reset);
    this.ln(C.cyan + `  He spots you and smiles like he's been waiting all day.` + C.reset);
    this.ln();

    const charm = p.charm || 0;
    const roll  = rnd(1, 100);

    if (charm < 10 || roll <= 15) {
      this.ln(C.red + `  Seth glances up and then away, unimpressed.` + C.reset);
      this.ln(C.red + `  "Sorry, love. Not my type."` + C.reset);
    } else if (charm < 40 || roll <= 45) {
      this.ln(C.cyan + `  Seth plays a sweet song just for you and offers a wink.` + C.reset);
      this.ln(C.cyan + `  "Come back when you're feeling bolder," he murmurs.` + C.reset);
    } else if (charm < 70 || roll <= 70) {
      this.ln(C.yellow + `  Seth takes your hand and sings a ballad with your name in it.` + C.reset);
      this.ln(C.yellow + `  Your heart flutters. Your charm grows.` + C.reset);
      p.charm = Math.min(100, charm + 1);
    } else {
      this.ln(C.cyan + `  Seth sweeps you off your feet with honeyed words and warm hands.` + C.reset);
      this.ln(C.cyan + `  The night passes like a dream.` + C.reset);
      this.ln(C.green + `  Your charm increases!` + C.reset);
      p.charm = Math.min(100, charm + 1);
      p.lays  = (p.lays || 0) + 1;
    }

    p.seenViolet = true;  // shared daily flag
    storage.savePlayer(p);

    this.ln();
    this._anyKey(() => this._enterBartender());
  }

  _bartenderGems() {
    const p = this.player;
    this.ln();
    if (p.gem <= 0) {
      this.ln(C.red + `  "You don't have any gems to trade," the bartender says.` + C.reset);
      this._anyKey(() => this._enterBartender());
      return;
    }
    this.ln(C.yellow + `  The bartender eyes your gems.` + C.reset);
    this.ln(C.yellow + `  "I'll give you a point of charm for each gem. Deal?"` + C.reset);
    this.ln();
    this.ln(C.green + `  You have ${C.white}${p.gem}${C.green} gems.` + C.reset);
    this.ln();
    this.ln(C.green + `  (Y)es — trade all gems for charm`);
    this.ln(C.green + `  (N)o  — never mind` + C.reset);
    this.ln();
    this.out(C.white + 'Choice: ');
    this.state = 'gem_trade';
  }

  _state_gem_trade(ch) {
    const p = this.player;
    if (ch === 'y') {
      const gained = Math.min(p.gem, 100 - (p.charm || 0));
      p.charm = Math.min(100, (p.charm || 0) + gained);
      p.gem   = 0;
      storage.savePlayer(p);
      this.ln();
      this.ln(C.green + `  You trade your gems for ${C.white}${gained}${C.green} charm point(s)!` + C.reset);
    } else {
      this.ln(C.gray + `  "Maybe next time," the bartender shrugs.` + C.reset);
    }
    this._anyKey(() => this._enterBartender());
  }

  _bartenderNameChange() {
    const p = this.player;
    this.ln();
    this.ln(C.yellow + `  "A new name costs ${C.white}500 gold${C.yellow}," says the bartender.` + C.reset);
    this.ln(C.yellow + `  "What would you be called?"` + C.reset);
    this.ln();
    if (p.gold < 500) {
      this.ln(C.red + `  You don't have enough gold.` + C.reset);
      this._anyKey(() => this._enterBartender());
      return;
    }
    this.out(C.white + 'New name: ');
    this.state = 'name_change';
  }

  _state_name_change(input) {
    const p = this.player;
    const newName = (input || '').trim();
    if (newName.length < 2) {
      this.ln(C.red + `  Name too short. Cancelled.` + C.reset);
      this._anyKey(() => this._enterBartender());
      return;
    }
    p.gold -= 500;
    p.name  = newName.slice(0, 20);
    storage.savePlayer(p);
    this.ln(C.green + `  From this day forth you are known as ${C.white}${p.name}${C.green}!` + C.reset);
    this._anyKey(() => this._enterBartender());
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
    this.ln(C.gray + `  Kills:     ${C.white}${p.kills}${C.gray}  Dragon kills: ${C.white}${p.king}  Lays: ${C.white}${p.lays || 0}`);
    this.ln(C.gray + `  Horse:     ${C.white}${p.extra ? 'Yes (+10 fights/day)' : 'No'}`);
    if (p.married >= 0) {
      const spouse = storage.findById(p.marriedTo);
      this.ln(C.magenta + `  Married:   ${C.white}${spouse ? spouse.name : 'Someone'}${C.magenta}  Kids: ${C.white}${p.kids || 0}` + C.reset);
    }
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
  // DRAGON'S LAIR
  // ══════════════════════════════════════════════════════════════════════════

  _enterDragonLair() {
    const p  = this.player;
    const gs = storage.getGameState();
    const dr = storage.getDragonState();

    const lairArt = loadArt('lairans.ans');
    if (lairArt) {
      this.out(lairArt);
      this._anyKey(() => this._renderDragonLair());
    } else {
      this._renderDragonLair();
    }
  }

  _renderDragonLair() {
    const p  = this.player;
    const gs = storage.getGameState();
    const dr = storage.getDragonState();
    const dragArt = getLordScreen('DRAG');
    if (dragArt) { this.out(dragArt); } else { this.cls(); }
    this.ln(C.dkred + titleBar("The Red Dragon's Lair") + C.reset);
    this.ln();
    this.ln(C.gray + `  You find a hidden cave. A burst of heat washes over you.` + C.reset);
    this.ln(C.gray + `  Before you can think, you are face to face with the Red Dragon!` + C.reset);
    this.ln();
    if (dr.hp <= 0) {
      this.ln(C.yellow + `  The dragon lies dead, slain by ${C.white}${gs.championName}${C.yellow}.` + C.reset);
      this.ln(C.gray   + `  It will return tomorrow...` + C.reset);
      this._anyKey(() => this._renderMain());
      return;
    }
    this.ln(C.red    + `  *** THE RED DRAGON ***` + C.reset);
    this.ln(C.gray   + `  Dragon HP: ${C.white}${dr.hp}${C.gray}/${dr.maxHp}  STR: ${C.white}2000` + C.reset);
    this.ln(C.gray   + `  Your    HP: ${C.white}${p.hp}${C.gray}/${p.hpMax}  STR: ${C.white}${p.strength}` + C.reset);
    this.ln();
    if (p.level < 8) {
      this.ln(C.yellow + `  [Warning: You are level ${p.level}. The dragon is extremely dangerous!]` + C.reset);
      this.ln();
    }
    if (p.dead) {
      this.ln(C.red + `  You are dead! The dragon laughs.` + C.reset);
      this._anyKey(() => this._renderMain()); return;
    }
    this.ln(C.green + `  (A)ttack   (F)lee   (G)em heal (${p.gem} gems)` + C.reset);
    this.ln();
    this.out(C.white + 'Choice: ');
    this.state = 'dragon_fight';
  }

  _state_dragon_fight(ch) {
    const p  = this.player;
    const dr = storage.getDragonState();

    if (ch === 'g') {
      if (p.gem <= 0) { this.ln(C.red + `\r\n  No gems!` + C.reset); this.out(C.white + 'Choice: '); return; }
      p.gem--;
      const heal = Math.min(getSetting('gemHeal'), p.hpMax - p.hp);
      p.hp = Math.min(p.hpMax, p.hp + getSetting('gemHeal'));
      this.ln(C.green + `\r\n  Gem used: +${heal} HP (${p.hp}/${p.hpMax})` + C.reset);
      this.out(C.white + 'Choice: ');
      storage.savePlayer(p);
      return;
    }

    if (ch === 'f') {
      // 30% flee chance against dragon
      if (rnd(1, 100) <= 30) {
        this.ln(C.yellow + `\r\n  You flee! The dragon roars in fury.` + C.reset);
      } else {
        const dDmg = Math.max(1, rnd(150, 400) - p.def);
        this.ln(C.red + `\r\n  You tried to flee, but the dragon's claw catches you for ${dDmg} damage!` + C.reset);
        p.hp -= dDmg;
        if (p.hp <= 0) { p.hp = 0; storage.savePlayer(p); return this._playerDeath('The Red Dragon'); }
        this.ln(C.gray + `  HP: ${p.hp}/${p.hpMax}` + C.reset);
        storage.savePlayer(p);
      }
      this._anyKey(() => this._renderMain());
      return;
    }

    if (ch !== 'a') { this.out(C.white + 'Choice: '); return; }

    // One attack round
    const pDmg = Math.max(1, rnd(Math.floor(p.strength * 0.5), p.strength));
    const pDmgBonus = p.hasAmulet ? Math.floor(pDmg * 0.25) : 0;
    const totalDmg = pDmg + pDmgBonus;
    const updatedDr = storage.damageDragon(totalDmg);

    this.ln();
    this.ln(C.green + `  You strike the Red Dragon for ${C.yellow}${totalDmg}${C.green} damage!` +
      (pDmgBonus > 0 ? C.cyan + ` (Amulet: +${pDmgBonus})` : '') + C.reset);
    this.ln(C.red + `  Dragon HP: ${updatedDr.hp}/${updatedDr.maxHp}` + C.reset);

    if (updatedDr.hp <= 0) {
      return this._dragonSlain();
    }

    // Dragon counter-attacks — scales with how wounded the dragon is (enrages)
    const dragonRage  = Math.ceil((1 - updatedDr.hp / updatedDr.maxHp) * 300);
    const dDmg = Math.max(1, rnd(200 + dragonRage, 500 + dragonRage) - p.def);
    this.ln(C.red + `  The Red Dragon breathes fire at you for ${C.white}${dDmg}${C.red} damage!` + C.reset);
    p.hp -= dDmg;
    if (p.hp <= 0) {
      p.hp = 0;
      storage.savePlayer(p);
      return this._playerDeath('The Red Dragon');
    }
    this.ln(C.gray + `  Your HP: ${p.hp}/${p.hpMax}` + C.reset);
    storage.savePlayer(p);
    this.ln();
    this.out(C.white + 'Choice: ');
  }

  _dragonSlain() {
    const p  = this.player;
    const gs = storage.getGameState();

    // Rewards
    const expGained  = 300000 + p.level * 50000;
    const goldGained = 100000 + p.level * 10000;
    p.exp  += expGained;
    p.gold += goldGained;
    p.king  = (p.king || 0) + 1;
    p.seenDragon = true;

    // Update champion
    const prevChamp = gs.championName;
    storage.updateGameState({ championName: p.name, championDays: gs.currentDay });
    storage.resetDragon();
    storage.savePlayer(p);

    this.cls();
    this.ln(C.dkred + `  ` + `═`.repeat(76) + C.reset);
    this.ln(C.red   + `  *** THE RED DRAGON HAS BEEN SLAIN! ***` + C.reset);
    this.ln(C.dkred + `  ` + `═`.repeat(76) + C.reset);
    this.ln();
    this.ln(C.yellow + `  ${p.name} has vanquished the Red Dragon!` + C.reset);
    this.ln(C.yellow + `  The threat has passed. The town is safe... for now.` + C.reset);
    this.ln();
    this.ln(C.green  + `  +${commas(expGained)} experience` + C.reset);
    this.ln(C.yellow + `  +${commas(goldGained)} gold` + C.reset);
    this.ln(C.cyan   + `  Dragon kills: ${p.king}` + C.reset);
    if (p.king === 1) {
      this.ln();
      this.ln(C.yellow + `  *** ${p.name} is the NEW CHAMPION of the realm! ***` + C.reset);
    }
    if (prevChamp !== p.name) {
      this.ln(C.gray + `  (Dethroning ${prevChamp})` + C.reset);
    }
    this.ln();
    this.ln(C.gray + `  The dragon will return tomorrow...` + C.reset);

    // Broadcast to all other players via mail
    for (const pl of storage.getAll()) {
      if (pl.id !== p.id) {
        storage.sendMail(pl.id, {
          type:     'dragon_slain',
          fromName: p.name,
          text:     `${p.name} has slain the Red Dragon and is now champion of the realm!`,
        });
      }
    }

    if (combat.canLevelUp(p)) {
      this.ln(C.yellow + `  *** You are ready to level up! Visit the Master! ***` + C.reset);
    }
    this._anyKey(() => this._renderMain());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HINTS
  // ══════════════════════════════════════════════════════════════════════════

  _enterHints() {
    this.cls();
    this.ln(C.white + titleBar('Help & Instructions') + C.reset);
    this.ln();
    this.ln(C.cyan   + `  Welcome to Legend of the Red Dragon — Browser Edition!` + C.reset);
    this.ln();
    this.ln(C.green  + `  *** Full multi-node support.`);
    this.ln(C.green  + `  *** This game is FINISHABLE! Slay the Red Dragon to win.`);
    this.ln(C.green  + `  *** Real-time messages and battles.`);
    this.ln(C.green  + `  *** Marriage and other 'Real Life' options.` + C.reset);
    this.ln();
    this.ln(C.yellow + `  MAIN MENU:` + C.reset);
    this.ln(C.gray   + `  (F) Forest — fight monsters for gold & exp` + C.reset);
    this.ln(C.gray   + `  (P) Player Battle — attack other players (${getSetting('pvpFights')}/day)` + C.reset);
    this.ln(C.gray   + `  (D) Dragon's Lair — fight the Red Dragon. Be ready!` + C.reset);
    this.ln(C.gray   + `  (T) Tavern — Violet/Seth Able, bard songs, blackjack` + C.reset);
    this.ln(C.gray   + `  (V) View Players — see others, propose marriage` + C.reset);
    this.ln(C.gray   + `  (L) Level Up — visit your Master when exp is sufficient` + C.reset);
    this.ln();
    this.ln(C.yellow + `  COMBAT CLASSES:` + C.reset);
    this.ln(C.gray   + `  Death Knight — Deadly Strike: massive damage, costs HP` + C.reset);
    this.ln(C.gray   + `  Mystical     — Magic Blast: ignores armour, starts with gems` + C.reset);
    this.ln(C.gray   + `  Thief        — Backstab: high damage, immune to Troll` + C.reset);
    this.ln();
    this.ln(C.yellow + `  TIPS:` + C.reset);
    this.ln(C.gray   + `  - Bank your gold! You lose half on death.` + C.reset);
    this.ln(C.gray   + `  - The Amulet of Accuracy (+25% damage) is sold near the bank.` + C.reset);
    this.ln(C.gray   + `  - Charm affects Violet/Seth Able encounters & appearance.` + C.reset);
    this.ln(C.gray   + `  - A horse gives +10 forest fights per day.` + C.reset);
    this.ln();
    this._anyKey(() => this._renderMain());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTRO / STORY (shown to new players once)
  // ══════════════════════════════════════════════════════════════════════════

  _showIntro() {
    this.cls();
    this.ln(C.dkred + titleBar('Legend of the Red Dragon') + C.reset);
    this.ln();
    this.ln(C.gray + `  Long ago, in a kingdom of dark forests and brave souls,` + C.reset);
    this.ln(C.gray + `  the Red Dragon descended upon the town of Farview.` + C.reset);
    this.ln();
    this.ln(C.gray + `  It burned the fields, devoured the livestock, and now` + C.reset);
    this.ln(C.gray + `  demands tribute in gold and blood.` + C.reset);
    this.ln();
    this.ln(C.gray + `  Many have tried to slay it. Few have returned.` + C.reset);
    this.ln();
    this.ln(C.yellow + `  You are the next to try.` + C.reset);
    this.ln();
    this.ln(C.gray + `  Fight monsters in the forest to grow stronger.` + C.reset);
    this.ln(C.gray + `  Buy weapons and armour. Level up under a Master's guidance.` + C.reset);
    this.ln(C.gray + `  Then — and only then — face the dragon in its lair.` + C.reset);
    this.ln();
    this.ln(C.yellow + `  The town is counting on you.` + C.reset);
    this.ln();
    this._anyKey(() => {
      const mail = storage.getMail(this.player.id);
      if (mail.length > 0) {
        this._context.pendingMail = [...mail];
        storage.clearMail(this.player.id);
        this._readNextMail();
      } else {
        this._renderMain();
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIL / MESSAGES
  // ══════════════════════════════════════════════════════════════════════════

  _readNextMail() {
    const queue = this._context.pendingMail || [];
    if (queue.length === 0) { this._renderMain(); return; }
    const letter = queue.shift();
    this._context.pendingMail = queue;

    this.cls();
    this.ln(C.yellow + titleBar('You have a message!') + C.reset);
    this.ln();

    if (letter.type === 'proposal') {
      this.ln(C.magenta + `  ${letter.fromName} has proposed marriage to you!` + C.reset);
      this.ln(C.gray    + `  Do you accept?` + C.reset);
      this.ln();
      this.ln(C.green   + `  (Y)es — Accept the proposal`);
      this.ln(C.red     + `  (N)o  — Decline` + C.reset);
      this.ln();
      this.out(C.white + 'Choice: ');
      this._context.marriageFromId   = letter.fromId;
      this._context.marriageFromName = letter.fromName;
      this.state = 'marriage_reply';
      return;
    }

    if (letter.type === 'pvp_loss') {
      this.ln(C.red  + `  ${letter.text}` + C.reset);
      this.ln(C.gray + `  They were stronger this time. Train harder.` + C.reset);
    } else if (letter.type === 'dragon_slain') {
      this.ln(C.yellow + `  *** Town Crier ***` + C.reset);
      this.ln(C.cyan   + `  ${letter.text}` + C.reset);
    } else {
      this.ln(C.cyan + `  From: ${letter.fromName || 'Unknown'}` + C.reset);
      this.ln(C.gray + `  ${letter.text}` + C.reset);
    }
    this.ln();
    this._anyKey(() => this._readNextMail());
  }

  _state_marriage_reply(ch) {
    const p         = this.player;
    const fromId    = this._context.marriageFromId;
    const fromName  = this._context.marriageFromName;
    const suitor    = storage.findById(fromId);

    if (ch === 'y' && suitor && suitor.married < 0 && p.married < 0) {
      p.married   = fromId;
      p.marriedTo = fromId;
      suitor.married   = p.id;
      suitor.marriedTo = p.id;
      storage.savePlayer(p);
      storage.savePlayer(suitor);
      storage.savePlayers();
      // Notify the suitor
      storage.sendMail(fromId, {
        type:     'marriage_accepted',
        fromName: p.name,
        text:     `${p.name} has accepted your proposal! You are now married!`,
      });
      this.ln(C.magenta + `\r\n  You accept ${fromName}'s proposal!` + C.reset);
      this.ln(C.yellow  + `  You are now married to ${fromName}!` + C.reset);
      p.charm = Math.min(100, p.charm + 2);
    } else if (ch === 'y') {
      this.ln(C.red + `\r\n  The marriage cannot happen right now.` + C.reset);
    } else {
      storage.sendMail(fromId, {
        type:     'marriage_rejected',
        fromName: p.name,
        text:     `${p.name} has declined your proposal.`,
      });
      this.ln(C.gray + `\r\n  You politely decline.` + C.reset);
    }
    this._anyKey(() => this._readNextMail());
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
