// game.js
"use strict";

/**
 * HexaChange - base local (sin server).
 * Estado separado de UI y listo para host autoritativo.
 */

const ICONS = {
  player: String.fromCodePoint(0x1f464),
  wait: String.fromCodePoint(0x23f3),
  heart: String.fromCodePoint(0x2665),
};

const COLORS = [
  { name: "Rojo", hex: "#ef4444" },
  { name: "Azul", hex: "#3b82f6" },
  { name: "Verde", hex: "#22c55e" },
  { name: "Amarillo", hex: "#facc15" },
  { name: "Morado", hex: "#7c3aed" },
  { name: "Naranja", hex: "#fb923c" },
  { name: "Rosa", hex: "#ff3df2" },
  { name: "Cian", hex: "#22d3ee" },
  { name: "Marron", hex: "#a16207" },
  { name: "Navy", hex: "#1e40af" },
];

const config = {
  playerCount: 4,     // 2..10
  spectatorsMax: 5,
  circlesTotal: 10,
  localPlayerId: 0,
  turnDurationMs: 30_000,
  autoCountdownSec: 5,
  paintStepMs: 170,
  rollMin: 1,
  rollMax: 6,
  roomPrivate: false,
  roomPasscode: "1234",
  hostAuthoritative: false,
};

const SFX = {
  click: makeSfx("../assets/audio/ui_click.wav", 0.45, 80),
  roll: makeSfx("../assets/audio/dice_roll.wav", 0.5, 200),
  land: makeSfx("../assets/audio/dice_land.wav", 0.55, 200),
  paint: makeSfx("../assets/audio/paint_step.wav", 0.25, 60),
  win: makeSfx("../assets/audio/win.wav", 0.6, 800),
  error: makeSfx("../assets/audio/error.wav", 0.5, 400),
};

const state = {
  started: false,
  players: [],
  playerById: new Map(),
  currentTurn: 0,
  rollInFlight: false,
  timerStartMs: 0,
  turnStartMs: 0,
  turnDeadlineMs: 0,
  spectators: 0,
  progressVisible: new Map(),
  autoTurnEnabled: new Map(),
  autoTurnArmed: new Map(),
  autoDialog: { visible: false, mode: "countdown", countdownSec: 0 },
  autoRollTimeoutId: null,
};

const boardCache = {
  seats: new Map(),
  paths: new Map(),
  dots: new Map(),
};

const el = {
  board: document.getElementById("board"),
  heart: document.getElementById("heart"),
  heartCore: document.querySelector(".heart-core"),

  hudPfp: document.getElementById("hudPfp"),
  hudName: document.getElementById("hudName"),
  hudDesc: document.getElementById("hudDesc"),

  statusTitle: document.getElementById("statusTitle"),
  statusSub: document.getElementById("statusSub"),

  spectatorsText: document.getElementById("spectatorsText"),
  timerText: document.getElementById("timerText"),
  progressText: document.getElementById("progressText"),

  rollBtn: document.getElementById("rollBtn"),

  autoDialogWrap: document.getElementById("autoDialogWrap"),
  autoDialogTitle: document.getElementById("autoDialogTitle"),
  autoDialogSub: document.getElementById("autoDialogSub"),
  autoDialogCheck: document.getElementById("autoDialogCheck"),

  overlayLobby: document.getElementById("overlayLobby"),
  slotsGrid: document.getElementById("slotsGrid"),
  startBtn: document.getElementById("startBtn"),
  backLobbyBtn: document.getElementById("backLobbyBtn"),

  overlayPass: document.getElementById("overlayPass"),
  passInput: document.getElementById("passInput"),
  passBackBtn: document.getElementById("passBackBtn"),
  passEnterBtn: document.getElementById("passEnterBtn"),
  passHint: document.getElementById("passHint"),

  overlayFinal: document.getElementById("overlayFinal"),
  finalTitle: document.getElementById("finalTitle"),
  finalSub: document.getElementById("finalSub"),
  finalLobbyBtn: document.getElementById("finalLobbyBtn"),
  finalRestartBtn: document.getElementById("finalRestartBtn"),
};

