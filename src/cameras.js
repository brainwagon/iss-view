import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EARTH_RADIUS_KM } from './earth.js';

export const MODES = {
  NADIR: 'nadir',
  FORWARD: 'forward',
  ORBIT: 'orbit',
  FREE: 'free',
  EXTERIOR: 'exterior',
};

export class CameraManager {
  constructor(camera, renderer) {
    this.camera = camera;
    this.renderer = renderer;
    this.mode = MODES.NADIR;

    // OrbitControls for FREE mode (Earth-centered)
    this.controls = new OrbitControls(camera, renderer.domElement);
    this.controls.enabled = false;
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = EARTH_RADIUS_KM * 1.01;
    this.controls.maxDistance = 500_000;
    this.controls.dampingFactor = 0.05;
    this.controls.enableDamping = true;

    // OrbitControls for EXTERIOR mode (ISS-centered, close range)
    this._extControls = new OrbitControls(camera, renderer.domElement);
    this._extControls.enabled = false;
    this._extControls.minDistance = 0.01;  // 10 m
    this._extControls.maxDistance = 0.5;   // 500 m
    this._extControls.dampingFactor = 0.08;
    this._extControls.enableDamping = true;

    this._lastIssPos = new THREE.Vector3();
    this._extInitialized = false;

    // Track global ISS position to anchor camera movement
    this._lastIssPosGlobal = null;

    // Interpolation targets and speed
    this._targetPos = new THREE.Vector3();
    this._targetQuat = new THREE.Quaternion();
    this._lerpAlpha = 3.0; // base lerp speed (alpha * delta)
    this._slerpAlpha = 3.0; // base slerp speed (alpha * delta)

    this._issModel = null;

    // Nadir zoom: km offset along zenith axis (positive = away from Earth)
    this._nadirZoom = 0;

    renderer.domElement.addEventListener('wheel', (e) => {
      if (this.mode !== MODES.NADIR) return;
      e.preventDefault();
      // Scale sensitivity with current zoom level for feel
      const sensitivity = 0.3 + Math.abs(this._nadirZoom) * 0.002;
      this._nadirZoom += e.deltaY * sensitivity;
      // Clamp: can't zoom past 50 km above surface or more than 15 000 km out
      this._nadirZoom = Math.max(-350, Math.min(15_000, this._nadirZoom));
    }, { passive: false });
  }

  setMode(newMode) {
    if (newMode === this.mode) return;

    console.log(`[Camera] Switching from ${this.mode} to ${newMode}`);
    this.mode = newMode;

    // Reset nadir zoom when leaving nadir mode
    if (this.mode !== MODES.NADIR) this._nadirZoom = 0;

    // Enable/disable controls based on mode
    this.controls.enabled = (newMode === MODES.FREE);
    this._extControls.enabled = (newMode === MODES.EXTERIOR);
    if (newMode === MODES.EXTERIOR) this._extInitialized = false;

    // Update model visibility
    if (this._issModel) {
      const showModel = newMode === MODES.ORBIT || newMode === MODES.FREE || newMode === MODES.EXTERIOR;
      this._issModel.setVisible(showModel);
    }
  }

  setISSModel(issModel) {
    this._issModel = issModel;
  }

  update(issData, delta) {
    if (!issData) return;

    const issPos = new THREE.Vector3(
      issData.position.x,
      issData.position.y,
      issData.position.z
    );

    if (!this._lastIssPosGlobal) {
      this._lastIssPosGlobal = issPos.clone();
    }

    // Apply ISS base movement to camera so interpolation doesn't lag behind orbital velocity.
    // The ISS moves at ~7.6 km/s, which completely swamps our position lerp if we don't
    // translate the camera reference frame first.
    if (this.mode !== MODES.FREE) {
      const movementDelta = issPos.clone().sub(this._lastIssPosGlobal);
      this.camera.position.add(movementDelta);
    }
    this._lastIssPosGlobal.copy(issPos);

    switch (this.mode) {
      case MODES.NADIR:
        this._updateModelVisibility(false);
        this._applyNadir(issPos, issData.lvlh, delta);
        break;
      case MODES.FORWARD:
        this._updateModelVisibility(false);
        this._applyForward(issPos, issData.velocity, delta);
        break;
      case MODES.ORBIT:
        this._updateModelVisibility(true);
        this._applyOrbit(issPos, issData.velocity, delta);
        break;
      case MODES.FREE:
        this._updateModelVisibility(true);
        this.controls.update();
        break;
      case MODES.EXTERIOR:
        this._updateModelVisibility(true);
        this._applyExterior(issPos);
        break;
    }
  }

  _updateModelVisibility(visible) {
    if (this._issModel && this._issModel.setVisible) {
      this._issModel.setVisible(visible);
    }
  }

  // ---- Camera Mode Implementations ----

