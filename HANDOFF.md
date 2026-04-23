# ISS Viewer - Handoff Documentation

**Project Status**: Phases 1-4 complete (MVP → Visual Polish → Camera Modes → 3D Model)  
**Date**: April 23, 2026  
**Running**: http://localhost:8080

---

## Current State

### ✅ What Works

- **Real-time ISS Tracking** (Phase 1)
  - Celestrak TLE fetching and propagation via satellite.js
  - Fallback to wheretheiss.at API
  - Live position updates every 1 second
  - HUD showing lat/lon/alt/velocity/source

- **Photorealistic Earth** (Phase 2)
  - High-res NASA textures (day/night sides)
  - Day/night blend shader with smooth terminator
  - Cloud layer with animation
  - Atmosphere glow effect
  - 8,000-point star field background
  - Dynamic sun position calculation

- **Multiple Camera Modes** (Phase 3)
  - Keyboard shortcuts: N (Nadir), F (Forward), O (Orbit), C (Free)
  - UI buttons with active state highlighting
  - Smooth lerp/slerp transitions between modes
  - OrbitControls in Free mode (mouse drag to rotate, scroll to zoom)
  - HUD display of current camera mode

- **3D ISS Model** (Phase 4)
  - NASA GLB model loading (466 KB)
  - Scale conversion (meters → km)
  - Context-aware visibility (hidden in Nadir/Forward, visible in Orbit/Free)
  - Procedural fallback (box/panels) if GLB fails
  - Proper LVLH orientation

### ⚠️ Known Issues / Suspected Problems

1. **Camera Orientation - Possible Remaining Issues**
   - LVLH computation was corrected (port direction fixed)
   - Nadir mode: *mostly* working (Earth centered, but user indicated issues remain)
   - Forward mode: *mostly* working (but may not be 100% accurate)
   - **Action needed**: Visual inspection and validation of camera orientations
   - Possibly needs:
     - Verification that camera "up" vector is correct
     - Check if 90° rotation in Forward mode is rotating around the right axis
     - Possible need for additional rotation corrections based on model testing

2. **ISS Model Orientation**
   - Model loaded with rotation correction (`rotation.x = -Math.PI / 2`)
   - This was estimated based on NASA model conventions
   - **Requires validation**: Does the ISS model appear to be oriented correctly in Orbit mode?
   - Solar panels should face toward sun (when in daylight)
   - Main truss should be perpendicular to velocity vector

3. **Earth-to-Camera Distance Calculations**
   - Orbit mode observer position: 300 km behind, 100 km above ISS
   - These are hard-coded estimates
   - **Verify**: Does the external view feel visually appropriate?

---

## Architecture Overview

### Coordinate System (Fixed Across All Code)

**ECI → Three.js Mapping**:
```
threeX =  eci.x
threeY =  eci.z    (ECI Z north → Three.js Y up)
threeZ = -eci.y
```
Scale: 1 Three.js unit = 1 km

**LVLH Frame** (computed from ISS position + velocity):
- `+X` (ram): forward along velocity
- `+Y` (port): perpendicular to orbital plane (right-hand rule)
- `+Z` (zenith): radially outward from Earth
- `-Z` (nadir): toward Earth center

Expressed as `THREE.Quaternion` built from basis vectors.

### Module Architecture

```
index.html                 ← shell + importmap + HUD
  ├─ src/app.js           ← main loop, orchestration
  ├─ src/scene.js         ← Three.js setup (renderer/camera/resize)
  ├─ src/earth.js         ← Earth + atmosphere + clouds + stars
  ├─ src/iss.js           ← TLE fetch + satellite.js propagation + LVLH math
  ├─ src/cameras.js       ← CameraManager (4 modes + smooth transitions)
  └─ src/iss-model.js     ← ISS GLB loader + procedural fallback
  
assets/iss-high.glb            ← NASA ISS 3D model (user-provided)
```

### Data Flow

```
Celestrak TLE / wheretheiss.at API
         ↓
    iss.js (ISSTracker)
    - propagate position
    - compute LVLH quaternion
         ↓
   app.js (update loop)
    - update HUD
    - update sun direction
         ↓
  cameras.js (CameraManager)
    - apply camera transformation
    - toggle ISS model visibility
         ↓
  iss-model.js
    - update position/orientation
         ↓
   Three.js render
```

