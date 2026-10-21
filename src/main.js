import * as THREE from 'three';
import './styles.css';
import { World } from './world/city.js';
import { Game } from './game/game.js';
import { Humanoid } from './entities/humanoid.js';
import { Input } from './core/input.js';
import { CinematicCamera } from './core/camera.js';
import { HUD, renderResult } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { RNG, newSeed, hashString } from './core/rng.js';
import { FACTIONS, ARCHETYPES, WEAPONS, STAKES, QUALITY } from './data/config.js';

// ---------- renderer / scene ----------
const canvas = document.getElementById('gl');
const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const quality = isMobile ? QUALITY.mobile : QUALITY.desktop;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = quality.shadows; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const SKY = '#a9cbe8';
scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(SKY, 90, quality.drawDistance);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 700);
scene.add(new THREE.HemisphereLight('#dfefff', '#6b5a48', 0.95));
const sun = new THREE.DirectionalLight('#ffe2b8', 1.7); sun.position.set(60, 90, 30); sun.castShadow = quality.shadows;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 300 }); sun.shadow.bias = -0.0008;
scene.add(sun); scene.add(sun.target);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---------- persistent state ----------
const LS = 'riotgear.v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } })();
const state = {
  faction: saved.faction || 'rioter', archetype: saved.archetype || 'instigator', weaponTier: saved.weaponTier ?? 0,
  balance: typeof saved.balance === 'number' ? saved.balance : 1000, countdown: 20, lobbyCount: 0,
};
if (!FACTIONS[state.faction].archetypes.includes(state.archetype)) state.archetype = FACTIONS[state.faction].archetypes[0];
const save = () => localStorage.setItem(LS, JSON.stringify({ faction: state.faction, archetype: state.archetype, weaponTier: state.weaponTier, balance: state.balance }));

// ---------- ui ----------
const hudRoot = document.getElementById('hud'), menuRoot = document.getElementById('menu'), resultRoot = document.getElementById('result');
const input = new Input(canvas, null);
const hud = new HUD(hudRoot, input); input.hud = hud;
const menu = new Menu(menuRoot, state, { onChange: () => { save(); lobby.refreshLineup(); }, onJoin: () => joinRound(), onSpectate: () => spectateRound() });

// ---------- lobby (world + lineup + cinematic camera) ----------
// The lobby constantly restarts: a 20s countdown, then a live round runs (bots only, shown behind the
// menu) that you can watch or queue for. Joining during the countdown starts your round immediately.
const cine = new CinematicCamera(camera); window.__cine = cine; window.__camera = camera;
let lobby = null, game = null, mode = 'lobby', roundSeed = newSeed();
const LIVE_ROUND_SECONDS = 75;

function makeLobby(seed) {
  const rng = new RNG(seed);
  const world = new World(scene, rng.fork('world'), quality);
  const lineup = []; const group = new THREE.Group(); scene.add(group);
  const L = { world, lineup, group, seed, t: 0, refreshLineup() { buildLineup(); }, dispose() { scene.remove(group); } };
  const buildLineup = () => {
    while (group.children.length) group.remove(group.children[0]); lineup.length = 0;
    const F = FACTIONS[state.faction], rngL = new RNG(hashString('lineup' + seed + state.faction));
    const dir = F.dir, baseZ = -dir * 6.5; // own side of the line, in the plaza
    const roster = state.faction === 'rioter'
      ? ['instigator', 'looter', 'brawler', 'rioter_npc', 'rioter_npc', 'instigator', 'looter', 'brawler', 'rioter_npc', 'rioter_npc', 'rioter_npc']
      : ['commander', 'front_echelon', 'front_echelon', 'snatch_squad', 'grenadier', 'front_echelon', 'snatch_squad', 'grenadier', 'peacekeeper_npc', 'front_echelon'];
    const w = WEAPONS[state.faction][state.weaponTier].id;
    // put the selected archetype in the centre of the front row
    const fi = roster.indexOf(state.archetype); [roster[2], roster[fi]] = [roster[fi], roster[2]];
    const focusIdx = 2;
    roster.forEach((a, i) => {
      const row = i < 5 ? 0 : 1, col = i < 5 ? i : i - 5;
      const x = (col - 2) * 1.5 + rngL.float(-0.2, 0.2) + (row ? 0.75 : 0), z = baseZ - dir * (row * 1.6) + rngL.float(-0.2, 0.2);
      const h = new Humanoid({ archetype: a, weapon: i === focusIdx ? w : rngL.pick(WEAPONS[state.faction].slice(0, 3)).id, rng: rngL, bandana: i === focusIdx ? '#ff2d55' : null });
      h.root.position.set(x, 0, z); h.root.rotation.y = dir > 0 ? 0 : Math.PI;
      group.add(h.root); lineup.push({ h, a, focus: i === focusIdx });
    });
    const f = lineup.find((l) => l.focus) || lineup[0];
    L.focus = new THREE.Vector3(f.h.root.position.x, 0, f.h.root.position.z);
    L.faceAngle = dir > 0 ? 0 : Math.PI;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: F.color, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(L.focus.x, 0.05, L.focus.z); group.add(ring); L.ring = ring;
    cine.first = true;
  };
  buildLineup();
  return L;
}

