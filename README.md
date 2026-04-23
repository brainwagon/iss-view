# ISS Viewer

A client-side HTML/JavaScript application that tracks the International Space Station in real-time and displays an animated 3D visualization of Earth as viewed from the ISS. Built with Three.js and satellite.js, no backend required.

## Phased Development Plan

### ✅ Phase 1 (Complete) — MVP

**Status**: Live ISS tracking with basic Earth visualization

**Features**:
- Real-time ISS position tracking via Celestrak TLE + satellite.js
- Automatic fallback to wheretheiss.at API if TLE unavailable
- Camera positioned at ISS looking nadir (straight down at Earth)
- Basic blue sphere Earth representation
- Live HUD overlay showing:
  - Latitude, Longitude, Altitude
  - Velocity (km/s)
  - Data source (TLE or wheretheiss.at)
  - Position updates every 1 second
  - TLE auto-refreshes hourly for accuracy

**Technical Details**:
- ECI → Three.js coordinate mapping (1 unit = 1 km)
- LVLH (Local Vertical, Local Horizontal) quaternion computation for ISS orientation
- ES modules via importmap (Three.js, satellite.js from CDN)
- CORS-safe external APIs (Celestrak, wheretheiss.at)

**Testing Phase 1**:
1. Open `http://localhost:8080` in a browser
2. Check HUD for plausible values:
   - Latitude: ±51.6° (ISS orbital inclination)
   - Altitude: 400-430 km
   - Velocity: ~27,540 km/s
3. Verify position updates every second
4. Verify data source shows "TLE" or "wheretheiss.at"
5. Check browser console (F12 → Console) for initialization messages

**Browser DevTools Console Expected Output**:
```
[ISS] TLE loaded successfully
[App] Initializing ISS tracker...
[App] Fetching initial ISS position...
[App] Starting animation loop...
```

---

### 🚧 Phase 2 (Next) — Visual Polish

**Planned Features**:
- Photorealistic Earth with NASA textures
  - High-res day/night hemisphere with shader-based blend
  - City lights on dark side (nighttime texture)
  - Cloud layer (semi-transparent, animated rotation)
  - Specular map for oceans
- Atmospheric glow effect (blue rim)
- 8000-point star field background
- Correct solar lighting (sun position computed from current date/time)
- Smooth day/night terminator blending

**Files to Create/Modify**:
- `src/earth.js` — complete rewrite with shaders and textures
- `src/app.js` — add sun direction calculation
- No new dependencies (all textures from Three.js CDN)

---

### 🔮 Phase 3 — Multiple Camera Modes

**Planned Features**:
- Four camera modes (keyboard shortcuts: N/F/O/C):
  - **N (Nadir)**: ISS looking straight down (default, Phase 1)
  - **F (Forward)**: ISS looking in velocity direction
  - **O (Orbit)**: External observer view 300 km behind, 100 km above ISS
  - **C (Free)**: OrbitControls-based free camera centered on Earth
- Smooth camera interpolation (lerp position, slerp orientation)
- UI buttons for mode switching (bottom-left corner)

**Files to Create**:
- `src/cameras.js` — CameraManager class with all four modes
- Update `index.html` — add camera switcher buttons

---

### 🎯 Phase 4 — 3D ISS Model

**Planned Features**:
- 3D ISS model from NASA (GLB format)
  - Properly oriented using LVLH quaternion
  - Visible in Orbit/Free camera modes
  - Hidden in Nadir/Forward modes (you'd be inside it)
- Falls back to procedural ISS (simple box + solar panels) if GLB unavailable
- Realistic solar panel orientation matching scene sun direction

**Files to Create**:
- `assets/iss.glb` — manually download from NASA and place here
- `src/iss-model.js` — GLTFLoader wrapper + procedural fallback

**Model Source**:
Download from: `https://science.nasa.gov/3d-resources/international-space-station-iss-b/`

---

## Architecture

### Coordinate System (Fixed Across All Phases)

**ECI (Earth-Centered Inertial)**
- satellite.js native output
- X: toward vernal equinox
- Z: toward north celestial pole
- Y: completes right-hand system
- Units: km

**Three.js World Space** (mapped from ECI)
```
threeX =  eci.x
threeY =  eci.z    (ECI Z north → Three.js Y up)
threeZ = -eci.y
```
- Earth center at origin
- 1 unit = 1 km

**LVLH (Local Vertical Local Horizontal) Frame**
- Derived from ISS position + velocity vectors
- Expressed as a `THREE.Quaternion`
- **+X**: ram (velocity direction)
- **+Y**: port (perpendicular to both nadir and ram)
- **-Z**: nadir (toward Earth center)

---

## External Dependencies (All from CDN via importmap)

| Library | URL | Purpose |
|---------|-----|---------|
| Three.js | `npm/three@0.167.0` | 3D graphics |
| OrbitControls | Three.js examples | Phase 3 free camera |
| GLTFLoader | Three.js examples | Phase 4 model loading |
| satellite.js | `npm/satellite.js@4.1.3` | TLE propagation & position calculation |

**Data Sources**:
- **Celestrak TLE**: `https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE` (primary)
- **wheretheiss.at API**: `https://api.wheretheiss.at/v1/satellites/25544` (fallback)
- **Earth Textures**: `https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/`

---

## Running Locally

**Requirements**:
- Python 3 (for HTTP server)
- Modern web browser (Chrome, Firefox, Safari, Edge with ES module support)

**Start Server**:
```bash
cd /home/markv/iss-view
python3 -m http.server 8080
```

**Access**:
Open `http://localhost:8080` in your browser.

**Stop Server**:
```bash
kill $(cat /tmp/server.pid)
```

---

## Project Structure

```
iss-view/
  ├── index.html              # Main HTML shell with importmap
  ├── README.md               # This file
  ├── src/
  │   ├── app.js              # Main orchestration loop
  │   ├── scene.js            # Three.js setup (renderer, camera)
  │   ├── earth.js            # Earth rendering (Phase 1: solid, Phase 2: textured)
  │   ├── iss.js              # ISS tracking (TLE, satellite.js, LVLH math)
  │   ├── cameras.js          # (Phase 3) Multi-mode camera manager
  │   └── iss-model.js        # (Phase 4) ISS 3D model loader
  ├── assets/
  │   └── iss.glb             # (Phase 4) NASA ISS model
  └── .claude/
      └── plans/
          └── create-a-simple-html-javascript-compressed-pebble.md  # Full implementation plan
```

---

## Known Limitations & Future Improvements

- **Phase 1**: ISS attitude unavailable when using fallback API (no velocity data)
- **Phase 2**: Terminator blending may need fine-tuning for visual accuracy
- **Phase 3**: OrbitControls not yet integrated
- **Phase 4**: ISS model may require axis rotation correction after download

---

## Troubleshooting

**"Failed to fetch TLE"**
- App automatically falls back to wheretheiss.at API
- Check console for detailed error messages

**"Canvas not rendering"**
- Verify browser supports WebGL (check console for GPU errors)
- Try a different browser
- Clear cache (Ctrl+Shift+Delete)

**"ISS position not updating"**
- Check browser console for JavaScript errors
- Verify network tab shows successful API calls (Network tab in DevTools)
- Confirm external APIs are reachable (test in new tab)

---

## Next Steps

See Phase 2+ planned features above. Implementation will follow the phased approach to gradually enhance visuals and camera control while maintaining a working application at each stage.
