# Camera System Handoff

**Date**: April 23, 2026  
**File**: `src/cameras.js` — `CameraManager` class  
**Related**: `src/app.js` (render loop), `src/earth.js` (depth fixes)

---

## Five Camera Modes

| Key | Mode constant | Description |
|-----|--------------|-------------|
| N | `MODES.NADIR` | ISS-riding, looking straight down. Default. |
| F | `MODES.FORWARD` | ISS-riding, looking along the velocity vector with horizon dip. |
| O | `MODES.ORBIT` | External observer behind/above ISS, auto-distances to fit model. |
| C | `MODES.FREE` | Earth-centered OrbitControls (drag + scroll). |
| E | `MODES.EXTERIOR` | ISS-centric OrbitControls — walk around the station. |

Mode is set via `CameraManager.setMode(mode)`, keyboard shortcuts, or the HUD buttons. All modes share one `THREE.PerspectiveCamera` (60° FOV).

---

## Coordinate System

**ECI → Three.js world space** (defined once in `src/iss.js`, used everywhere):
```
threeX =  eciX
threeY =  eciZ   ← ECI north pole maps to Three.js Y-up
threeZ = -eciY
```
Scale: **1 Three.js unit = 1 km**. Earth center at origin.

**LVLH frame** (from `ISSTracker`, expressed as a `THREE.Quaternion`):
- `+X` ram — forward along velocity  
- `+Y` port — perpendicular to orbital plane  
- `+Z` zenith — radially outward from Earth  
- `-Z` nadir — toward Earth center  

---

## ISS Orbital Velocity Compensation

The ISS moves at ~7.6 km/s. Without compensation, lerp-based camera smoothing falls ~7 km behind the ISS each second. The fix (applied every frame in `update()` for all non-FREE modes):

```js
const movementDelta = issPos.clone().sub(this._lastIssPosGlobal);
this.camera.position.add(movementDelta);
```

This translates the camera's reference frame before applying the per-mode lerp, so the lerp only covers the *relative* residual. FREE mode skips this because OrbitControls is Earth-centered.

---

## Per-Mode Implementation Details

### NADIR (`_applyNadir`)
- Target position: `issPos + zenith * _nadirZoom`
- `_nadirZoom` is a km offset on the zenith axis, adjusted by mouse wheel
  - Range: −350 km (50 km below surface, clamped) to +15,000 km
  - Sensitivity scales with current zoom: `0.3 + |_nadirZoom| * 0.002`
- Orientation: LVLH quaternion applied directly (`camera.quaternion.slerp(lvlh, α)`)
  - The camera naturally looks down its −Z axis; LVLH −Z = nadir
  - Fallback (no LVLH): build quaternion from `(0,0,−1) → −zenith`

### FORWARD (`_applyForward`)
- Target position: `issPos` (camera sits at ISS)
- Builds an orthonormal frame from ram + zenith:
  1. `right = ram × zenith` 
  2. `horizontalForward = zenith × right` (velocity tangent)
  3. `dip = acos(EARTH_RADIUS / dist)` — geometric horizon depression
  4. `viewDir = horizontalForward * cos(dip) + zenith * (−sin(dip))`
  5. `up = right × viewDir`
- Camera matrix: basis `(right, up, −viewDir)` → quaternion

### ORBIT (`_applyOrbit`)
- Auto-computed observer distance so ISS fills **50% of horizontal FOV**:
  ```
  D = issSizeKm / (2 * 0.5 * tan(hFOV / 2))
  ```
  `issSizeKm` = longest dimension of the ISS model bounding box (in km).  
  Falls back to 0.1 km (100 m) if model bounding box is unavailable.
- Observer offset: 10 units anti-ram + 2.7 units zenith (normalized), scaled to D
  - Gives roughly 15° elevation above the orbital plane
- Looks at `issPos` using zenith as the up hint for the look-at matrix

### FREE (`controls` — OrbitControls)
- Target: Earth center `(0, 0, 0)`
- Min distance: `EARTH_RADIUS_KM * 1.01` (just above surface)
- Max distance: 500,000 km
- Damping factor: 0.05
- No ISS velocity compensation (camera is Earth-anchored)

### EXTERIOR (`_applyExterior` — OrbitControls)
- Target: ISS position (updated every frame as ISS moves)
- Min distance: 0.01 km (10 m) / Max distance: 0.5 km (500 m)
- Damping factor: 0.08
- On first entry: camera placed 50 m above ISS along zenith (`_extInitialized` flag)
- ISS orbital velocity compensation still applies — camera reference frame moves with ISS

---

## Dual-Phase Render (in `src/app.js`)

Modes ORBIT, FREE, and EXTERIOR use a two-pass render to prevent Z-clipping artifacts between ISS geometry (sub-meter scale) and Earth (6,371 km scale):

