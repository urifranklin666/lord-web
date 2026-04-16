# LORD Web — Legend of the Red Dragon, Browser Edition

A faithful browser reimplementation of [Seth Robinson's](http://www.rtsoft.com) classic 1989 BBS door game **Legend of the Red Dragon (LORD) 4.07**, playable entirely in the browser over WebSocket using an xterm.js terminal.

No BBS required. No DOSBox. Just open a tab.

---

## Features

### Core Gameplay (faithful to LORD 4.07)
- **Three character classes** — Death Knight (Deadly Strike), Mystical (Magic Blast), Thief (Backstab); each gains 1 skill point per level-up (max 40), improving their special ability's power and daily uses
- **Forest combat** — fight level-scaled monsters for gold and experience, with class special abilities and a flat 10% crit chance
- **In-game day/night cycle** — each completed fight advances your personal clock by 1 hour; time-of-day affects event rates and encounter danger; at midnight your daily fights, skill uses, and inn rest automatically restore
- **Player-vs-Player battles** — attack other live players, steal their gold, earn kills
- **Level-up system** — 12 levels, each gated by exp threshold and a named trainer (Halder → Turgon)
- **Weapons & Armour shops** — 15 tiers each, parsed from original `WEAPONS.DAT` / `ARMOR.DAT`
- **Bank** — deposit and withdraw gold
- **Healer** — pay per HP or pay to resurrect from death
- **Inn** — pay to sleep and wake fully healed at the next in-game midnight

### NPCs & Events
- **Violet / Seth Able** — charm-based daily romance encounter in the Tavern bartender submenu; outcomes range from rejection to +charm and +lays
- **Gem trading** — exchange gems for charm points at the bartender
- **Bard songs** — Seth Able the Bard plays a daily song with gameplay effects (fights, healing, gold, charm); gender-specific songs from `BARDSONG.LDY`
- **Blackjack** — full 52-card deck, bet 10% of gold, hit or stand
- **9 forest random events** from `EVENTS.LDY` — gems, bags of gold, Hammer Stone, Merry Men, Old Man escort, Hag gem-healing, horse trader, Troll ambush, Ugly Stick
- **Fairy** — rare Extra Special Event: charm, fights, gold, or full heal
- **Demon** — dangerous level-scaled forest encounter with big rewards
- **Weird events** — silent `v3` accumulator fires a strange bonus every 5 forest visits
- **Amulet of Accuracy** — sold by a cloaked stranger who appears as a forest event or near the bank; +25% damage in all fights
- **Horse** — buy for 10,000g × level, grants +10 forest fights per day
- **Charm parley** — players with high Charm (up to 100) have up to a 10% chance to intimidate a monster into surrendering half its gold without a fight (no exp — a tradeoff)
- **Monster pickpocket** — enemies have an 8% chance per successful hit to steal 5% of your current gold; risk exists beyond just PvP

### Endgame — The Red Dragon
- **Shared persistent boss** — all players on the server chip away at the same dragon (25,000 HP)
- **Turn-based dragon fight** — Attack / Flee / Gem heal; dragon counter-attacks for 100–300 damage; Amulet bonus applies
- **Dragon resets daily**
- **Killing the dragon** awards massive exp & gold, increments your dragon-kill counter, and crowns you **Champion of the Realm**
- All other players receive a Town Crier mail notification

### Social Systems
- **Marriage** — propose to any unmarried player from the player list; they are prompted on next login to accept or decline
- **Inter-player mail** — proposals, PvP loss notifications, and dragon-slain announcements are queued and shown on login
- **GOODSAY / BADSAY** — authentic win/lose taunts from the original DAT files shown after PvP battles
- **Kill taunts** — NORMSAY.DAT lines shown after monster and PvP kills
- **Charm-based appearance** — MLOOKS/FLOOKS.DAT descriptions shown in the player list and stats screen

### Admin Panel
Accessible at `/admin.html` with a Bearer token password.

- **Dashboard** — player counts, champion, top 10 by experience
- **Environment settings** — tune forest fights, PvP fights, inn cost, healer rate, gem heal per point
- **Player editor** — search, view, and edit any player field; reset daily counters; delete players

---

## Stack

| Layer | Technology |
|---|---|
| Terminal frontend | [xterm.js](https://xtermjs.org/) in the browser |
| Transport | WebSocket (`ws`) |
| Backend | Node.js + Express |
| Auth | bcrypt password hashing |
| Persistence | JSON flat files (`data/players.json`, `data/gamestate.json`) |
| Deployment | Docker + docker-compose |

---

## Project Structure

```
lord-web/
├── server.js              # Express app, WebSocket server, admin REST API
├── game/
│   ├── session.js         # Main game state machine (~1600 lines)
│   ├── combat.js          # Hit calculation, monster/player/dragon combat
│   ├── events.js          # Forest events, bard songs, NORMSAY/GOODSAY/BADSAY
│   ├── storage.js         # Player persistence, gamestate, mail, dragon state
│   ├── monsters.js        # Random monster generation by level
│   ├── trainers.js        # TRAINTXT.DAT parser — trainer names and dialogue
│   ├── weapons.js         # WEAPONS.DAT / ARMOR.DAT parser
│   ├── appearance.js      # MLOOKS/FLOOKS.DAT charm-based appearance
│   ├── constants.js       # Level table, class stats, dragon constants
│   └── text.js            # ANSI colour helpers, colorize(), titleBar(), rnd()
├── public/
│   ├── index.html         # xterm.js browser client
│   └── admin.html         # Admin panel (vanilla JS, no framework)
├── data/                  # Runtime data + original LORD 4.07 DAT files
│   ├── players.json       # Player records (gitignored)
│   ├── gamestate.json     # Day counter, champion, dragon HP, settings (gitignored)
│   ├── WEAPONS.DAT        # Original weapon definitions (15 tiers)
│   ├── ARMOR.DAT          # Original armour definitions (15 tiers)
│   ├── EVENTS.LDY         # Forest event scripts
│   ├── BARDSONG.LDY       # Bard song scripts
│   ├── TRAINTXT.DAT       # Trainer dialogue by level and gender
│   ├── NORMSAY.DAT        # 26 monster kill taunts
│   ├── GOODSAY.DAT        # 38 PvP win taunts
│   ├── BADSAY.DAT         # 17 PvP loss taunts
│   ├── MLOOKS.DAT         # 101 male appearance descriptions
│   └── FLOOKS.DAT         # 101 female appearance descriptions
├── docker-compose.yml
└── Dockerfile
```

---

## Running Locally

**Prerequisites:** Node.js 18+ or Docker.

### With Docker (recommended)

```bash
cp .env.example .env        # set ADMIN_PASS
docker compose up -d
```

Then open `http://localhost:7682` in your browser.

### Without Docker

```bash
npm install
ADMIN_PASS=yourpassword npm start
```

---

## Configuration

Copy `.env.example` to `.env` and set:

```env
ADMIN_PASS=your_secure_password_here
```

In-game settings (forest fights/day, inn cost, healer rate, etc.) are adjustable live through the admin panel at `/admin.html` without restarting the server.

---

## Deployment (behind a reverse proxy)

The server binds to `127.0.0.1:7682` by default. Route a subdomain through nginx / Nginx Proxy Manager and proxy WebSocket connections (`Upgrade: websocket`) to that port.

Example NPM configuration: forward `lord.yourdomain.com` → `http://127.0.0.1:7682`, enable WebSocket support.

---

## Acknowledgements

- **Seth A. Robinson** — original Legend of the Red Dragon (© 1989–1997 Robinson Technologies). LORD is his creation; this project is a fan reimplementation for educational and nostalgic purposes.
- Original game data files (`.DAT`, `.LDY`) are property of Robinson Technologies and are not redistributed with this repository.
