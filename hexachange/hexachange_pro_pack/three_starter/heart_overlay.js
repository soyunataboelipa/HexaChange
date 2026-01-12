// heart_overlay.js (starter)
// Requires: three (THREE) loaded by your build system or import maps.
import * as THREE from "three";

export function createHeartOverlay(canvas, { pixelRatio = Math.min(window.devicePixelRatio || 1, 2) } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0.25, 3.2);

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2, 3, 4);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-2, 1, 3);
  scene.add(fill);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  // Heart shape (2D) -> extrude to 3D
  const x = 0, y = 0;
  const heartShape = new THREE.Shape();
  heartShape.moveTo(x + 0.0, y + 0.25);
  heartShape.bezierCurveTo(x + 0.0, y + 0.25, x - 0.5, y - 0.1, x - 0.5, y - 0.45);
  heartShape.bezierCurveTo(x - 0.5, y - 0.8, x - 0.1, y - 1.0, x + 0.0, y - 0.75);
  heartShape.bezierCurveTo(x + 0.1, y - 1.0, x + 0.5, y - 0.8, x + 0.5, y - 0.45);
  heartShape.bezierCurveTo(x + 0.5, y - 0.1, x + 0.0, y + 0.25, x + 0.0, y + 0.25);

  const geo = new THREE.ExtrudeGeometry(heartShape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 6,
    curveSegments: 24
  });
  geo.center();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.12
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI * 0.08;
  scene.add(mesh);

  let running = true;
  let spinEvery = 3.0; // seconds per full turn baseline (your spec)
  let acc = 0;

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function setColor(hex) {
    mat.color.set(hex);
  }

  function setWinMode(isWin) {
    // win: faster (1.5s per turn)
    spinEvery = isWin ? 1.5 : 3.0;
  }

  function tick(dt) {
    if (!running) return;
    acc += dt;
    const speed = (Math.PI * 2) / spinEvery;
    mesh.rotation.y += speed * dt;
    // subtle idle bob
    mesh.position.y = Math.sin(acc * 1.2) * 0.02;
    renderer.render(scene, camera);
  }

  function stop() { running = false; }
  function start() { running = true; }

  return { resize, tick, stop, start, setColor, setWinMode };
}