**Pass 1 — Earth pass** (ISS hidden):
```
camera.near = max(1, (distFromCenter − 6371) * 0.1)
camera.far  = 1,000,000
```
The near plane scales with camera altitude above Earth's surface. This keeps the near/far ratio under ~230:1 even at 50,000 km out (vs. a fixed 1,000,000:1), which is why depth precision holds without a log depth buffer.

**Pass 2 — ISS pass** (tight frustum):
```
camera.near = 0.001
camera.far  = max(1, distToISS + 5)
```
Depth buffer cleared between passes (`renderer.clearDepth()`).

NADIR and FORWARD use a single pass with `camera.near = 1, far = 1,000,000` since the ISS model is hidden and only the Earth needs to be rendered.

---

## Depth Precision — Fixes Applied This Session

Three layered fixes for z-fighting when zoomed out in FREE mode:

| Fix | File | What it does |
|-----|------|-------------|
| Stars: `depthWrite: false` + `renderOrder = −1` | `earth.js` | Stars never compete in the depth buffer; always render behind everything else |
| Atmosphere: `depthTest: false` | `earth.js` | Eliminates frame-to-frame depth test failures near the terminator where the atmosphere sphere (6,451 km) converges with the Earth sphere (6,371 km) |
| Dynamic near plane in Pass 1 | `app.js` | Scales near = `max(1, altitude * 0.1)` so near/far ratio stays reasonable at large zoom |

**What was tried and reverted**:
- `logarithmicDepthBuffer: true` on the renderer — caused 1 fps performance collapse because the custom `ShaderMaterial` shaders (Earth day/night, atmosphere) don't include `#include <logdepthbuf_*>` chunks, triggering a slow `EXT_frag_depth` fallback path.
- Adding `#include <logdepthbuf_pars_vertex/fragment>` to the custom shaders — broke Earth rendering entirely; Three.js 0.167 doesn't inject the required `logDepthBufFC` uniform into ShaderMaterial automatically.

The dynamic near plane + `depthTest: false` on the atmosphere achieves the same visual result without touching the shaders or renderer flags.

---

## Sun and Moon (Added This Session)

`src/sun.js` — `SunObject(scene, camera)`  
`src/moon.js` — `MoonObject(scene)`  

Both instantiated in `app.js` after initial `tick()`. Sun updated every frame (alongside Earth shader sun direction); moon updated once per second in `tick()`.

**Sun position**: existing `getSunDirectionECI()` in `app.js`, normalized ECI → Three.js vector. Placed at 500,000 km along that direction. Core sphere radius 2,200 km (`MeshBasicMaterial`, always fully lit). Glow plane 16,000 km wide, procedural canvas radial gradient, `AdditiveBlending`, `depthWrite: false`, billboarded toward camera each frame.

**Moon position**: `getMoonPositionThree()` in `app.js` — simplified Meeus algorithm (accurate to ~1°):
- `Lp = 218.316 + 13.176396 * d` (mean longitude)
- `M  = 134.963 + 13.064993 * d` (mean anomaly)
- `F  =  93.272 + 13.229350 * d` (argument of latitude)
- `lambda = Lp + 6.289 * sin(M)` (ecliptic longitude)
- `beta = 5.128 * sin(F)` (ecliptic latitude)
- `delta = 385001 − 20905 * cos(M)` km (distance)
- Rotate ecliptic → ECI using obliquity 23.439°, then ECI → Three.js

Moon sphere radius 1,737 km (actual lunar radius). `MeshStandardMaterial`, gray, no emissive — moon phase emerges naturally from the existing `DirectionalLight` positioned at `sunDir * 150,000,000`.

Both objects are frustum-culled automatically in Pass 2 (far = distToISS + 5 ≈ 400 km max).

---

## Known Issues / Next Work

1. **ISS model axis correction** — `rotation.x = −π/2` in `iss-model.js` is an estimate. Solar panels should face the sun, main truss perpendicular to velocity. Validate visually in ORBIT mode.

2. **EXTERIOR mode target drift** — `_extControls.target` is set to `issPos` every frame, but OrbitControls may resist this if damping is active. If the camera drifts off-center from the ISS in EXTERIOR mode, the fix is to call `_extControls.target.copy(issPos)` before `_extControls.update()` and also reset `_extControls.target0`.

3. **Nadir zoom resets on mode switch** — `_nadirZoom = 0` on any `setMode()` call away from NADIR. Intentional but may feel abrupt if the user switches modes while zoomed out.

4. **Moon glow** — no atmospheric glow around the moon. A faint white additive halo (similar to `SunObject` glow but dimmer) would improve realism.

5. **Moon texture** — currently a flat gray `MeshStandardMaterial`. A real lunar normal/albedo map would add surface detail.

6. **Moon phase accuracy** — phase is determined purely by the directional light hitting the moon sphere, which requires the light direction to exactly match the sun ECI direction. The `setSunDirection()` call sets `sunLight.position.copy(dir * 150,000,000)` — verify this stays consistent with the computed moon position.
