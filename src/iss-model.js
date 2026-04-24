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
    this.sizeKm = 0.109;
  }

  async load(url = './assets/iss-high.glb') {
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

          // 1. Auto-scale to realistic ISS dimensions first:
          // The real ISS is ~109m x 73m. We'll scale it so its largest 
          // dimension is 0.109 km (1 units = 1 km).
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          
          if (maxDim > 0) {
            const targetScale = 0.109 / maxDim;
            gltf.scene.scale.setScalar(targetScale);
            console.log(`[ISS-Model] Auto-scaled from ${maxDim.toFixed(2)} units to 0.109 km (scale: ${targetScale.toExponential(4)})`);
          }

          // 2. Center the model geometry AFTER scaling
          // We re-compute the box to get the scaled dimensions and center
          const scaledBox = new THREE.Box3().setFromObject(gltf.scene);
          const center = scaledBox.getCenter(new THREE.Vector3());
          gltf.scene.position.sub(center);

          // 3. Apply corrective rotation
          // This rotates around the newly centered origin
          gltf.scene.rotation.x = -Math.PI / 2;

          // Add to our group
          this.group.add(gltf.scene);
          this.loaded = true;

          // Cache local-space max dimension so ORBIT camera doesn't recompute
          // an AABB over the whole high-res model every frame.
          const localBox = new THREE.Box3().setFromObject(gltf.scene);
          const localSize = localBox.getSize(new THREE.Vector3());
          this.sizeKm = Math.max(localSize.x, localSize.y, localSize.z);

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

  // Main truss (elongated box, 0.1 km long × 0.005 km × 0.005 km)
  const trussGeo = new THREE.BoxGeometry(0.1, 0.005, 0.005);
  const trussMesh = new THREE.Mesh(trussGeo, silverMat);
  group.add(trussMesh);

  // Modules and segments (small boxes along truss)
  for (let i = -4; i <= 4; i++) {
    const modGeo = new THREE.BoxGeometry(0.006, 0.006, 0.006);
    const modMesh = new THREE.Mesh(modGeo, silverMat);
    modMesh.position.x = i * 0.01;
    group.add(modMesh);
  }

  // Solar panel arrays (pairs at ±X and ±Y positions)
  // Each panel is a large flat surface
  const panelGeo = new THREE.PlaneGeometry(0.04, 0.015);

  // Port and starboard solar arrays (±Z)
  for (const sign of [-1, 1]) {
    const pMesh = new THREE.Mesh(panelGeo, solarPanelMat);
    pMesh.position.set(0.025, 0, sign * 0.035);
    pMesh.rotation.y = Math.PI / 2;
    group.add(pMesh);

    const sMesh = new THREE.Mesh(panelGeo, solarPanelMat);
    sMesh.position.set(-0.025, 0, sign * 0.035);
    sMesh.rotation.y = Math.PI / 2;
    group.add(sMesh);
  }

  // Radiators (thin flat panels)
  const radiatorGeo = new THREE.PlaneGeometry(0.02, 0.008);
  const radiatorMat = new THREE.MeshPhongMaterial({
    color: 0x333333,
    side: THREE.DoubleSide,
  });

  for (let i = -1; i <= 1; i++) {
    const rMesh = new THREE.Mesh(radiatorGeo, radiatorMat);
    rMesh.position.set(i * 0.02, 0.015, 0);
    rMesh.rotation.x = Math.PI / 4;
    group.add(rMesh);
  }

  scene.add(group);

  const pBox = new THREE.Box3().setFromObject(group);
  const pSize = pBox.getSize(new THREE.Vector3());

  return {
    group,
    loaded: true,
    visible: false,
    sizeKm: Math.max(pSize.x, pSize.y, pSize.z),

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
