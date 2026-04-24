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
  uniform float dayBrightness;
  uniform float dayGamma;
  uniform float nightBrightness;
  uniform float nightGamma;

  varying vec3 vNormal;
  varying vec2 vUv;

  vec3 tone(vec3 c, float brightness, float gamma) {
    return pow(max(c, 0.0), vec3(1.0 / gamma)) * brightness;
  }

  void main() {
    float cosAngle = dot(normalize(vNormal), normalize(sunDirection));
    // smoothstep: terminator zone from -0.15 to +0.15
    float blend = mix(smoothstep(-0.15, 0.15, cosAngle), 1.0, dayOnly);

    vec3 day = tone(texture2D(dayTex, vUv).rgb, dayBrightness, dayGamma);
    vec3 night = tone(texture2D(nightTex, vUv).rgb, nightBrightness, nightGamma);

    gl_FragColor = vec4(mix(night, day, blend), 1.0);
  }
`;

// Cloud layer shader: lit on the day side, nearly black on the night side.
// Uses normal alpha blending so dark clouds occlude city lights behind them.
const cloudVert = dayNightVert;
const cloudFrag = `
  uniform sampler2D cloudTex;
  uniform vec3 sunDirection;
  uniform float dayOnly;
  uniform float opacity;
  uniform float nightBrightness;

  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    float cosAngle = dot(normalize(vNormal), normalize(sunDirection));
    float lit = mix(smoothstep(-0.15, 0.15, cosAngle), 1.0, dayOnly);

    vec3 cloud = texture2D(cloudTex, vUv).rgb;
    float alpha = max(max(cloud.r, cloud.g), cloud.b) * opacity;

    vec3 color = cloud * mix(nightBrightness, 1.0, lit);
    gl_FragColor = vec4(color, alpha);
  }
`;

// Atmosphere glow shader. Only lit portions of the limb glow — the night
// limb fades to black so we don't paint a blue ring around the dark side.
const atmosVert = `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const atmosFrag = `
  uniform vec3 sunDirection;
  uniform float dayOnly;

  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  void main() {
    float rim = 1.0 - abs(dot(vNormal, vViewDir));
    float glow = pow(rim, 3.0) * 0.8;
    float cosAngle = dot(normalize(vWorldNormal), normalize(sunDirection));
    float lit = mix(smoothstep(-0.1, 0.25, cosAngle), 1.0, dayOnly);
    gl_FragColor = vec4(0.2, 0.5, 1.0, glow * lit);
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
  cloudTex.colorSpace = THREE.SRGBColorSpace;

  // ---- Earth sphere with day/night shader ----
  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      dayTex: { value: dayTex },
      nightTex: { value: nightTex },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      dayOnly: { value: 0.0 },
      dayBrightness: { value: 1.0 },
      dayGamma: { value: 1.0 },
      nightBrightness: { value: 2.2 },
      nightGamma: { value: 0.8 },
    },
    vertexShader: dayNightVert,
    fragmentShader: dayNightFrag,
  });

  const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS_KM, 128, 64);
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earthMesh);
  console.log('[Earth] Earth sphere created');

  // ---- Cloud layer ----
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      cloudTex: { value: cloudTex },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      dayOnly: { value: 0.0 },
      opacity: { value: 0.85 },
      nightBrightness: { value: 0.02 },
    },
    vertexShader: cloudVert,
    fragmentShader: cloudFrag,
    transparent: true,
    depthWrite: false,
  });
  const cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_KM + 8, 128, 64),
    cloudMat
  );
  scene.add(cloudMesh);
  console.log('[Earth] Cloud layer created');

  // ---- Atmosphere glow ----
  const atmosMat = new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      dayOnly: { value: 0.0 },
    },
    vertexShader: atmosVert,
    fragmentShader: atmosFrag,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
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
      depthWrite: false,
    })
  );
  stars.renderOrder = -1;
  scene.add(stars);
  console.log('[Earth] Star field created');

  // ---- Sun light ----
  const SUN_INTENSITY = 2.0;
  const sunLight = new THREE.DirectionalLight(0xfff4e0, SUN_INTENSITY);
  sunLight.castShadow = false;
  // Shadow camera frustum: tight ortho box sized slightly larger than the
  // ISS (~0.11 km). Only activated when ISS self-shadowing is enabled;
  // app.js repositions the light to follow the ISS each frame.
  sunLight.shadow.camera.left = -0.1;
  sunLight.shadow.camera.right = 0.1;
  sunLight.shadow.camera.top = 0.1;
  sunLight.shadow.camera.bottom = -0.1;
  sunLight.shadow.camera.near = 0.01;
  sunLight.shadow.camera.far = 2;
  sunLight.shadow.mapSize.set(2048, 2048);
  // Pass 2 re-origins the scene around the ISS before rendering, so shadow
  // math runs in local coordinates — we can use small bias values without
  // acne.
  sunLight.shadow.bias = -0.00005;
  sunLight.shadow.normalBias = 0.001;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Ambient fill — keeps the ISS faintly readable in full shadow.
  const ambient = new THREE.AmbientLight(0xfff4e0, 0.15);
  scene.add(ambient);

  return {
    earthMesh,
    cloudMesh,
    atmosMesh,
    stars,
    sunLight,
    sunBaseIntensity: SUN_INTENSITY,
    setSunDirection(dir) {
      earthMat.uniforms.sunDirection.value.copy(dir);
      cloudMat.uniforms.sunDirection.value.copy(dir);
      atmosMat.uniforms.sunDirection.value.copy(dir);
      sunLight.position.copy(dir.clone().multiplyScalar(150_000_000));
    },
    setDayOnly(enabled) {
      const v = enabled ? 1.0 : 0.0;
      earthMat.uniforms.dayOnly.value = v;
      cloudMat.uniforms.dayOnly.value = v;
      atmosMat.uniforms.dayOnly.value = v;
    },
    setCloudsVisible(visible) {
      cloudMesh.visible = visible;
    },
    setDayTone(brightness, gamma) {
      earthMat.uniforms.dayBrightness.value = brightness;
      earthMat.uniforms.dayGamma.value = gamma;
    },
    setNightTone(brightness, gamma) {
      earthMat.uniforms.nightBrightness.value = brightness;
      earthMat.uniforms.nightGamma.value = gamma;
    },
    // Rotate Earth and Cloud layers to match real sidereal time (GMST in radians)
    // Three.js and ECI mappings require earthMesh to rotate by exactly +gmst
    // to align the Prime Meridian (at u=0.5 on the texture) under the ISS.
    setGMST(gmst) {
      earthMesh.rotation.y = gmst;
    },
    // Cloud layer rotates with the Earth (no extra drift)
    updateClouds(gmst) {
      cloudMesh.rotation.y = gmst;
    },
  };
}
