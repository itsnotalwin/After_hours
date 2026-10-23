/* AFTERHOURS — paper-craft primitives: isometric maths, palettes, halftone / hatch / grain textures, ink blobs. */
(function () {
  'use strict';
  var AH = (window.AH = window.AH || {});

  var HW = 32, HH = 16;
  AH.ISO = { HW: HW, HH: HH, TW: 64, TH: 32, E: 4 }; // E = how far city blocks are raised above the streets

  AH.iso = function (x, y, z) { return { x: (x - y) * HW, y: (x + y) * HH - (z || 0) }; };
  AH.unIso = function (sx, sy, z) {
    var a = sx / HW, b = (sy + (z || 0)) / HH;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  };

  /* ---------- colour ---------- */
  var cache = {};
  function parse(c) {
    if (cache[c]) return cache[c];
    var n = parseInt(c.slice(1), 16);
    return (cache[c] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }
  AH.mix = function (a, b, t) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    var A = parse(a), B = parse(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  };
  AH.rgba = function (hex, a) { var c = parse(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };

  // Monochrome paper + ink. Night is the same sheet printed in reverse: black paper, white ink.
  AH.PAL = {
    day: {
      bg: '#F1F1F1', bg2: '#E4E4E4', blob: '#0A0A0A', ink: '#0A0A0A', line: '#0A0A0A',
      top: '#FFFFFF', left: '#ECECEC', right: '#CDCDCD',
      ground: '#DADADA', block: '#FAFAFA', blockL: '#D6D6D6', blockR: '#B4B4B4',
      slabL: '#C2C2C2', slabR: '#9E9E9E', win: '#0A0A0A', winLit: '#FFFFFF',
      dot: '#0A0A0A', dotA: 0.3, hatchA: 0.45, shadowA: 0.17,
      park: '#EFEFEF', path: '#FFFFFF', dash: '#FAFAFA', glass: '#0A0A0A', sign: '#0A0A0A', signText: '#FFFFFF',
      awA: '#0A0A0A', awB: '#FFFFFF'
    },
    night: {
      bg: '#0B0B0B', bg2: '#171717', blob: '#E9E9E9', ink: '#050505', line: '#E4E4E4',
      top: '#3B3B3B', left: '#2B2B2B', right: '#181818',
      ground: '#1A1A1A', block: '#2A2A2A', blockL: '#1F1F1F', blockR: '#111111',
      slabL: '#151515', slabR: '#0D0D0D', win: '#050505', winLit: '#FFFFFF',
      dot: '#FFFFFF', dotA: 0.2, hatchA: 0.28, shadowA: 0.4,
      park: '#303030', path: '#3F3F3F', dash: '#4B4B4B', glass: '#E8E8E8', sign: '#E8E8E8', signText: '#050505',
      awA: '#E8E8E8', awB: '#222222'
    }
  };
  AH.pc = function (key, nf) { return AH.mix(AH.PAL.day[key], AH.PAL.night[key], nf); };

  /* ---------- geometry ---------- */
  AH.poly = function (ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  };

  AH.hull = function (pts) {
    pts = pts.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
    var lo = [], i;
    for (i = 0; i < pts.length; i++) {
      while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop();
      lo.push(pts[i]);
    }
    var up = [];
    for (i = pts.length - 1; i >= 0; i--) {
      while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop();
      up.push(pts[i]);
    }
    up.pop(); lo.pop();
    return lo.concat(up);
  };

  AH.rr = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // A smooth, slightly lumpy closed shape — the "ink blob" of the reference sheets.
  AH.blobPath = function (ctx, cx, cy, rx, ry, rng, wob, n) {
    n = n || 9; wob = wob == null ? 0.22 : wob;
    var pts = [], i;
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2, k = 1 + (rng.next() - 0.5) * 2 * wob;
      pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
    }
    function mid(p, q) { return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; }
    var m0 = mid(pts[n - 1], pts[0]);
    ctx.beginPath();
    ctx.moveTo(m0.x, m0.y);
    for (i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n], m = mid(p, q);
      ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
    }
    ctx.closePath();
  };

  /* ---------- textures (tiles are painted at 4x and mapped back to world units) ---------- */
  var Q = 4;
  var tiles = {};

  function tile(sp) {
    var c = document.createElement('canvas');
    c.width = c.height = Math.round(sp * Q);
    return c;
  }

  AH.dotTile = function (sp, r, color, alpha) {
    var key = 'd' + sp + '_' + r + color + alpha;
    if (tiles[key]) return tiles[key];
    var c = tile(sp), g = c.getContext('2d');
    g.fillStyle = AH.rgba(color, alpha);
    var s = sp * Q;
    // offset rows (halftone screen)
    g.beginPath(); g.arc(s * 0.25, s * 0.25, r * Q, 0, 6.2832); g.fill();
    g.beginPath(); g.arc(s * 0.75, s * 0.75, r * Q, 0, 6.2832); g.fill();
    return (tiles[key] = c);
  };

  AH.hatchTile = function (sp, lw, color, alpha, dir) {
    var key = 'h' + sp + '_' + lw + color + alpha + dir;
    if (tiles[key]) return tiles[key];
    var c = tile(sp), g = c.getContext('2d'), s = sp * Q;
    g.strokeStyle = AH.rgba(color, alpha);
    g.lineWidth = lw * Q;
    g.lineCap = 'butt';
    g.beginPath();
    var k;
    for (k = -1; k <= 1; k++) {
      if (dir >= 0) { g.moveTo(-s + k * s, s * 2 + 0); g.lineTo(s * 2 + k * s, -s); }
      else { g.moveTo(-s + k * s, -s); g.lineTo(s * 2 + k * s, s * 2); }
    }
    g.stroke();
    return (tiles[key] = c);
  };

  AH.grainTile = function (seed) {
    var key = 'g' + seed;
    if (tiles[key]) return tiles[key];
    var c = document.createElement('canvas'); c.width = c.height = 160;
    var g = c.getContext('2d'), rng = new AH.RNG(seed || 7), i;
    for (i = 0; i < 520; i++) {
      var x = rng.next() * 160, y = rng.next() * 160, s = rng.chance(0.2) ? 2 : 1;
      g.fillStyle = rng.chance(0.55) ? 'rgba(255,255,255,' + rng.range(0.1, 0.5) + ')' : 'rgba(0,0,0,' + rng.range(0.1, 0.5) + ')';
      g.fillRect(x, y, s, s);
    }
    // a few scratches, like worn ink
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    for (i = 0; i < 14; i++) {
      var sx = rng.next() * 160, sy = rng.next() * 160;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + rng.range(-24, 24), sy + rng.range(-8, 8)); g.stroke();
    }
    return (tiles[key] = c);
  };

  // pattern that is tied to world units (so it scales with the camera like printed paper does)
  AH.pattern = function (ctx, tileCanvas, unitScale) {
    var p = ctx.createPattern(tileCanvas, 'repeat');
    var s = unitScale == null ? 1 / Q : unitScale;
    if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(s, s));
    return p;
  };
  AH.Q = Q;
})();
