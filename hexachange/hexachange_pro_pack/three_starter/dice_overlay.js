// dice_overlay.js (starter)
// Requires: three (THREE) loaded by your build system or import maps.
import * as THREE from "three";

export function createDiceOverlay(canvas, { pixelRatio = Math.min(window.devicePixelRatio || 1, 2) } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 1.4, 3.2);
  camera.lookAt(0, 0.7, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2, 4, 2);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xffffff, 0.35);
  rim.position.set(-3, 2, -2);
  scene.add(rim);

  // Simple dice: cube with rounded-ish look (bevel via geometry segments)
  const geo = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.25,
    metalness: 0.05
  });
  const dice = new THREE.Mesh(geo, mat);
  dice.position.set(0, 0.7, 0);
  scene.add(dice);

  // Ground shadow plane (fake)
  const shadowGeo = new THREE.PlaneGeometry(3, 3);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.1;
  scene.add(shadow);

  let running = true;
  let phase = "idle"; // "roll" "land"
  let t = 0;

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function startRoll(duration = 2.0) {
    phase = "roll";
    t = 0;
    dice.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
    // We'll stop at a nice orientation later when we implement result mapping.
    dice.userData.rollDuration = duration;
  }

  function tick(dt) {
    if (!running) return;
    if (phase === "roll") {
      t += dt;
      dice.rotation.x += 6.5 * dt;
      dice.rotation.y += 7.2 * dt;
      dice.rotation.z += 5.8 * dt;
      const p = Math.min(t / (dice.userData.rollDuration || 2.0), 1);
      // ease down spin near end
      const ease = 1 - Math.pow(1 - p, 3);
      dice.rotation.x *= (0.985 + 0.015*(1-ease));
      dice.rotation.y *= (0.985 + 0.015*(1-ease));
      dice.rotation.z *= (0.985 + 0.015*(1-ease));
      shadowMat.opacity = 0.18 + 0.12 * (1 - ease);
      if (p >= 1) phase = "idle";
    } else {
      // idle micro motion
      dice.rotation.y += 0.3 * dt;
      shadowMat.opacity = 0.22;
    }

    renderer.render(scene, camera);
  }

  function stop() { running = false; }
  function start() { running = true; }

  return { resize, tick, stop, start, startRoll };
}