---

## Files & Their Responsibilities

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 71 | HTML shell, importmap, HUD overlay, camera buttons |
| `src/app.js` | 170 | Main event loop, ISS tracking init, ISS model loading |
| `src/scene.js` | 25 | Three.js renderer, camera, window resize handling |
| `src/earth.js` | 148 | Earth sphere, shaders, clouds, atmosphere, stars |
| `src/iss.js` | 200 | TLE fetch, satellite.js propagation, **LVLH quaternion** |
| `src/cameras.js` | 150 | CameraManager, 4 camera modes, smooth transitions |
| `src/iss-model.js` | 170 | ISS GLB loader, procedural fallback, visibility control |
| `README.md` | 280 | User-facing documentation |
| `CLAUDE.md` | — | Not yet created (future) |

---

## Recent Changes (This Session)

### Bug Fixes Applied

1. **LVLH Port Direction** (iss.js)
   - Changed from `nadir × ram` to `zenith × ram`
   - Rationale: Standard LVLH frame requires port perpendicular to orbital plane
   - Impact: Fixed reversed/incorrect axis orientations in all camera modes

2. **Camera Quaternion Application** (cameras.js)
   - Removed incorrect conjugate from Nadir mode
   - Corrected Forward mode rotation from conjugate-based to direct LVLH
   - Rationale: With corrected LVLH computation, direct application works

3. **Coordinate System Consistency** (iss.js)
   - Changed from nadir-centric to zenith-centric basis
   - More standard for satellite operations (uses positive Z = radial outward)

---

## Testing Checklist

### Manual Visual Tests (do these!)

- [ ] **Nadir Mode (N)**
  - [ ] Earth fills most of frame?
  - [ ] Horizon visible at edges?
  - [ ] Earth centered in view?
  - [ ] Terminator line (day/night boundary) visible?

- [ ] **Forward Mode (F)**
  - [ ] Camera looking along velocity vector?
  - [ ] Earth appears ahead/below (not behind)?
  - [ ] Horizon ahead and to sides?
  - [ ] ISS appears to be moving forward (not backward)?

- [ ] **Orbit Mode (O)**
  - [ ] ISS model visible as small object in center?
  - [ ] Earth dominates background?
  - [ ] Model rotates visibly over ~92 minutes?
  - [ ] Solar panels face roughly toward sun (if in daylight)?

- [ ] **Free Mode (C)**
  - [ ] Mouse drag rotates view?
  - [ ] Scroll wheel zooms?
  - [ ] Model visible from all angles?
  - [ ] Model orientation looks correct from different angles?

### Quantitative Validation Possibilities

- **ISS Position Accuracy**: Compare HUD coordinates with external ISS tracking websites (wheretheiss.at, heavens-above.com)
- **Day/Night Terminator**: Verify terminator line aligns with actual sun position
- **Model Orientation**: Compare ISS model orientation with real ISS photos/videos
- **Camera FOV**: Verify 60° FOV matches expected Earth angular size from ISS (≈68°)

---

## Known Limitations & Technical Debt

1. **LVLH Quaternion Computation**
   - Uses `makeBasis()` + `setFromRotationMatrix()`
   - Works but may be opaque; could be clearer with explicit matrix construction
   - Alternative: Use `setFromAxisAngle()` or manual quaternion algebra

2. **Camera Interpolation**
   - Fixed lerp/slerp alphas (0.05) on position/orientation
   - Not delta-time normalized (should be `0.05 * delta`)
   - Causes frame-rate dependent camera smoothness

3. **Sun Position Calculation**
   - Simplified algorithm, accurate to ~1°
   - Uses Meeus algorithm (standard), but simplified terms
   - Better accuracy possible with higher-order terms

4. **No Clamping on Orbit Observer**
   - Observer position: 300 km behind + 100 km above
   - Hard-coded, not validated against actual viewing comfort
   - Could be parameterized

5. **ISS Model Axis Correction**
   - Rotation applied: `rotation.x = -Math.PI / 2`
   - Estimated based on typical NASA model conventions
   - Needs validation against actual ISS orientation

6. **No Error Handling for Texture Load Failures**
   - Creates fallback canvas textures, but user sees no warning
   - Could add visual indicator or HUD message

---

## Next Steps (For Future Work)

