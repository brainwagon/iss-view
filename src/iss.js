import * as THREE from 'three';
import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLat,
  degreesLong,
} from 'satellite';

// ---- Coordinate Mapping: ECI → Three.js World Space ----
// ECI (satellite.js native): X toward vernal equinox, Z toward north pole, Y completes RHS. Units: km.
// Three.js world: Y-axis is up (north), 1 unit = 1 km.
// Mapping: threeX = eci.x, threeY = eci.z, threeZ = -eci.y

function eciToThree(eciVec) {
  return {
    x: eciVec.x,
    y: eciVec.z,
    z: -eciVec.y,
  };
}

// ---- TLE Fetching ----
const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
const FALLBACK_URL = 'https://api.wheretheiss.at/v1/satellites/25544';

async function fetchTLE() {
  const res = await fetch(TLE_URL);
  if (!res.ok) throw new Error(`TLE fetch failed: ${res.status}`);
  const text = await res.text();
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trim());
  if (lines.length < 3 || !lines[1].startsWith('1 ')) {
    throw new Error('Invalid TLE format');
  }
  return { name: lines[0], line1: lines[1], line2: lines[2] };
}

// ---- LVLH Quaternion Computation ----
// Inputs: pos (ECI position, km), vel (ECI velocity, km/s) in Three.js world space
// Outputs: THREE.Quaternion representing LVLH orientation
// LVLH axes: +X = ram (velocity), +Y = port, -Z = nadir (toward Earth)
export function computeLVLHQuaternion(pos, vel) {
  const posV = new THREE.Vector3(pos.x, pos.y, pos.z);
  const velV = new THREE.Vector3(vel.x, vel.y, vel.z);

  // LVLH frame definition (standard satellite conventions):
  // +X (ram): forward along velocity vector
  // +Y (port): perpendicular to orbital plane (right by RHS)
  // +Z (zenith): radially outward from Earth
  // -Z (nadir): toward Earth center

  // Zenith direction (away from Earth)
  const zenith = posV.clone().normalize();

  // Ram direction (velocity tangent to orbit)
  const ram = velV.clone().normalize();

  // Port = zenith cross ram (perpendicular to orbital plane)
  const port = new THREE.Vector3().crossVectors(zenith, ram).normalize();

  // Re-orthogonalize ram to ensure perfect orthonormal basis
  const ramOrtho = new THREE.Vector3().crossVectors(port, zenith).normalize();

  // Build rotation matrix from basis vectors:
  // LVLH +X = ramOrtho (ram), +Y = port, +Z = zenith
  const m = new THREE.Matrix4().makeBasis(ramOrtho, port, zenith);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

// ---- ISSTracker Class ----
export class ISSTracker {
  constructor() {
    this.satrec = null;
    this.usedTLE = false;
    this.position = null;
    this.velocity = null;
    this.geodetic = null;
    this.lvlh = null;
    this.lastTLEFetch = 0;
  }

  async init() {
    try {
      const { line1, line2 } = await fetchTLE();
      this.satrec = twoline2satrec(line1, line2);
      this.usedTLE = true;
      this.lastTLEFetch = Date.now();
      console.log('[ISS] TLE loaded successfully');
    } catch (err) {
      console.warn('[ISS] TLE fetch failed, will use fallback API:', err.message);
      this.usedTLE = false;
    }
  }

  // Synchronously propagate to a specific date using existing satrec
  getPropagatedState(date) {
    if (!this.satrec) return null;

    const posVel = propagate(this.satrec, date);
    if (!posVel || posVel.position === false) return null;

    const gmst = gstime(date);
    const geo = eciToGeodetic(posVel.position, gmst);

    const pos3 = eciToThree(posVel.position);
    const vel3 = eciToThree(posVel.velocity);

    const geodetic = {
      lat: degreesLat(geo.latitude),
      lon: degreesLong(geo.longitude),
      alt: geo.height,
    };
    const lvlh = computeLVLHQuaternion(pos3, vel3);
    const speed = Math.sqrt(vel3.x ** 2 + vel3.y ** 2 + vel3.z ** 2);

    return {
      position: pos3,
      geodetic,
      velocity: vel3,
      lvlh,
      speed,
      source: 'TLE (Sync)',
    };
  }

  // Called once per tick to update ISS position
  async update() {
    // Re-fetch TLE once per hour to prevent SGP4 accuracy degradation
    if (
      this.usedTLE &&
      Date.now() - this.lastTLEFetch > 3_600_000
    ) {
      try {
        const { line1, line2 } = await fetchTLE();
        this.satrec = twoline2satrec(line1, line2);
        this.lastTLEFetch = Date.now();
        console.log('[ISS] TLE refreshed');
      } catch (err) {
        console.warn('[ISS] TLE refresh failed:', err.message);
      }
    }

    if (this.usedTLE && this.satrec) {
      return this._propagateTLE(new Date());
    } else {
      return this._fetchFallback();
    }
  }

  _propagateTLE(date) {
    const posVel = propagate(this.satrec, date);
    if (!posVel || posVel.position === false) {
      console.warn('[ISS] SGP4 propagation failed');
      return null;
    }

    const gmst = gstime(date);
    const geo = eciToGeodetic(posVel.position, gmst);

    const pos3 = eciToThree(posVel.position);
    const vel3 = eciToThree(posVel.velocity);

    this.position = pos3;
    this.velocity = vel3;
    this.geodetic = {
      lat: degreesLat(geo.latitude),
      lon: degreesLong(geo.longitude),
      alt: geo.height,
    };
    this.lvlh = computeLVLHQuaternion(pos3, vel3);

    const speed = Math.sqrt(vel3.x ** 2 + vel3.y ** 2 + vel3.z ** 2);

    return {
      position: this.position,
      geodetic: this.geodetic,
      velocity: this.velocity,
      lvlh: this.lvlh,
      speed,
      source: 'TLE',
    };
  }

  async _fetchFallback() {
    try {
      const res = await fetch(FALLBACK_URL);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();

      const latRad = (data.latitude * Math.PI) / 180;
      const lonRad = (data.longitude * Math.PI) / 180;
      const r = 6371 + data.altitude;
      const gmst = gstime(new Date());

      // Approximate ECI position: Right Ascension = Longitude + GMST
      const ra = lonRad + gmst;
      const posEci = {
        x: r * Math.cos(latRad) * Math.cos(ra),
        y: r * Math.sin(latRad),
        z: r * Math.cos(latRad) * Math.sin(ra),
      };

      this.position = eciToThree(posEci);
      this.geodetic = {
        lat: data.latitude,
        lon: data.longitude,
        alt: data.altitude,
      };
      this.velocity = null;
      this.lvlh = null;

      const speed = data.velocity || 0;

      return {
        position: this.position,
        geodetic: this.geodetic,
        velocity: null,
        lvlh: null,
        speed,
        source: 'wheretheiss.at',
      };
    } catch (err) {
      console.error('[ISS] Fallback API failed:', err.message);
      return null;
    }
  }
}