const overlays = {
  lobby: { wrap: el.overlayLobby, panel: el.overlayLobby?.querySelector(".overlay") },
  pass: { wrap: el.overlayPass, panel: el.overlayPass?.querySelector(".overlay") },
  final: { wrap: el.overlayFinal, panel: el.overlayFinal?.querySelector(".overlay") },
};

// ---------- init ----------
boot();

function boot() {
  initOverlays();
  buildPlayers();
  renderLobbySlots();
  bindActions();

  setSpectators(0);
  applyHudProfile(getPlayer(config.localPlayerId));
  updateLocalProgressUI();
  setRollButtonState(false);
  setStatus("Sala", "Pulsa INICIAR PARTIDA para probar el juego");

  startTicker();
  window.addEventListener("resize", layoutBoard);
  layoutBoard();
}

// ---------- audio helpers ----------
function makeSfx(src, volume, cooldownMs) {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = volume;
  return { audio, volume, cooldownMs, lastPlayMs: 0 };
}

function safePlay(sfx) {
  if (!sfx) return;
  const now = Date.now();
  if (now - sfx.lastPlayMs < sfx.cooldownMs) return;
  sfx.lastPlayMs = now;
  try {
    sfx.audio.currentTime = 0;
    sfx.audio.volume = sfx.volume;
    sfx.audio.play().catch(() => {});
  } catch (_) {
    // ignore autoplay restrictions
  }
}

// ---------- players ----------
function buildPlayers() {
  const count = clamp(config.playerCount, 2, 10);
  state.players = makePlayers(count);
  state.playerById = new Map(state.players.map(p => [p.id, p]));
  resetPlayerState();
}

function resetPlayerState() {
  state.progressVisible.clear();
  state.autoTurnEnabled.clear();
  state.autoTurnArmed.clear();
  state.players.forEach(p => {
    state.progressVisible.set(p.id, 0);
    state.autoTurnEnabled.set(p.id, false);
    state.autoTurnArmed.set(p.id, false);
  });
}

function makePlayers(n) {
  const shuffled = [...COLORS].sort(() => Math.random() - 0.5).slice(0, n);
  const players = [];
  for (let i = 0; i < n; i++) {
    players.push({
      id: i,
      name: i === 0 ? "Tu" : (i === 1 ? "Ana" : i === 2 ? "Luis" : `Jugador ${i + 1}`),
      colorHex: shuffled[i].hex,
      colorName: shuffled[i].name,
      isBot: false,
    });
  }
  return players;
}

// ---------- overlays ----------
function initOverlays() {
  setOverlayVisible("lobby", true, true);
  setOverlayVisible("pass", false, true);
  setOverlayVisible("final", false, true);
  hideAutoDialog();
}

function showOverlay(key) {
  setOverlayVisible(key, true, false);
}

function hideOverlay(key) {
  setOverlayVisible(key, false, false);
}

function setOverlayVisible(key, visible, immediate) {
  const entry = overlays[key];
  if (!entry || !entry.wrap) return;

  if (visible) {
    entry.wrap.hidden = false;
    if (entry.panel) {
      entry.panel.classList.remove("overlay-exit");
      entry.panel.classList.add("overlay-enter");
    }
    return;
  }

  if (immediate) {
    entry.wrap.hidden = true;
    if (entry.panel) {
      entry.panel.classList.remove("overlay-exit");
      entry.panel.classList.remove("overlay-enter");
    }
    return;
  }

  if (entry.panel) entry.panel.classList.add("overlay-exit");
  setTimeout(() => {
    entry.wrap.hidden = true;
    if (entry.panel) entry.panel.classList.remove("overlay-exit");
  }, 180);
}

