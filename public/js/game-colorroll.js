// game-colorroll.js
"use strict";

/**
 * HexaChange - ColorRoll Lite (local state, server-ready).
 */

const STORAGE_KEYS = {
  name: "hexachange_name",
  circles: "hexachange_circles",
  hostLeft: "hexachange_host_left",
};

const ICONS = {
  player: String.fromCodePoint(0x1f464),
  bot: String.fromCodePoint(0x1f916),
  crown: String.fromCodePoint(0x1f451),
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

const ui = {
  board: document.getElementById("board"),
  boardPoly: document.getElementById("boardPoly"),
  heart: document.getElementById("heart"),
  heartCore: document.querySelector(".heart-core"),
  heartCanvas: document.getElementById("heartCanvas"),

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
  overlayFinal: document.getElementById("overlayFinal"),

  slotsGrid: document.getElementById("slotsGrid"),
  finalSlotsGrid: document.getElementById("finalSlotsGrid"),
  lobbyHint: document.getElementById("lobbyHint"),

  privateToggle: document.getElementById("privateToggle"),
  privacyStatus: document.getElementById("privacyStatus"),
  playerCountSelect: document.getElementById("playerCountSelect"),
  goalSelect: document.getElementById("goalSelect"),
  roomPassInput: document.getElementById("roomPassInput"),

  startBtn: document.getElementById("startBtn"),
  backLobbyBtn: document.getElementById("backLobbyBtn"),

  finalTitle: document.getElementById("finalTitle"),
  finalSub: document.getElementById("finalSub"),
  finalLobbyBtn: document.getElementById("finalLobbyBtn"),
  finalRestartBtn: document.getElementById("finalRestartBtn"),

  slotMenu: document.getElementById("slotMenu"),
  slotMenuTitle: document.getElementById("slotMenuTitle"),
  menuAddBotBtn: document.getElementById("menuAddBotBtn"),
  menuSpectatorBtn: document.getElementById("menuSpectatorBtn"),
  menuKickBtn: document.getElementById("menuKickBtn"),
  menuHostBtn: document.getElementById("menuHostBtn"),

  diceOverlay: document.getElementById("diceOverlay"),
  diceImage: document.getElementById("diceImage"),
  diceResult: document.getElementById("diceResult"),
  dicePlayer: document.getElementById("dicePlayer"),
  diceAvatar: document.getElementById("diceAvatar"),
  diceName: document.getElementById("diceName"),
};

const gameState = {
  config: {
    playerCount: 4,
    objective: 10,
    phaseSize: 10,
    spectatorsMax: 5,
    localPlayerId: 0,
    turnDurationMs: 30_000,
    autoCountdownSec: 5,
    paintStepMs: 170,
    rollMin: 1,
    rollMax: 6,
    roomPrivate: false,
    roomPasscode: "",
    hostAuthoritative: false,
  },
  started: false,
  roster: new Map(),
  slots: [],
  hostId: 0,
  nextId: 1,
  botCount: 0,
  activePlayers: [],
  turnOrder: [],
  turnIndex: 0,
  currentTurnId: null,
  rollInFlight: false,
  timerStartMs: 0,
  turnStartMs: 0,
  turnDeadlineMs: 0,
  spectators: 0,
  progressTotal: new Map(),
  autoTurnEnabled: new Map(),
  autoTurnArmed: new Map(),
  autoDialog: { visible: false, mode: "countdown", countdownSec: 0 },
  autoRollTimeoutId: null,
  botRollTimeoutId: null,
  lobbyHintTimeoutId: null,
  menuTarget: null,
};

const boardCache = {
  seats: new Map(),
  paths: new Map(),
  dots: new Map(),
  pathInners: new Map(),
  seatProgress: new Map(),
};

const overlays = {
  lobby: { wrap: ui.overlayLobby, panel: ui.overlayLobby?.querySelector(".overlay") },
  final: { wrap: ui.overlayFinal, panel: ui.overlayFinal?.querySelector(".overlay") },
};

const SFX = {
  click: makeSfx("../multimedia/audio/ui_click.wav", 0.45, 80),
  roll: makeSfx("../multimedia/audio/dice_roll.wav", 0.5, 200),
  land: makeSfx("../multimedia/audio/dice_land.wav", 0.55, 200),
  paint: makeSfx("../multimedia/audio/paint_step.wav", 0.25, 60),
  win: makeSfx("../multimedia/audio/win.wav", 0.6, 800),
  error: makeSfx("../multimedia/audio/error.wav", 0.5, 400),
};
const boardLayout = {
  layout() {
    if (!gameState.activePlayers.length || !ui.board) return;

    const rect = ui.board.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const minSide = Math.min(rect.width, rect.height);

    const playerCount = gameState.activePlayers.length;
    const sides = playerCount === 2 ? 4 : playerCount;
    const localIndex = gameState.activePlayers.findIndex(p => p.id === gameState.config.localPlayerId);
    const offset = localIndex >= 0
      ? Math.PI - (Math.PI * 2 * (localIndex + 0.5)) / sides
      : 0;

    const boardRadius = clamp(minSide * 0.42, 200, minSide * 0.52);
    const sideRadius = boardRadius * Math.cos(Math.PI / sides);
    const seatOffset = clamp(minSide * 0.06, 40, 70);
    const seatRadius = sideRadius + seatOffset;
    const heartRadius = getHeartSafeRadius(rect);
    const safePadding = clamp(minSide * 0.12, 90, 140);

    updatePolygonVisual(sides, cx, cy, boardRadius, offset);

    gameState.activePlayers.forEach((p, index) => {
      const sideIndex = playerCount === 2 ? index * 2 : index;
      const sideAngle = (Math.PI * 2 * (sideIndex + 0.5)) / sides - Math.PI / 2 + offset;
      const sideCenterX = cx + Math.cos(sideAngle) * sideRadius;
      const sideCenterY = cy + Math.sin(sideAngle) * sideRadius;
      const x = cx + Math.cos(sideAngle) * seatRadius;
      const y = cy + Math.sin(sideAngle) * seatRadius;

      const seatEl = boardCache.seats.get(p.id);
      if (seatEl) {
        seatEl.style.left = `${x}px`;
        seatEl.style.top = `${y}px`;
      }

      const distToCenter = Math.hypot(cx - sideCenterX, cy - sideCenterY);
      const rawPathLen = distToCenter - heartRadius - safePadding;
      const pathEl = boardCache.paths.get(p.id);
      const inner = boardCache.pathInners.get(p.id);
      const dotCount = gameState.config.phaseSize;
      const dotSize = 18;
      const minPathLen = dotCount * dotSize + (dotCount - 1) * 6;
      const pathLen = Math.max(minPathLen, rawPathLen);
      const gap = Math.max(6, (pathLen - dotSize * dotCount) / Math.max(1, dotCount - 1));

      if (pathEl) {
        const angleToCenter = Math.atan2(cy - sideCenterY, cx - sideCenterX);
        const rot = angleToCenter + Math.PI / 2;
        pathEl.style.left = `${sideCenterX}px`;
        pathEl.style.top = `${sideCenterY}px`;
        pathEl.style.height = `${pathLen}px`;
        pathEl.style.width = "24px";
        pathEl.style.transform = `translate(-50%, -50%) rotate(${rot}rad)`;
      }

      if (inner) {
        inner.style.gap = `${gap}px`;
        const dots = boardCache.dots.get(p.id) || [];
        const snakeAmp = clamp(minSide * 0.015, 6, 12);
        dots.forEach((dot, idx) => {
          const dir = idx % 2 === 0 ? -1 : 1;
          const fade = 1 - idx / Math.max(1, dotCount - 1);
          dot.style.transform = `translateX(${dir * snakeAmp * fade}px)`;
        });
      }
    });
  },
};

const threeHeart = {
  renderer: null,
  scene: null,
  camera: null,
  mesh: null,
  ready: false,
  running: false,
  spinEvery: 3,
  acc: 0,
  init() {
    if (!ui.heartCanvas || !window.THREE || !THREE.GLTFLoader) return false;
    const renderer = new THREE.WebGLRenderer({ canvas: ui.heartCanvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.2, 2.8);
    this.camera = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-2, 1, 3);
    scene.add(fill);

    const loader = new THREE.GLTFLoader();
    loader.load("../assets/3d/corazon.glb", (gltf) => {
      const obj = gltf.scene || gltf.scenes[0];
      obj.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.metalness = 0.15;
          child.material.roughness = 0.35;
        }
      });
      obj.scale.set(0.8, 0.8, 0.8);
      obj.rotation.x = Math.PI * 0.08;
      this.mesh = obj;
      scene.add(obj);
      this.ready = true;
    });

    this.running = true;
    return true;
  },
  resize() {
    if (!this.renderer || !ui.heartCanvas) return;
    const rect = ui.heartCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.renderer.setSize(rect.width, rect.height, false);
    if (this.camera) {
      this.camera.aspect = rect.width / rect.height;
      this.camera.updateProjectionMatrix();
    }
  },
  tick(dt) {
    if (!this.running || !this.renderer || !this.scene || !this.camera) return;
    if (this.mesh) {
      const speed = (Math.PI * 2) / this.spinEvery;
      this.mesh.rotation.y += speed * dt;
      this.acc += dt;
      this.mesh.position.y = Math.sin(this.acc * 1.2) * 0.02;
    }
    this.renderer.render(this.scene, this.camera);
  },
  setColor(hex) {
    if (!this.mesh) return;
    this.mesh.traverse((child) => {
      if (child.isMesh && child.material && child.material.color) {
        child.material.color.set(hex);
      }
    });
  },
  setWinMode(isWin) {
    this.spinEvery = isWin ? 1.5 : 3.0;
  },
};

