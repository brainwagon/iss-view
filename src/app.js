import * as THREE from 'three';
import { gstime } from 'satellite';
import { createScene } from './scene.js';
import { createEarth } from './earth.js';
import { ISSTracker } from './iss.js';
import { CameraManager, MODES } from './cameras.js';
import { ISSModel, createProceduralISS } from './iss-model.js';
import { MapOverlay } from './map.js';
import { SunObject } from './sun.js';
import { MoonObject } from './moon.js';

const { scene, camera, renderer } = createScene();
const earth = await createEarth(scene);
const { earthMesh, cloudMesh, atmosMesh } = earth;
const iss = new ISSTracker();
const cameraManager = new CameraManager(camera, renderer);
const clock = new THREE.Clock();
const mapOverlay = new MapOverlay();

// ISS 3D model (with procedural fallback)
let issModel = null;
let sunObject = null;
let moonObject = null;

// HUD elements
const hudLat = document.getElementById('hud-lat');
const hudLon = document.getElementById('hud-lon');
const hudAlt = document.getElementById('hud-alt');
const hudVel = document.getElementById('hud-vel');
const hudSrc = document.getElementById('hud-src');
const hudMode = document.getElementById('hud-mode');
const hudFps = document.getElementById('hud-fps');

let lastTick = 0;
const TICK_MS = 1000; // ISS position update interval
let currentData = null;

let fpsFrames = 0;
let fpsLastUpdate = 0;

// Moon position calculation (simplified Meeus, accurate to ~1°)
// Returns THREE.Vector3 in Three.js world space with magnitude = distance in km
function getMoonPositionThree(date) {
  const JD = date.getTime() / 86400000.0 + 2440587.5;
  const d = JD - 2451545.0;
  const D2R = Math.PI / 180;
  const Lp = (218.316 + 13.176396 * d) % 360;
  const M  = ((134.963 + 13.064993 * d) % 360) * D2R;
  const F  = (( 93.272 + 13.229350 * d) % 360) * D2R;
  const lambda = ((Lp + 6.289 * Math.sin(M)) % 360) * D2R;
  const beta   = (5.128 * Math.sin(F)) * D2R;
  const delta  = 385001 - 20905 * Math.cos(M); // km
  const eps = 23.439 * D2R;
  const eciX =  Math.cos(beta) * Math.cos(lambda);
  const eciY =  Math.cos(eps) * Math.cos(beta) * Math.sin(lambda) - Math.sin(eps) * Math.sin(beta);
  const eciZ =  Math.sin(eps) * Math.cos(beta) * Math.sin(lambda) + Math.cos(eps) * Math.sin(beta);
  // ECI → Three.js: threeX=eciX, threeY=eciZ, threeZ=-eciY
  return new THREE.Vector3(eciX, eciZ, -eciY).multiplyScalar(delta);
}

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
  const gmst = gstime(now);

  // Rotate Earth texture to match real sidereal orientation
  earth.setGMST(gmst);

  // Update sun direction for day/night lighting
  const sunDir = getSunDirectionECI(now);
  earth.setSunDirection(sunDir);
  if (moonObject) moonObject.update(getMoonPositionThree(now));

  // Update 2D map overlay
  const track = iss.getGroundTrack(now);
  mapOverlay.update(data.geodetic.lat, data.geodetic.lon, sunDir, gmst, track);
}

function animate(timestamp) {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const now = new Date();

  // FPS counter: count frames, update HUD ~2x/sec
  fpsFrames++;
  if (timestamp - fpsLastUpdate > 500) {
    const fps = (fpsFrames * 1000) / (timestamp - fpsLastUpdate);
    hudFps.textContent = fps.toFixed(1);
    fpsFrames = 0;
    fpsLastUpdate = timestamp;
  }

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

  // Update ISS model position and orientation
  if (issModel) {
    issModel.update(currentData);
  }

  // Update camera based on current mode and ISS data
  cameraManager.update(currentData, delta);

  // Rotate Earth and Cloud layers to match real sidereal orientation
  const gmst = gstime(now);
  earth.setGMST(gmst);
  earth.updateClouds(gmst);

  // Update sun direction for day/night lighting
  const sunDir = getSunDirectionECI(now);
  earth.setSunDirection(sunDir);
  if (sunObject) sunObject.update(sunDir);

  // Render logic
  const mode = cameraManager.mode;
  const showModel = (mode === MODES.ORBIT || mode === MODES.FREE || mode === MODES.EXTERIOR);

  if (showModel) {
    // Two-phase render to handle precision/clipping when following ISS
    // Pass 1 — Earth (ISS hidden). Scale near to camera altitude so the
    // near/far ratio stays reasonable when zoomed far out in FREE mode.
    const distFromCenter = camera.position.length();
    const altAboveSurface = Math.max(1, distFromCenter - 6371);
    renderer.autoClear = false;
    camera.near = Math.max(1, altAboveSurface * 0.1);
    camera.far = 1_000_000;
    camera.updateProjectionMatrix();
    if (issModel) issModel.setVisible(false);
    renderer.clear();
    renderer.render(scene, camera);

    // Pass 2 — ISS (tight frustum hugging the camera-to-ISS distance).
    // Near scales with distToIss so the near/far ratio stays ~1000:1 even when
    // distToIss is large (FREE mode with camera far from ISS); a fixed near of
    // 0.001 km produced catastrophic depth precision and z-fighting between the
    // ISS model, Earth, and the cloud layer.
    const distToIss = currentData ? camera.position.distanceTo(
      new THREE.Vector3(currentData.position.x, currentData.position.y, currentData.position.z)
    ) : 2;

    camera.near = Math.max(0.001, distToIss - 1);
    camera.far = Math.max(1, distToIss + 5);
    camera.updateProjectionMatrix();
    renderer.clearDepth();
    // Hide Earth/clouds/atmosphere in Pass 2 — Pass 1 already rendered them,
    // and including them here pulls them into the tight frustum where they
    // z-fight with the ISS model.
    const cloudsWereVisible = cloudMesh.visible;
    earthMesh.visible = false;
    cloudMesh.visible = false;
    atmosMesh.visible = false;
    if (issModel) issModel.setVisible(true);
    renderer.render(scene, camera);
    earthMesh.visible = true;
    cloudMesh.visible = cloudsWereVisible;
    atmosMesh.visible = true;

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

    sunObject = new SunObject(scene, camera);
    moonObject = new MoonObject(scene, camera);
    const initNow = new Date();
    sunObject.update(getSunDirectionECI(initNow));
    moonObject.update(getMoonPositionThree(initNow));

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
const chkMap = document.getElementById('chk-map');
chkMap.addEventListener('change', (e) => {
  mapOverlay.setVisible(e.target.checked);
});
mapOverlay.setVisible(chkMap.checked); // apply default (on)

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
  if (key === 'm') {
    const chk = document.getElementById('chk-map');
    chk.checked = !chk.checked;
    mapOverlay.setVisible(chk.checked);
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
