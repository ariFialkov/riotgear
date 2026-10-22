# Riotgear

A 3D third-person action betting game, playable on desktop and mobile as a PWA. Pick a side
(rioters or peacekeepers), an archetype, and a melee weapon that doubles as your stake, then
drop into a constantly restarting riot in a procedurally generated Mediterranean old town.

Rioters break the line, loot and wreck as much as they can and advance as far as possible.
Peacekeepers push their line forward, quell mobs and restore order. Money ticks up for every
second conscious, every foot you and your mob/squad advance past the original line, every
prop destroyed (or looted), every knockout and every mob quelled.

It is a **simulated multiplayer** game: nothing is networked. Every other participant is a
bot with realistic-looking behaviour, and the round's result is drawn before the round starts.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (use --host to test on a phone on the same network)
npm run build      # generates PWA icons and builds to dist/
npm run preview    # serve the production build
npm test           # RTP distribution tests
```

The service worker caches the app shell, so after the first visit it works offline and can be
installed from the browser's "Add to home screen" / install prompt.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | WASD / arrows | static joystick (left half of screen) |
| Melee (random swing variants) | click or `X` | tap |
| Aimed throw (rock/molotov or gas/flash) | click-drag swipe | swipe |
| Throw forward | hold `X` | — |
| Jump / duck toggle | `Space` / double-tap `Space` | JUMP button / double-tap |
| Archetype ability | tap / hold `Z` | tap / hold the Z button |
| Camera orbit | `Q` / `E`, right-drag | automatic |

### Archetype abilities (Z)

| Archetype | Tap | Hold |
| --- | --- | --- |
| Commander (PK) | cycle squad strategy | take command of a nearby squad |
| Front Echelon (PK) | shield bash | shield block |
| Snatch Squad (PK) | release/arrest | grab & restrain a rioter, drag them behind the line |
| Grenadier (PK) | fire rubber bullet | automatic fire (auto reload) |
| Instigator (R) | cycle mob strategy | take command of a nearby mob (rally cry) |
| Looter (R) | loot a small prop | climb a building/monument (forward = up, back = down) |
| Brawler (R) | — | pick up a medium prop; release to throw, hold to charge |

Squad strategies: slow advance, collapse into wall, breakout & assault, pulse with snatch
squad, fall back & regroup, anchor & lob. Mob strategies: sustained shelling, blitzkrieg,
high ground, counter snatch squad, retreat & regroup, scorched earth.

### Weapons / stakes

Peacekeepers: baton, pepper spray (blinding cone), cattle prod (stun), riot flail (wide
sweep), shock gauntlets (every third hit discharges a knockdown pulse).
Rioters: 2×4, brass knuckles (combo damage), baseball bat (prop wrecker), nunchucks
(flurry while held), sledgehammer (ground slam, demolishes buildings).
Stakes per tier: $1, $2, $5, $10, $25. The balance is virtual and stored locally.

## How the result is decided

`src/game/rtp.js` draws the round's multiplier from a banded distribution tuned to a 96%
return to player (tested in `tests/rtp.test.js`), giving a payout and a target duration of
roughly one to five minutes. The Director (`src/game/director.js`) compares the player's money
with a target earning curve every frame and sets a bias that feeds bot strength, aggression
and strategy choice, the contested perimeter, reinforcements and supply drops. A separate
battle lean makes the fight visibly drift against you on losing bets and towards you on
winning ones.

How a round ends is decided by the bet:

| Result | Share of rounds | Ending |
| --- | --- | --- |
| Lost the stake (below 1x) | about 72% | put down or arrested |
| Small win (1x to 2x) | about 20% | your side is winning, but you are still put down or arrested |
| Big win (2x and up, `BIG_WIN`) | about 7% | your side wins: riot dispersed / lines broken |

Losing beats are mostly physical: snatch squads hunting a rioter, a mob or squad converging
to beat the player down, gas or fire, and only rarely a stray rubber round or brick. The after
action report states plainly whether the bet was won or lost, separately from how the round
ended. Every reward scales with the stake, so the payout distribution is stake independent.

## Project layout

```
src/
  core/        seeded RNG, unified input, cameras
  data/        factions, archetypes, weapons, projectiles, strategies, economy, quality presets
  world/       procedural textures, prop factories, the city generator (World)
  entities/    humanoid rig & animation, Character, groups/strategies, bot AI, player controller
  game/        rtp outcome, director, round orchestration (Game), combat, projectiles, effects
  ui/          lobby menu, HUD and result screen
public/        manifest, service worker, generated icons
scripts/       icon generator, headless screenshot/playtest helpers (Playwright)
tests/         RTP distribution tests
```

## Headless playtesting

`scripts/sim.mjs` joins a round in headless Chromium and fast-forwards the simulation via the
`window.__step(seconds)` hook, logging money/bias/front-line state and taking screenshots:

```bash
npm run build && npx vite preview --port 4173 &
node scripts/sim.mjs out/run1 rioter instigator 0
```