const diceOverlay = {
  rolling: false,
  rollTimer: null,
  resolve: null,
  frameIndex: 0,
  rollDurationMs: 3000,
  resultHoldMs: 2000,
  fps: 18,
  rollFrames: 60,
  playRoll(player) {
    if (!ui.diceImage) return Promise.resolve(getRandomRoll());
    showDiceOverlay(player);
    if (ui.diceResult) ui.diceResult.textContent = "-";
    if (this.rollTimer) {
      clearInterval(this.rollTimer);
      this.rollTimer = null;
    }
    this.rolling = true;
    this.frameIndex = 0;
    safePlay(SFX.roll);

    const frameInterval = Math.round(1000 / this.fps);
    const start = Date.now();

    return new Promise((resolve) => {
      this.resolve = resolve;
      this.rollTimer = setInterval(() => {
        const elapsed = Date.now() - start;
        const idx = 1 + Math.floor(Math.random() * this.rollFrames);
        ui.diceImage.src = `./multimedia/dado/roll_${String(idx).padStart(3, "0")}.png`;

        if (elapsed >= this.rollDurationMs) {
          clearInterval(this.rollTimer);
          this.rollTimer = null;
          this.rolling = false;
          const result = getRandomRoll();
          ui.diceImage.src = `./multimedia/dado/face_${result}.png`;
          if (ui.diceResult) ui.diceResult.textContent = String(result);
          safePlay(SFX.land);
          setTimeout(() => {
            hideDiceOverlay();
            resolve(result);
          }, this.resultHoldMs);
        }
      }, frameInterval);
    });
  },
};
// ---------- init ----------
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

function boot() {
  initConfigFromStorage();
  initLobbyState();
  initOverlays();
  bindActions();
  syncLobbyControls();

  renderLobbySlots();
  applyHudProfile(getPlayer(gameState.config.localPlayerId));
  updateSpectatorsUI();
  updateLocalProgressUI();
  setRollButtonState(false);
  setStatus("Sala", "Pulsa INICIAR PARTIDA para probar el juego");

  initThree();
  startTicker();
  startRenderLoop();

  window.addEventListener("resize", handleResize);
  handleResize();
  setupHostDisconnectListener();
}

function initThree() {
  if (threeHeart.init()) {
    ui.heartCore?.classList.add("hidden");
  }
}

function handleResize() {
  resizeHeartCanvas();
  boardLayout.layout();
  threeHeart.resize();
}

