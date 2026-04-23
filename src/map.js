export class MapOverlay {
  constructor() {
    this.canvas = document.getElementById('map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.earthImg = null;
    this._loadTexture();
  }

  _loadTexture() {
    const img = new Image();
    img.src = 'assets/8k_earth_daymap.jpg';
    img.onload = () => { this.earthImg = img; };
  }

  // sunDirWorld: Three.js Vector3 in world space (Y=north/ECI-Z, X=ECI-X, Z=-ECI-Y)
  // gmst: Greenwich Mean Sidereal Time in radians
  // track: [{lat, lon, t}] array from ISSTracker.getGroundTrack(), or null
  update(issLat, issLon, sunDirWorld, gmst, track) {
    if (!this.earthImg) return;

    const W = this.canvas.width;
    const H = this.canvas.height;
    const ctx = this.ctx;

    ctx.drawImage(this.earthImg, 0, 0, W, H);

    // Subsolar geographic coordinates
    const subLatRad = Math.asin(Math.max(-1, Math.min(1, sunDirWorld.y)));
    const eciLonRad = Math.atan2(-sunDirWorld.z, sunDirWorld.x);
    let subLonRad = eciLonRad - gmst;
    subLonRad = ((subLonRad + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

    this._drawNightOverlay(ctx, W, H, subLatRad, subLonRad);
    if (track) this._drawTrack(ctx, W, H, track);
    this._drawISS(ctx, W, H, issLat * Math.PI / 180, issLon * Math.PI / 180);
  }

  _drawNightOverlay(ctx, W, H, subLatRad, subLonRad) {
    const lonToX = (lon) => (lon / (2 * Math.PI) + 0.5) * W;
    const latToY = (lat) => (0.5 - lat / Math.PI) * H;

    // Avoid exact zero at equinox (causes atan2 ambiguity)
    const sinSub = Math.abs(Math.sin(subLatRad)) < 1e-6
      ? (subLatRad >= 0 ? 1e-6 : -1e-6)
      : Math.sin(subLatRad);
    const cosSub = Math.cos(subLatRad);

    const STEPS = 360;
    const termX = [];
    const termY = [];
    for (let i = 0; i <= STEPS; i++) {
      const lon = -Math.PI + (i / STEPS) * 2 * Math.PI;
      const termLat = Math.atan2(-cosSub * Math.cos(lon - subLonRad), sinSub);
      termX.push(lonToX(lon));
      termY.push(latToY(termLat));
    }

    const northIsNight = subLatRad < 0;

    // Night fill polygon
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 20, 0.70)';
    ctx.beginPath();
    if (northIsNight) {
      ctx.moveTo(0, 0);
      for (let i = 0; i <= STEPS; i++) ctx.lineTo(termX[i], termY[i]);
      ctx.lineTo(W, 0);
    } else {
      ctx.moveTo(0, H);
      for (let i = 0; i <= STEPS; i++) ctx.lineTo(termX[i], termY[i]);
      ctx.lineTo(W, H);
    }
    ctx.closePath();
    ctx.fill();

    // Soft terminator glow
    ctx.beginPath();
    ctx.moveTo(termX[0], termY[0]);
    for (let i = 1; i <= STEPS; i++) ctx.lineTo(termX[i], termY[i]);
    ctx.strokeStyle = 'rgba(255, 220, 120, 0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }

  _drawTrack(ctx, W, H, track) {
    const lonToX = (lon) => (lon / 180 + 1) / 2 * W;
    const latToY = (lat) => (0.5 - lat / 180) * H;

    const past = track.filter(p => p.t <= 0);
    const future = track.filter(p => p.t >= 0);

    const drawSegments = (points, style, width, dash) => {
      if (points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let penDown = false;
      for (let i = 0; i < points.length; i++) {
        const x = lonToX(points[i].lon);
        const y = latToY(points[i].lat);
        if (!penDown) {
          ctx.moveTo(x, y);
          penDown = true;
        } else {
          // Break path at antimeridian crossings to avoid horizontal streaks
          const dLon = Math.abs(points[i].lon - points[i - 1].lon);
          if (dLon > 180) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    };

    // Past: dashed amber
    drawSegments(past, 'rgba(255, 180, 60, 0.55)', 1.5, [4, 4]);
    // Future: solid cyan
    drawSegments(future, 'rgba(100, 220, 255, 0.75)', 1.5, []);

    // Tick marks at each 5-min sample
    ctx.save();
    for (const p of track) {
      if (p.t === 0) continue; // skip current position (drawn separately)
      const x = lonToX(p.lon);
      const y = latToY(p.lat);
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = p.t < 0 ? 'rgba(255, 180, 60, 0.7)' : 'rgba(100, 220, 255, 0.85)';
      ctx.fill();
    }
    ctx.restore();
  }

  _drawISS(ctx, W, H, latRad, lonRad) {
    const x = (lonRad / Math.PI + 1) / 2 * W;
    const y = (0.5 - latRad / Math.PI) * H;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffee00';
    ctx.fill();
    ctx.restore();
  }

  setVisible(v) {
    document.getElementById('map-panel').style.display = v ? 'block' : 'none';
  }
}
