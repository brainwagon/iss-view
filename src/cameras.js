import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EARTH_RADIUS_KM } from './earth.js';

export const MODES = {
  NADIR: 'nadir',
  FORWARD: 'forward',
  ORBIT: 'orbit',
  FREE: 'free',
};

export class CameraManager {
  constructor(camera, renderer) {
    this.camera = camera;
    this.renderer = renderer;
    this.mode = MODES.NADIR;

    // OrbitControls for FREE mode
    this.controls = new OrbitControls(camera, renderer.domElement);
    this.controls.enabled = false;
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = EARTH_RADIUS_KM * 1.01;
    this.controls.maxDistance = 500_000;
    this.controls.dampingFactor = 0.05;
    this.controls.enableDamping = true;

    // Interpolation targets and speed
    this._targetPos = new THREE.Vector3();
    this._targetQuat = new THREE.Quaternion();
    this._lerpAlpha = 0.05; // position lerp speed
    this._slerpAlpha = 0.05; // quaternion slerp speed

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
    if (newMode === MODES.FREE) {
      this.controls.enabled = true;
    } else {
      this.controls.enabled = false;
    }

    // Update model visibility
    if (this._issModel) {
      const showModel = newMode === MODES.ORBIT || newMode === MODES.FREE;
      this._issModel.setVisible(showModel);
    }
  }

  setISSModel(issModel) {
    this._issModel = issModel;
  }

  // Called every frame
  update(issData, delta) {
    if (!issData) return;

    const issPos = new THREE.Vector3(
      issData.position.x,
      issData.position.y,
      issData.position.z
    );

    switch (this.mode) {
      case MODES.NADIR:
        this._updateModelVisibility(false);
        this._applyNadir(issPos, issData.lvlh);
        break;
      case MODES.FORWARD:
        this._updateModelVisibility(false);
        this._applyForward(issPos, issData.velocity, issData.lvlh);
        break;
      case MODES.ORBIT:
        this._updateModelVisibility(true);
        this._applyOrbit(issPos, issData.velocity);
        break;
      case MODES.FREE:
        this._updateModelVisibility(true);
        // OrbitControls handles its own updates
        this.controls.update();
        break;
    }
  }

  _updateModelVisibility(visible) {
    if (this._issModel && this._issModel.setVisible) {
      this._issModel.setVisible(visible);
    }
  }

  // ---- Camera Mode Implementations ----

  _applyNadir(issPos, lvlh) {
    // Zenith unit vector (away from Earth center)
    const zenith = issPos.clone().normalize();
    this._targetPos.copy(issPos).addScaledVector(zenith, this._nadirZoom);
    this.camera.position.lerp(this._targetPos, this._lerpAlpha);

    if (lvlh) {
      // LVLH frame: +Z = zenith (away), -Z = nadir (toward Earth)
      // Camera naturally looks down -Z, so LVLH orientation directly gives nadir view
      this.camera.quaternion.slerp(lvlh, this._slerpAlpha);
    } else {
      // Fallback: just look at Earth center
      this.camera.position.copy(issPos);
      this.camera.lookAt(0, 0, 0);
    }
  }

  _applyForward(issPos, velocity, lvlh) {
    // Camera at ISS position, looking in velocity direction (ram)
    this._targetPos.copy(issPos);
    this.camera.position.lerp(this._targetPos, this._lerpAlpha);

    if (velocity) {
      const forward = new THREE.Vector3(velocity.x, velocity.y, velocity.z).normalize();
      const zenith = issPos.clone().normalize();

      // Build orthonormal basis: camera looks along forward, zenith is up
      const right = forward.clone().cross(zenith).normalize();
      const up = right.clone().cross(forward).normalize();

      // Camera looks in its local -Z; set basis columns (right, up, -forward)
      const m = new THREE.Matrix4();
      m.makeBasis(right, up, forward.clone().negate());
      this._targetQuat.setFromRotationMatrix(m);

      this.camera.quaternion.slerp(this._targetQuat, this._slerpAlpha);
    }
  }

  _applyOrbit(issPos, velocity) {
    // Observer positioned 300 km behind ISS (anti-ram) and 100 km above (zenith)
    // looking back at ISS

    if (velocity) {
      const vel = new THREE.Vector3(
        velocity.x,
        velocity.y,
        velocity.z
      ).normalize();

      // Nadir direction (toward Earth)
      const nadir = issPos.clone().normalize();

      // Observer offset: behind ISS along -ram + above along zenith
      const observerOffset = vel
        .clone()
        .negate()
        .multiplyScalar(300)
        .add(nadir.clone().multiplyScalar(100));

      this._targetPos.copy(issPos).add(observerOffset);
    } else {
      // Fallback: just move back along Z
      this._targetPos.copy(issPos).add(new THREE.Vector3(0, 0, 300));
    }

    // Smooth camera movement
    this.camera.position.lerp(this._targetPos, 0.02);

    // Look at ISS
    this.camera.lookAt(issPos);
  }
}