function startRenderLoop() {
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    threeHeart.tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function initConfigFromStorage() {
  const circles = getStoredNumber(STORAGE_KEYS.circles);
  if (circles) gameState.config.objective = clamp(circles, 10, 50);
}

function initLobbyState() {
  gameState.roster.clear();
  gameState.progressTotal.clear();
  gameState.autoTurnEnabled.clear();
  gameState.autoTurnArmed.clear();

  gameState.botCount = 0;
  gameState.nextId = 1;
  gameState.spectators = 0;
  gameState.slots = new Array(clamp(gameState.config.playerCount, 2, 10)).fill(null);

  const localName = sanitizeName(getStoredName()) || "Ana";
  const host = createPlayer(localName, { id: 0, isBot: false });
  host.isHost = true;
  gameState.hostId = host.id;
  gameState.config.localPlayerId = host.id;

  gameState.roster.set(host.id, host);
  gameState.slots[0] = host.id;
  initPlayerState(host.id);

  gameState.activePlayers = [];
  gameState.turnOrder = [];
  gameState.turnIndex = 0;
  gameState.currentTurnId = null;
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

// ---------- lobby ----------
function syncLobbyControls() {
  if (ui.playerCountSelect) ui.playerCountSelect.value = String(gameState.config.playerCount);
  if (ui.goalSelect) ui.goalSelect.value = String(gameState.config.objective);
  if (ui.privateToggle) ui.privateToggle.checked = gameState.config.roomPrivate;
  updatePrivacyUI();
  updateHostControls();
  updateStartButton();
}

function updateHostControls() {
  const isHost = isLocalHost();
  if (ui.playerCountSelect) ui.playerCountSelect.disabled = !isHost || gameState.started;
  if (ui.goalSelect) ui.goalSelect.disabled = !isHost || gameState.started;
  if (ui.privateToggle) ui.privateToggle.disabled = !isHost || gameState.started;
  if (ui.roomPassInput) ui.roomPassInput.disabled = !isHost || !gameState.config.roomPrivate || gameState.started;
}

function updatePrivacyUI() {
  gameState.config.roomPrivate = !!ui.privateToggle?.checked;
  if (ui.privacyStatus) ui.privacyStatus.textContent = gameState.config.roomPrivate ? "Privada" : "Publica";
  if (ui.roomPassInput) {
    ui.roomPassInput.disabled = !gameState.config.roomPrivate || !isLocalHost() || gameState.started;
    if (!gameState.config.roomPrivate) ui.roomPassInput.value = "";
  }
}

function renderLobbySlots() {
  if (!ui.slotsGrid) return;
  ui.slotsGrid.innerHTML = "";
  const canManage = isLocalHost() && !gameState.started;

  gameState.slots.forEach((pid, index) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.slotIndex = String(index);
    if (canManage) slot.classList.add("clickable");

    if (pid === null) {
      slot.classList.add("slot-empty");
      const avatar = document.createElement("div");
      avatar.className = "slot-avatar slot-avatar-empty";
      avatar.textContent = ICONS.wait;

      const info = document.createElement("div");
      info.className = "slot-info";

      const name = document.createElement("div");
      name.className = "slot-name waiting";
      name.textContent = "Esperando jugador";

      const sub = document.createElement("div");
      sub.className = "slot-sub";
      sub.textContent = canManage ? "Click para agregar bot" : "Esperando...";

      info.appendChild(name);
      info.appendChild(sub);
      slot.appendChild(avatar);
      slot.appendChild(info);
    } else {
      const p = gameState.roster.get(pid);
      if (!p) return;
      slot.style.borderColor = `${p.colorHex}55`;
      slot.style.boxShadow = `0 0 18px ${p.colorHex}1f`;

      const avatar = document.createElement("div");
      avatar.className = "slot-avatar";
      avatar.textContent = p.isBot ? ICONS.bot : ICONS.player;
      avatar.style.background = `${p.colorHex}22`;
      avatar.style.borderColor = `${p.colorHex}66`;

      const info = document.createElement("div");
      info.className = "slot-info";

      const name = document.createElement("div");
      name.className = "slot-name";
      name.textContent = p.name;

      const sub = document.createElement("div");
      sub.className = "slot-sub";
      sub.textContent = p.colorName;

      info.appendChild(name);
      info.appendChild(sub);
      slot.appendChild(avatar);
      slot.appendChild(info);

      if (p.id === gameState.hostId) {
        slot.classList.add("slot-host");
        const crown = document.createElement("div");
        crown.className = "slot-crown";
        crown.textContent = ICONS.crown;
        slot.appendChild(crown);

        const badge = document.createElement("div");
        badge.className = "slot-badge";
        badge.textContent = "Host";
        slot.appendChild(badge);
      } else if (p.isBot) {
        const badge = document.createElement("div");
        badge.className = "slot-badge";
        badge.textContent = "Bot";
        slot.appendChild(badge);
      }
    }

    ui.slotsGrid.appendChild(slot);
  });

  updateStartButton();
}

function renderFinalSlots(winnerId) {
  if (!ui.finalSlotsGrid) return;
  ui.finalSlotsGrid.innerHTML = "";

  const players = gameState.activePlayers.length ? gameState.activePlayers : getActivePlayers();
  players.forEach((p) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.style.borderColor = `${p.colorHex}55`;
    slot.style.boxShadow = `0 0 18px ${p.colorHex}1f`;

    const avatar = document.createElement("div");
    avatar.className = "slot-avatar";
    avatar.textContent = p.isBot ? ICONS.bot : ICONS.player;
    avatar.style.background = `${p.colorHex}22`;
    avatar.style.borderColor = `${p.colorHex}66`;

    const info = document.createElement("div");
    info.className = "slot-info";

    const name = document.createElement("div");
    name.className = "slot-name";
    name.textContent = p.name;

    const sub = document.createElement("div");
    sub.className = "slot-sub";
    sub.textContent = p.colorName;

    info.appendChild(name);
    info.appendChild(sub);
    slot.appendChild(avatar);
    slot.appendChild(info);

    if (p.id === gameState.hostId) {
      slot.classList.add("slot-host");
      const crown = document.createElement("div");
      crown.className = "slot-crown";
      crown.textContent = ICONS.crown;
      slot.appendChild(crown);

      const badge = document.createElement("div");
      badge.className = "slot-badge";
      badge.textContent = "Host";
      slot.appendChild(badge);
    } else if (p.isBot) {
      const badge = document.createElement("div");
      badge.className = "slot-badge";
      badge.textContent = "Bot";
      slot.appendChild(badge);
    }

    if (winnerId !== null && p.id === winnerId) {
      slot.classList.add("slot-winner");
      slot.style.borderColor = `${p.colorHex}aa`;
      slot.style.boxShadow = `0 0 26px ${p.colorHex}66`;
    }

    ui.finalSlotsGrid.appendChild(slot);
  });
}