// ---------- lobby ----------
function renderLobbySlots() {
  el.slotsGrid.innerHTML = "";
  const totalSlots = clamp(config.playerCount, 2, 10);
  for (let i = 0; i < totalSlots; i++) {
    const slot = document.createElement("div");
    slot.className = "slot";
    if (i < state.players.length) {
      const p = state.players[i];
      slot.innerHTML = `
        <div class="mini" style="background:${p.colorHex}22;border-color:${p.colorHex}55">${ICONS.player}</div>
        <div>
          <div class="t1">${escapeHtml(p.name)}</div>
          <div class="t2">${escapeHtml(p.colorName)}</div>
        </div>
      `;
    } else {
      slot.innerHTML = `
        <div class="mini" style="background:rgba(255,255,255,.06)">${ICONS.wait}</div>
        <div>
          <div class="t1">Esperando jugador</div>
          <div class="t2">Conectate para entrar</div>
        </div>
      `;
    }
    el.slotsGrid.appendChild(slot);
  }

  el.startBtn.disabled = state.players.length < 2;
}

function handlePassEnter() {
  safePlay(SFX.click);
  if (!config.roomPrivate) {
    el.passHint.textContent = "";
    hideOverlay("pass");
    showOverlay("lobby");
    return;
  }

  const value = el.passInput.value.trim();
  if (value === config.roomPasscode) {
    el.passHint.textContent = "";
    el.passInput.value = "";
    hideOverlay("pass");
    showOverlay("lobby");
  } else {
    el.passHint.textContent = "Contrasena incorrecta";
    safePlay(SFX.error);
  }
}

// ---------- event wiring ----------
function bindActions() {
  el.startBtn.addEventListener("click", () => {
    safePlay(SFX.click);
    if (config.roomPrivate) {
      showOverlay("pass");
      hideOverlay("lobby");
      return;
    }
    startGame();
  });

  el.backLobbyBtn.addEventListener("click", () => {
    safePlay(SFX.click);
    window.location.href = "./room.html";
  });

  el.rollBtn.addEventListener("click", () => {
    requestRoll(config.localPlayerId, true);
  });

  el.autoDialogCheck.addEventListener("click", () => {
    const pid = state.currentTurn;
    if (pid !== config.localPlayerId) return;
    if (!state.autoTurnEnabled.get(pid)) return;
    safePlay(SFX.click);
    disableAutoTurn(pid);
  });

  el.passBackBtn.addEventListener("click", () => {
    safePlay(SFX.click);
    el.passHint.textContent = "";
    el.passInput.value = "";
    hideOverlay("pass");
    showOverlay("lobby");
  });

  el.passEnterBtn.addEventListener("click", handlePassEnter);
  el.passInput.addEventListener("keydown", event => {
    if (event.key === "Enter") handlePassEnter();
  });

  el.finalLobbyBtn.addEventListener("click", () => {
    safePlay(SFX.click);
    window.location.href = "./room.html";
  });

  el.finalRestartBtn.addEventListener("click", () => {
    safePlay(SFX.click);
    window.location.reload();
  });
}

// ---------- start game ----------
function startGame() {
  if (state.players.length < 2) {
    safePlay(SFX.error);
    setStatus("Faltan jugadores", "Se requieren al menos 2");
    return;
  }

  state.started = true;
  state.rollInFlight = false;
  state.timerStartMs = Date.now();

  resetPlayerState();
  renderBoard();

  state.currentTurn = Math.floor(Math.random() * state.players.length);
  startTurn();

  hideOverlay("lobby");
  updateTurnUI();
}

