import * as THREE from 'three';

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0,    'rgba(220, 225, 240, 0.55)');
  grad.addColorStop(0.3,  'rgba(200, 210, 230, 0.25)');
  grad.addColorStop(0.7,  'rgba(160, 175, 200, 0.08)');
  grad.addColorStop(1,    'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

export class MoonObject {
  constructor(scene, camera) {
    this._camera = camera;

    this._mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1737, 32, 16),
      new THREE.MeshStandardMaterial({
        color: 0x999999,
        roughness: 0.9,
        metalness: 0.0,
      })
    );

    this._glow = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        color: 0xc8d0e0,
      })
    );
    this._glow.renderOrder = 1;

    scene.add(this._mesh);
    scene.add(this._glow);
  }

  update(moonPos) {
    this._mesh.position.copy(moonPos);
    this._glow.position.copy(moonPos);
    if (this._camera) this._glow.lookAt(this._camera.position);
  }
}