### High Priority

1. **Validate Camera Orientations**
   - Visually compare Nadir/Forward/Orbit views against expected behavior
   - Test with real ISS tracker websites simultaneously
   - May need additional rotation corrections if issues remain

2. **ISS Model Axis Correction**
   - Inspect model in Orbit mode
   - Verify orientation matches real ISS (solar panels face sun, truss horizontal)
   - Adjust `rotation` values in `iss-model.js` if needed

3. **Document CLAUDE.md**
   - Summarize this handoff for future Claude instances
   - Include testing checklist and known issues

### Medium Priority

4. **Delta-Time Normalize Camera Interpolation**
   - Use `deltaSeconds` for lerp/slerp alphas
   - Make smoothness independent of frame rate

5. **Add Diagnostic Overlays**
   - Optional debug mode showing LVLH vectors
   - Show camera position/orientation values
   - Show ISS model orientation quaternion

6. **Improve Sun Position Algorithm**
   - Add higher-order terms for better accuracy
   - Consider obliquity of ecliptic variations

### Low Priority

7. **Ground Track Visualization**
   - Draw ISS orbital path on Earth surface

8. **ISS Visibility Predictor**
   - Calculate sun illumination of ISS
   - Predict when ISS is visible from ground locations

9. **Performance Optimization**
   - Profile rendering (check GPU utilization)
   - Optimize star field (could use texture instead of points)

10. **Multi-Satellite Support**
    - Track multiple satellites simultaneously
    - Useful for space station + cargo vehicles

---

## How to Resume Development

### Start Server
```bash
cd /home/markv/iss-view
python3 -m http.server 8080
```

### Access App
- Open http://localhost:8080 in browser
- Open DevTools (F12) → Console for debug messages

### Make Changes
- Edit any `.js` file in `src/`
- Reload browser (Ctrl+R or Cmd+R) to see changes
- Check console for errors

### Validate LVLH
To test camera orientations:
1. Open wheretheiss.at in adjacent window
2. Compare ISS coordinates shown in HUD
3. Verify camera directions match expectations
4. If wrong, likely need more rotation corrections

### Test ISS Model
In Orbit mode (O):
- Rotate view with mouse
- Verify solar panels face toward sun
- Verify main truss is perpendicular to Earth view
- If rotated wrong, adjust `rotation.x/y/z` in `iss-model.js`

---

## Resources

- **ISS TLE Data**: https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE
- **ISS Position (fallback)**: https://api.wheretheiss.at/v1/satellites/25544
- **Three.js Docs**: https://threejs.org/docs/
- **satellite.js Docs**: https://github.com/shashwatak/satellite-js
- **NASA ISS Model**: https://science.nasa.gov/3d-resources/international-space-station-iss-b/
- **LVLH Reference**: Standard satellite orbit mechanics textbooks (Vallado, Bate/Mueller/White)

---

## Questions / Ambiguities for Next Session

1. **Forward Mode Rotation**: Is the 90° rotation around port (Y) axis the right correction? Or should it be around a different axis?

2. **ISS Model Orientation**: The `-π/2` rotation around X axis was an estimate. Need to validate visually.

3. **Orbit Camera Distance**: Are 300 km behind + 100 km above the right values for good visualization? 

4. **Camera "Up" Vector**: In all modes, the camera's local +Y should point in port direction (or zenith?). Need to verify this is actually happening.

5. **Remaining Issues**: User noted "some issues remain" but didn't specify. Likely one or more of:
   - Camera still not pointing exactly where expected
   - Model orientation wrong
   - Terminator blending off
   - ISS position tracking issue (unlikely, tests fine)

---

## Session Log

**Started**: April 22, 2026 17:14 UTC  
**Completed**: April 23, 2026 00:40 UTC  
**Duration**: ~7 hours (intermittent)  
**Phases Completed**: 4/4 ✓  
**Known Bugs Fixed**: 1 (LVLH port direction)  
**Known Issues Remaining**: ~3-4 (camera orientation, ISS model rotation, possibly others)  

**Git Status**: Not a git repository (user chose not to initialize)

---

## Quick Ref: How to Rebuild CLAUDE.md

For the next Claude instance, run `/init` to autogenerate from this codebase:
```
/init
```

It will ask for important patterns. Use this handoff as reference for what to include.