// ---------- board render ----------
function renderBoard() {
  [...el.board.querySelectorAll(".seat, .path")].forEach(node => node.remove());
  boardCache.seats.clear();
  boardCache.paths.clear();
  boardCache.dots.clear();

  state.players.forEach(p => {
    const seat = document.createElement("div");
    seat.className = "seat";
    seat.dataset.pid = String(p.id);
    seat.innerHTML = `
      <div class="seat-card">
        <div class="seat-pfp" style="background:${p.colorHex}22;border-color:${p.colorHex}66">${ICONS.player}</div>
        <div>
          <div class="seat-name">${escapeHtml(p.name)}</div>
          <div class="seat-sub">${escapeHtml(p.colorName)}</div>
        </div>
      </div>
    `;
    boardCache.seats.set(p.id, seat);
    el.board.appendChild(seat);

    const path = document.createElement("div");
    path.className = "path";
    path.dataset.pid = String(p.id);

    const inner = document.createElement("div");
    inner.className = "path-inner";

    const dots = [];
    for (let i = 0; i < config.circlesTotal; i++) {
      const dot = document.createElement("div");
      dot.className = "dotc";
      dot.dataset.idx = String(i);
      inner.appendChild(dot);
      dots.push(dot);
    }

    path.appendChild(inner);
    boardCache.paths.set(p.id, path);
    boardCache.dots.set(p.id, dots);
    el.board.appendChild(path);
  });

  layoutBoard();
  paintAllFromState();
}

function layoutBoard() {
  if (!state.players.length || boardCache.seats.size === 0) return;

  const rect = el.board.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const minSide = Math.min(rect.width, rect.height);

  const seatHalf = 90;
  const maxRadius = Math.max(80, Math.min(cx, cy) - seatHalf);
  const rSeat = clamp(minSide * 0.46, 120, maxRadius);
  const maxPath = Math.max(90, rSeat - 70);
  const pathLen = clamp(minSide * 0.30, 90, maxPath);

  const n = state.players.length;

  state.players.forEach((p, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x = cx + Math.cos(angle) * rSeat;
    const y = cy + Math.sin(angle) * rSeat;

    const seatEl = boardCache.seats.get(p.id);
    if (seatEl) {
      seatEl.style.left = `${x}px`;
      seatEl.style.top = `${y}px`;
    }

    const pathEl = boardCache.paths.get(p.id);
    if (pathEl) {
      const deg = angle * (180 / Math.PI);
      pathEl.style.left = `${cx}px`;
      pathEl.style.top = `${cy}px`;
      pathEl.style.height = `${pathLen}px`;
      pathEl.style.width = "20px";
      pathEl.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
    }
  });
}

// ---------- painting ----------
async function paintSteps(playerId, steps) {
  const dots = boardCache.dots.get(playerId);
  if (!dots) return;

  const total = config.circlesTotal;
  const current = state.progressVisible.get(playerId) ?? 0;
  const target = Math.min(current + steps, total);
  const color = getPlayer(playerId).colorHex;

  for (let i = current; i < target; i++) {
    state.progressVisible.set(playerId, i + 1);
    const dot = dots[i];
    if (dot) {
      dot.classList.add("painted");
      dot.style.background = color;
      dot.style.boxShadow = `0 0 16px ${color}44`;
    }
    if (playerId === config.localPlayerId) updateLocalProgressUI();
    safePlay(SFX.paint);
    await sleep(config.paintStepMs);
  }
}

function paintAllFromState() {
  state.players.forEach(p => {
    const dots = boardCache.dots.get(p.id);
    if (!dots) return;

    const progress = state.progressVisible.get(p.id) ?? 0;
    dots.forEach((dot, idx) => {
      if (idx < progress) {
        dot.classList.add("painted");
        dot.style.background = p.colorHex;
        dot.style.boxShadow = `0 0 16px ${p.colorHex}44`;
      } else {
        dot.classList.remove("painted");
        dot.style.background = "";
        dot.style.boxShadow = "";
      }
    });
  });
}

// ---------- turn logic ----------
function startTurn() {
  const pid = state.currentTurn;
  state.turnStartMs = Date.now();
  state.turnDeadlineMs = state.turnStartMs + config.turnDurationMs;
  state.autoTurnArmed.set(pid, false);

  if (state.autoRollTimeoutId) {
    clearTimeout(state.autoRollTimeoutId);
    state.autoRollTimeoutId = null;
  }

  hideAutoDialog();
  el.autoDialogCheck.disabled = false;

  if (state.autoTurnEnabled.get(pid)) {
    showAutoDialogEnabled(pid);
    scheduleAutoRoll(pid);
  }
}

