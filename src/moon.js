import * as THREE from 'three';

// Moon lives on its own layer for visibility, and shades itself in a custom
// shader using a uniform sun direction — no scene light is used, so nothing
// the moon does can ever illuminate the ISS or Earth.
export const MOON_LAYER = 1;

const moonVert = `
  varying vec3 vWorldNormal;

  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const moonFrag = `
  uniform vec3 sunDirection;
  uniform vec3 baseColor;
  uniform float ambient;

  varying vec3 vWorldNormal;

  void main() {
    float cosAngle = max(0.0, dot(normalize(vWorldNormal), normalize(sunDirection)));
    vec3 color = baseColor * (ambient + (1.0 - ambient) * cosAngle);
    gl_FragColor = vec4(color, 1.0);
  }
`;

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

    this._mat = new THREE.ShaderMaterial({
      uniforms: {
        sunDirection: { value: new THREE.Vector3(1, 0, 0) },
        baseColor: { value: new THREE.Color(0x999999) },
        ambient: { value: 0.02 },
      },
      vertexShader: moonVert,
      fragmentShader: moonFrag,
    });

    this._mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1737, 32, 16),
      this._mat
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

    this._mesh.layers.set(MOON_LAYER);
    this._glow.layers.set(MOON_LAYER);

    scene.add(this._mesh);
    scene.add(this._glow);
  }

  update(moonPos) {
    this._mesh.position.copy(moonPos);
    this._glow.position.copy(moonPos);
    if (this._camera) this._glow.lookAt(this._camera.position);
  }

  // Call each frame with the world-space sun direction unit vector.
  updateSun(sunDirWorld) {
    this._mat.uniforms.sunDirection.value.copy(sunDirWorld);
  }
}