function setLobbyHint(message, isError) {
  if (!ui.lobbyHint) return;
  ui.lobbyHint.textContent = message || "";
  ui.lobbyHint.classList.toggle("hint-error", !!isError);

  if (gameState.lobbyHintTimeoutId) clearTimeout(gameState.lobbyHintTimeoutId);
  if (message) {
    gameState.lobbyHintTimeoutId = setTimeout(() => {
      ui.lobbyHint.textContent = "";
      ui.lobbyHint.classList.remove("hint-error");
      gameState.lobbyHintTimeoutId = null;
    }, 2400);
  }
}

// ---------- event wiring ----------
function bindActions() {
  if (ui.startBtn) {
    ui.startBtn.addEventListener("click", () => {
      safePlay(SFX.click);
      if (!isLocalHost()) {
        setLobbyHint("Solo el host puede iniciar", true);
        return;
      }
      if (getActivePlayers().length < 2) {
        setLobbyHint("Se requieren al menos 2 jugadores", true);
        safePlay(SFX.error);
        return;
      }
      closeSlotMenu();
      startGame();
    });
  }

  if (ui.backLobbyBtn) {
    ui.backLobbyBtn.addEventListener("click", () => {
      safePlay(SFX.click);
      window.location.href = "./room.html";
    });
  }

  if (ui.finalLobbyBtn) {
    ui.finalLobbyBtn.addEventListener("click", () => {
      safePlay(SFX.click);
      window.location.href = "./room.html";
    });
  }

  if (ui.finalRestartBtn) {
    ui.finalRestartBtn.addEventListener("click", () => {
      safePlay(SFX.click);
      window.location.reload();
    });
  }

  if (ui.rollBtn) {
    ui.rollBtn.addEventListener("click", () => {
      requestRoll(gameState.config.localPlayerId, true);
    });
  }

  if (ui.autoDialogCheck) {
    ui.autoDialogCheck.addEventListener("click", () => {
      const pid = gameState.currentTurnId;
      if (pid !== gameState.config.localPlayerId) return;
      if (!gameState.autoTurnEnabled.get(pid)) return;
      safePlay(SFX.click);
      disableAutoTurn(pid);
    });
  }

  if (ui.privateToggle) {
    ui.privateToggle.addEventListener("change", () => {
      if (!isLocalHost() || gameState.started) {
        ui.privateToggle.checked = gameState.config.roomPrivate;
        return;
      }
      updatePrivacyUI();
    });
  }

  if (ui.roomPassInput) {
    ui.roomPassInput.addEventListener("input", () => {
      gameState.config.roomPasscode = String(ui.roomPassInput.value || "").trim();
    });
  }

  if (ui.playerCountSelect) {
    ui.playerCountSelect.addEventListener("change", () => {
      if (!isLocalHost() || gameState.started) {
        ui.playerCountSelect.value = String(gameState.config.playerCount);
        return;
      }
      const nextCount = clamp(Number(ui.playerCountSelect.value), 2, 10);
      if (!canResizeSlots(nextCount)) {
        setLobbyHint("Primero expulsa jugadores/bots", true);
        safePlay(SFX.error);
        ui.playerCountSelect.value = String(gameState.config.playerCount);
        return;
      }
      resizeSlots(nextCount);
      renderLobbySlots();
    });
  }

  if (ui.goalSelect) {
    ui.goalSelect.addEventListener("change", () => {
      if (!isLocalHost() || gameState.started) {
        ui.goalSelect.value = String(gameState.config.objective);
        return;
      }
      const nextGoal = Number(ui.goalSelect.value);
      if (!Number.isFinite(nextGoal) || nextGoal <= 0) return;
      gameState.config.objective = nextGoal;
      updateLocalProgressUI();
    });
  }

  if (ui.slotsGrid) {
    ui.slotsGrid.addEventListener("click", (event) => {
      const slot = event.target.closest(".slot");
      if (!slot || !ui.slotsGrid.contains(slot)) return;
      if (!isLocalHost() || gameState.started) return;

      const slotIndex = Number(slot.dataset.slotIndex);
      if (!Number.isFinite(slotIndex)) return;

      const pid = gameState.slots[slotIndex] ?? null;
      if (pid !== null && pid === gameState.hostId) return;

      event.stopPropagation();
      openSlotMenu(slotIndex, pid, slot);
    });
  }

  if (ui.slotMenu) {
    ui.slotMenu.addEventListener("click", (event) => event.stopPropagation());
  }

  document.addEventListener("click", (event) => {
    if (!ui.slotMenu || ui.slotMenu.hidden) return;
    if (ui.slotMenu.contains(event.target)) return;
    closeSlotMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSlotMenu();
  });

  if (ui.menuAddBotBtn) {
    ui.menuAddBotBtn.addEventListener("click", () => {
      if (!gameState.menuTarget) return;
      addBotToSlot(gameState.menuTarget.slotIndex);
      closeSlotMenu();
    });
  }

  if (ui.menuSpectatorBtn) {
    ui.menuSpectatorBtn.addEventListener("click", () => {
      if (!gameState.menuTarget || gameState.menuTarget.playerId === null) return;
      moveToSpectator(gameState.menuTarget.playerId);
      closeSlotMenu();
    });
  }

  if (ui.menuKickBtn) {
    ui.menuKickBtn.addEventListener("click", () => {
      if (!gameState.menuTarget || gameState.menuTarget.playerId === null) return;
      removePlayer(gameState.menuTarget.playerId);
      closeSlotMenu();
    });
  }

  if (ui.menuHostBtn) {
    ui.menuHostBtn.addEventListener("click", () => {
      if (!gameState.menuTarget || gameState.menuTarget.playerId === null) return;
      setHost(gameState.menuTarget.playerId);
      closeSlotMenu();
    });
  }
}