function nextTurn() {
  hideAutoDialog();
  el.autoDialogCheck.disabled = false;

  state.currentTurn = (state.currentTurn + 1) % state.players.length;
  startTurn();
  updateTurnUI();
}

function updateTurnUI() {
  const isMyTurn = state.started && state.currentTurn === config.localPlayerId;
  setRollButtonState(isMyTurn);

  if (!state.started) {
    updateLocalProgressUI();
    return;
  }

  const p = getPlayer(state.currentTurn);
  if (state.currentTurn === config.localPlayerId) {
    setStatus("Es tu turno", "Tira el dado para avanzar");
  } else {
    setStatus(`Turno de ${p.name}`, "Observa el avance y espera tu turno");
  }

  updateLocalProgressUI();
}

function setRollButtonState(enabled) {
  el.rollBtn.classList.toggle("enabled", enabled);
  el.rollBtn.classList.toggle("turn-active", enabled);
  el.rollBtn.disabled = !enabled;
  el.rollBtn.setAttribute("aria-disabled", String(!enabled));
}

// server-ready roll flow: request -> apply (host authoritative)
function requestRoll(playerId, manual) {
  if (!state.started) return;
  if (state.rollInFlight) return;
  if (playerId !== state.currentTurn) return;

  if (manual) safePlay(SFX.click);
  state.rollInFlight = true;

  if (config.hostAuthoritative) {
    setStatus("Esperando resultado...", "El host esta tirando el dado");
    return;
  }

  const roll = getRandomRoll();
  applyRoll(playerId, roll, manual, "local");
}

async function applyRoll(playerId, roll, manual, source) {
  const total = config.circlesTotal;
  try {
    if (!state.started || playerId !== state.currentTurn) return;

    const current = state.progressVisible.get(playerId) ?? 0;
    if (current >= total) return;

    safePlay(SFX.roll);
    setStatus(`Salio ${roll}`, "Pintando circulos...");

    await sleep(700);

    if (current + roll > total) {
      safePlay(SFX.error);
      setStatus("Numero no exacto", `Necesitas ${total - current} exacto para llegar al corazon`);
      await sleep(650);
      nextTurn();
      return;
    }

    await paintSteps(playerId, roll);

    safePlay(SFX.land);

    const after = state.progressVisible.get(playerId) ?? 0;
    if (after === total) {
      safePlay(SFX.win);
      showFinal(playerId);
      return;
    }

    nextTurn();
  } finally {
    state.rollInFlight = false;
    void manual;
    void source;
  }
}

function getRandomRoll() {
  return config.rollMin + Math.floor(Math.random() * (config.rollMax - config.rollMin + 1));
}

function scheduleAutoRoll(pid) {
  if (state.autoRollTimeoutId) clearTimeout(state.autoRollTimeoutId);
  state.autoRollTimeoutId = setTimeout(() => {
    state.autoRollTimeoutId = null;
    if (!state.started || state.currentTurn !== pid) return;
    if (!state.autoTurnEnabled.get(pid)) return;
    requestRoll(pid, false);
  }, 600);
}

// ---------- auto-turn ----------
function startTicker() {
  setInterval(() => {
    updateTimer();
    if (!state.started) return;
    tickTurnTimer();
  }, 120);
}

function tickTurnTimer() {
  const pid = state.currentTurn;
  if (state.autoTurnEnabled.get(pid)) return;

  const now = Date.now();
  const msLeft = state.turnDeadlineMs - now;

  if (msLeft <= 0) {
    enableAutoTurn(pid);
    return;
  }

  if (msLeft <= config.autoCountdownSec * 1000) {
    state.autoTurnArmed.set(pid, true);
    const sec = Math.ceil(msLeft / 1000);
    showAutoDialogCountdown(sec, pid);
    return;
  }

  if (state.autoTurnArmed.get(pid)) {
    state.autoTurnArmed.set(pid, false);
  }

  if (state.autoDialog.visible) hideAutoDialog();
}

