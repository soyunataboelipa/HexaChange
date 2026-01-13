(() => {
  const $ = (s) => document.querySelector(s);

  const gearBtn = $("#gearBtn");
  const overlay = $("#settingsOverlay");
  const box = $("#settingsBox");

  const closeBtn = $("#settingsClose");
  const cancelBtn = $("#setCancel");
  const applyBtn = $("#setApply");

  const selCircles = $("#setCircles");
  const inpMax = $("#setMaxPlayers");
  const chkAnon = $("#setAnon");

  // NUEVO: privado + contraseña
  const chkPrivate = $("#setPrivate");
  const passRow = $("#setPassRow");
  const inpPass = $("#setPassword");

  if (!gearBtn || !overlay || !box) return;

  const open = () => {
    if (!window.Hexa?.isHost?.()) return;
    overlay.classList.add("show");
    box.classList.add("show");
    box.classList.remove("hide");
    document.body.classList.add("modal-open");
  };

  const close = () => {
    overlay.classList.remove("show");
    box.classList.remove("show");
    box.classList.add("hide");
    document.body.classList.remove("modal-open");
  };

  // Para que el botón NO intente “submit” si está dentro de form
  gearBtn.type = "button";

  gearBtn.addEventListener("click", open);
  overlay.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);

  // Poblar círculos según modo
  function circlesForMode(mode) {
    if (mode === "probalico") return [100, 150, 200];
    return [10, 20, 50];
  }

  function fillCircles(mode, current) {
    selCircles.innerHTML = "";
    circlesForMode(mode).forEach((n) => {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = `${n} círculos`;
      if (n === Number(current)) opt.selected = true;
      selCircles.appendChild(opt);
    });
  }

  function syncUIFromState() {
    const st = window.Hexa?.getState?.();
    if (!st) return;

    fillCircles(st.config.mode, st.config.circles);

    inpMax.value = String(st.config.maxPlayers ?? 10);
    chkAnon.checked = !!st.config.anonymous;

    // privado/contra
    chkPrivate.checked = !!st.config.private;
    passRow.style.display = chkPrivate.checked ? "flex" : "none";
    inpPass.value = ""; // nunca mostrar la actual
  }

  chkPrivate?.addEventListener("change", () => {
    passRow.style.display = chkPrivate.checked ? "flex" : "none";
    if (!chkPrivate.checked) inpPass.value = "";
  });

  applyBtn?.addEventListener("click", () => {
    const st = window.Hexa?.getState?.();
    if (!st) return;

    // Solo host y solo antes de iniciar
    if (st.started) {
      window.Hexa.socket().emit("room:error", { code: "CONFIG_LOCKED" });
      return;
    }

    const circles = Number(selCircles.value);
    const maxPlayers = Math.max(2, Math.min(10, Number(inpMax.value || 10)));

    const isPrivate = !!chkPrivate.checked;
    const password = inpPass.value.trim();

    if (isPrivate && password.length < 3) {
      // mínimo para no quedar bloqueado
      alert("Pon una contraseña (mínimo 3 caracteres).");
      return;
    }

    window.Hexa.socket().emit("room:config", {
      roomId: window.Hexa.roomId(),
      patch: {
        circles,
        maxPlayers,
        anonymous: !!chkAnon.checked,

        // NUEVO
        private: isPrivate,
        password: isPrivate ? password : "" // el server debe hashearla
      }
    });

    close();
  });

  // Si llega estado, sincroniza (y también al abrir)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // Cuando el host abre el panel, cargar valores actuales
  gearBtn.addEventListener("click", () => {
    setTimeout(syncUIFromState, 0);
  });
})();
