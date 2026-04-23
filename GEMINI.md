# Project Overview: ISS Viewer

A high-fidelity, client-side 3D visualization of the International Space Station (ISS) and Earth. It tracks the ISS in real-time using TLE (Two-Line Element) data and satellite.js, providing multiple camera perspectives and realistic Earth rendering.

## Core Technologies
- **Graphics:** Three.js (v0.167.0)
- **Satellite Propagation:** satellite.js (v4.1.3)
- **Assets:** NASA 8k Earth textures and a 3D ISS model (GLB)
- **Environment:** Vanilla JavaScript (ES Modules) with no build step or backend dependencies.

## Key Architectures
### Coordinate Systems
- **ECI (Earth-Centered Inertial):** Primary frame for satellite propagation.
- **Three.js World Space:** Mapped from ECI where **1 unit = 1 km**.
  - `X_three = X_eci`
  - `Y_three = Z_eci` (ECI North is Three.js Up)
  - `Z_three = -Y_eci`
- **LVLH (Local Vertical Local Horizontal):** Frame used for ISS and camera orientations.
  - `+X (Ram)`: Velocity direction.
  - `+Y (Port)`: Normal to the orbital plane.
  - `-Z (Nadir)`: Toward Earth center.

### Module Structure
- `index.html`: Entry point, HUD overlay, and CDN-based `importmap`.
- `src/app.js`: Main orchestration, animation loop, and sun direction logic.
- `src/iss.js`: TLE fetching and ECI/LVLH math.
- `src/earth.js`: Earth sphere with custom shaders for day/night blending, clouds, and atmosphere.
- `src/cameras.js`: Manages five camera modes (Nadir, Forward, Orbit, Free, Exterior).
- `src/iss-model.js`: Loads the GLB model with a procedural fallback.
- `src/scene.js`: Standard Three.js scene/renderer initialization.

## Building and Running
The project is a static site and requires a local HTTP server to handle ES modules and asset loading.

- **Start Server:**
  ```bash
  python3 -m http.server 8080
  ```
- **Access:** `http://localhost:8080`

## Development Conventions
- **Zero Dependencies:** All libraries must be loaded via the `importmap` in `index.html` from CDNs (e.g., JSDelivr).
- **Phased Progress:** Adhere to the phased development roadmap outlined in `README.md`.
- **Coordinate Precision:** Always maintain the 1 unit = 1 km scale to ensure accuracy across modules.
- **Testing:** 
  - Use browser DevTools to verify HUD values (Latitude: ±51.6°, Altitude: 400-430 km).
  - Verify camera orientations visually by comparing against expected Earth/Horizon views.
  - Check the console for `[App]` or `[ISS]` prefixed log messages.

## Known Constraints
- **Model Orientation:** The ISS GLB model requires a `-π/2` rotation on the X-axis to align with the LVLH frame.
- **Camera Interpolation:** Position and orientation transitions are currently frame-rate dependent; future updates should normalize using `deltaSeconds`.
- **Texture Fallbacks:** Basic canvas-generated textures are used if 8k NASA textures fail to load.