function enableAutoTurn(pid) {
  if (state.autoTurnEnabled.get(pid)) return;
  state.autoTurnEnabled.set(pid, true);
  state.autoTurnArmed.set(pid, true);
  showAutoDialogEnabled(pid);
  scheduleAutoRoll(pid);
}

function disableAutoTurn(pid) {
  state.autoTurnEnabled.set(pid, false);
  state.autoTurnArmed.set(pid, false);
  if (state.autoRollTimeoutId) {
    clearTimeout(state.autoRollTimeoutId);
    state.autoRollTimeoutId = null;
  }
  el.autoDialogCheck.disabled = true;
  setTimeout(() => hideAutoDialog(), 1000);
}

function showAutoDialogCountdown(sec, pid) {
  if (
    state.autoDialog.visible &&
    state.autoDialog.mode === "countdown" &&
    state.autoDialog.countdownSec === sec
  ) {
    return;
  }

  state.autoDialog = { visible: true, mode: "countdown", countdownSec: sec };
  el.autoDialogWrap.hidden = false;
  el.autoDialogTitle.textContent = `Auto-Turno en ${sec}`;
  el.autoDialogSub.textContent = "Si no tiras, lo hara por ti";
  el.autoDialogCheck.hidden = true;
  void pid;
}

function showAutoDialogEnabled(pid) {
  state.autoDialog = { visible: true, mode: "active", countdownSec: 0 };
  el.autoDialogWrap.hidden = false;
  el.autoDialogTitle.textContent = "Auto-Turno activado";
  el.autoDialogSub.textContent = "Tiradas automaticas en tu turno";

  const isLocal = pid === config.localPlayerId;
  el.autoDialogCheck.hidden = !isLocal;
  el.autoDialogCheck.disabled = !isLocal;
}

function hideAutoDialog() {
  state.autoDialog = { visible: false, mode: "countdown", countdownSec: 0 };
  el.autoDialogWrap.hidden = true;
  el.autoDialogCheck.hidden = false;
}

// ---------- final ----------
function showFinal(winnerId) {
  state.started = false;
  hideAutoDialog();
  setRollButtonState(false);

  const w = getPlayer(winnerId);
  el.finalTitle.textContent = `Victoria de ${w.name}!`;
  el.finalSub.textContent = "Llego al corazon con numero exacto";

  el.heart.style.boxShadow = `0 0 28px ${w.colorHex}55, 0 0 0 1px rgba(0,0,0,.18) inset`;
  el.heart.style.borderColor = `${w.colorHex}66`;
  if (el.heartCore) {
    el.heartCore.style.color = w.colorHex;
    el.heartCore.textContent = ICONS.heart;
  }

  showOverlay("final");
}

// ---------- HUD helpers ----------
function applyHudProfile(p) {
  if (!p) return;
  el.hudName.textContent = p.name;
  el.hudDesc.textContent = `Color: ${p.colorName}`;
  el.hudPfp.style.background = `${p.colorHex}22`;
  el.hudPfp.style.borderColor = `${p.colorHex}66`;
  el.hudPfp.textContent = ICONS.player;
}

function updateLocalProgressUI() {
  const meProg = state.progressVisible.get(config.localPlayerId) ?? 0;
  el.progressText.textContent = `Circulos: ${meProg}/${config.circlesTotal}`;
}

function setStatus(title, sub) {
  el.statusTitle.textContent = title;
  el.statusSub.textContent = sub;
}

function setSpectators(n) {
  const safe = clamp(n, 0, config.spectatorsMax);
  state.spectators = safe;
  el.spectatorsText.textContent = `${safe}/${config.spectatorsMax}`;
}

function updateTimer() {
  if (!state.started) {
    el.timerText.textContent = "00:00";
    return;
  }
  const ms = Date.now() - state.timerStartMs;
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  el.timerText.textContent = `${mm}:${ss}`;
}

// ---------- utils ----------
function getPlayer(id) {
  const p = state.playerById.get(id);
  if (!p) throw new Error(`player not found: ${id}`);
  return p;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[s]));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}



