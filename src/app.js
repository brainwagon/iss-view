import * as THREE from 'three';
import { gstime } from 'satellite';
import { createScene } from './scene.js';
import { createEarth } from './earth.js';
import { ISSTracker } from './iss.js';
import { CameraManager, MODES } from './cameras.js';
import { ISSModel, createProceduralISS } from './iss-model.js';

const { scene, camera, renderer } = createScene();
const earth = await createEarth(scene);
const { earthMesh, cloudMesh } = earth;
const iss = new ISSTracker();
const cameraManager = new CameraManager(camera, renderer);
const clock = new THREE.Clock();

// ISS 3D model (with procedural fallback)
let issModel = null;

// HUD elements
const hudLat = document.getElementById('hud-lat');
const hudLon = document.getElementById('hud-lon');
const hudAlt = document.getElementById('hud-alt');
const hudVel = document.getElementById('hud-vel');
const hudSrc = document.getElementById('hud-src');
const hudMode = document.getElementById('hud-mode');

let lastTick = 0;
const TICK_MS = 1000; // ISS position update interval
let currentData = null;

// Sun direction calculation (approximate, accurate to ~1°)
function getSunDirectionECI(date) {
  const JD = date.getTime() / 86400000.0 + 2440587.5;
  const n = JD - 2451545.0; // days since J2000.0

  const L = (280.46 + 0.9856474 * n) % 360; // mean longitude
  const g = ((357.528 + 0.9856003 * n) % 360) * (Math.PI / 180); // mean anomaly

  const lambdaRad = ((L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360) *
    (Math.PI / 180); // ecliptic longitude

  const epsilon = 23.439 * (Math.PI / 180); // obliquity of ecliptic

  // ECI direction (unit vector toward sun)
  const eciX = Math.cos(lambdaRad);
  const eciY = Math.cos(epsilon) * Math.sin(lambdaRad);
  const eciZ = Math.sin(epsilon) * Math.sin(lambdaRad);

  // Map ECI → Three.js world space
  return new THREE.Vector3(eciX, eciZ, -eciY).normalize();
}

async function tick() {
  const data = await iss.update();
  if (!data) return;
  currentData = data;

  // Update HUD
  hudLat.textContent = data.geodetic.lat.toFixed(4);
  hudLon.textContent = data.geodetic.lon.toFixed(4);
  hudAlt.textContent = data.geodetic.alt.toFixed(1);
  hudVel.textContent = data.speed.toFixed(2);
  hudSrc.textContent = data.source;
  hudMode.textContent = cameraManager.mode.toUpperCase();

  const now = new Date();

  // Rotate Earth texture to match real sidereal orientation
  earth.setGMST(gstime(now));

  // Update sun direction for day/night lighting
  const sunDir = getSunDirectionECI(now);
  earth.setSunDirection(sunDir);
}

function animate(timestamp) {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const now = new Date();

  // Tick ISS update once per second (for HUD/API fallback)
  if (timestamp - lastTick > TICK_MS) {
    lastTick = timestamp;
    tick();
  }

  // Smooth per-frame propagation if TLE is available
  if (iss.usedTLE) {
    const syncData = iss.getPropagatedState(now);
    if (syncData) currentData = syncData;
  }

  // Animate cloud rotation (slow drift relative to Earth)
  cloudMesh.rotation.y += 0.00001 * (delta * 1000);

  // Update ISS model position and orientation
  if (issModel) {
    issModel.update(currentData);
  }

  // Update camera based on current mode and ISS data
  cameraManager.update(currentData, delta);

  // Rotate Earth texture to match real sidereal orientation
  earth.setGMST(gstime(now));

  // Update sun direction for day/night lighting
  const sunDir = getSunDirectionECI(now);
  earth.setSunDirection(sunDir);

  // Render logic
  const mode = cameraManager.mode;
  const showModel = (mode === MODES.ORBIT || mode === MODES.FREE || mode === MODES.EXTERIOR);

  if (showModel) {
    // Two-phase render to handle precision/clipping when following ISS
    // Pass 1 — Earth (ISS hidden, standard near/far)
    renderer.autoClear = false;
    camera.near = 1;
    camera.far = 1_000_000;
    camera.updateProjectionMatrix();
    if (issModel) issModel.setVisible(false);
    renderer.clear();
    renderer.render(scene, camera);

    // Pass 2 — ISS (tight near/far around the camera-to-ISS distance)
    // For EXTERIOR, far=1 is fine. For ORBIT, we need more room.
    const distToIss = currentData ? camera.position.distanceTo(
      new THREE.Vector3(currentData.position.x, currentData.position.y, currentData.position.z)
    ) : 2;
    
    camera.near = 0.001; 
    camera.far = Math.max(1, distToIss + 5); // 5km padding
    camera.updateProjectionMatrix();
    renderer.clearDepth();
    if (issModel) issModel.setVisible(true);
    renderer.render(scene, camera);

    // Restore defaults for UI or other overlays
    camera.near = 1;
    camera.far = 1_000_000;
    camera.updateProjectionMatrix();
    renderer.autoClear = true;
  } else {
    renderer.render(scene, camera);
  }
}

// Main initialization
(async () => {
  try {
    console.log('[App] Initializing ISS tracker...');
    await iss.init();

    console.log('[App] Loading ISS 3D model...');
    issModel = new ISSModel(scene);
    try {
      await issModel.load();
    } catch (err) {
      console.warn('[App] GLB model load failed, using procedural fallback:', err.message);
      issModel = createProceduralISS(scene);
    }
    cameraManager.setISSModel(issModel);

    console.log('[App] Fetching initial ISS position...');
    await tick();
    console.log('[App] Starting animation loop...');
    animate(0);
  } catch (err) {
    console.error('[App] Fatal error:', err);
    document.body.innerHTML = `<div style="color:#f00;font-family:monospace;padding:20px;">Error: ${err.message}</div>`;
  }
})();

// Visualization toggles
const chkDayOnly = document.getElementById('chk-dayonly');
chkDayOnly.addEventListener('change', (e) => {
  earth.setDayOnly(e.target.checked);
});
earth.setDayOnly(chkDayOnly.checked); // apply default (on)
const chkClouds = document.getElementById('chk-clouds');
chkClouds.addEventListener('change', (e) => {
  earth.setCloudsVisible(e.target.checked);
});
earth.setCloudsVisible(chkClouds.checked); // apply default (off)

// Keyboard shortcuts for camera modes
document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  const modeMap = {
    n: MODES.NADIR,
    f: MODES.FORWARD,
    o: MODES.ORBIT,
    c: MODES.FREE,
    e: MODES.EXTERIOR,
  };
  if (modeMap[key]) {
    cameraManager.setMode(modeMap[key]);
    updateCameraButtons();
  }
});

// Camera switcher buttons
function updateCameraButtons() {
  document.querySelectorAll('[data-cam]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.cam === cameraManager.mode);
  });
}

document.querySelectorAll('[data-cam]').forEach((btn) => {
  btn.addEventListener('click', () => {
    cameraManager.setMode(btn.dataset.cam);
    updateCameraButtons();
  });
});