  _applyNadir(issPos, lvlh, delta) {
    // Zenith unit vector (away from Earth center)
    const zenith = issPos.clone().normalize();
    this._targetPos.copy(issPos).addScaledVector(zenith, this._nadirZoom);
    
    const alpha = Math.min(1.0, this._lerpAlpha * delta);
    this.camera.position.lerp(this._targetPos, alpha);

    if (lvlh) {
      // Camera naturally looks down -Z; LVLH directly provides this orientation
      const sAlpha = Math.min(1.0, this._slerpAlpha * delta);
      this.camera.quaternion.slerp(lvlh, sAlpha);
    } else {
      // Fallback: look at Earth center
      this._targetQuat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), zenith.clone().negate());
      this.camera.quaternion.slerp(this._targetQuat, Math.min(1.0, this._slerpAlpha * delta));
    }
  }

  _applyForward(issPos, velocity, delta) {
    // Camera at ISS position
    this._targetPos.copy(issPos);
    const alpha = Math.min(1.0, this._lerpAlpha * delta);
    this.camera.position.lerp(this._targetPos, alpha);

    // RAM direction (velocity vector)
    const ram = velocity 
      ? new THREE.Vector3(velocity.x, velocity.y, velocity.z).normalize()
      : new THREE.Vector3(0, 0, 1);

    const zenith = issPos.clone().normalize();
    
    // Orthonormal frame: Right = Ram x Zenith
    const right = new THREE.Vector3().crossVectors(ram, zenith).normalize();
    // Local Horizontal Forward (tangent to orbital path)
    const horizontalForward = new THREE.Vector3().crossVectors(zenith, right).normalize();

    // Calculate dip angle to horizon: cos(theta) = R / (R + h)
    const dist = issPos.length();
    const dip = Math.acos(Math.min(1.0, EARTH_RADIUS_KM / dist));

    // The View Vector (the direction the camera looks)
    // Points 'dip' degrees below the local horizontal
    const viewDir = new THREE.Vector3()
      .addScaledVector(horizontalForward, Math.cos(dip))
      .addScaledVector(zenith, -Math.sin(dip))
      .normalize();

    // The 'Up' Vector for the camera
    const up = new THREE.Vector3().crossVectors(right, viewDir).normalize();

    // Three.js Camera looks down its local -Z axis.
    // Basis: X=right, Y=up, Z=-viewDir
    const m = new THREE.Matrix4();
    m.makeBasis(right, up, viewDir.clone().negate());
    this._targetQuat.setFromRotationMatrix(m);

    const sAlpha = Math.min(1.0, this._slerpAlpha * delta);
    this.camera.quaternion.slerp(this._targetQuat, sAlpha);
  }

  _applyOrbit(issPos, velocity, delta) {
    // Observer positioned behind ISS (anti-ram) and above (zenith) looking at ISS
    const forward = velocity 
      ? new THREE.Vector3(velocity.x, velocity.y, velocity.z).normalize()
      : new THREE.Vector3(0, 0, 1);

    const zenith = issPos.clone().normalize();

    const issSizeKm = (this._issModel && this._issModel.sizeKm) || 0.1;

    const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * this.camera.aspect);

    const horizontalFraction = 0.5;
    const dist = issSizeKm / (2 * horizontalFraction * Math.tan(hFovRad / 2));

    // Behind (anti-ram) and above (~15° elevation)
    const offsetDir = new THREE.Vector3()
      .addScaledVector(forward, -10)
      .addScaledVector(zenith, 2.7)
      .normalize();

    const observerOffset = offsetDir.multiplyScalar(dist);

    this._targetPos.copy(issPos).add(observerOffset);

    // Smooth camera movement
    const alpha = Math.min(1.0, this._lerpAlpha * delta);
    this.camera.position.lerp(this._targetPos, alpha);

    // Orientation: Look at ISS
    const lookDir = issPos.clone().sub(this.camera.position).normalize();
    const m = new THREE.Matrix4();
    // Use zenith as temporary "up" to build the look-at basis
    const right = new THREE.Vector3().crossVectors(lookDir, zenith).normalize();
    const up = new THREE.Vector3().crossVectors(right, lookDir).normalize();
    m.makeBasis(right, up, lookDir.clone().negate());
    this._targetQuat.setFromRotationMatrix(m);

    const sAlpha = Math.min(1.0, this._slerpAlpha * delta);
    this.camera.quaternion.slerp(this._targetQuat, sAlpha);
  }

  _applyExterior(issPos) {
    if (!this._extInitialized) {
      // Place camera 50 m (0.05 km) along zenith from ISS on first entry
      const zenith = issPos.clone().normalize();
      this.camera.position.copy(issPos).addScaledVector(zenith, 0.05);
      this._extControls.target.copy(issPos);
      this._extControls.update();
      this._extInitialized = true;
      return;
    }

    // Camera position has already been translated by orbital movement in update()
    this._extControls.target.copy(issPos);
    this._extControls.update();
  }
}
