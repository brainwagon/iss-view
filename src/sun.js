import * as THREE from 'three';

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0,    'rgba(255, 252, 220, 1.0)');
  grad.addColorStop(0.25, 'rgba(255, 240, 180, 0.8)');
  grad.addColorStop(0.6,  'rgba(255, 200, 100, 0.3)');
  grad.addColorStop(1,    'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

export class SunObject {
  constructor(scene, camera) {
    this._camera = camera;
    this._sunPos = new THREE.Vector3();

    this._core = new THREE.Mesh(
      new THREE.SphereGeometry(2200, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0xfffbe8 })
    );

    this._glow = new THREE.Mesh(
      new THREE.PlaneGeometry(16000, 16000),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        color: 0xffeeaa,
      })
    );
    this._glow.renderOrder = 1;

    scene.add(this._core);
    scene.add(this._glow);
  }

  update(sunDir) {
    this._sunPos.copy(sunDir).multiplyScalar(500_000);
    this._core.position.copy(this._sunPos);
    this._glow.position.copy(this._sunPos);
    this._glow.lookAt(this._camera.position);
  }
}