function startLobby() {
  mode = 'lobby'; hud.stop(); resultRoot.classList.add('hidden');
  if (game) { game.dispose(); game = null; }
  roundSeed = newSeed();
  lobby = makeLobby(roundSeed); window.__lobby = lobby;
  state.countdown = 20; state.lobbyCount = 18 + Math.floor(Math.random() * 14); state.live = false;
  menu.show(); input.enabled = false;
  document.getElementById('boot').classList.add('hidden');
  if (state.queued) { state.queued = false; joinRound(); }
}
function joinRound() {
  if (state.live) { state.queued = !state.queued; menu.render(); return; } // queue for the next round
  const stake = STAKES[state.weaponTier];
  if (state.balance < stake) { hud.toast('Not enough balance for that stake.'); alert('Not enough balance for that stake.'); return; }
  state.balance -= stake; save(); menu.tick();
  startRound(false);
}
function spectateRound() {
  if (!state.live) startLiveRound();
  menu.hide(); hud.start(game); showSpectateBar();
}
function showSpectateBar() {
  const bar = document.createElement('div'); bar.className = 'spectate-bar'; bar.innerHTML = '<button class="big-btn">BACK TO LOBBY</button>';
  bar.querySelector('button').onclick = () => { bar.remove(); hud.stop(); menu.show(); }; hudRoot.appendChild(bar);
  if (game) game.spectateBar = bar;
}
/** Bots-only round that plays behind the menu until it ends; then the lobby restarts with a new city. */
function startLiveRound() {
  if (game) return;
  const world = lobby.world; lobby.dispose(); lobby = null;
  game = new Game({ scene, camera, renderer, hud, input, quality, seed: roundSeed, selection: null, spectate: true, world });
  game.sun = sun; hud.stop(); input.enabled = false;
  state.live = true; state.lobbyCount = 18 + Math.floor(Math.random() * 14); menu.render();
  game.onEnd = () => { if (game?.spectateBar) game.spectateBar.remove(); startLobby(); };
  game.liveDeadline = LIVE_ROUND_SECONDS;
  window.__game = game;
}
function startRound(spectate) {
  if (game) { game.dispose(); game = null; }
  menu.hide(); mode = 'playing';
  const world = lobby ? lobby.world : new World(scene, new RNG(roundSeed).fork('world'), quality); if (lobby) { lobby.dispose(); lobby = null; }
  const selection = { faction: state.faction, archetype: state.archetype, weapon: WEAPONS[state.faction][state.weaponTier].id, stake: STAKES[state.weaponTier] };
  game = new Game({ scene, camera, renderer, hud, input, quality, seed: roundSeed, selection, spectate, world });
  game.sun = sun;
  hud.start(game); input.enabled = !spectate; input.camYaw = 0; state.live = false;
  game.onEnd = (reason) => {
    mode = 'result'; hud.stop();
    state.balance += game.outcome.payout; save();
    resultRoot.classList.remove('hidden'); renderResult(resultRoot, game, state.balance, () => startLobby());
  };
  window.__game = game;
}

// ---------- main loop ----------
let last = performance.now(), countAcc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mode === 'lobby' && lobby) {
    lobby.t += dt; lobby.world.update(dt);
    for (const l of lobby.lineup) l.h.update(dt, { moving: false, stance: 1 });
    if (lobby.ring) lobby.ring.scale.setScalar(1 + Math.sin(lobby.t * 3) * 0.08);
    cine.update(dt, lobby.focus, isMobile ? 11 : 8.5, isMobile ? 6 : 3.8, isMobile ? 0 : 2.4, isMobile ? -3.4 : 0.2, lobby.faceAngle);
    countAcc += dt; if (countAcc >= 1) { countAcc = 0; state.countdown = Math.max(0, state.countdown - 1); menu.tick(); if (state.countdown === 0) startLiveRound(); }
  } else if (game) {
    game.update(dt);
    if (game.spectate && game.liveDeadline && game.time > game.liveDeadline && !game.roundOver) game.endRound('whistle');
  }
  renderer.render(scene, camera);
  window.__frames = (window.__frames || 0) + 1;
  requestAnimationFrame(frame);
}

// ---------- boot ----------
startLobby();
requestAnimationFrame(frame);

// PWA
if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
  addEventListener('load', () => navigator.serviceWorker?.register('/sw.js').catch(() => {}));
}
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__installPrompt = e; if (mode === 'lobby') menu.render(); });
// test hooks
window.__step = (sec, dt = 1 / 30) => { if (!game) return; for (let i = 0; i < sec / dt; i++) { if (game.roundOver) break; game.update(dt); } };
window.__startLive = () => startLiveRound();
window.__input = input;