// ---------- slot menu ----------
function openSlotMenu(slotIndex, playerId, anchorEl) {
  if (!ui.slotMenu) return;
  gameState.menuTarget = { slotIndex, playerId };

  const player = playerId !== null ? gameState.roster.get(playerId) : null;
  if (player && player.id === gameState.hostId) return;

  setMenuButtonVisible(ui.menuAddBotBtn, playerId === null);
  setMenuButtonVisible(ui.menuSpectatorBtn, !!player && !player.isBot);
  setMenuButtonVisible(ui.menuKickBtn, !!player);
  setMenuButtonVisible(ui.menuHostBtn, !!player && !player.isBot);

  if (ui.slotMenuTitle) {
    ui.slotMenuTitle.textContent = player ? `Acciones: ${player.name}` : "Slot vacio";
  }

  ui.slotMenu.hidden = false;
  positionMenu(ui.slotMenu, anchorEl);
}

function closeSlotMenu() {
  if (!ui.slotMenu) return;
  ui.slotMenu.hidden = true;
  gameState.menuTarget = null;
}

function positionMenu(menu, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - menuRect.width / 2;
  let top = rect.bottom + 8;

  left = clamp(left, 12, window.innerWidth - menuRect.width - 12);
  top = clamp(top, 12, window.innerHeight - menuRect.height - 12);

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function setMenuButtonVisible(btn, visible) {
  if (!btn) return;
  btn.hidden = !visible;
}

// ---------- players ----------
function createPlayer(name, options = {}) {
  const id = Number.isFinite(options.id) ? options.id : gameState.nextId++;
  const color = pickNextColor();
  const fallbackName = options.isBot
    ? `Bot ${id + 1}`
    : (id === gameState.config.localPlayerId ? "Ana" : "Tu");
  return {
    id,
    name: name || fallbackName,
    colorHex: color.hex,
    colorName: color.name,
    isBot: !!options.isBot,
    isHost: false,
    isSpectator: false,
  };
}

function pickNextColor() {
  const used = new Set([...gameState.roster.values()].map(p => p.colorHex));
  const available = COLORS.find(c => !used.has(c.hex));
  return available || COLORS[gameState.roster.size % COLORS.length];
}

function initPlayerState(pid) {
  gameState.progressTotal.set(pid, 0);
  gameState.autoTurnEnabled.set(pid, false);
  gameState.autoTurnArmed.set(pid, false);
}

function addBotToSlot(slotIndex) {
  if (!isLocalHost() || gameState.started) return;
  if (slotIndex < 0 || slotIndex >= gameState.slots.length) return;
  if (gameState.slots[slotIndex] !== null) return;

  const botName = `Bot ${gameState.botCount + 1}`;
  const bot = createPlayer(botName, { isBot: true });
  gameState.botCount += 1;

  gameState.roster.set(bot.id, bot);
  gameState.slots[slotIndex] = bot.id;
  initPlayerState(bot.id);

  renderLobbySlots();
}

function moveToSpectator(playerId) {
  const player = gameState.roster.get(playerId);
  if (!player) return;
  if (player.id === gameState.hostId) return;

  player.isSpectator = true;
  removeFromSlots(playerId);
  updateSpectatorsUI();
  renderLobbySlots();
}

function removePlayer(playerId) {
  const player = gameState.roster.get(playerId);
  if (!player) return;
  if (player.id === gameState.hostId) return;

  removeFromSlots(playerId);
  gameState.roster.delete(playerId);
  gameState.progressTotal.delete(playerId);
  gameState.autoTurnEnabled.delete(playerId);
  gameState.autoTurnArmed.delete(playerId);

  renderLobbySlots();
  updateSpectatorsUI();
}

function removeFromSlots(playerId) {
  gameState.slots = gameState.slots.map(pid => (pid === playerId ? null : pid));
}

function setHost(playerId) {
  const player = gameState.roster.get(playerId);
  if (!player) return;

  gameState.hostId = playerId;
  gameState.roster.forEach(p => { p.isHost = p.id === playerId; });
  updateHostControls();
  renderLobbySlots();
}

function canResizeSlots(nextCount) {
  const occupied = gameState.slots.filter(pid => pid !== null).length;
  const overflow = gameState.slots.slice(nextCount).some(pid => pid !== null);
  return occupied <= nextCount && !overflow;
}

function resizeSlots(nextCount) {
  const safeCount = clamp(nextCount, 2, 10);
  const oldCount = gameState.slots.length;
  gameState.config.playerCount = safeCount;

  if (safeCount > oldCount) {
    for (let i = oldCount; i < safeCount; i++) gameState.slots.push(null);
  } else if (safeCount < oldCount) {
    gameState.slots.length = safeCount;
  }
}

function getActivePlayers() {
  const players = [];
  gameState.slots.forEach((pid) => {
    if (pid === null) return;
    const p = gameState.roster.get(pid);
    if (!p || p.isSpectator) return;
    players.push(p);
  });
  return players;
}

function isLocalHost() {
  return gameState.hostId === gameState.config.localPlayerId;
}
// ---------- overlays ----------
function initOverlays() {
  setOverlayVisible("lobby", true, true);
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

// ---------- start game ----------
function startGame() {
  if (getActivePlayers().length < 2) {
    safePlay(SFX.error);
    setLobbyHint("Se requieren al menos 2 jugadores", true);
    return;
  }

  gameState.started = true;
  gameState.rollInFlight = false;
  gameState.timerStartMs = Date.now();
  updateHostControls();

  const activePlayers = getActivePlayers();
  gameState.activePlayers = activePlayers;
  gameState.turnOrder = activePlayers.map(p => p.id);
  gameState.turnIndex = Math.floor(Math.random() * gameState.turnOrder.length);
  gameState.currentTurnId = gameState.turnOrder[gameState.turnIndex];

  threeHeart.setWinMode(false);
  threeHeart.setColor("#ffffff");

  resetPlayerState();
  renderBoard();
  startTurn();

  hideOverlay("lobby");
  updateTurnUI();
}

function resetPlayerState() {
  gameState.progressTotal.clear();
  gameState.autoTurnEnabled.clear();
  gameState.autoTurnArmed.clear();
  gameState.roster.forEach((p) => initPlayerState(p.id));
}

// ---------- board render ----------
function renderBoard() {
  [...ui.board.querySelectorAll(".seat, .path")].forEach(node => node.remove());
  boardCache.seats.clear();
  boardCache.paths.clear();
  boardCache.dots.clear();
  boardCache.pathInners.clear();
  boardCache.seatProgress.clear();

  gameState.activePlayers.forEach(p => {
    const seat = document.createElement("div");
    seat.className = "seat";
    if (p.id === gameState.config.localPlayerId) seat.classList.add("seat-local");
    seat.dataset.pid = String(p.id);
    seat.innerHTML = `
      <div class="seat-card">
        <div class="seat-pfp" style="background:${p.colorHex}22;border-color:${p.colorHex}66">${ICONS.player}</div>
        <div>
          <div class="seat-name">${escapeHtml(p.name)}</div>
          <div class="seat-sub" data-progress></div>
        </div>
      </div>
    `;
    boardCache.seats.set(p.id, seat);
    const progressEl = seat.querySelector("[data-progress]");
    if (progressEl) boardCache.seatProgress.set(p.id, progressEl);
    ui.board.appendChild(seat);

    const path = document.createElement("div");
    path.className = "path";
    path.dataset.pid = String(p.id);

    const inner = document.createElement("div");
    inner.className = "path-inner";

    const dots = [];
    const dotCount = gameState.config.phaseSize;
    for (let i = 0; i < dotCount; i++) {
      const dot = document.createElement("div");
      dot.className = "dotc";
      dot.dataset.idx = String(i);
      inner.appendChild(dot);
      dots.push(dot);
    }

    path.appendChild(inner);
    boardCache.paths.set(p.id, path);
    boardCache.pathInners.set(p.id, inner);
    boardCache.dots.set(p.id, dots);
    ui.board.appendChild(path);
  });

  handleResize();
  paintAllFromState();
}

// ---------- painting + phases ----------
async function paintSteps(playerId, steps) {
  const dots = boardCache.dots.get(playerId);
  if (!dots) return;

  const objective = gameState.config.objective;
  const phaseSize = gameState.config.phaseSize;
  let total = gameState.progressTotal.get(playerId) ?? 0;
  const currentPhase = total % phaseSize;
  const overflow = objective > phaseSize && total + steps < objective && currentPhase + steps > phaseSize
    ? currentPhase + steps - phaseSize
    : 0;

  for (let i = 0; i < steps; i++) {
    total += 1;
    gameState.progressTotal.set(playerId, total);
    updateSeatProgress(playerId);

    const phaseProgress = total % phaseSize;
    const dotIndex = phaseProgress === 0 ? phaseSize - 1 : phaseProgress - 1;
    const dot = dots[dotIndex];
    if (dot) {
      dot.classList.add("painted");
      dot.style.background = getPlayer(playerId).colorHex;
      dot.style.boxShadow = `0 0 16px ${getPlayer(playerId).colorHex}44`;
    }

    if (playerId === gameState.config.localPlayerId) updateLocalProgressUI();
    safePlay(SFX.paint);
    await sleep(gameState.config.paintStepMs);

    if (objective > phaseSize && total % phaseSize === 0 && total < objective) {
      await sleep(120);
      resetDots(playerId);
      if (overflow > 0) spawnPhasePop(playerId, `+${overflow} adelantados`);
    }
  }
}

function paintAllFromState() {
  gameState.activePlayers.forEach(p => {
    const dots = boardCache.dots.get(p.id);
    if (!dots) return;

    const total = gameState.progressTotal.get(p.id) ?? 0;
    updateSeatProgress(p.id);
    const objective = gameState.config.objective;
    const phaseSize = gameState.config.phaseSize;
    let visible = 0;

    if (objective <= phaseSize) {
      visible = Math.min(total, objective);
    } else if (total >= objective) {
      visible = phaseSize;
    } else if (total % phaseSize === 0) {
      visible = 0;
    } else {
      visible = total % phaseSize;
    }

    dots.forEach((dot, idx) => {
      if (idx < visible) {
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

function resetDots(playerId) {
  const dots = boardCache.dots.get(playerId);
  if (!dots) return;
  dots.forEach((dot) => {
    dot.classList.remove("painted");
    dot.style.background = "";
    dot.style.boxShadow = "";
  });
}

function spawnPhasePop(playerId, text) {
  const path = boardCache.paths.get(playerId);
  if (!path || !text) return;
  const pop = document.createElement("div");
  pop.className = "phase-pop";
  pop.textContent = text;
  path.appendChild(pop);
  setTimeout(() => pop.remove(), 1400);
}

// ---------- turn logic ----------
function startTurn() {
  const pid = gameState.currentTurnId;
  gameState.turnStartMs = Date.now();
  gameState.turnDeadlineMs = gameState.turnStartMs + gameState.config.turnDurationMs;
  gameState.autoTurnArmed.set(pid, false);

  if (gameState.autoRollTimeoutId) {
    clearTimeout(gameState.autoRollTimeoutId);
    gameState.autoRollTimeoutId = null;
  }
  if (gameState.botRollTimeoutId) {
    clearTimeout(gameState.botRollTimeoutId);
    gameState.botRollTimeoutId = null;
  }

  hideAutoDialog();
  if (ui.autoDialogCheck) ui.autoDialogCheck.disabled = false;

  const p = getPlayer(pid);
  if (p.isBot) {
    scheduleBotRoll(pid);
    return;
  }

  if (gameState.autoTurnEnabled.get(pid)) {
    if (pid === gameState.config.localPlayerId) showAutoDialogEnabled(pid);
    scheduleAutoRoll(pid);
  }
}

function nextTurn() {
  hideAutoDialog();
  if (ui.autoDialogCheck) ui.autoDialogCheck.disabled = false;

  gameState.turnIndex = (gameState.turnIndex + 1) % gameState.turnOrder.length;
  gameState.currentTurnId = gameState.turnOrder[gameState.turnIndex];
  startTurn();
  updateTurnUI();
}

function updateTurnUI() {
  const isMyTurn = gameState.started && gameState.currentTurnId === gameState.config.localPlayerId;
  setRollButtonState(isMyTurn);

  if (!gameState.started) {
    updateLocalProgressUI();
    return;
  }

  const p = getPlayer(gameState.currentTurnId);
  if (isMyTurn) {
    setStatus("Es tu turno", "Tira el dado para avanzar");
  } else {
    setStatus(`Turno de ${p.name}`, "Observa el avance y espera tu turno");
  }

  updateLocalProgressUI();
}

function setRollButtonState(enabled) {
  if (!ui.rollBtn) return;
  ui.rollBtn.classList.toggle("enabled", enabled);
  ui.rollBtn.classList.toggle("turn-active", enabled);
  ui.rollBtn.disabled = !enabled;
  ui.rollBtn.setAttribute("aria-disabled", String(!enabled));
}

// server-ready roll flow: request -> apply (host authoritative)
function requestRoll(playerId, manual) {
  if (!gameState.started) return;
  if (gameState.rollInFlight) return;
  if (playerId !== gameState.currentTurnId) return;

  if (manual) safePlay(SFX.click);
  gameState.rollInFlight = true;
  executeRoll(playerId).finally(() => {
    gameState.rollInFlight = false;
  });
}

async function executeRoll(playerId) {
  const total = gameState.config.objective;
  const current = gameState.progressTotal.get(playerId) ?? 0;
  const player = getPlayer(playerId);

  const roll = await diceOverlay.playRoll(player);

  if (!gameState.started || playerId !== gameState.currentTurnId) return;

  if (current + roll > total) {
    safePlay(SFX.error);
    setStatus("Numero no exacto", `Necesitas ${total - current} exacto para llegar al corazon`);
    await sleep(650);
    nextTurn();
    return;
  }

  setStatus(`Salio ${roll}`, "Pintando circulos...");
  await paintSteps(playerId, roll);

  const after = gameState.progressTotal.get(playerId) ?? 0;
  if (after >= total) {
    safePlay(SFX.win);
    showFinal(playerId);
    return;
  }

  nextTurn();
}

function getRandomRoll() {
  return gameState.config.rollMin + Math.floor(Math.random() * (gameState.config.rollMax - gameState.config.rollMin + 1));
}

function scheduleAutoRoll(pid) {
  if (gameState.autoRollTimeoutId) clearTimeout(gameState.autoRollTimeoutId);
  gameState.autoRollTimeoutId = setTimeout(() => {
    gameState.autoRollTimeoutId = null;
    if (!gameState.started || gameState.currentTurnId !== pid) return;
    if (!gameState.autoTurnEnabled.get(pid)) return;
    requestRoll(pid, false);
  }, 600);
}

function scheduleBotRoll(pid) {
  if (gameState.botRollTimeoutId) clearTimeout(gameState.botRollTimeoutId);
  gameState.botRollTimeoutId = setTimeout(() => {
    gameState.botRollTimeoutId = null;
    if (!gameState.started || gameState.currentTurnId !== pid) return;
    requestRoll(pid, false);
  }, 700);
}

// ---------- auto-turn ----------
function startTicker() {
  setInterval(() => {
    updateTimer();
    if (!gameState.started) return;
    tickTurnTimer();
  }, 120);
}

function tickTurnTimer() {
  const pid = gameState.currentTurnId;
  if (!pid) return;

  const player = getPlayer(pid);
  if (player.isBot) return;
  if (gameState.autoTurnEnabled.get(pid)) return;

  const now = Date.now();
  const msLeft = gameState.turnDeadlineMs - now;

  if (msLeft <= 0) {
    enableAutoTurn(pid);
    return;
  }

  if (pid !== gameState.config.localPlayerId) return;

  if (msLeft <= gameState.config.autoCountdownSec * 1000) {
    gameState.autoTurnArmed.set(pid, true);
    const sec = Math.ceil(msLeft / 1000);
    showAutoDialogCountdown(sec);
    return;
  }

  if (gameState.autoDialog.visible) hideAutoDialog();
}

function enableAutoTurn(pid) {
  if (gameState.autoTurnEnabled.get(pid)) return;
  gameState.autoTurnEnabled.set(pid, true);
  gameState.autoTurnArmed.set(pid, true);

  if (pid === gameState.config.localPlayerId) showAutoDialogEnabled(pid);
  scheduleAutoRoll(pid);
}

function disableAutoTurn(pid) {
  gameState.autoTurnEnabled.set(pid, false);
  gameState.autoTurnArmed.set(pid, false);
  if (gameState.autoRollTimeoutId) {
    clearTimeout(gameState.autoRollTimeoutId);
    gameState.autoRollTimeoutId = null;
  }
  if (ui.autoDialogCheck) ui.autoDialogCheck.disabled = true;
  setTimeout(() => hideAutoDialog(), 1000);
}

function showAutoDialogCountdown(sec) {
  if (
    gameState.autoDialog.visible &&
    gameState.autoDialog.mode === "countdown" &&
    gameState.autoDialog.countdownSec === sec
  ) {
    return;
  }

  gameState.autoDialog = { visible: true, mode: "countdown", countdownSec: sec };
  if (ui.autoDialogWrap) ui.autoDialogWrap.hidden = false;
  if (ui.autoDialogTitle) ui.autoDialogTitle.textContent = `Auto-Turno en ${sec}`;
  if (ui.autoDialogSub) ui.autoDialogSub.textContent = "Si no tiras, lo hara por ti";
  if (ui.autoDialogCheck) ui.autoDialogCheck.hidden = true;
}

function showAutoDialogEnabled(pid) {
  gameState.autoDialog = { visible: true, mode: "active", countdownSec: 0 };
  if (ui.autoDialogWrap) ui.autoDialogWrap.hidden = false;
  if (ui.autoDialogTitle) ui.autoDialogTitle.textContent = "Auto-Turno activado";
  if (ui.autoDialogSub) ui.autoDialogSub.textContent = "Tiradas automaticas en tu turno";

  const isLocal = pid === gameState.config.localPlayerId;
  if (ui.autoDialogCheck) {
    ui.autoDialogCheck.hidden = !isLocal;
    ui.autoDialogCheck.disabled = !isLocal;
  }
}

function hideAutoDialog() {
  gameState.autoDialog = { visible: false, mode: "countdown", countdownSec: 0 };
  if (ui.autoDialogWrap) ui.autoDialogWrap.hidden = true;
  if (ui.autoDialogCheck) ui.autoDialogCheck.hidden = false;
}

// ---------- final ----------
function showFinal(winnerId) {
  gameState.started = false;
  hideAutoDialog();
  setRollButtonState(false);
  updateHostControls();

  const w = getPlayer(winnerId);
  if (ui.heart) {
    ui.heart.style.boxShadow = `0 0 28px ${w.colorHex}55, 0 0 0 1px rgba(0,0,0,.18) inset`;
    ui.heart.style.borderColor = `${w.colorHex}66`;
  }
  if (ui.heartCore) {
    ui.heartCore.style.color = w.colorHex;
    ui.heartCore.textContent = ICONS.heart;
  }
  threeHeart.setColor(w.colorHex);
  threeHeart.setWinMode(true);

  if (ui.finalTitle) ui.finalTitle.textContent = `Victoria de ${w.name}!`;
  if (ui.finalSub) ui.finalSub.textContent = "Llego al corazon con numero exacto";

  renderFinalSlots(winnerId);
  showOverlay("final");
}

// ---------- HUD helpers ----------
function applyHudProfile(p) {
  if (!p) return;
  if (ui.hudName) ui.hudName.textContent = p.name;
  if (ui.hudDesc) ui.hudDesc.textContent = `Color: ${p.colorName}`;
  if (ui.hudPfp) {
    ui.hudPfp.style.background = `${p.colorHex}22`;
    ui.hudPfp.style.borderColor = `${p.colorHex}66`;
    ui.hudPfp.textContent = ICONS.player;
  }
}

function updateLocalProgressUI() {
  if (!ui.progressText) return;
  const meProg = gameState.progressTotal.get(gameState.config.localPlayerId) ?? 0;
  ui.progressText.textContent = `Circulos pintados: ${meProg}/${gameState.config.objective}`;
}

function updateSeatProgress(playerId) {
  const el = boardCache.seatProgress.get(playerId);
  if (!el) return;
  const total = gameState.progressTotal.get(playerId) ?? 0;
  el.textContent = `${total}/${gameState.config.objective}`;
}

function updateSpectatorsUI() {
  const count = [...gameState.roster.values()].filter(p => p.isSpectator).length;
  gameState.spectators = clamp(count, 0, gameState.config.spectatorsMax);
  if (ui.spectatorsText) ui.spectatorsText.textContent = `${gameState.spectators}/${gameState.config.spectatorsMax}`;
}

function setStatus(title, sub) {
  if (ui.statusTitle) ui.statusTitle.textContent = title;
  if (ui.statusSub) ui.statusSub.textContent = sub;
}

function updateTimer() {
  if (!ui.timerText) return;
  if (!gameState.started) {
    ui.timerText.textContent = "00:00";
    return;
  }
  const ms = Date.now() - gameState.timerStartMs;
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  ui.timerText.textContent = `${mm}:${ss}`;
}

function updateStartButton() {
  if (!ui.startBtn) return;
  const canStart = isLocalHost() && getActivePlayers().length >= 2 && !gameState.started;
  ui.startBtn.disabled = !canStart;
}

// ---------- dice overlay ----------
function showDiceOverlay(player) {
  if (!ui.diceOverlay) return;
  ui.diceOverlay.hidden = false;

  if (ui.dicePlayer) {
    const showPlayer = player.id !== gameState.config.localPlayerId;
    ui.dicePlayer.hidden = !showPlayer;
    if (showPlayer) {
      ui.diceName.textContent = player.name;
      ui.diceAvatar.style.background = `${player.colorHex}22`;
      ui.diceAvatar.style.borderColor = `${player.colorHex}66`;
      ui.diceAvatar.textContent = ICONS.player;
    }
  }
}

function hideDiceOverlay() {
  if (!ui.diceOverlay) return;
  ui.diceOverlay.hidden = true;
}

// ---------- host disconnect ----------
function setupHostDisconnectListener() {
  window.addEventListener("hexachange:host-disconnect", () => {
    try { localStorage.setItem(STORAGE_KEYS.hostLeft, "1"); } catch (_) {}
    window.location.href = "./room.html";
  });
}

// ---------- geometry helpers ----------
function updatePolygonVisual(sides, cx, cy, radius, offset) {
  if (!ui.boardPoly) return;
  const size = radius * 2;
  ui.boardPoly.style.width = `${size}px`;
  ui.boardPoly.style.height = `${size}px`;
  ui.boardPoly.style.left = `${cx - radius}px`;
  ui.boardPoly.style.top = `${cy - radius}px`;

  const points = [];
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2 + offset;
    const x = 50 + Math.cos(angle) * 50;
    const y = 50 + Math.sin(angle) * 50;
    points.push(`${x}% ${y}%`);
  }
  ui.boardPoly.style.clipPath = `polygon(${points.join(",")})`;
}

function getHeartSafeRadius(boardRect) {
  const heartRect = ui.heartCanvas?.getBoundingClientRect?.() || ui.heart?.getBoundingClientRect?.();
  if (!heartRect) return clamp(Math.min(boardRect.width, boardRect.height) * 0.08, 40, 70);
  const size = Math.max(heartRect.width, heartRect.height);
  const extra = clamp(Math.min(boardRect.width, boardRect.height) * 0.02, 10, 20);
  return size / 2 + extra;
}

function resizeHeartCanvas() {
  if (!ui.heartCanvas || !ui.board) return;
  const rect = ui.board.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const size = clamp(Math.min(rect.width, rect.height) * 0.18, 140, 220);
  ui.heartCanvas.style.width = `${size}px`;
  ui.heartCanvas.style.height = `${size}px`;
}

// ---------- utils ----------
function getPlayer(id) {
  const p = gameState.roster.get(id);
  if (!p) throw new Error(`player not found: ${id}`);
  return p;
}

function getStoredNumber(key) {
  try {
    const raw = localStorage.getItem(key);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch (_) {
    return null;
  }
}

function getStoredName() {
  try {
    return localStorage.getItem(STORAGE_KEYS.name) || "";
  } catch (_) {
    return "";
  }
}

function sanitizeName(name) {
  return String(name || "").trim().slice(0, 18);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[s]));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Minimal hooks for future server integration
window.HexaGame = {
  state: () => gameState,
  setHeartColor: (hex) => threeHeart.setColor(hex),
  triggerHostDisconnect: () => window.dispatchEvent(new Event("hexachange:host-disconnect")),
};





