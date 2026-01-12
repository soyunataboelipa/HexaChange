(() => {
  const MODE_KEY = "hexachange_mode";
  const CIRCLES_KEY = "hexachange_circles";

  const list = document.querySelector(".list");
  if (!list) return;

  const mode = list.getAttribute("data-mode") || "colorroll";

  list.addEventListener("click", (e) => {
    const btn = e.target.closest(".list-item");
    if (!btn) return;

    const circles = Number(btn.getAttribute("data-circles"));
    if (!Number.isFinite(circles) || circles <= 0) return;

    // Guardar selección
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(CIRCLES_KEY, String(circles));

    // Ir al siguiente paso (tu flujo)
    window.location.href = "./room.html";
  });
})();
