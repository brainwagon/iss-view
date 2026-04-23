import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export class ISSModel {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.loaded = false;
    this.visible = false;
  }

  async load(url = './assets/iss.glb') {
    return new Promise((resolve, reject) => {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/libs/draco/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      console.log(`[ISS-Model] Loading from ${url}...`);

      loader.load(
        url,
        (gltf) => {
          console.log('[ISS-Model] GLB loaded successfully');

          // Scale: NASA model is in meters, convert to km (0.001 scale)
          gltf.scene.scale.setScalar(0.001);

          // Apply corrective rotation if needed
          // The NASA model may have different axis conventions
          // Adjust these rotations after visual inspection
          gltf.scene.rotation.x = -Math.PI / 2;

          // Add to our group
          this.group.add(gltf.scene);
          this.loaded = true;

          // Apply lighting properties to all meshes
          gltf.scene.traverse((obj) => {
            if (obj.isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = false;
              // Improve rendering of metallic ISS surfaces
              if (obj.material && obj.material.isMaterial) {
                obj.material.envMapIntensity = 1.5;
              }
            }
          });

          console.log('[ISS-Model] Model ready for display');
          resolve(this);
        },
        undefined,
        (err) => {
          console.error('[ISS-Model] Failed to load GLB:', err.message);
          reject(err);
        }
      );
    });
  }

  // Update position and orientation
  update(issData) {
    if (!issData || !this.loaded) return;

    const pos = issData.position;
    this.group.position.set(pos.x, pos.y, pos.z);

    // Apply LVLH orientation quaternion
    if (issData.lvlh) {
      this.group.quaternion.copy(issData.lvlh);
    }
  }

  // Control visibility
  setVisible(visible) {
    this.group.visible = visible;
    this.visible = visible;
  }

  getVisible() {
    return this.visible;
  }
}

// Procedural ISS model as fallback
export function createProceduralISS(scene) {
  console.log('[ISS-Model] Creating procedural ISS model');

  const group = new THREE.Group();

  // Materials
  const silverMat = new THREE.MeshPhongMaterial({
    color: 0xcccccc,
    shininess: 100,
    emissive: 0x222222,
  });

  const solarPanelMat = new THREE.MeshPhongMaterial({
    color: 0x1a4da6,
    shininess: 50,
    side: THREE.DoubleSide,
  });

  // Main truss (elongated box, 100 km long × 8 km × 8 km)
  const trussGeo = new THREE.BoxGeometry(100, 8, 8);
  const trussMesh = new THREE.Mesh(trussGeo, silverMat);
  group.add(trussMesh);

  // Modules and segments (small boxes along truss)
  for (let i = -4; i <= 4; i++) {
    const modGeo = new THREE.BoxGeometry(5, 5, 5);
    const modMesh = new THREE.Mesh(modGeo, silverMat);
    modMesh.position.x = i * 10;
    group.add(modMesh);
  }

  // Solar panel arrays (pairs at ±X and ±Y positions)
  // Each panel is a large flat surface
  const panelGeo = new THREE.PlaneGeometry(40, 20);

  // Port and starboard solar arrays (±Z)
  for (const sign of [-1, 1]) {
    const pMesh = new THREE.Mesh(panelGeo, solarPanelMat);
    pMesh.position.set(25, 0, sign * 35);
    pMesh.rotation.y = Math.PI / 2;
    group.add(pMesh);

    const sMesh = new THREE.Mesh(panelGeo, solarPanelMat);
    sMesh.position.set(-25, 0, sign * 35);
    sMesh.rotation.y = Math.PI / 2;
    group.add(sMesh);
  }

  // Radiators (thin flat panels)
  const radiatorGeo = new THREE.PlaneGeometry(20, 8);
  const radiatorMat = new THREE.MeshPhongMaterial({
    color: 0x333333,
    side: THREE.DoubleSide,
  });

  for (let i = -1; i <= 1; i++) {
    const rMesh = new THREE.Mesh(radiatorGeo, radiatorMat);
    rMesh.position.set(i * 20, 20, 0);
    rMesh.rotation.x = Math.PI / 4;
    group.add(rMesh);
  }

  scene.add(group);

  return {
    group,
    loaded: true,
    visible: false,

    update(issData) {
      if (!issData) return;
      const { x, y, z } = issData.position;
      group.position.set(x, y, z);
      if (issData.lvlh) {
        group.quaternion.copy(issData.lvlh);
      }
    },

    setVisible(v) {
      group.visible = v;
      this.visible = v;
    },

    getVisible() {
      return this.visible;
    },
  };
}
