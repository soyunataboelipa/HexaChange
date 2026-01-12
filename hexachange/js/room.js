(() => {
  const ROOM_KEY = "hexachange_room";
  const NAME_KEY = "hexachange_name";
  const MODE_KEY = "hexachange_mode";
  const CIRCLES_KEY = "hexachange_circles";

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const makeRoom = () =>
    Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

  const $ = (s) => document.querySelector(s);

  // ===== UI base =====
  const nameInput = $("#nameInput");
  const modePill = $("#modePill");
  const circlesPill = $("#circlesPill");
  const debugLine = $("#debugLine");

  const newRoomCode = $("#newRoomCode");
  const regenBtn = $("#regenBtn");
  const createBtn = $("#createBtn");

  const joinCodeInput = $("#joinCodeInput");
  const joinBtn = $("#joinBtn");

  // ===== Burbuja cómic =====
  const codeStatusWrap = $("#codeStatusWrap");
  const codeStatusBubble = $("#codeStatusBubble");

  // ===== Modal password =====
  const passOverlay = $("#passOverlay");
  const passModal = $("#passModal");
  const passInput = $("#passInput");
  const passClose = $("#passClose");
  const passCancel = $("#passCancel");
  const passOk = $("#passOk");

  // ===== Socket.IO =====
  const socket = window.io ? window.io() : null;

  // Estado del flujo Join
  let pendingJoinCode = null;

  // ===== Helpers =====
  function setDebug(msg) {
    if (debugLine) debugLine.textContent = msg || "—";
  }

  function showBubble(text) {
    if (!codeStatusWrap || !codeStatusBubble) return;
    codeStatusBubble.textContent = text;
    codeStatusWrap.style.display = "flex";
  }

  function hideBubble() {
    if (!codeStatusWrap) return;
    codeStatusWrap.style.display = "none";
  }

  function openPassModal() {
    if (!passOverlay || !passModal) return;
    passOverlay.classList.add("show");
    passModal.classList.add("show");
    passModal.setAttribute("aria-hidden", "false");
    if (passInput) {
      passInput.value = "";
      setTimeout(() => passInput.focus(), 0);
    }
  }

  function closePassModal() {
    if (!passOverlay || !passModal) return;
    passOverlay.classList.remove("show");
    passModal.classList.remove("show");
    passModal.setAttribute("aria-hidden", "true");
    if (passInput) passInput.value = "";
  }

  function gameFor(mode) {
    return mode === "probalico" ? "./game-probalico.html" : "./game-colorroll.html";
  }

  function sanitizeCode(v) {
    const raw = String(v || "").trim();
    const filtered = raw.split("").filter((c) => chars.includes(c)).join("");
    return filtered.slice(0, 6);
  }

  function getName() {
    const n = String(nameInput?.value || "").trim().slice(0, 18);
    return n.length ? n : null;
  }

  function saveName() {
    const n = getName();
    if (n) localStorage.setItem(NAME_KEY, n);
    else localStorage.removeItem(NAME_KEY);
  }

  function loadConfig() {
    const mode = localStorage.getItem(MODE_KEY);
    const circles = localStorage.getItem(CIRCLES_KEY);

    if (modePill) {
      if (mode === "probalico") modePill.textContent = "Probalico";
      else if (mode === "colorroll") modePill.textContent = "ColorRoll Lite";
      else modePill.textContent = "—";
    }

    if (circlesPill) circlesPill.textContent = circles ? circles : "—";
    if (nameInput) nameInput.value = localStorage.getItem(NAME_KEY) || "";

    // Generar código siempre
    if (newRoomCode) newRoomCode.textContent = makeRoom();

    setDebug(`mode=${mode ?? "null"} | circles=${circles ?? "null"} | socket=${socket ? "ok" : "no"}`);

    hideBubble();
  }

  // ===== Modal close bindings =====
  if (passOverlay) passOverlay.addEventListener("click", closePassModal);
  if (passClose) passClose.addEventListener("click", closePassModal);
  if (passCancel) passCancel.addEventListener("click", closePassModal);

  if (passInput) {
    passInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && passOk) passOk.click();
      if (e.key === "Escape") closePassModal();
    });
  }

  // ===== Crear sala =====
  if (regenBtn) {
    regenBtn.addEventListener("click", () => {
      if (newRoomCode) newRoomCode.textContent = makeRoom();
    });
  }

  if (createBtn) {
    createBtn.addEventListener("click", () => {
      saveName();

      const mode = localStorage.getItem(MODE_KEY);
      const circles = localStorage.getItem(CIRCLES_KEY);

      if (!mode || !circles) {
        window.location.href = "./index.html";
        return;
      }

      const code = newRoomCode ? newRoomCode.textContent : makeRoom();
      localStorage.setItem(ROOM_KEY, code);

      // Host entra al juego directo
      window.location.href = gameFor(mode);
    });
  }

  // ===== Sanitizar input de join =====
  if (joinCodeInput) {
    joinCodeInput.addEventListener("input", () => {
      joinCodeInput.value = sanitizeCode(joinCodeInput.value);
    });
  }

  // ===== JOIN: SOLO al presionar Unirme =====
  if (joinBtn) {
    joinBtn.addEventListener("click", () => {
      saveName();

      const name = getName();
      if (!name) {
        setDebug("Pon tu nombre antes de unirte.");
        return;
      }

      const mode = localStorage.getItem(MODE_KEY);
      const circles = localStorage.getItem(CIRCLES_KEY);
      if (!mode || !circles) {
        window.location.href = "./index.html";
        return;
      }

      const code = sanitizeCode(joinCodeInput?.value);
      if (code.length !== 6) {
        setDebug("El código debe tener 6 caracteres.");
        return;
      }

      localStorage.setItem(ROOM_KEY, code);

      if (!socket) {
        showBubble("⚠️ No hay servidor: no se puede verificar salas.");
        setDebug("No hay servidor activo.");
        return;
      }

      pendingJoinCode = code;
      showBubble("👀 Buscando sala...");
      setDebug("Buscando sala...");

      socket.emit("room:peek", { code });
    });
  }

  // ===== Respuestas del server =====
  if (socket) {
    socket.on("room:peek:result", (data) => {
      if (!data || data.code !== pendingJoinCode) return;

      const ok = data.exists && data.hasHost && data.isOpen;

      if (!ok) {
        showBubble("No se ha encontrado ninguna sala.");
        setDebug("No se ha encontrado ninguna sala.");
        pendingJoinCode = null;
        return;
      }

      showBubble("✅ Sala encontrada. Verificando acceso...");
      setDebug("Sala encontrada. Verificando acceso...");
      socket.emit("room:check", { code: pendingJoinCode });
    });

    socket.on("room:check:result", (data) => {
      if (!data || data.code !== pendingJoinCode) return;

      if (!data.ok || !data.exists) {
        showBubble("No se ha encontrado ninguna sala.");
        setDebug(data?.message || "No se ha encontrado ninguna sala.");
        pendingJoinCode = null;
        return;
      }

      if (data.requiresPassword) {
        showBubble("🔒 Sala privada. Escribe la contraseña.");
        setDebug("Sala privada: esperando contraseña.");
        openPassModal();
      } else {
        showBubble("➡️ Entrando a la sala...");
        setDebug("Entrando...");
        socket.emit("room:join", { code: pendingJoinCode, name: getName() });
      }
    });

    if (passOk) {
      passOk.addEventListener("click", () => {
        const pass = String(passInput?.value || "").trim();
        if (!pass) {
          setDebug("Escribe la contraseña.");
          return;
        }
        if (!pendingJoinCode) {
          setDebug("No hay sala pendiente.");
          return;
        }

        showBubble("🔑 Validando contraseña...");
        setDebug("Validando...");
        socket.emit("room:join", { code: pendingJoinCode, name: getName(), password: pass });
      });
    }

    socket.on("room:join:result", (data) => {
      if (!data || data.code !== pendingJoinCode) return;

      if (!data.ok) {
        showBubble(data?.message || "No se pudo entrar.");
        setDebug(data?.message || "No se pudo entrar.");
        return;
      }

      closePassModal();
      showBubble("✅ Entraste a la sala. Cargando...");
      setDebug("Entraste. Redirigiendo...");

      const mode = localStorage.getItem(MODE_KEY);
      window.location.href = data.redirectUrl || gameFor(mode);
    });
  }

  // ===== Extra: tilt + parallax estilo index =====
  const tiltables = document.querySelectorAll(".panel, .card");
  function tilt(el, e) {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const rx = (0.5 - y) * 5;
    const ry = (x - 0.5) * 7;
    el.style.transform = `translateY(-2px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }
  function reset(el) { el.style.transform = ""; }

  tiltables.forEach(el => {
    el.addEventListener("mousemove", (e) => tilt(el, e));
    el.addEventListener("mouseleave", () => reset(el));
  });

  const a1 = document.querySelector(".a1");
  const a2 = document.querySelector(".a2");
  window.addEventListener("mousemove", (e) => {
    const px = (e.clientX / window.innerWidth - 0.5);
    const py = (e.clientY / window.innerHeight - 0.5);
    if (a1) a1.style.transform = `translate(${px * 18}px, ${py * -12}px) scale(1.02)`;
    if (a2) a2.style.transform = `translate(${px * -16}px, ${py * 14}px) scale(1.02)`;
  }, { passive: true });

  // Init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadConfig);
  } else {
    loadConfig();
  }
})();
