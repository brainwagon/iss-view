import * as THREE from 'three';

export const EARTH_RADIUS_KM = 6371;

const TEXTURES = {
  day: 'assets/8k_earth_daymap.jpg',
  night: 'assets/8k_earth_nightmap.jpg',
  clouds: 'assets/8k_earth_clouds.jpg',
  specular: 'assets/8k_earth_specular_map.jpg',
  normal: 'assets/8k_earth_normal_map.jpg',
};

// Day/night blend shader
const dayNightVert = `
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    // modelMatrix transforms object → world space; sunDirection is also world space
    vNormal = normalize(mat3(modelMatrix) * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const dayNightFrag = `
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform vec3 sunDirection;
  uniform float dayOnly;

  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    float cosAngle = dot(normalize(vNormal), normalize(sunDirection));
    // smoothstep: terminator zone from -0.15 to +0.15
    float blend = mix(smoothstep(-0.15, 0.15, cosAngle), 1.0, dayOnly);

    vec4 day = texture2D(dayTex, vUv);
    vec4 night = texture2D(nightTex, vUv);

    gl_FragColor = mix(night, day, blend);
  }
`;

// Atmosphere glow shader
const atmosVert = `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const atmosFrag = `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    float rim = 1.0 - abs(dot(vNormal, vViewDir));
    float glow = pow(rim, 3.0) * 0.8;
    gl_FragColor = vec4(0.2, 0.5, 1.0, glow);
  }
`;

export async function createEarth(scene) {
  const loader = new THREE.TextureLoader();
  const load = (url) =>
    new Promise((resolve) => {
      loader.load(url, resolve, undefined, (err) => {
        console.warn(`[Earth] Texture load error for ${url}:`, err.message);
        // Create a placeholder texture on error
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2266aa';
        ctx.fillRect(0, 0, 64, 64);
        resolve(new THREE.CanvasTexture(canvas));
      });
    });

  console.log('[Earth] Loading textures...');
  const [dayTex, nightTex, cloudTex, specTex] = await Promise.all([
    load(TEXTURES.day),
    load(TEXTURES.night),
    load(TEXTURES.clouds),
    load(TEXTURES.specular),
  ]);

  dayTex.colorSpace = THREE.SRGBColorSpace;
  nightTex.colorSpace = THREE.SRGBColorSpace;

  // ---- Earth sphere with day/night shader ----
  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      dayTex: { value: dayTex },
      nightTex: { value: nightTex },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      dayOnly: { value: 0.0 },
    },
    vertexShader: dayNightVert,
    fragmentShader: dayNightFrag,
  });

  const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS_KM, 128, 64);
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earthMesh);
  console.log('[Earth] Earth sphere created');

  // ---- Cloud layer ----
  const cloudMat = new THREE.MeshPhongMaterial({
    map: cloudTex,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    emissive: 0x333333,
  });
  const cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_KM + 8, 128, 64),
    cloudMat
  );
  scene.add(cloudMesh);
  console.log('[Earth] Cloud layer created');

  // ---- Atmosphere glow ----
  const atmosMat = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: atmosVert,
    fragmentShader: atmosFrag,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const atmosMesh = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_KM + 80, 64, 32),
    atmosMat
  );
  scene.add(atmosMesh);
  console.log('[Earth] Atmosphere glow created');

  // ---- Stars: 8000-point cloud on large sphere ----
  const starCount = 8000;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 900_000;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(starPositions, 3)
  );
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 400,
      sizeAttenuation: true,
    })
  );
  scene.add(stars);
  console.log('[Earth] Star field created');

  // ---- Sun light ----
  const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.0);
  sunLight.castShadow = false;
  scene.add(sunLight);

  const ambient = new THREE.AmbientLight(0x111111, 0.5);
  scene.add(ambient);

  return {
    earthMesh,
    cloudMesh,
    atmosMesh,
    stars,
    sunLight,
    setSunDirection(dir) {
      earthMat.uniforms.sunDirection.value.copy(dir);
      sunLight.position.copy(dir.clone().multiplyScalar(150_000_000));
    },
    setDayOnly(enabled) {
      earthMat.uniforms.dayOnly.value = enabled ? 1.0 : 0.0;
    },
    setCloudsVisible(visible) {
      cloudMesh.visible = visible;
    },
    // Rotate Earth and Cloud layers to match real sidereal time (GMST in radians)
    // 1. Rotation direction: +gmst is Eastward (X -> -Z in Three.js maps to X -> Y in ECI)
    // 2. Offset: Texture Lon 0 is at U=0, which SphereGeometry puts at local -X.
    //    To put local -X at world angle 0 (at GMST=0), we need rotation.y = PI.
    setGMST(gmst) {
      const rotation = gmst + Math.PI;
      earthMesh.rotation.y = rotation;
    },
    // Independent cloud rotation update
    updateClouds(gmst, drift) {
      cloudMesh.rotation.y = gmst + Math.PI + drift;
    },
  };
}
