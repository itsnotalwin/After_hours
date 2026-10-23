/* AFTERHOURS — seeded random numbers (mulberry32). Everything in the city is reproducible from a seed. */
(function () {
  'use strict';
  var AH = (window.AH = window.AH || {});

  function hashStr(s) {
    s = String(s);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function RNG(seed) {
    this.seed = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
    this._f = mulberry32(this.seed);
  }
  RNG.prototype.next = function () { return this._f(); };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this._f(); };
  RNG.prototype.int = function (a, b) { return Math.floor(a + (b - a + 1) * this._f()); };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this._f() * arr.length)]; };
  RNG.prototype.chance = function (p) { return this._f() < p; };
  RNG.prototype.gauss = function () { return (this._f() + this._f() + this._f() + this._f() - 2) / 0.5774; };
  RNG.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this._f() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  RNG.prototype.fork = function (label) { return new RNG(hashStr(this.seed + ':' + label)); };

  AH.RNG = RNG;
  AH.hashStr = hashStr;
})();

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

/* AFTERHOURS — the city generator. One seed → one district: streets, blocks, buildings, trees, lamps. */
(function () {
  'use strict';
  var AH = window.AH;

  var N = 16;                       // tiles per side
  var STREETS = [0, 5, 10, 15];     // street rows / columns
  var K = { STREET: 0, LOT: 1, PARK: 2, OBST: 3 };
  var E = AH.ISO.E;

  var LAST = ['Marlow', 'Quill', 'Voss', 'Hartigan', 'Ledger', 'Okafor', 'Brandt', 'Pell', 'Sorensen', 'Vance', 'Thistle', 'Arkwright', 'Delacroix', 'Nkemelu', 'Ashby', 'Lind'];
  var CAFES = ["Marlow's Café", 'Half Moon Bakery', 'Kettle & Crumb', 'Ember Bakehouse', 'The Daily Crumb', 'Nightingale Café'];
  var PRINTS = ['Quill & Ledger', 'Inkwell Press', 'Hartigan Print', 'The Gazette Press'];
  var HALLS = ['City Hall', 'Civic Hall', 'Town Hall'];
  var SHOPS = ['Corner Grocer', "Pell's Hardware", 'Apothecary', 'Tailor & Press', 'Florist', 'Barber', 'Record Shop', 'Haberdashery', 'Kiosk 9', 'Dry Cleaner', 'Bike Repair', 'Bookbinder'];
  var OFFICES = ['Brandt Assurance', 'Vance & Co.', 'Okafor Freight', 'Arkwright Law', 'Thistle Survey', 'Delacroix Bank'];
  var PARKS = ['Linden Park', 'Fountain Green', 'Quiet Square'];
  var STREET_NAMES = ['Elm St', 'Cutler Row', 'Mill Lane', 'Gantry Way', 'Foundry St', 'Orchard Rd', 'Pilot St', 'Wick Lane'];

  function layoutLots(bx, by, layout) {
    switch (layout) {
      case 'full': return [{ x: bx, y: by, w: 4, h: 4, t: 'b' }];
      case 'stack': return [{ x: bx, y: by, w: 4, h: 2, t: 'b' }, { x: bx, y: by + 2, w: 4, h: 2, t: 'b' }];
      case 'split': return [{ x: bx, y: by, w: 2, h: 4, t: 'b' }, { x: bx + 2, y: by, w: 2, h: 4, t: 'b' }];
      case 'ell': return [{ x: bx, y: by, w: 2, h: 2, t: 'y' }, { x: bx + 2, y: by, w: 2, h: 2, t: 'b' }, { x: bx, y: by + 2, w: 4, h: 2, t: 'b' }];
      case 'ell2': return [{ x: bx, y: by, w: 2, h: 2, t: 'y' }, { x: bx + 2, y: by, w: 2, h: 4, t: 'b' }, { x: bx, y: by + 2, w: 2, h: 2, t: 'b' }];
      default: return [{ x: bx, y: by, w: 2, h: 2, t: 'y' }, { x: bx + 2, y: by, w: 2, h: 2, t: 'b' }, { x: bx + 2, y: by + 2, w: 2, h: 2, t: 'b' }, { x: bx, y: by + 2, w: 2, h: 2, t: 'b' }];
    }
  }

  // The visual recipe for each kind of building. The art generator only reads these fields.
  function spec(kind, rng) {
    var s = { kind: kind, floors: 2, floorH: 20, groundH: 20, wall: 'plain', windows: 'grid', awning: false, sign: false, roof: 'flat', balcony: false, door: 'plain', columns: false, clock: false };
    switch (kind) {
      case 'home': s.floors = rng.int(2, 3); s.wall = rng.pick(['plain', 'dots', 'hatch']); s.roof = rng.pick(['flat', 'chimney', 'chimney', 'tank']); break;
      case 'flat': s.floors = rng.int(3, 4); s.floorH = 17; s.groundH = 17; s.windows = 'tall'; s.balcony = true; s.wall = rng.pick(['hatch', 'dots']); s.roof = rng.pick(['tank', 'flat']); break;
      case 'office': s.floors = rng.int(3, 4); s.floorH = 18; s.groundH = 18; s.windows = 'band'; s.wall = rng.pick(['plain', 'ink', 'plain']); s.roof = 'ac'; break;
      case 'shop': s.floors = rng.int(1, 2); s.groundH = 34; s.floorH = 18; s.awning = true; s.sign = true; s.wall = rng.pick(['plain', 'dots']); break;
      case 'cafe': s.floors = 2; s.groundH = 34; s.floorH = 18; s.awning = true; s.sign = true; s.wall = 'dots'; s.roof = 'chimney'; break;
      case 'print': s.floors = 2; s.groundH = 34; s.floorH = 18; s.sign = true; s.wall = 'hatch'; s.roof = 'sawtooth'; break;
      case 'hall': s.floors = 4; s.floorH = 22; s.groundH = 26; s.wall = 'plain'; s.roof = 'stepped'; s.columns = true; s.clock = true; s.windows = 'tall'; break;
      case 'warehouse': s.floors = 1; s.floorH = 30; s.groundH = 34; s.wall = 'hatch'; s.roof = 'sawtooth'; s.door = 'roller'; s.windows = 'high'; break;
    }
    s.roofExtra = { stepped: 34, tank: 20, chimney: 20, sawtooth: 14, ac: 14, flat: 8 }[s.roof] || 8;
    return s;
  }

  function generateWorld(seed) {
    var rng = new AH.RNG(seed);
    var tiles = new Uint8Array(N * N);
    var blocks = [], buildings = [], trees = [], lamps = [], benches = [], byId = {};
    var i, j;

    /* ---- blocks ---- */
    for (j = 0; j < 3; j++) for (i = 0; i < 3; i++) {
      var b = { bi: i, bj: j, x0: 1 + i * 5, y0: 1 + j * 5, park: i === 1 && j === 1, layout: 'park' };
      blocks.push(b);
      for (var ty = b.y0; ty < b.y0 + 4; ty++) for (var tx = b.x0; tx < b.x0 + 4; tx++) tiles[ty * N + tx] = b.park ? K.PARK : K.LOT;
    }

    var hallAt = rng.pick([[0, 0], [1, 0], [0, 1]]);
    var layouts = ['stack', 'split', 'ell', 'ell2', 'trio'];
    var lots = [];
    blocks.forEach(function (b) {
      if (b.park) return;
      b.layout = (b.bi === hallAt[0] && b.bj === hallAt[1]) ? 'full' : rng.pick(layouts);
      layoutLots(b.x0, b.y0, b.layout).forEach(function (l) { l.block = b; lots.push(l); });
    });

    /* ---- buildings & yards ---- */
    var seq = 0;
    lots.forEach(function (l) {
      if (l.t === 'y') {
        var n = rng.int(1, 3), spots = [[0.5, 0.5], [1.5, 0.5], [0.5, 1.5], [1.5, 1.5]];
        rng.shuffle(spots);
        for (var k = 0; k < n; k++) trees.push({ x: l.x + spots[k][0] + rng.range(-0.12, 0.12), y: l.y + spots[k][1] + rng.range(-0.12, 0.12), kind: rng.pick(['round', 'lolli', 'pine']), seed: rng.int(1, 99999), s: rng.range(0.85, 1.15) });
        return;
      }
      var bd = { id: 'b' + (++seq), x: l.x, y: l.y, w: l.w, h: l.h, block: l.block, kind: null, name: '' };
      // door on a face the camera can see (+x or +y side that touches a street)
      var sides = [];
      if (l.x + l.w === l.block.x0 + 4) sides.push('x');
      if (l.y + l.h === l.block.y0 + 4) sides.push('y');
      bd.side = rng.pick(sides);
      if (bd.side === 'x') {
        var ty2 = l.y + rng.int(0, l.h - 1);
        bd.doorTile = { x: l.x + l.w, y: ty2 };
        bd.doorEdge = { x: l.x + l.w, y: ty2 + 0.5 };
        bd.doorU = (l.y + l.h - (ty2 + 0.5)) * 32;
        bd.faceL = l.h * 32;
      } else {
        var tx2 = l.x + rng.int(0, l.w - 1);
        bd.doorTile = { x: tx2, y: l.y + l.h };
        bd.doorEdge = { x: tx2 + 0.5, y: l.y + l.h };
        bd.doorU = (tx2 + 0.5 - l.x) * 32;
        bd.faceL = l.w * 32;
      }
      buildings.push(bd);
    });

    /* ---- roles ---- */
    var pool = buildings.filter(function (b) { return b.block.layout !== 'full'; });
    rng.shuffle(pool);
    var usedBlocks = {};
    function take(pred) {
      var idx = -1, n;
      for (n = 0; n < pool.length; n++) if (pred(pool[n])) { idx = n; break; }
      if (idx < 0) idx = 0;
      return pool.splice(idx, 1)[0];
    }
    var hall = buildings.filter(function (b) { return b.block.layout === 'full'; })[0];
    hall.kind = 'hall'; hall.name = rng.pick(HALLS);
    var cafe = take(function (b) { return b.w * b.h >= 8; }); cafe.kind = 'cafe'; cafe.name = rng.pick(CAFES);
    var print = take(function (b) { return b.w * b.h >= 4; }); print.kind = 'print'; print.name = rng.pick(PRINTS);
    var homes = [];
    for (i = 0; i < 3; i++) {
      var hm = take(function (b) { return b.w * b.h <= 8 && !usedBlocks[b.block.bi + ',' + b.block.bj]; });
      usedBlocks[hm.block.bi + ',' + hm.block.bj] = 1;
      hm.kind = 'home'; hm.name = rng.pick(LAST) + ' House';
      homes.push(hm);
    }
    var usedNames = {};
    pool.forEach(function (b) {
      var area = b.w * b.h, r = rng.next();
      if (area >= 8 && r < 0.28) { b.kind = 'warehouse'; b.name = 'Freight Shed'; }
      else if (r < 0.5) { b.kind = 'shop'; do { b.name = rng.pick(SHOPS); } while (usedNames[b.name] && Object.keys(usedNames).length < SHOPS.length); }
      else if (r < 0.75) { b.kind = 'office'; do { b.name = rng.pick(OFFICES); } while (usedNames[b.name] && Object.keys(usedNames).length < OFFICES.length); }
      else if (b.w * b.h <= 4 || r < 0.85) { b.kind = 'flat'; b.name = rng.pick(LAST) + ' Flats'; }
      else { b.kind = 'home'; b.name = rng.pick(LAST) + ' House'; }
      usedNames[b.name] = 1;
    });

    buildings.forEach(function (b) {
      var s = spec(b.kind, rng);
      for (var k in s) b[k] = s[k];
      b.seed = rng.int(1, 1e9);
      b.H = b.groundH + (b.floors - 1) * b.floorH;
      b.x0 = b.x; b.x1 = b.x + b.w; b.y0 = b.y; b.y1 = b.y + b.h;
      b.signText = b.sign ? b.name.toUpperCase() : null;
      byId[b.id] = b;
    });

    /* ---- park ---- */
    var park = blocks.filter(function (b) { return b.park; })[0];
    var px = park.x0, py = park.y0;
    [[7, 7], [8, 7], [7, 8], [8, 8]].forEach(function (t) { tiles[t[1] * N + t[0]] = K.OBST; });
    [[6, 6], [9, 6], [6, 9], [9, 9]].forEach(function (t) {
      tiles[t[1] * N + t[0]] = K.OBST;
      trees.push({ x: t[0] + 0.5, y: t[1] + 0.5, kind: rng.pick(['round', 'lolli']), seed: rng.int(1, 99999), s: 1.2, park: true });
    });
    benches.push({ x: 7, y: 6, dir: 'n' }, { x: 9, y: 8, dir: 'e' }, { x: 8, y: 9, dir: 's' }, { x: 6, y: 7, dir: 'w' });
    var spots = benches.map(function (bn, idx) {
      return { t: 's', key: 'bench' + idx, x: bn.x + 0.5, y: bn.y + 0.5, sit: true, face: bn.dir, name: 'a park bench' };
    });

    /* ---- lamps ---- */
    [[5, 5], [10, 5], [5, 10], [10, 10], [0, 5], [15, 5], [5, 0], [5, 15], [0, 10], [15, 10], [10, 0], [10, 15]].forEach(function (p, idx) {
      lamps.push({ x: p[0] + 0.14, y: p[1] + 0.14, id: 'l' + idx });
    });

    /* ---- walkable grid ---- */
    var walk = new Uint8Array(N * N);
    for (i = 0; i < N * N; i++) walk[i] = (tiles[i] === K.STREET || tiles[i] === K.PARK) ? 1 : 0;

    var world = {
      seed: seed, N: N, K: K, E: E, tiles: tiles, walk: walk, blocks: blocks, buildings: buildings, byId: byId,
      trees: trees, lamps: lamps, benches: benches, spots: spots, homes: homes,
      cafe: cafe, print: print, hall: hall, park: park, parkName: rng.pick(PARKS),
      fountain: { x0: 7, y0: 7, x1: 9, y1: 9 },
      streetNames: { col: rng.shuffle(STREET_NAMES.slice()).slice(0, 2), row: rng.shuffle(STREET_NAMES.slice()).slice(0, 2) }
    };

    world.tileKind = function (x, y) { return (x < 0 || y < 0 || x >= N || y >= N) ? -1 : tiles[y * N + x]; };

    // height of the ground under a point: streets are low, blocks are raised paper sheets (smooth ramp so feet do not pop)
    world.zAt = function (x, y) {
      var kind = world.tileKind(Math.floor(x), Math.floor(y));
      if (kind === K.STREET || kind < 0) return 0;
      var bi = Math.floor((Math.floor(x) - 1) / 5), bj = Math.floor((Math.floor(y) - 1) / 5);
      var b0 = 1 + bi * 5, c0 = 1 + bj * 5;
      var d = Math.min(x - b0, b0 + 4 - x, y - c0, c0 + 4 - y);
      return E * Math.max(0, Math.min(1, d / 0.35));
    };

    // shortest route over streets and park lawn
    world.findPath = function (sx, sy, ex, ey) {
      var start = sy * N + sx, goal = ey * N + ex;
      if (start === goal) return [[sx, sy]];
      var prev = new Int16Array(N * N).fill(-1), q = [start], head = 0;
      prev[start] = start;
      var dx = [1, 0, -1, 0], dy = [0, 1, 0, -1];
      while (head < q.length) {
        var cur = q[head++];
        if (cur === goal) break;
        var cx = cur % N, cy = (cur / N) | 0;
        for (var d = 0; d < 4; d++) {
          var nx = cx + dx[d], ny = cy + dy[d];
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          var ni = ny * N + nx;
          if (prev[ni] >= 0 || !walk[ni]) continue;
          prev[ni] = cur; q.push(ni);
        }
      }
      if (prev[goal] < 0) return null;
      var path = [], c = goal;
      while (c !== start) { path.push([c % N, (c / N) | 0]); c = prev[c]; }
      path.push([sx, sy]);
      path.reverse();
      return path;
    };

    return world;
  }

  AH.generateWorld = generateWorld;
  AH.buildingSpec = spec;
})();

/* AFTERHOURS — procedural paper-craft art. Everything is drawn in code from seeds: buildings, trees, the paper board, figures. */
(function () {
  'use strict';
  var AH = window.AH, I = AH.iso, E = AH.ISO.E, SS = 2;
  var SERIF = '"Times New Roman", Times, "Liberation Serif", Georgia, serif';
  var SANS = '"Avenir Next", Avenir, "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif';
  AH.PAL.night.isNight = true;
  var art = (AH.art = { SS: SS, SERIF: SERIF, SANS: SANS });
  var cache = {};

  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
  function mkSS(w, h) { var c = mk(w * SS, h * SS), g = c.getContext('2d'); g.scale(SS, SS); return { c: c, g: g }; }

  /* ---------- shared bits ---------- */
  function boxHull(x0, y0, x1, y1, z0, z1) {
    var pts = [];
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(function (p) { pts.push(I(p[0], p[1], z0)); pts.push(I(p[0], p[1], z1)); });
    return AH.hull(pts);
  }
  function castShadow(g, P, hull, ox, oy, blur, a) {
    g.save();
    g.shadowColor = 'rgba(0,0,0,' + a + ')';
    g.shadowBlur = blur * SS; g.shadowOffsetX = ox * SS; g.shadowOffsetY = oy * SS;
    g.fillStyle = P.top; AH.poly(g, hull); g.fill();
    g.restore();
  }
  // an extruded block: right face (x1), left face (y1), top
  function box(g, P, x0, y0, x1, y1, z0, z1, o) {
    o = o || {};
    var fr = [I(x1, y1, z0), I(x1, y0, z0), I(x1, y0, z1), I(x1, y1, z1)];
    var fl = [I(x0, y1, z0), I(x1, y1, z0), I(x1, y1, z1), I(x0, y1, z1)];
    var ft = [I(x0, y0, z1), I(x1, y0, z1), I(x1, y1, z1), I(x0, y1, z1)];
    AH.poly(g, fr); g.fillStyle = o.right || P.right; g.fill();
    AH.poly(g, fl); g.fillStyle = o.left || P.left; g.fill();
    AH.poly(g, ft); g.fillStyle = o.top || P.top; g.fill();
    g.lineJoin = 'round';
    if (P.isNight) {
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 0.8;
      AH.poly(g, fr); g.stroke(); AH.poly(g, fl); g.stroke(); AH.poly(g, ft); g.stroke();
    } else {
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 0.9; AH.poly(g, ft); g.stroke();
    }
  }
  // open a flat "elevation" space on a wall: u runs along the wall in screen px, v runs up as negative y
  function faceOpen(g, x0, y0, x1, y1, z0, which) {
    var p0 = which === 'R' ? I(x1, y1, z0) : I(x0, y1, z0);
    g.save(); g.translate(p0.x, p0.y); g.transform(1, which === 'R' ? -0.5 : 0.5, 0, 1, 0, 0);
    return (which === 'R' ? (y1 - y0) : (x1 - x0)) * 32;
  }
  // a black (or white at night) shape with grain and halftone shading — the ink-blob look
  function inkShape(w, h, color, shadeDots, draw) {
    var c = mk(w * SS, h * SS), g = c.getContext('2d');
    g.scale(SS, SS);
    g.fillStyle = color; g.strokeStyle = color; g.lineJoin = 'round';
    draw(g);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.5; g.fillStyle = AH.pattern(g, AH.grainTile(11), 0.6); g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
    g.fillStyle = AH.pattern(g, AH.dotTile(3.2, 0.75, shadeDots.c, shadeDots.a));
    g.beginPath(); g.moveTo(w * 0.62, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(w * 0.1, h); g.closePath(); g.fill();
    return c;
  }

  /* ---------- buildings ---------- */
  function pane(g, P, u, v, w, h, lit) {
    if (P.isNight) {
      g.fillStyle = lit ? P.winLit : P.win; g.fillRect(u, v, w, h);
      g.strokeStyle = lit ? 'rgba(10,10,10,0.55)' : 'rgba(255,255,255,0.18)';
    } else if (lit) {
      g.fillStyle = '#FFFFFF'; g.fillRect(u, v, w, h);
      g.strokeStyle = P.ink; g.lineWidth = 0.9; g.strokeRect(u + 0.45, v + 0.45, w - 0.9, h - 0.9);
      g.strokeStyle = 'rgba(10,10,10,0.5)';
    } else {
      g.fillStyle = P.win; g.fillRect(u, v, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.5)';
    }
    g.lineWidth = 0.7; g.beginPath();
    g.moveTo(u + w / 2, v); g.lineTo(u + w / 2, v + h);
    if (h > 7) { g.moveTo(u, v + h * 0.45); g.lineTo(u + w, v + h * 0.45); }
    g.stroke();
  }

  function windowsRow(g, P, b, rng, L, vTop, fh, f, doorU) {
    var kind = b.windows, ww = 8, wh = 9, pitch = 16, k, n, gap, uc;
    if (b.kind === 'hall') { ww = 8; wh = 13; pitch = 20; }
    else if (kind === 'tall') { ww = 7; wh = 12; pitch = 14; }
    else if (kind === 'high') { ww = 10; wh = 5; pitch = 18; }
    if (kind === 'band' && b.kind !== 'hall') {
      var segs = Math.max(2, Math.floor((L - 10) / 14)), sw = (L - 10) / segs, top = vTop + Math.round((fh - 8) / 2);
      for (k = 0; k < segs; k++) {
        var litB = rng.chance(0.55);
        if (f === 0 && Math.abs(5 + sw * (k + 0.5) - doorU) < sw / 2 + 6) continue;
        pane(g, P, 5 + k * sw + 0.6, top, sw - 1.2, 8, litB);
      }
      return;
    }
    n = Math.max(1, Math.floor((L - 4) / pitch)); gap = L / n;
    var wTop = kind === 'high' ? vTop + 5 : vTop + Math.round((fh - wh) / 2) + (f === 0 ? 1 : 0);
    for (k = 0; k < n; k++) {
      uc = (k + 0.5) * gap;
      var lit = rng.chance(0.55);
      if (f === 0 && Math.abs(uc - doorU) < ww / 2 + 8) continue;
      pane(g, P, uc - ww / 2, wTop, ww, wh, lit);
      if (b.balcony && f >= 1) {
        g.fillStyle = P.isNight ? '#6A6A6A' : P.blockR; g.fillRect(uc - ww / 2 - 2, wTop + wh, ww + 4, 1.6);
        g.strokeStyle = P.isNight ? 'rgba(255,255,255,0.4)' : 'rgba(10,10,10,0.55)'; g.lineWidth = 0.6;
        g.beginPath(); g.moveTo(uc - ww / 2 - 2, wTop + wh - 3); g.lineTo(uc + ww / 2 + 2, wTop + wh - 3); g.stroke();
      }
    }
  }

  function shopGlass(g, P, b, rng, L, doorU) {
    var u0 = 5, u1 = L - 5, segs = doorU > 0 ? [[u0, doorU - 8], [doorU + 8, u1]] : [[u0, u1]];
    var top = b.awning ? -14 : -(b.groundH - 14);
    segs.forEach(function (sg) {
      var w = sg[1] - sg[0], lit = rng.chance(0.8);
      if (w < 6) return;
      g.save();
      g.beginPath(); g.rect(sg[0], top, w, -3 - top); g.clip();
      g.fillStyle = P.isNight ? (lit ? P.winLit : P.win) : P.win; g.fillRect(sg[0], top, w, -3 - top);
      g.strokeStyle = P.isNight ? 'rgba(10,10,10,0.35)' : 'rgba(255,255,255,0.55)'; g.lineWidth = 1;
      for (var x = sg[0] + 3; x < sg[1]; x += 11) { g.beginPath(); g.moveTo(x, -3); g.lineTo(x + 9, top); g.stroke(); }
      g.restore();
    });
  }

  function door(g, P, b, u) {
    var w, h;
    if (b.door === 'roller') {
      w = 22; h = 24;
      g.fillStyle = P.isNight ? '#2A2A2A' : '#8A8A8A'; g.fillRect(u - w / 2, -h, w, h);
      g.strokeStyle = P.isNight ? 'rgba(255,255,255,0.25)' : 'rgba(10,10,10,0.45)'; g.lineWidth = 0.7;
      for (var y = -h + 3; y < 0; y += 3) { g.beginPath(); g.moveTo(u - w / 2, y); g.lineTo(u + w / 2, y); g.stroke(); }
      return;
    }
    if (b.kind === 'hall') {
      w = 14; h = 22;
      g.fillStyle = P.ink; g.beginPath(); g.moveTo(u - w / 2, 0); g.lineTo(u - w / 2, -h + w / 2); g.arc(u, -h + w / 2, w / 2, Math.PI, 0); g.lineTo(u + w / 2, 0); g.closePath(); g.fill();
      if (P.isNight) { g.fillStyle = P.winLit; g.beginPath(); g.moveTo(u - 5, 0); g.lineTo(u - 5, -h + 7); g.arc(u, -h + 7, 5, Math.PI, 0); g.lineTo(u + 5, 0); g.closePath(); g.fill(); }
      g.fillStyle = P.top; g.fillRect(u - 12, -2, 24, 2); g.fillRect(u - 15, -1, 30, 1);
      return;
    }
    w = 9; h = b.sign ? 18 : 16;
    g.fillStyle = P.ink; g.fillRect(u - w / 2, -h, w, h);
    if (P.isNight) { g.fillStyle = P.winLit; g.fillRect(u - w / 2 + 1.3, -h + 1.3, w - 2.6, h - 1.3); }
    else { g.fillStyle = '#fff'; g.beginPath(); g.arc(u + w / 2 - 2, -h * 0.45, 0.8, 0, 6.3); g.fill(); }
    g.fillStyle = P.top; g.fillRect(u - w / 2 - 1.5, -1.3, w + 3, 1.3);
  }

  function awning(g, P, L) {
    var u, i = 0;
    for (u = 2; u < L - 2; u += 6, i++) {
      var w = Math.min(6, L - 2 - u);
      g.fillStyle = i % 2 ? P.awB : P.awA;
      g.fillRect(u, -24, w, 9);
      g.beginPath(); g.arc(u + w / 2, -15, w / 2, 0, Math.PI); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(2, -24, L - 4, 1);
  }

  function plaque(g, P, b, L) {
    g.fillStyle = P.sign; AH.rr(g, 4, -33, L - 8, 7, 1.5); g.fill();
    g.font = '700 10px ' + SANS;
    var w10 = g.measureText(b.signText).width, fs = Math.min(5.6, (L - 14) / w10 * 10);
    g.font = '700 ' + fs + 'px ' + SANS; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = P.signText; g.fillText(b.signText, L / 2, -29.4);
  }

  function hallFront(g, P, b, L, doorU) {
    g.fillStyle = P.right; g.fillRect(0, -b.groundH, L, 4);
    for (var u = 8; u < L - 4; u += 14) {
      if (Math.abs(u - doorU) < 13) continue;
      g.fillStyle = P.top; g.fillRect(u - 2, -b.groundH + 4, 4, b.groundH - 6);
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(u + 0.8, -b.groundH + 4, 1.2, b.groundH - 6);
    }
  }

  function faceDetail(g, P, b, which, rng) {
    var L = (which === 'R' ? b.h : b.w) * 32, H = b.H, night = P.isNight;
    var isDoor = (which === 'R') === (b.side === 'x');
    var doorU = isDoor ? b.doorU : -999;
    faceOpen(g, b.x0, b.y0, b.x1, b.y1, E, which);
    g.beginPath(); g.rect(0, -H, L, H); g.clip();
    if (b.wall === 'ink') { g.fillStyle = P.ink; g.fillRect(0, -H, L, H); }
    else if (b.wall === 'dots') { g.fillStyle = AH.pattern(g, AH.dotTile(4.5, 0.7, P.dot, P.dotA * 0.9)); g.fillRect(0, -H, L, H); }
    else if (b.wall === 'hatch') { g.fillStyle = AH.pattern(g, AH.hatchTile(5, 0.8, P.dot, P.hatchA * 0.5, which === 'R' ? 1 : -1)); g.fillRect(0, -H, L, H); }
    g.fillStyle = night ? 'rgba(255,255,255,0.1)' : 'rgba(10,10,10,0.3)'; g.fillRect(0, -3, L, 3);
    g.strokeStyle = night ? 'rgba(255,255,255,0.14)' : 'rgba(10,10,10,0.22)'; g.lineWidth = 0.8;
    for (var k = 0; k < b.floors - 1; k++) { var y = -b.groundH - k * b.floorH; g.beginPath(); g.moveTo(0, y); g.lineTo(L, y); g.stroke(); }
    var base = 0, f;
    for (f = 0; f < b.floors; f++) {
      var fh = f === 0 ? b.groundH : b.floorH;
      if (f === 0 && b.sign) shopGlass(g, P, b, rng, L, doorU);
      else if (f === 0 && b.kind === 'hall') hallFront(g, P, b, L, doorU);
      else windowsRow(g, P, b, rng, L, -base - fh, fh, f, doorU);
      base += fh;
    }
    if (isDoor) door(g, P, b, doorU);
    if (b.awning) awning(g, P, L);
    if (b.sign && b.signText) plaque(g, P, b, L);
    g.restore();
  }

  function smoke(g, P, p) {
    var r = [2.4, 3.2, 4.2], i;
    for (i = 0; i < 3; i++) {
      g.beginPath(); g.arc(p.x + i * 4 + 2, p.y - 6 - i * 7, r[i], 0, 6.3);
      g.fillStyle = P.isNight ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.96)'; g.fill();
      g.strokeStyle = P.isNight ? 'rgba(255,255,255,0.2)' : 'rgba(10,10,10,0.2)'; g.lineWidth = 0.7; g.stroke();
    }
  }

  function tank(g, P, cx, cy, zt) {
    box(g, P, cx - 0.22, cy - 0.22, cx + 0.22, cy + 0.22, zt, zt + 5);
    var c = I(cx, cy, zt + 5);
    g.fillStyle = P.left; g.fillRect(c.x - 7, c.y - 13, 7, 13);
    g.fillStyle = P.right; g.fillRect(c.x, c.y - 13, 7, 13);
    g.beginPath(); g.ellipse(c.x, c.y, 7, 3.5, 0, 0, Math.PI); g.fillStyle = P.right; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.7;
    [4, 9].forEach(function (d) { g.beginPath(); g.ellipse(c.x, c.y - d, 7, 3.5, 0, 0, Math.PI); g.stroke(); });
    g.beginPath(); g.ellipse(c.x, c.y - 13, 7, 3.5, 0, 0, 6.3); g.fillStyle = P.top; g.fill();
  }

  function clockFace(g, P, cx, cy) {
    g.beginPath(); g.arc(cx, cy, 4.6, 0, 6.3); g.fillStyle = '#fff'; g.fill();
    g.strokeStyle = P.isNight ? '#050505' : P.ink; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - 1.2, cy - 2.7); g.moveTo(cx, cy); g.lineTo(cx + 2.2, cy + 0.4); g.stroke();
  }

  function roofExtras(g, P, b, rng) {
    var Zt = E + b.H, x0 = b.x0, y0 = b.y0, x1 = b.x1, y1 = b.y1, i, cx, cy;
    switch (b.roof) {
      case 'chimney':
        cx = x0 + rng.range(0.3, b.w - 0.7); cy = y0 + rng.range(0.3, b.h - 0.7);
        box(g, P, cx, cy, cx + 0.28, cy + 0.28, Zt, Zt + 14); smoke(g, P, I(cx + 0.14, cy + 0.14, Zt + 14));
        break;
      case 'tank':
        cx = x0 + rng.range(0.6, b.w - 0.6); cy = y0 + rng.range(0.6, b.h - 0.6); tank(g, P, cx, cy, Zt);
        break;
      case 'sawtooth': {
        var step = (b.h - 0.8) / 3;
        for (i = 0; i < 3; i++) box(g, P, x0 + 0.4, y0 + 0.4 + i * step, x1 - 0.4, y0 + 0.4 + i * step + step * 0.7, Zt, Zt + 7);
        break;
      }
      case 'ac':
        cx = x0 + rng.range(0.4, b.w - 1.2); cy = y0 + rng.range(0.4, b.h - 1);
        box(g, P, cx, cy, cx + 0.6, cy + 0.45, Zt, Zt + 6); box(g, P, cx + 0.8, cy + 0.1, cx + 1.3, cy + 0.5, Zt, Zt + 5);
        break;
      case 'stepped': {
        box(g, P, x0 + 0.35, y0 + 0.35, x1 - 0.35, y1 - 0.35, Zt, Zt + 10);
        var tx0 = x0 + 1.4, ty0 = y0 + 1.4, tx1 = x1 - 1.4, ty1 = y1 - 1.4, tz = Zt + 10;
        box(g, P, tx0, ty0, tx1, ty1, tz, tz + 24);
        ['R', 'L'].forEach(function (w) { var L = faceOpen(g, tx0, ty0, tx1, ty1, tz, w); clockFace(g, P, L / 2, -14); g.restore(); });
        var fp = I((tx0 + tx1) / 2, (ty0 + ty1) / 2, tz + 24);
        g.strokeStyle = P.isNight ? '#EEE' : P.ink; g.lineWidth = 1; g.beginPath(); g.moveTo(fp.x, fp.y); g.lineTo(fp.x, fp.y - 11); g.stroke();
        g.fillStyle = P.isNight ? '#EEE' : P.ink; g.beginPath(); g.moveTo(fp.x, fp.y - 11); g.lineTo(fp.x + 6, fp.y - 9); g.lineTo(fp.x, fp.y - 7); g.closePath(); g.fill();
        break;
      }
    }
  }

  art.building = function (b, mode) {
    var key = b.id + mode;
    if (cache[key]) return cache[key];
    var P = AH.PAL[mode], night = mode === 'night', rng = new AH.RNG(b.seed);
    var Zt = E + b.H, extra = b.roofExtra + (b.kind === 'hall' ? 22 : 0) + 10;
    var minX = (b.x0 - b.y1) * 32, maxX = (b.x1 - b.y0) * 32;
    var minY = (b.x0 + b.y0) * 16 - Zt - extra, maxY = (b.x1 + b.y1) * 16 - E;
    var padL = 10, padR = 30, padT = 8, padB = 24;
    var s = mkSS(maxX - minX + padL + padR, maxY - minY + padT + padB), g = s.g;
    g.translate(padL - minX, padT - minY);
    g.lineJoin = 'round';
    castShadow(g, P, boxHull(b.x0, b.y0, b.x1, b.y1, E, Zt), 7, 9, 8, night ? 0.5 : 0.26);
    box(g, P, b.x0, b.y0, b.x1, b.y1, E, Zt);
    // roof texture + parapet
    var topPts = [I(b.x0, b.y0, Zt), I(b.x1, b.y0, Zt), I(b.x1, b.y1, Zt), I(b.x0, b.y1, Zt)];
    g.fillStyle = AH.pattern(g, AH.dotTile(6, 0.8, P.dot, night ? 0.14 : 0.13)); AH.poly(g, topPts); g.fill();
    var ins = 0.14, inPts = [I(b.x0 + ins, b.y0 + ins, Zt), I(b.x1 - ins, b.y0 + ins, Zt), I(b.x1 - ins, b.y1 - ins, Zt), I(b.x0 + ins, b.y1 - ins, Zt)];
    g.strokeStyle = night ? 'rgba(255,255,255,0.16)' : 'rgba(10,10,10,0.14)'; g.lineWidth = 0.7; AH.poly(g, inPts); g.stroke();
    faceDetail(g, P, b, 'R', rng);
    faceDetail(g, P, b, 'L', rng);
    roofExtras(g, P, b, rng);
    return (cache[key] = { c: s.c, ox: minX - padL, oy: minY - padT });
  };

  art.makeSpecimen = function (kind, seed) {
    var rng = new AH.RNG(seed), s = AH.buildingSpec(kind, rng);
    var names = { home: 'Marlow House', flat: 'Vance Flats', office: 'Brandt Assurance', shop: 'Corner Grocer', cafe: "Marlow's Café", print: 'Quill & Ledger', hall: 'City Hall', warehouse: 'Freight Shed' };
    var b = { id: 'spec' + kind + seed, x0: 0, y0: 0, x1: 3, y1: 3, w: 3, h: 3, side: 'y', doorU: 48, name: names[kind], seed: seed, kind: kind };
    for (var k in s) b[k] = s[k];
    b.H = b.groundH + (b.floors - 1) * b.floorH;
    b.signText = b.sign ? b.name.toUpperCase() : null;
    return b;
  };

  /* ---------- trees ---------- */
  art.tree = function (t, mode) {
    var key = 't' + t.kind + t.seed + mode;
    if (cache[key]) return cache[key];
    var P = AH.PAL[mode], night = mode === 'night', rng = new AH.RNG(t.seed);
    var W = 60, H = 84, fx = 30, fy = 70, s = mkSS(W, H), g = s.g;
    var sc = t.s || 1;
    g.translate(fx, fy); g.scale(sc, sc);
    g.fillStyle = 'rgba(0,0,0,' + (night ? 0.28 : 0.1) + ')';
    g.beginPath(); g.ellipse(4, 1.5, 13, 5, 0, 0, 6.3); g.fill();
    g.fillStyle = 'rgba(0,0,0,' + (night ? 0.3 : 0.12) + ')';
    g.beginPath(); g.ellipse(3.5, 1.2, 9.5, 3.6, 0, 0, 6.3); g.fill();
    var trunk = night ? '#9A9A9A' : '#0A0A0A', shade = night ? { c: '#000000', a: 0.4 } : { c: '#FFFFFF', a: 0.5 };
    var sd1 = rng.int(1, 1e9), sd2 = rng.int(1, 1e9), cv, th, cy;
    if (t.kind === 'pine') {
      g.fillStyle = trunk; g.fillRect(-1.2, -6, 2.4, 6);
      cv = inkShape(36, 44, P.blob, shade, function (c) {
        for (var i = 0; i < 3; i++) {
          var w = 15 - i * 3.2, y0 = 40 - i * 11;
          c.beginPath(); c.moveTo(18, y0 - 15); c.lineTo(18 + w, y0); c.lineTo(18 - w, y0); c.closePath(); c.fill(); c.lineWidth = 2; c.stroke();
        }
      });
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.drawImage(cv, -18 + 1.6, -6 - 44 + 2.2 + 3, 36, 44);
      g.drawImage(cv, -18, -6 - 44 + 3, 36, 44);
    } else {
      th = t.kind === 'lolli' ? 14 : 8; var rx = t.kind === 'lolli' ? 8.5 : 11.5, ry = t.kind === 'lolli' ? 8.5 : 10;
      g.fillStyle = trunk; g.fillRect(-1.2, -th, 2.4, th);
      var bw = rx * 2 + 8, bh = ry * 2 + 8;
      cv = inkShape(bw, bh, P.blob, shade, function (c) { AH.blobPath(c, bw / 2, bh / 2, rx, ry, new AH.RNG(sd1), 0.13, 11); c.fill(); });
      var bs = inkShape(bw, bh, '#000', { c: '#000', a: 0 }, function (c) { AH.blobPath(c, bw / 2, bh / 2, rx, ry, new AH.RNG(sd1), 0.13, 11); c.fill(); });
      cy = -(th + ry - 1);
      g.globalAlpha = night ? 0.5 : 0.22; g.drawImage(bs, -bw / 2 + 1.6, cy - bh / 2 + 2.4, bw, bh); g.globalAlpha = 1;
      g.drawImage(cv, -bw / 2, cy - bh / 2, bw, bh);
    }
    return (cache[key] = { c: s.c, ox: -fx * 1 + 0, oy: -fy, sc: 1 });
  };

  /* ---------- lamps ---------- */
  art.drawLamp = function (g, x, y, nf) {
    var p = I(x, y, 0);
    var ink = AH.pc('ink', nf), post = nf > 0.5 ? '#CFCFCF' : '#0A0A0A';
    if (nf > 0.02) {
      g.save(); g.translate(p.x, p.y - 20); g.scale(1, 0.55);
      var gr = g.createRadialGradient(0, 0, 1, 0, 0, 44);
      gr.addColorStop(0, 'rgba(255,255,255,' + (0.34 * nf) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 44, 0, 6.3); g.fill(); g.restore();
    }
    g.fillStyle = 'rgba(0,0,0,' + (0.14 * (1 - nf * 0.6)) + ')'; g.beginPath(); g.ellipse(p.x + 2.5, p.y + 1, 4, 1.8, 0, 0, 6.3); g.fill();
    g.strokeStyle = post; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - 20); g.stroke();
    g.beginPath(); g.arc(p.x, p.y - 22, 3.2, 0, 6.3); g.fillStyle = '#fff'; g.fill();
    g.strokeStyle = nf > 0.5 ? '#fff' : '#0A0A0A'; g.lineWidth = 1.2; g.stroke();
  };

  /* ---------- figures (cut-paper people) ---------- */
  art.drawFigure = function (g, o) {
    var night = o.nf > 0.5, st = o.style;
    var ol = (st === 0 && night) ? '#F4F4F4' : '#0A0A0A';
    var fl = st === 0 ? '#0A0A0A' : '#FFFFFF';
    var sy = o.sy || 0;
    g.save();
    g.translate(o.x, o.y);
    g.globalAlpha = o.alpha == null ? 1 : o.alpha;
    // shadow
    g.fillStyle = 'rgba(0,0,0,' + (night ? 0.4 : 0.2) + ')'; g.beginPath(); g.ellipse(1.8, 0.8, 4.6, 1.8, 0, 0, 6.3); g.fill();
    if (o.selected) {
      g.save(); g.scale(1, 0.5); g.strokeStyle = night ? '#fff' : '#0A0A0A'; g.lineWidth = 1.3;
      g.setLineDash([3, 2.6]); g.lineDashOffset = -o.t * 6; g.beginPath(); g.arc(0, 0, 10.5, 0, 6.3); g.stroke(); g.restore();
    }
    g.scale(o.dir || 1, 1);
    g.lineCap = 'round'; g.lineJoin = 'round';
    var ph = o.phase || 0, a = o.moving ? Math.sin(ph) * 0.62 : 0, bob = o.moving ? -Math.abs(Math.sin(ph)) * 0.9 : Math.sin(o.t * 2 + st) * 0.25;
    function limb(x0, y0, x1, y1, w) {
      g.strokeStyle = ol; g.lineWidth = w + 1.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = fl; g.lineWidth = w - 0.1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    var hipY, shY;
    if (o.sit) {
      hipY = -4; shY = -9.5; bob = Math.sin(o.t * 1.6 + st) * 0.2;
      limb(0, hipY, 4.6, hipY, 1.7); limb(4.6, hipY, 4.6, 0, 1.7);
      limb(0, hipY, 3.6, hipY + 0.3, 1.7);
      limb(0.4, shY + bob, 3.6, shY + 3.8 + bob, 1.4);
    } else {
      hipY = -6 + bob; shY = -11.2 + bob;
      limb(0, hipY, Math.sin(a) * 5.4, hipY + Math.cos(a) * 5.4 - bob * 0.0, 1.8);
      limb(0, hipY, Math.sin(-a) * 5.4, hipY + Math.cos(a) * 5.4, 1.8);
      limb(0, shY, Math.sin(-a * 1.2) * 4.6, shY + Math.cos(a) * 4.4, 1.4);
    }
    // torso
    g.beginPath(); AH.rr(g, -2.7, shY - 0.6, 5.4, hipY - shY + 1.8, 2.2);
    g.fillStyle = fl; g.fill();
    if (st === 2) { g.fillStyle = AH.pattern(g, AH.dotTile(2.4, 0.6, '#0A0A0A', 0.85), 0.25 * 1); g.fill(); }
    g.strokeStyle = ol; g.lineWidth = 1.3; g.stroke();
    // far arm in front for walking (second arm)
    if (!o.sit) limb(0, shY, Math.sin(a * 1.2) * 4.6, shY + Math.cos(a) * 4.4, 1.4);
    // head
    var hy = shY - 3.4;
    g.beginPath(); g.arc(0.5, hy, 2.9, 0, 6.3); g.fillStyle = st === 0 ? '#0A0A0A' : '#fff'; g.fill(); g.strokeStyle = ol; g.lineWidth = 1.3; g.stroke();
    g.fillStyle = ol;
    if (o.acc === 'bun') { g.beginPath(); g.arc(-2.1, hy - 2.1, 1.7, 0, 6.3); g.fill(); }
    else if (o.acc === 'cap') {
      g.beginPath(); g.arc(0.5, hy - 0.4, 3.1, Math.PI, 0); g.closePath(); g.fill();
      g.fillRect(1, hy - 0.8, 4.2, 1.1);
    } else {
      g.beginPath(); g.arc(0.3, hy, 3.5, Math.PI * 0.9, Math.PI * 2.1); g.lineTo(-2.4, hy + 3.2); g.lineTo(-3.4, hy + 0.5); g.closePath(); g.fill();
    }
    g.restore();
  };

  /* ---------- the paper board (ground, streets, raised block sheets, park) ---------- */
  art.board = function (world, mode) {
    var key = 'board' + world.seed + mode;
    if (cache[key]) return cache[key];
    var P = AH.PAL[mode], N = world.N, T = 12, night = mode === 'night', K = world.K;
    var ox = -580, oy = -70, W = 1160, H = 512 + T + 70 + 60;
    var s = mkSS(W, H), g = s.g;
    g.translate(-ox, -oy); g.lineJoin = 'round'; g.lineCap = 'round';
    var edge = night ? 'rgba(255,255,255,0.16)' : 'rgba(10,10,10,0.2)';
    function tileD(x, y, z) { return [I(x, y, z), I(x + 1, y, z), I(x + 1, y + 1, z), I(x, y + 1, z)]; }
    castShadow(g, P, AH.hull([I(0, 0, 0), I(N, 0, 0), I(N, N, 0), I(0, N, 0), I(N, 0, -T), I(N, N, -T), I(0, N, -T)]), 10, 22, 16, night ? 0.6 : 0.3);
    // card edge of the board
    AH.poly(g, [I(N, N, 0), I(N, 0, 0), I(N, 0, -T), I(N, N, -T)]); g.fillStyle = P.slabR; g.fill();
    AH.poly(g, [I(0, N, 0), I(N, N, 0), I(N, N, -T), I(0, N, -T)]); g.fillStyle = P.slabL; g.fill();
    g.strokeStyle = night ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.2)'; g.lineWidth = 0.7;
    [1, 2, 3].forEach(function (k) {
      g.beginPath(); g.moveTo(I(N, N, -k * 3).x, I(N, N, -k * 3).y); g.lineTo(I(N, 0, -k * 3).x, I(N, 0, -k * 3).y); g.stroke();
      g.beginPath(); g.moveTo(I(0, N, -k * 3).x, I(0, N, -k * 3).y); g.lineTo(I(N, N, -k * 3).x, I(N, N, -k * 3).y); g.stroke();
    });
    // street level
    var topPts = [I(0, 0, 0), I(N, 0, 0), I(N, N, 0), I(0, N, 0)];
    AH.poly(g, topPts); g.fillStyle = P.ground; g.fill();
    g.save(); g.globalAlpha = night ? 0.3 : 0.4; g.fillStyle = AH.pattern(g, AH.grainTile(5), 0.6); AH.poly(g, topPts); g.fill(); g.restore();
    var ST = [0, 5, 10, 15], r, c, i;
    // intersections: halftone screens
    g.fillStyle = AH.pattern(g, AH.dotTile(5, 0.95, P.dot, night ? 0.2 : 0.22));
    ST.forEach(function (rr) { ST.forEach(function (cc) { AH.poly(g, tileD(cc, rr, 0)); g.fill(); }); });
    g.strokeStyle = edge; g.lineWidth = 0.7;
    ST.forEach(function (rr) { ST.forEach(function (cc) { AH.poly(g, tileD(cc, rr, 0)); g.stroke(); }); });
    // dashed centre lines
    g.strokeStyle = P.dash; g.lineWidth = 1.6; g.lineCap = 'butt';
    ST.forEach(function (st) {
      for (i = 0; i < N; i++) {
        if (ST.indexOf(i) >= 0) continue;
        var a = I(st + 0.5, i + 0.2, 0), b = I(st + 0.5, i + 0.8, 0);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        a = I(i + 0.2, st + 0.5, 0); b = I(i + 0.8, st + 0.5, 0);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    });
    g.lineCap = 'round';
    // street names, printed flat on the paper
    function streetText(txt, x, y, dir) {
      g.save(); var p = I(x, y, 0); g.translate(p.x, p.y); g.transform(1, dir === 'x' ? 0.5 : -0.5, 0, 1, 0, 0);
      g.font = '700 6px ' + SANS; g.textAlign = 'center'; g.textBaseline = 'middle';
      if ('letterSpacing' in g) g.letterSpacing = '2px';
      g.fillStyle = night ? 'rgba(255,255,255,0.5)' : 'rgba(10,10,10,0.42)'; g.fillText(txt.toUpperCase(), 0, 0);
      g.restore();
    }
    streetText(world.streetNames.row[0], 3, 5.5, 'x'); streetText(world.streetNames.row[1], 8, 10.5, 'x');
    streetText(world.streetNames.col[0], 5.5, 3, 'y'); streetText(world.streetNames.col[1], 10.5, 8, 'y');
    // raised paper sheets (blocks)
    var covered = new Uint8Array(N * N);
    world.buildings.forEach(function (b) { for (var yy = b.y0; yy < b.y1; yy++) for (var xx = b.x0; xx < b.x1; xx++) covered[yy * N + xx] = 1; });
    world.blocks.forEach(function (bl) {
      var x0 = bl.x0, y0 = bl.y0;
      castShadow(g, P, boxHull(x0, y0, x0 + 4, y0 + 4, 0, E), 4, 5, 5, night ? 0.55 : 0.24);
      box(g, P, x0, y0, x0 + 4, y0 + 4, 0, E, { top: bl.park ? P.park : P.block, left: P.blockL, right: P.blockR });
      var tx, ty;
      for (ty = y0; ty < y0 + 4; ty++) for (tx = x0; tx < x0 + 4; tx++) {
        if (covered[ty * N + tx]) continue;
        var kind = world.tileKind(tx, ty), walk = world.walk[ty * N + tx];
        AH.poly(g, tileD(tx, ty, E));
        g.fillStyle = (bl.park && walk) ? P.path : P.park; g.fill();
        if (!(bl.park && walk)) { g.fillStyle = AH.pattern(g, AH.dotTile(4, 0.7, P.dot, night ? 0.2 : 0.2)); g.fill(); }
        g.strokeStyle = edge; g.lineWidth = 0.6; g.stroke();
      }
    });
    // fountain
    var fc = I(8, 8, E), rx = 56, ry = 28;
    g.beginPath(); g.ellipse(fc.x, fc.y + 4, rx, ry, 0, 0, 6.3); g.fillStyle = P.slabR; g.fill();
    g.beginPath(); g.ellipse(fc.x, fc.y, rx, ry, 0, 0, 6.3); g.fillStyle = P.path; g.fill(); g.strokeStyle = P.ink === '#050505' ? '#E4E4E4' : '#0A0A0A'; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.ellipse(fc.x, fc.y, rx - 9, ry - 4.5, 0, 0, 6.3); g.fillStyle = night ? '#101010' : '#FFFFFF'; g.fill();
    g.fillStyle = AH.pattern(g, AH.dotTile(3.4, 0.75, P.dot, night ? 0.5 : 0.5)); g.fill();
    g.strokeStyle = night ? 'rgba(255,255,255,0.6)' : 'rgba(10,10,10,0.55)'; g.lineWidth = 0.8;
    [0.55, 0.32].forEach(function (k) { g.beginPath(); g.ellipse(fc.x, fc.y, (rx - 9) * k, (ry - 4.5) * k, 0, 0, 6.3); g.stroke(); });
    g.fillStyle = night ? '#E4E4E4' : '#0A0A0A'; g.beginPath(); g.ellipse(fc.x, fc.y, 4.5, 2.4, 0, 0, 6.3); g.fill();
    g.lineWidth = 1.2; g.strokeStyle = night ? '#fff' : '#0A0A0A';
    [-9, 0, 9].forEach(function (d) { g.beginPath(); g.moveTo(fc.x, fc.y - 2); g.quadraticCurveTo(fc.x + d * 0.8, fc.y - 20, fc.x + d * 1.6, fc.y - 6); g.stroke(); });
    // benches
    var bc = night ? '#D8D8D8' : '#0A0A0A';
    world.benches.forEach(function (bn) {
      var x = bn.x, y = bn.y, ns = bn.dir === 'n' || bn.dir === 's';
      var o = { top: bc, left: bc, right: bc };
      if (ns) {
        box(g, P, x + 0.2, y + 0.4, x + 0.8, y + 0.6, E, E + 4, o);
        var by = bn.dir === 'n' ? y + 0.26 : y + 0.66; box(g, P, x + 0.2, by, x + 0.8, by + 0.08, E + 4, E + 8, o);
      } else {
        box(g, P, x + 0.4, y + 0.2, x + 0.6, y + 0.8, E, E + 4, o);
        var bx = bn.dir === 'w' ? x + 0.26 : x + 0.66; box(g, P, bx, y + 0.2, bx + 0.08, y + 0.8, E + 4, E + 8, o);
      }
    });
    // print details on the board edge
    g.font = '700 5.5px ' + SANS; g.textBaseline = 'middle'; if ('letterSpacing' in g) g.letterSpacing = '1.5px';
    g.fillStyle = night ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
    g.save(); g.translate(I(0, N, 0).x, I(0, N, 0).y); g.transform(1, 0.5, 0, 1, 0, 0); g.textAlign = 'left'; g.fillText('AFTERHOURS  ·  DISTRICT 01', 10, 6.5); g.restore();
    g.save(); g.translate(I(N, N, 0).x, I(N, N, 0).y); g.transform(1, -0.5, 0, 1, 0, 0); g.textAlign = 'right'; g.fillText('CITY No. ' + world.seed, 118 * 4.3, 6.5); g.restore();
    return (cache[key] = { c: s.c, ox: ox, oy: oy });
  };

  /* ---------- backdrop: big pale discs, hatch + dot patches, ink blobs (screen space, parallax) ---------- */
  art.backdrop = function (mode) {
    var key = 'bd' + mode;
    if (cache[key]) return cache[key];
    var W = 2200, H = 1900, night = mode === 'night', c = mk(W, H), g = c.getContext('2d'), rng = new AH.RNG(4242);
    g.fillStyle = night ? '#0B0B0B' : '#F1F1F1'; g.fillRect(0, 0, W, H);
    g.fillStyle = night ? '#141414' : '#E7E7E7'; g.beginPath(); g.arc(W * 0.28, H * 0.66, 540, 0, 6.3); g.fill();
    g.fillStyle = night ? '#111111' : '#EBEBEB'; g.beginPath(); g.arc(W * 0.8, H * 0.22, 380, 0, 6.3); g.fill();
    g.save(); AH.rr(g, 160, 150, 540, 380, 48); g.clip();
    g.fillStyle = AH.pattern(g, AH.hatchTile(9, 1, night ? '#FFFFFF' : '#0A0A0A', night ? 0.16 : 0.4, 1)); g.fillRect(0, 0, W, H); g.restore();
    g.save(); AH.rr(g, 1560, 1240, 470, 380, 48); g.clip();
    g.fillStyle = AH.pattern(g, AH.dotTile(11, 1.7, night ? '#FFFFFF' : '#0A0A0A', night ? 0.2 : 0.4)); g.fillRect(0, 0, W, H); g.restore();
    function blob(cx, cy, rx, ry, col, wob) {
      var t = mk(rx * 2.7, ry * 2.7), tg = t.getContext('2d');
      AH.blobPath(tg, t.width / 2, t.height / 2, rx, ry, rng, wob, 11); tg.fillStyle = col; tg.fill();
      tg.globalCompositeOperation = 'source-atop'; tg.globalAlpha = night ? 0.25 : 0.5;
      tg.fillStyle = tg.createPattern(AH.grainTile(11), 'repeat'); tg.fillRect(0, 0, t.width, t.height);
      g.drawImage(t, cx - t.width / 2, cy - t.height / 2);
    }
    blob(W * 0.84, H * 0.84, 440, 360, night ? '#262626' : '#0A0A0A', 0.17);
    blob(W * 0.1, H * 0.12, 170, 150, night ? '#1E1E1E' : '#0A0A0A', 0.2);
    blob(W * 0.5, H * 0.04, 120, 80, night ? '#1A1A1A' : '#0A0A0A', 0.2);
    g.save(); g.globalAlpha = 0.5; g.fillStyle = AH.pattern(g, AH.grainTile(3), 0.9); g.fillRect(0, 0, W, H); g.restore();
    return (cache[key] = c);
  };
})();

/* AFTERHOURS — templated speech. Lines are assembled from the kind of encounter, who is speaking (their strongest trait),
   how the two feel about each other, and an optional memory callback. Fully deterministic: no generated text. */
(function () {
  'use strict';
  var AH = window.AH;
  var TR = ['ambition', 'honesty', 'sociability', 'greed', 'temper'];

  var L = {
    greet: {
      d: ['{tod}, {o}.', 'Oh, hello {o}.', '{o}. Fancy seeing you here.'],
      sociability: ['{o}! Just who I hoped to see!', 'There you are, {o}! Come, sit.'],
      temper: ['{o}. What is it now?', 'Hm. {o}.'],
      honesty: ['Hello, {o}. Honestly, good to see you.', '{o}. Plainly put: nice to see you.'],
      ambition: ['{o}, good timing. I have plans.', '{o}. I have a minute. Just one.'],
      greed: ['{o}! How is business?', '{o}. Not cheap round here, is it?']
    },
    cold: { d: ['{o}.', 'Oh. It is you.', '{o}. Did not expect you here.'], temper: ['You again.', '{o}. Of all places.'], honesty: ['{o}. I will not pretend I am thrilled.'] },
    warm: { d: ['{o}! My favourite person today.', 'Look who it is! Hello, {o}.', '{o}! Just what the day needed.'], sociability: ['{o}!! Come here, tell me everything.'], temper: ['{o}. You are the one person I do not mind.'] },
    topic: {
      d: ['Lovely light today.', 'Quiet day, really.', 'Did the bells sound odd to you?', 'I keep losing my pencil.', 'They say the weather turns tomorrow.'],
      sociability: ['Everyone is talking about the new awning.', 'I heard three bits of gossip before breakfast.'],
      temper: ['The noise on this street is something else.', 'Someone left a cart in my way again.'],
      honesty: ['I will not pretend today has been easy.', 'Truthfully, I would rather be here than at work.'],
      ambition: ['Between us, I am up for something bigger.', 'I have been rearranging my whole week.'],
      greed: ['Rents are going up, I am told.', 'I saw a lovely coat. It costs a fortune.']
    },
    farewell: {
      d: ['Well, back to it.', 'See you around, {o}.', 'I should go. Take care.'],
      sociability: ['Do not be a stranger, {o}!'], temper: ['Right. I am off.'], ambition: ['Must run. Things to build.'], greed: ['Time is money. Bye, {o}.'], honesty: ['It was good talking. Truly.']
    },
    joke: {
      d: ['I told the pigeon my plans. It left.', 'I bought a clock. Now I am late for something else.', 'Why was the clerk calm? Everything was filed.'],
      sociability: ['A man walks into a bakery. He says nothing, it is a tragedy.'], greed: ['I invest in puns. High risk, low return.'], temper: ['I tried yoga. The mat started it.']
    },
    laugh: { d: ['Ha! Stop it, my sides.', 'Oh, that is terrible. Tell it again.', 'Ha! You always get me.'], sociability: ['Ha ha ha! I will be repeating that all week.'] },
    ask: { d: ['{o}, could you spare a hand with something?', 'I am in a bit of a jam, {o}.'], greed: ['{o}, I am short this week. Could you help?'], ambition: ['{o}, I need a favour for something important.'] },
    offer: { d: ['Of course. Leave it with me.', 'Say no more. I will sort it.'], honesty: ['Happy to. No strings.'], sociability: ['Anything for you, {o}!'] },
    thanks: { d: ['You are a lifesaver, {o}.', 'I owe you one.'], honesty: ['I mean it: thank you.'], temper: ['Hm. Thanks. I mean that.'] },
    snipe: {
      d: ['You are late again, {o}.', 'Did you really have to say that, {o}?', 'Is this your idea of manners?'],
      temper: ['I have had quite enough of you, {o}.', 'Do not look at me like that.'], honesty: ['I will say it to your face, {o}: that was unfair.'], ambition: ['You keep getting in my way, {o}.'], greed: ['You still owe me, {o}.']
    },
    retort: { d: ['Oh, that is rich, coming from you.', 'Do not start with me.', 'At least I try.'], temper: ['Say that again. Go on.'], sociability: ['Everyone says you are impossible, you know.'] },
    escalate: { d: ['You always do this.', 'I am done being polite.', 'Say that again, I dare you.'], temper: ['Enough! I will not be spoken to like that!'] },
    huff: { d: ['Hmph. We are finished here.', 'Forget it. Just forget it.', 'I am leaving.'], honesty: ['I said what I meant. Good day.'] },
    cbGood: { d: ['Still smiling about {pl}.', 'Remember {pl}? That was a good one.'] },
    cbBad: { d: ['Not another {pl} like last time, I hope.', 'I have not forgotten {pl}.'] }
  };

  function flavor(ch) {
    var best = null, v = 0.7;
    TR.forEach(function (k) { if (ch.traits[k] > v) { v = ch.traits[k]; best = k; } });
    return best;
  }
  function pick(cat, ch, rng, vars) {
    var set = L[cat], f = flavor(ch), arr = (f && set[f] && rng.chance(0.65)) ? set[f] : set.d;
    var s = rng.pick(arr);
    return s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }
  function tod(min) { var h = (min % 1440) / 60; return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'; }

  // kind: chat | laugh | favour | argument. pair = [A, B] characters. ctx: {pl, minute, rel:[ab, ba], cb:{good:bool,pl}|null, giver:0|1}
  AH.dialogue = {
    make: function (kind, pair, ctx, rng) {
      var A = pair[0], B = pair[1];
      function v(s, o) { return { o: o.first, pl: ctx.pl, tod: tod(ctx.minute) }; }
      function say(w, cat, extra) {
        var sp = w === 0 ? A : B, ot = w === 0 ? B : A, vars = v(null, ot);
        if (extra) for (var k in extra) vars[k] = extra[k];
        return { who: sp.id, text: pick(cat, sp, rng, vars) };
      }
      var a = ctx.rel[0], b = ctx.rel[1], cold = Math.max(a.r, b.r) > 0.4 || (a.a + b.a) / 2 < -0.2, warm = (a.a + b.a) / 2 > 0.35;
      var first = (A.traits.temper + A.traits.sociability * 0.2 > B.traits.temper + B.traits.sociability * 0.2) ? 0 : 1;
      var out = [], sec = 1 - first;
      var greetCat = cold ? 'cold' : warm ? 'warm' : 'greet';
      if (kind === 'chat') {
        out.push(say(first, greetCat)); out.push(say(sec, 'topic'));
        if (ctx.cb) out.push(say(first, ctx.cb.good ? 'cbGood' : 'cbBad', { pl: ctx.cb.pl }));
        else out.push(say(first, 'topic'));
        out.push(say(sec, 'farewell'));
      } else if (kind === 'laugh') {
        out.push(say(first, greetCat)); out.push(say(sec, 'joke')); out.push(say(first, 'laugh'));
        if (ctx.cb && ctx.cb.good) out.push(say(sec, 'cbGood', { pl: ctx.cb.pl }));
        out.push(say(sec, 'farewell'));
      } else if (kind === 'favour') {
        var g = ctx.giver, r = 1 - g;
        out.push(say(r, 'ask')); out.push(say(g, 'offer')); out.push(say(r, 'thanks')); out.push(say(g, 'farewell'));
      } else {
        if (ctx.cb && !ctx.cb.good) out.push(say(first, 'cbBad', { pl: ctx.cb.pl }));
        out.push(say(first, 'snipe')); out.push(say(sec, 'retort')); out.push(say(first, 'escalate')); out.push(say(sec, 'huff'));
      }
      return out;
    }
  };
})();

/* AFTERHOURS — the clock, the citizens and the day ledger.
   Each in-game day is "settled" in order: plans are made from what people remember and feel, encounters are found from those plans,
   and the outcomes change tomorrow. Everything is seeded, so the same city always has the same history.
   Within a day any moment is still computed directly from that day's plans, so playback stays cheap. */
(function () {
  'use strict';
  var AH = window.AH, E = AH.ISO.E;
  var SPEED = 1.15;   // tiles per game-minute
  var RATE = 1;       // game-minutes per real second (1 game hour per real minute)
  var DAY = 1440, STEP = 2;
  var DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  var FIRST = ['Ada', 'Teo', 'Ines', 'Odile', 'Bram', 'Mina', 'Sol', 'Cass', 'Ravi', 'Noor', 'Pim', 'Hana', 'Jory', 'Lena'];
  var LASTN = ['Quill', 'Marlow', 'Voss', 'Hartigan', 'Okafor', 'Brandt', 'Pell', 'Lind', 'Ashby', 'Vance'];
  var BIO_HI = {
    ambition: 'Keeps a ledger of every rung on the ladder.', honesty: 'Cannot tell a lie, and has tried.',
    sociability: 'Knows everyone, and remembers what they said.', greed: 'Counts the coins twice, then once more.',
    temper: 'Slow to boil, but loud when it does.'
  };
  var BIO_LO = {
    ambition: 'Happy to leave the ladder to others.', honesty: 'Treats the truth as a first draft.',
    sociability: 'Prefers a quiet bench to a loud room.', greed: 'Gives away more than the budget allows.',
    temper: 'Hard to rattle; harder to hurry.'
  };
  var TRAITS = ['ambition', 'honesty', 'sociability', 'greed', 'temper'];
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function r3(x) { return Math.round(x * 1000) / 1000; }

  function relScore(r) { return r.a + 0.35 * (r.t - 0.5) - 0.9 * r.r; }
  function relLabel(r) {
    var s = relScore(r);
    if (r.r > 0.5 && r.a < -0.05) return 'Rival';
    if (s >= 0.55) return 'Close friend';
    if (s >= 0.22) return 'Friendly';
    if (s <= -0.5) return 'Bitter';
    if (s <= -0.15) return 'Wary';
    return r.met ? 'Acquaintance' : 'Stranger';
  }

  function create(world, seed, t0) {
    var rng = new AH.RNG(seed ^ 0x51ed);
    var K = world.K, chars = [], used = {};
    var jobB = [world.print, world.cafe, world.hall];
    var titles = ['Typesetter', 'Baker & owner', 'Records clerk'];
    var lanes = [[0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]];
    var accs = rng.shuffle(['bun', 'cap', 'bob']);
    var i;
    for (i = 0; i < 3; i++) {
      var first, last;
      do { first = rng.pick(FIRST); } while (used[first]);
      used[first] = 1; last = rng.pick(LASTN);
      var tr = {};
      TRAITS.forEach(function (k) { tr[k] = Math.round(rng.range(0.12, 0.96) * 100) / 100; });
      var hi = TRAITS[0], lo = TRAITS[0];
      TRAITS.forEach(function (k) { if (tr[k] > tr[hi]) hi = k; if (tr[k] < tr[lo]) lo = k; });
      chars.push({ id: i, first: first, last: last, name: first + ' ' + last, initial: first[0], job: { title: titles[i], b: jobB[i] }, home: world.homes[i], traits: tr, style: i, acc: accs[i], lane: lanes[i], bio: BIO_HI[hi] + ' ' + BIO_LO[lo], _dir: 1 });
    }
    var N = chars.length;

    /* ---------- state: relationships and memories ---------- */
    function freshState() {
      var s = { rel: [], mem: [], lastGood: [] }, a, b;
      for (a = 0; a < N; a++) {
        s.rel[a] = []; s.mem[a] = []; s.lastGood[a] = -1;
        for (b = 0; b < N; b++) {
          if (a === b) { s.rel[a][b] = null; continue; }
          var ca = chars[a].traits, cb = chars[b].traits;
          s.rel[a][b] = { a: r3(0.12 * (cb.sociability - 0.5) + 0.06 * (ca.sociability - 0.5)), t: r3(0.5 + 0.1 * (cb.honesty - 0.5)), r: r3(0.04 + 0.12 * Math.min(ca.ambition, cb.ambition)), met: 0 };
        }
      }
      return s;
    }
    function cloneState(s) {
      var o = { rel: [], mem: [], lastGood: s.lastGood.slice() }, a, b;
      for (a = 0; a < N; a++) {
        o.rel[a] = []; o.mem[a] = s.mem[a].map(function (m) { var c = {}; for (var k in m) c[k] = m[k]; return c; });
        for (b = 0; b < N; b++) { var r = s.rel[a][b]; o.rel[a][b] = r ? { a: r.a, t: r.t, r: r.r, met: r.met } : null; }
      }
      return o;
    }
    function applyEvent(s, ev) {
      ev.dl.forEach(function (d) {
        var r = s.rel[d.from][d.to];
        // diminishing returns: the closer a bond is to its limit, the less one more event moves it
        var da = d.da > 0 ? d.da * (1 - Math.max(0, r.a) * 0.85) : d.da * (1 - Math.max(0, -r.a) * 0.85);
        var dt = d.dt > 0 ? d.dt * (1 - Math.max(0, r.t - 0.5) * 1.6) : d.dt * (1 - Math.max(0, 0.5 - r.t) * 1.6);
        var dr = d.dr > 0 ? d.dr * (1 - r.r * 0.8) : d.dr;
        r.a = r3(clamp(r.a + da, -1, 1)); r.t = r3(clamp(r.t + dt, 0, 1)); r.r = r3(clamp(r.r + dr, 0, 1)); r.met++;
      });
      ev.mems.forEach(function (m) { var c = {}; for (var k in m) c[k] = m[k]; s.mem[m.owner].push(c); });
      if (ev.tone === 'warm') { s.lastGood[ev.a] = ev.day; s.lastGood[ev.b] = ev.day; }
    }
    function endOfDay(s) {
      var a, b;
      for (a = 0; a < N; a++) {
        for (b = 0; b < N; b++) { var r = s.rel[a][b]; if (!r) continue; r.a = r3(r.a * 0.97); r.r = r3(r.r * 0.92); r.t = r3(0.5 + (r.t - 0.5) * 0.98); }
        s.mem[a].forEach(function (m) { m.s = r3(m.s * 0.86); });
        s.mem[a] = s.mem[a].filter(function (m) { return m.s >= 0.1; }).sort(function (p, q) { return q.s - p.s; }).slice(0, 10);
      }
    }
    function placeW(s, i, key) {
      var sum = 0; s.mem[i].forEach(function (m) { if (m.placeKey === key) sum += m.v * m.s; });
      return clamp(1 + 1.3 * sum, 0.15, 2.6);
    }

    /* ---------- places and routes ---------- */
    function tilePt(tx, ty, ch) {
      return world.tileKind(tx, ty) === K.STREET ? { x: tx + 0.5 + ch.lane[0], y: ty + 0.5 + ch.lane[1] } : { x: tx + 0.5, y: ty + 0.5 };
    }
    function inLoc(b) { return { k: 'in', b: b, name: b.name }; }
    function outLoc(tx, ty, ch, label, extra) {
      var p = tilePt(tx, ty, ch), o = { k: 'out', tx: tx, ty: ty, x: p.x, y: p.y, name: label };
      if (extra) for (var k in extra) o[k] = extra[k];
      return o;
    }
    function keyOf(loc) { return loc.k === 'in' ? 'b:' + loc.b.id : (loc.sit ? 'park' : 'street'); }
    function route(a, b, ch) {
      if (a.k === 'in' && b.k === 'in' && a.b === b.b) return null;
      if (a.k === 'out' && b.k === 'out' && a.tx === b.tx && a.ty === b.ty) return null;
      var from = a.k === 'in' ? a.b.doorTile : { x: a.tx, y: a.ty };
      var to = b.k === 'in' ? b.b.doorTile : { x: b.tx, y: b.ty };
      var tiles = world.findPath(from.x, from.y, to.x, to.y);
      if (!tiles) return null;
      var pts = [], n;
      if (a.k === 'in') pts.push({ x: a.b.doorEdge.x, y: a.b.doorEdge.y });
      tiles.forEach(function (t) { pts.push(tilePt(t[0], t[1], ch)); });
      if (a.k === 'out' && a.sit) pts[0] = { x: a.x, y: a.y };
      if (b.k === 'in') pts.push({ x: b.b.doorEdge.x, y: b.b.doorEdge.y });
      else if (b.sit) pts[pts.length - 1] = { x: b.x, y: b.y };
      var clean = [pts[0]], cum = [0], len = 0;
      for (n = 1; n < pts.length; n++) {
        var d = Math.hypot(pts[n].x - clean[clean.length - 1].x, pts[n].y - clean[clean.length - 1].y);
        if (d < 1e-4) continue;
        len += d; clean.push(pts[n]); cum.push(len);
      }
      if (clean.length < 2) return null;
      return { pts: clean, cum: cum, len: len };
    }
    function wpick(r, opts) {
      var tot = 0, k;
      for (k = 0; k < opts.length; k++) tot += opts[k].w;
      var x = r.next() * tot;
      for (k = 0; k < opts.length; k++) { x -= opts[k].w; if (x <= 0) return opts[k]; }
      return opts[opts.length - 1];
    }

    /* ---------- goals ---------- */
    function goalFor(s, ch, day) {
      var tr = ch.traits, id = ch.id, rivalJ = -1, worst = 0, j;
      for (j = 0; j < N; j++) {
        if (j === id) continue;
        var rr = s.rel[id][j];
        if (rr.r > 0.45 && relScore(rr) < -0.2 && tr.temper > 0.5 && rr.r > worst) { worst = rr.r; rivalJ = j; }
      }
      if (rivalJ >= 0) return { k: 'score', other: rivalJ, text: 'Wants a word with ' + chars[rivalJ].first };
      if (tr.sociability > 0.65 || day - s.lastGood[id] >= 3) return { k: 'company', text: 'Wants some company' };
      if (tr.ambition > 0.7) return { k: 'status', text: 'Wants to get ahead' };
      if (tr.greed > 0.7) return { k: 'money', text: 'Chasing a little money' };
      var bad = s.mem[id].some(function (m) { return m.v < -0.4 && m.s > 0.35; });
      if (tr.sociability < 0.35 || bad) return { k: 'peace', text: 'Wants a quiet life' };
      return { k: 'routine', text: 'Content with the routine' };
    }

    /* ---------- daily plan ---------- */
    function buildPlan(ch, day, st, plans) {
      var r = new AH.RNG(world.seed + ':' + day + ':' + ch.id), tr = ch.traits, id = ch.id;
      var dow = ((day % 7) + 7) % 7, weekend = dow >= 5;
      var legs = [], t = 0, cur = inLoc(ch.home), homeLoc = inLoc(ch.home), workLoc = inLoc(ch.job.b);
      var goal = goalFor(st, ch, day), cafeWorker = ch.job.b === world.cafe;
      function holdLabel() { return cur.k === 'in' ? (cur.b === ch.home ? 'At home' : cur.b === ch.job.b ? 'Working at ' + cur.name : 'At ' + cur.name) : 'Waiting'; }
      function stay(until, label) { if (until > t) { legs.push({ t0: t, t1: until, type: 'stay', loc: cur, label: label }); t = until; } }
      function walk(dest, label) {
        var w = route(cur, dest, ch);
        if (w) { legs.push({ t0: t, t1: t + w.len / SPEED, type: 'walk', pts: w.pts, cum: w.cum, len: w.len, from: cur, to: dest, label: label }); t += w.len / SPEED; }
        cur = dest;
      }
      function parkLoc() { var sp = r.pick(world.spots); return outLoc(Math.floor(sp.x), Math.floor(sp.y), ch, world.parkName, { sit: true, x: sp.x, y: sp.y, face: sp.face }); }

      var wake = Math.round(6 * 60 + 15 - tr.ambition * 50 + r.int(-10, 25) + (weekend ? 90 + r.int(0, 60) : 0));
      stay(wake, 'Asleep at home');
      if (!weekend) {
        stay(wake + r.int(30, 55), 'At home');
        walk(workLoc, 'Walking to ' + workLoc.name);
        stay(12 * 60 + r.int(-15, 25), 'Working at ' + workLoc.name);
        var wPark = (0.35 + tr.sociability * 0.3) * placeW(st, id, 'park') * (cafeWorker ? 2.2 : 1);
        var wCafe = cafeWorker ? 0 : 0.5 * placeW(st, id, 'b:' + world.cafe.id);
        var lunchPark = wpick(r, [{ w: wPark, t: 'park' }, { w: wCafe, t: 'cafe' }]).t === 'park';
        var lunch = lunchPark ? { loc: parkLoc(), label: 'Lunch on a bench in ' + world.parkName } : { loc: inLoc(world.cafe), label: 'Having lunch at ' + world.cafe.name };
        walk(lunch.loc, 'Walking to lunch');
        stay(t + r.int(35, 60), lunch.label);
        walk(workLoc, 'Walking back to ' + workLoc.name);
        stay(17 * 60 + Math.round(tr.ambition * 70) + r.int(0, 25) + (goal.k === 'status' ? 45 : 0), 'Working at ' + workLoc.name);
      } else {
        stay(wake + r.int(20, 40), 'At home');
      }

      var endBy = 22 * 60 + r.int(0, 50), acts = weekend ? 3 : r.int(1, 2) + (goal.k === 'company' ? 1 : 0), a, attempts;
      var shops = world.buildings.filter(function (b) { return (b.kind === 'shop' || b.kind === 'office') && b !== ch.job.b; });
      for (a = 0; a < acts; a++) {
        var done = false;
        for (attempts = 0; attempts < 4 && !done; attempts++) {
          var opts = [], mult = { company: 1.6, peace: 0.8 }[goal.k] || 1;
          opts.push({ w: (0.6 + (1 - tr.sociability) * 0.4) * placeW(st, id, 'park') * (goal.k === 'peace' ? 1.3 : goal.k === 'company' ? 0.8 : 1), t: 'park' });
          opts.push({ w: (0.3 + tr.sociability * 0.5) * placeW(st, id, 'b:' + world.cafe.id) * (goal.k === 'company' ? 1.3 : goal.k === 'peace' ? 0.7 : 1), t: 'cafe' });
          if (shops.length) opts.push({ w: (0.3 + tr.greed * 0.4) * (goal.k === 'money' ? 1.5 : 1), t: 'shop' });
          opts.push({ w: 0.3 * placeW(st, id, 'street'), t: 'lamp' });
          plans.forEach(function (p, j) {
            if (!p || j === id) return;
            var s = relScore(st.rel[id][j]), seekRival = goal.k === 'score' && goal.other === j;
            if (s <= 0.12 && !seekRival) return;
            p.legs.forEach(function (L) {
              if (L.type !== 'stay' || L.t1 - L.t0 < 20 || L.t1 < t + 25 || L.t0 > endBy) return;
              if (L.loc.k === 'in' && L.loc.b === chars[j].home) return;
              opts.push({ w: seekRival ? 3 : (0.4 + 2.2 * s) * mult, t: 'join', j: j, leg: L });
            });
          });
          var pick = wpick(r, opts), loc, dur, label, walkLabel, arrive = null;
          if (pick.t === 'park') { loc = parkLoc(); dur = r.int(40, 90); label = 'Sitting in ' + world.parkName; walkLabel = 'Walking to ' + world.parkName; }
          else if (pick.t === 'cafe') { loc = inLoc(world.cafe); dur = r.int(30, 70); label = 'Having a coffee at ' + world.cafe.name; walkLabel = 'Walking to ' + world.cafe.name; }
          else if (pick.t === 'shop') { var sb = r.pick(shops); loc = inLoc(sb); dur = r.int(15, 40); label = 'Visiting ' + sb.name; walkLabel = 'Walking to ' + sb.name; }
          else if (pick.t === 'lamp') { var lp = r.pick(world.lamps); loc = outLoc(Math.floor(lp.x), Math.floor(lp.y), ch, 'a streetlamp'); dur = r.int(12, 30); label = 'Waiting under a streetlamp'; walkLabel = 'Walking to a streetlamp'; }
          else {
            var L0 = pick.leg, fo = chars[pick.j].first;
            if (L0.loc.k === 'in') loc = inLoc(L0.loc.b);
            else loc = outLoc(L0.loc.tx, L0.loc.ty, ch, L0.loc.name, L0.loc.sit ? { sit: true, x: L0.loc.x + 0.2, y: L0.loc.y - 0.2, face: L0.loc.face } : null);
            label = 'Meeting up with ' + fo; walkLabel = 'Going to find ' + fo; arrive = L0;
          }
          var go = route(cur, loc, ch), back = route(loc, homeLoc, ch), wt = go ? go.len / SPEED : 0, bt = back ? back.len / SPEED : 0, depart = t;
          if (arrive) {
            var arr = Math.max(t + wt, arrive.t0 + 3);
            if (arr > arrive.t1 - 10) continue;
            depart = arr - wt; dur = Math.min(arrive.t1, arr + r.int(25, 60)) - arr;
          }
          if (depart + wt + dur + bt > endBy) { if (arrive) continue; a = acts; break; }
          // keep away from people we dislike
          var clash = false;
          if (!arrive && goal.k !== 'score') {
            plans.forEach(function (p, j) {
              if (!p || j === id || relScore(st.rel[id][j]) >= -0.25) return;
              p.legs.forEach(function (L) { if (L.type === 'stay' && keyOf(L.loc) === keyOf(loc) && L.t0 < depart + wt + dur && L.t1 > depart + wt) clash = true; });
            });
          }
          if (clash) continue;
          stay(depart, holdLabel());
          walk(loc, walkLabel);
          stay(t + dur, label);
          done = true;
        }
      }
      walk(homeLoc, 'Heading home');
      stay(DAY, 'At home');
      return { legs: legs, wake: wake, weekend: weekend, goal: goal };
    }

    /* ---------- where is someone at a given minute of a day ---------- */
    function legState(ch, plan, m, mutate) {
      var legs = plan.legs, idx = 0;
      while (idx < legs.length - 1 && m >= legs[idx].t1) idx++;
      var leg = legs[idx], st = { vis: true, moving: false, sit: false, alpha: 1, dir: ch._dir, walkDist: 0, label: leg.label, inB: null, x: 0, y: 0, z: 0 };
      if (leg.type === 'stay') {
        var loc = leg.loc;
        if (loc.k === 'in') {
          st.vis = false; st.inB = loc.b; st.x = loc.b.doorEdge.x; st.y = loc.b.doorEdge.y; st.z = E;
          if (loc.b === ch.home && (m < plan.wake || m >= 23 * 60)) st.label = 'Asleep at home';
          else if (loc.b === ch.home) st.label = 'At home';
        } else {
          st.x = loc.x; st.y = loc.y; st.sit = !!loc.sit; st.z = world.zAt(st.x, st.y);
          if (st.sit) st.dir = ((8 - st.x) - (8 - st.y)) >= 0 ? 1 : -1;
        }
      } else {
        var s = clamp((m - leg.t0) * SPEED, 0, leg.len), n = 1;
        while (n < leg.cum.length - 1 && leg.cum[n] < s) n++;
        var p0 = leg.pts[n - 1], p1 = leg.pts[n], seg = leg.cum[n] - leg.cum[n - 1], f = seg > 0 ? (s - leg.cum[n - 1]) / seg : 0;
        st.x = p0.x + (p1.x - p0.x) * f; st.y = p0.y + (p1.y - p0.y) * f;
        var sdx = (p1.x - p0.x) - (p1.y - p0.y);
        if (Math.abs(sdx) > 1e-3) { st.dir = sdx > 0 ? 1 : -1; if (mutate) ch._dir = st.dir; }
        st.moving = true; st.walkDist = s;
        var rem = leg.len - s, al = 1;
        if (leg.to.k === 'in' && rem < 0.5) al = Math.min(al, rem / 0.5);
        if (leg.from.k === 'in' && s < 0.5) al = Math.min(al, s / 0.5);
        st.alpha = Math.max(0, al);
        st.z = world.zAt(st.x, st.y) + E * (1 - st.alpha);
        if (leg.to.k === 'in') st.inB = leg.to.b;
      }
      st.leg = leg;
      return st;
    }

    /* ---------- encounters ---------- */
    function parkBlockTile(x, y) { var p = world.park; return x >= p.x0 && x < p.x0 + 4 && y >= p.y0 && y < p.y0 + 4; }
    function detect(plans) {
      var open = {}, out = [], m, a, b;
      function close(key) {
        var o = open[key]; delete open[key];
        if (o.t1 - o.t0 + STEP >= 6) out.push(o);
      }
      for (m = 0; m < DAY; m += STEP) {
        var ss = chars.map(function (ch) { return legState(ch, plans[ch.id], m, false); });
        for (a = 0; a < N; a++) for (b = a + 1; b < N; b++) {
          var A = ss[a], B = ss[b], key = a + '-' + b, co = false, pk = null, pn = null;
          if (!A.vis && !B.vis && A.inB && A.inB === B.inB) { co = true; pk = 'b:' + A.inB.id; pn = A.inB.name; }
          else if (A.vis && B.vis && A.alpha > 0.9 && B.alpha > 0.9 && Math.hypot(A.x - B.x, A.y - B.y) <= 1.4) {
            co = true; var inPark = parkBlockTile(Math.floor(A.x), Math.floor(A.y)); pk = inPark ? 'park' : 'street'; pn = inPark ? world.parkName : 'the street';
          }
          if (co) {
            if (!open[key]) open[key] = { a: a, b: b, t0: m, t1: m, last: m, placeKey: pk, place: pn, sit: A.sit && B.sit };
            else { open[key].t1 = m; open[key].last = m; }
          } else if (open[key] && m - open[key].last > 4) close(key);
        }
      }
      Object.keys(open).forEach(close);
      return out.sort(function (p, q) { return p.t0 - q.t0 || p.a - q.a; });
    }

    var evSeq = 0;
    function mem(owner, other, ev, v, s, text) { return { id: ev.id, owner: owner, other: other, at: ev.at, day: ev.day, kind: ev.kind, placeKey: ev.placeKey, place: ev.place, v: v, s: s, text: text }; }
    function resolve(enc, s, day, idx, goals) {
      var A = chars[enc.a], B = chars[enc.b], ta = A.traits, tb = B.traits, a = enc.a, b = enc.b;
      var rab = s.rel[a][b], rba = s.rel[b][a], r = new AH.RNG(world.seed + ':enc:' + day + ':' + idx);
      var d = enc.t1 - enc.t0 + STEP, scale = Math.min(1, d / 25);
      var riv = Math.max(rab.r, rba.r), aff = (rab.a + rba.a) / 2, soc = (ta.sociability + tb.sociability) / 2, tmp = (ta.temper + tb.temper) / 2;
      var seeking = (goals[a].k === 'score' && goals[a].other === b) || (goals[b].k === 'score' && goals[b].other === a);
      var fric = clamp(0.05 + 0.26 * tmp + 0.3 * riv - 0.14 * aff + (seeking ? 0.35 : 0), 0.03, 0.85);
      var warm = clamp(0.3 + 0.35 * soc + 0.3 * Math.max(0, aff) - 0.2 * riv, 0.1, 0.9);
      var kind, u = r.next(), giver = -1;
      if (u < fric) kind = 'argument';
      else {
        var w = r.next();
        giver = ta.greed - ta.honesty * 0.4 < tb.greed - tb.honesty * 0.4 ? 0 : 1;
        var gt = giver === 0 ? ta : tb;
        if (w < warm * 0.45) kind = 'laugh';
        else if (w < warm * 0.62 && gt.greed < 0.6 && riv < 0.35) kind = 'favour';
        else kind = 'chat';
      }
      var ev = { id: ++evSeq, day: day, at: day * DAY + enc.t0, end: day * DAY + enc.t1, a: a, b: b, kind: kind, placeKey: enc.placeKey, place: enc.place, inside: enc.placeKey.charAt(0) === 'b', dl: [], mems: [], lines: [] };
      var chatty = aff >= 0.1 || ta.sociability + tb.sociability > 1.1;
      ev.tone = kind === 'argument' ? 'tense' : (kind === 'chat' && !chatty) ? 'neutral' : 'warm';
      function dl(from, to, da, dt, dr) { ev.dl.push({ from: from, to: to, da: r3(da * scale), dt: r3(dt * scale), dr: r3(dr * scale) }); }
      function honestyBump(self, other) { return (chars[self].traits.honesty > 0.65 && chars[other].traits.honesty < 0.35) ? -0.03 : (chars[self].traits.honesty > 0.55 && chars[other].traits.honesty > 0.55) ? 0.02 : 0; }
      var pa = A.first, pb = B.first, pl = enc.place, head, verbA, verbB, vA, vB;
      if (kind === 'argument') {
        var inst = ta.temper >= tb.temper ? a : b, oth = inst === a ? b : a;
        dl(a, b, -0.16, -0.06, 0.16); dl(b, a, -0.16, -0.06, 0.16);
        dl(oth, inst, -0.05, -0.1, 0.06);
        head = pa + ' and ' + pb + ' had a row' + (enc.placeKey === 'street' ? ' in the street' : ' at ' + pl);
        verbA = 'Argued with ' + pb; verbB = 'Argued with ' + pa; vA = vB = -0.8;
      } else if (kind === 'laugh') {
        dl(a, b, 0.14, 0.03 + honestyBump(a, b), -0.04); dl(b, a, 0.14, 0.03 + honestyBump(b, a), -0.04);
        head = pa + ' and ' + pb + ' shared a laugh' + (enc.placeKey === 'street' ? ' in the street' : ' at ' + pl);
        verbA = 'Laughed with ' + pb; verbB = 'Laughed with ' + pa; vA = vB = 0.7;
      } else if (kind === 'favour') {
        var rc = 1 - giver;
        dl(rc, giver, 0.16, 0.12, -0.08); dl(giver, rc, 0.05, 0.02, -0.04);
        var gn = chars[giver].first, rn = chars[rc].first;
        head = gn + ' helped ' + rn + (enc.placeKey === 'street' ? ' in the street' : ' at ' + pl);
        verbA = giver === a ? 'Helped ' + pb : 'Was helped by ' + pb; verbB = giver === b ? 'Helped ' + pa : 'Was helped by ' + pa;
        vA = giver === a ? 0.5 : 0.9; vB = giver === b ? 0.5 : 0.9;
      } else {
        var big = d >= 40;
        dl(a, b, 0.08 + 0.05 * tb.sociability, 0.02 + honestyBump(a, b) * 0.5, -0.02); dl(b, a, 0.08 + 0.05 * ta.sociability, 0.02 + honestyBump(b, a) * 0.5, -0.02);
        head = pa + ' and ' + pb + (big ? ' had a long talk' : ' talked') + (enc.placeKey === 'street' ? ' in the street' : ' at ' + pl);
        verbA = 'Chatted with ' + pb; verbB = 'Chatted with ' + pa; vA = vB = chatty ? 0.35 : 0.1;
      }
      var str = r3(0.5 + 0.4 * scale), where = enc.placeKey === 'street' ? ' in the street' : ' at ' + pl;
      ev.mems.push(mem(a, b, ev, vA, str, verbA + where), mem(b, a, ev, vB, str, verbB + where));
      ev.head = head;
      var base = { argument: 1, favour: 0.8, laugh: 0.5, chat: 0.35 }[kind];
      ev.imp = r3(base * (0.4 + 0.6 * scale) * (1 + Math.abs(ev.dl[0].da) * 2));
      // lines of speech, spaced so each bubble can be read
      var pair = [A, B];
      var prev = s.mem[a].filter(function (m) { return m.other === b && m.placeKey === enc.placeKey && m.s > 0.25; }).sort(function (p, q) { return Math.abs(q.v * q.s) - Math.abs(p.v * p.s); })[0];
      var cb = prev && enc.placeKey !== 'street' ? { good: prev.v > 0, pl: pl } : null;
      var txt = AH.dialogue.make(kind, pair, { pl: pl, minute: enc.t0, rel: [rab, rba], cb: cb, giver: giver === b ? 1 : 0 }, r);
      var n = Math.min(txt.length, Math.max(2, Math.floor(d / 5))), gap = Math.max(4, Math.floor((d - 2) / n));
      for (var k = 0; k < n; k++) ev.lines.push({ at: ev.at + 1 + k * gap, who: txt[k].who, text: txt[k].text });
      return ev;
    }

    /* ---------- the ledger ---------- */
    var days = {}, events = [], settled = -1, working = freshState();
    function settleDay(d) {
      var start = cloneState(working);
      var order = new AH.RNG(world.seed + ':ord:' + d).shuffle(chars.map(function (c) { return c.id; }));
      var plans = []; for (var q = 0; q < N; q++) plans.push(null);
      order.forEach(function (id) { plans[id] = buildPlan(chars[id], d, start, plans); });
      var goals = plans.map(function (p) { return p.goal; });
      var evs = [];
      detect(plans).forEach(function (enc, idx) { var ev = resolve(enc, working, d, idx, goals); evs.push(ev); applyEvent(working, ev); });
      endOfDay(working);
      days[d] = { day: d, start: start, plans: plans, events: evs, goals: goals };
      evs.forEach(function (e) { events.push(e); });
      settled = d;
      delete days[d - 3];
    }
    var sim = { world: world, chars: chars, t: t0, seed: seed, RATE: RATE, SPEED: SPEED, DAY: DAY, events: events };
    sim.settled = function () { return settled; };
    sim.ensureDay = function (d) { while (settled < d) settleDay(settled + 1); };
    // settle days in small batches so the screen never freezes; returns true when finished
    sim.catchUp = function (d, budgetMs) {
      var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + budgetMs;
      while (settled < d) {
        settleDay(settled + 1);
        if ((typeof performance !== 'undefined' ? performance.now() : Date.now()) > t1) break;
      }
      return settled >= d;
    };
    sim.advance = function (dt) { sim.t += dt * RATE; };
    function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
    sim.clock = function (t) {
      var day = Math.floor(t / DAY), m = t - day * DAY, hf = m / 60, nf;
      if (hf < 5.5) nf = 1; else if (hf < 7.5) nf = 1 - smooth((hf - 5.5) / 2); else if (hf < 18) nf = 0; else if (hf < 20) nf = smooth((hf - 18) / 2); else nf = 1;
      var hh = Math.floor(hf), mm = Math.floor(m % 60), dow = ((day % 7) + 7) % 7;
      return { day: day, dow: dow, dayName: DOW[dow], hf: hf, nf: nf, str: (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm };
    };
    sim.state = function (ch, t) {
      var d = Math.floor(t / DAY); sim.ensureDay(d);
      return legState(ch, days[d].plans[ch.id], t - d * DAY, true);
    };
    // what everyone knows and feels at minute t (day-start state plus the events that have happened so far)
    sim.view = function (t) {
      var d = Math.floor(t / DAY); sim.ensureDay(d);
      var s = cloneState(days[d].start);
      days[d].events.forEach(function (ev) { if (ev.at <= t) applyEvent(s, ev); });
      return s;
    };
    sim.goal = function (id, t) { var d = Math.floor(t / DAY); sim.ensureDay(d); return days[d].goals[id]; };
    sim.todayLines = function (t) {
      var d = Math.floor(t / DAY); sim.ensureDay(d);
      return days[d].events;
    };
    sim.eventsBetween = function (t0, t1) { return events.filter(function (e) { return e.at > t0 && e.at <= t1; }); };
    sim.thought = function (id, t) {
      var s = sim.view(t), best = null, bv = 0;
      s.mem[id].forEach(function (m) { var w = m.s * Math.abs(m.v); if (w > bv) { bv = w; best = m; } });
      if (!best || bv < 0.25) return '';
      var day = Math.floor(t / DAY), ago = day - best.day, when = ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago + ' days ago';
      return (best.v < 0 ? 'Still bothered: ' : 'Fondly recalls: ') + best.text.charAt(0).toLowerCase() + best.text.slice(1) + ', ' + when;
    };
    sim.ledgerHash = function () {
      var h = 2166136261 >>> 0;
      events.forEach(function (e) {
        var str = e.id + ':' + e.at + ':' + e.kind + ':' + e.a + e.b + ':' + e.placeKey + ':' + e.dl.map(function (x) { return x.da + ',' + x.dt + ',' + x.dr; }).join(';');
        for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      });
      return h >>> 0;
    };
    sim.relLabel = relLabel; sim.relScore = relScore;
    return sim;
  }

  AH.createSim = create;
  AH.TRAIT_KEYS = TRAITS;
  AH.relLabel = relLabel; AH.relScore = relScore;
})();

/* AFTERHOURS — camera, input, rendering loop, UI. */
(function () {
  'use strict';
  var AH = window.AH, art = AH.art, E = AH.ISO.E, SS = art.SS;
  var SAVE_KEY = 'afterhours.v1';
  var DAYLEN = 1440, LINE_DUR = 4, MAX_AWAY = 30 * DAYLEN;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('view'), ctx = canvas.getContext('2d');
  var vw = 0, vh = 0, dpr = 1;
  var world, sim, seed, cam = { x: 0, y: 250, zoom: 1 }, zoomGoal = null;
  var selected = -1, follow = -1, clock, sts = [], lastT = 0;
  var KIND = { home: 'Residence', flat: 'Apartments', office: 'Offices', shop: 'Shop', cafe: 'Café', print: 'Print shop', hall: 'Civic building', warehouse: 'Warehouse' };
  var perf = { scale: 1, ema: 8, lastAdj: 0, ms: 0 };

  /* ---------- helpers ---------- */
  function hhmm(m) { m = ((Math.floor(m) % DAYLEN) + DAYLEN) % DAYLEN; var h = Math.floor(m / 60), n = m % 60; return (h < 10 ? '0' : '') + h + ':' + (n < 10 ? '0' : '') + n; }
  function stamp(at) { return 'D' + (Math.floor(at / DAYLEN) + 1) + ' ' + hhmm(at); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ago(day, now) { var d = Math.floor(now / DAYLEN) - day; return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; }
  function dur(min) {
    var d = Math.floor(min / DAYLEN), h = Math.floor((min % DAYLEN) / 60);
    return d ? d + (d === 1 ? ' day' : ' days') + (h ? ' and ' + h + 'h' : '') : h + (h === 1 ? ' hour' : ' hours');
  }

  /* ---------- save / load ---------- */
  function loadSave() { try { var s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.v === 1 && typeof s.seed === 'number') return s; } catch (e) {} return null; }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, seed: seed, t: sim.t, savedAt: Date.now() })); } catch (e) {} }

  var awayMin = 0, awayFrom = 0;
  function start(newSeed) {
    var saved = newSeed ? null : loadSave();
    seed = newSeed || (saved ? saved.seed : Math.floor(Math.random() * 900000) + 100000);
    var t0 = saved ? saved.t : 7 * 60 + 10;
    awayMin = 0; awayFrom = t0;
    if (saved) { var el = (Date.now() - saved.savedAt) / 1000; if (el > 60) awayMin = Math.min(el * 1, MAX_AWAY); }
    world = AH.generateWorld(seed);
    sim = AH.createSim(world, seed, t0 + awayMin);
    lastT = sim.t;
    sts = [];
    selected = follow = -1;
    bondKey = ''; webPos = null; webSel = null;
  }

  /* ---------- sizing & camera ---------- */
  function resize() {
    var base = Math.min(window.devicePixelRatio || 1, 2.5);
    dpr = Math.max(Math.min(base, 1), base * perf.scale);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
  }
  function clampCam() {
    cam.zoom = Math.max(0.3, Math.min(4, cam.zoom));
    cam.x = Math.max(-560, Math.min(560, cam.x));
    cam.y = Math.max(-60, Math.min(560, cam.y));
  }
  function fit() {
    var portrait = vh > vw;
    cam.x = 0; cam.y = 236;
    cam.zoom = portrait ? Math.max(0.62, Math.min(1.1, vw / 640)) : Math.max(0.5, Math.min(1.5, Math.min(vw / 1120, (vh - 40) / 700)));
    zoomGoal = null;
  }
  function toScreen(wx, wy) { return { x: vw / 2 + (wx - cam.x) * cam.zoom, y: vh / 2 + (wy - cam.y) * cam.zoom }; }
  function toWorld(sx, sy) { return { x: cam.x + (sx - vw / 2) / cam.zoom, y: cam.y + (sy - vh / 2) / cam.zoom }; }
  function zoomAt(f, sx, sy) {
    var w = toWorld(sx, sy);
    cam.zoom = Math.max(0.3, Math.min(4, cam.zoom * f));
    cam.x = w.x - (sx - vw / 2) / cam.zoom; cam.y = w.y - (sy - vh / 2) / cam.zoom;
    zoomGoal = null; clampCam();
  }

  /* ---------- drawing ---------- */
  var bs = [], staticSlots = [], B = 0, vx0 = 0, vx1 = 0, vy0 = 0, vy1 = 0;
  // A thing is drawn before (hidden behind) the first building whose bulk blocks the view ray toward the camera.
  // The ray rises 32 px per tile it travels, so things far behind a building appear above its roofline instead of vanishing.
  function slotFor(x, y, z) {
    for (var i = 0; i < B; i++) {
      var b = bs[i], t0 = Math.max(b.x0 - x, b.y0 - y, 0), t1 = Math.min(b.x1 - x, b.y1 - y);
      if (t1 > t0 + 1e-6 && (z || 0) + 32 * t0 < E + b.H) return i;
    }
    return B;
  }
  function prepareScene() {
    bs = world.buildings.slice().sort(function (a, b) { return (a.x1 + a.y1) - (b.x1 + b.y1) || a.x0 - b.x0; });
    B = bs.length; staticSlots = [];
    for (var i = 0; i <= B; i++) staticSlots.push([]);
    world.trees.forEach(function (t) { staticSlots[slotFor(t.x, t.y, E)].push({ k: 'tree', e: t, key: t.x + t.y }); });
    world.lamps.forEach(function (l) { staticSlots[slotFor(l.x, l.y, 0)].push({ k: 'lamp', e: l, key: l.x + l.y }); });
    staticSlots.forEach(function (a) { a.sort(function (p, q) { return p.key - q.key; }); });
  }
  // performance: anything whose paper lies wholly outside the screen is skipped
  function seen(ox, oy, w, h) { return !(ox > vx1 || ox + w < vx0 || oy > vy1 || oy + h < vy0); }
  function blit(sp, alpha) {
    var w = sp.c.width / SS, h = sp.c.height / SS;
    if (!seen(sp.ox, sp.oy, w, h)) return;
    if (alpha < 0.995) ctx.globalAlpha = alpha;
    ctx.drawImage(sp.c, sp.ox, sp.oy, w, h);
    ctx.globalAlpha = 1;
  }
  function drawDual(getter, e, nf) {
    blit(getter(e, 'day'), 1);
    if (nf > 0.01) blit(getter(e, 'night'), nf);
  }
  function drawTree(t, nf) {
    var d = art.tree(t, 'day'), p = AH.iso(t.x, t.y, E), w = d.c.width / SS, h = d.c.height / SS;
    if (!seen(p.x + d.ox, p.y + d.oy, w, h)) return;
    ctx.drawImage(d.c, p.x + d.ox, p.y + d.oy, w, h);
    if (nf > 0.01) { var n = art.tree(t, 'night'); ctx.globalAlpha = nf; ctx.drawImage(n.c, p.x + n.ox, p.y + n.oy, n.c.width / SS, n.c.height / SS); ctx.globalAlpha = 1; }
  }
  function drawChar(ch, st, nf, now) {
    var p = AH.iso(st.x, st.y, st.z);
    art.drawFigure(ctx, { x: p.x, y: p.y, style: ch.style, acc: ch.acc, dir: st.dir, phase: st.walkDist * 3.1, moving: st.moving, sit: st.sit, nf: nf, alpha: st.alpha, t: now / 1000, selected: selected === ch.id && st.vis });
  }

  function drawBackdrop(nf) {
    var d = art.backdrop('day'), n = nf > 0.01 ? art.backdrop('night') : null;
    var sc = Math.max(1, vw / (d.width - 60), vh / (d.height - 60));
    var mx = (d.width * sc - vw) / 2, my = (d.height * sc - vh) / 2;
    var dx = Math.max(-mx, Math.min(mx, -cam.x * cam.zoom * 0.14)), dy = Math.max(-my, Math.min(my, -(cam.y - 250) * cam.zoom * 0.14));
    var x = vw / 2 - d.width * sc / 2 + dx, y = vh / 2 - d.height * sc / 2 + dy;
    ctx.drawImage(d, x, y, d.width * sc, d.height * sc);
    if (n) { ctx.globalAlpha = nf; ctx.drawImage(n, x, y, d.width * sc, d.height * sc); ctx.globalAlpha = 1; }
  }

  // where a citizen's marker sits on screen; people sharing a building are spread side by side
  var pipOff = [];
  function computePipOffsets() {
    var cnt = {}, idx = [];
    sim.chars.forEach(function (ch, i) { var st = sts[i]; if (st && !st.vis && st.inB) { var k = st.inB.id; idx[i] = cnt[k] || 0; cnt[k] = idx[i] + 1; } });
    sim.chars.forEach(function (ch, i) { var st = sts[i]; pipOff[i] = (st && !st.vis && st.inB) ? (idx[i] - (cnt[st.inB.id] - 1) / 2) * 24 : 0; });
  }
  function pipPos(i) {
    var st = sts[i], p;
    if (st.vis) { var q = AH.iso(st.x, st.y, st.z); p = toScreen(q.x, q.y - 22); }
    else { var q2 = AH.iso(st.x, st.y, E); p = toScreen(q2.x, q2.y - st.inB.H - 10); p.x += pipOff[i] || 0; }
    return p;
  }

  /* speech bubbles: paper cut-outs; conflict is red */
  var bubbles = [];
  function activeBubbles(t) {
    var out = [];
    sim.todayLines(t).forEach(function (ev) {
      if (t < ev.at || t > ev.end + 8) return;
      ev.lines.forEach(function (L) { var age = t - L.at; if (age >= 0 && age < LINE_DUR) out.push({ ev: ev, L: L, age: age }); });
    });
    return out;
  }
  function wrapText(text, maxW) {
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function drawBubble(it, nf) {
    var i = it.L.who, ch = sim.chars[i], p = pipPos(i), sel = selected === i, tense = it.ev.tone === 'tense', night = nf > 0.5;
    var top = sel ? p.y - 22 : p.y - 2;
    var a = Math.max(0, Math.min(1, it.age / 0.4, (LINE_DUR - it.age) / 0.6));
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = 'italic 600 13px ' + art.SERIF;
    var lines = wrapText(it.L.text, 172), tw = 0;
    lines.forEach(function (l) { tw = Math.max(tw, ctx.measureText(l).width); });
    var name = ch.first.toUpperCase();
    ctx.font = '700 9px ' + art.SANS; if ('letterSpacing' in ctx) ctx.letterSpacing = '1.4px';
    var nw = ctx.measureText(name).width;
    var w = Math.max(tw, nw) + 26, h = 14 + lines.length * 17 + 16;
    var bx = Math.max(8, Math.min(vw - 8 - w, p.x - w / 2)), by = Math.max(70, top - 12 - h);
    var fill = tense ? '#C8102E' : night ? '#171717' : '#FFFFFF', edge = tense ? '#7A0A1C' : night ? '#F2F2F2' : '#0A0A0A', fg = tense ? '#FFFFFF' : night ? '#F2F2F2' : '#0A0A0A';
    ctx.fillStyle = night ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.17)'; AH.rr(ctx, bx + 2.5, by + 3.5, w, h, 12); ctx.fill();
    ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = 1.5; AH.rr(ctx, bx, by, w, h, 12); ctx.fill(); ctx.stroke();
    if (by + h < top - 3) {
      var tx = Math.max(bx + 18, Math.min(bx + w - 18, p.x));
      ctx.beginPath(); ctx.moveTo(tx - 6, by + h - 1); ctx.lineTo(p.x, top - 2); ctx.lineTo(tx + 6, by + h - 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx - 6, by + h); ctx.lineTo(p.x, top - 2); ctx.lineTo(tx + 6, by + h); ctx.stroke();
      ctx.fillStyle = fill; ctx.fillRect(tx - 5, by + h - 2, 10, 3);
    }
    ctx.fillStyle = tense ? 'rgba(255,255,255,.8)' : (night ? '#8C8C8C' : '#7A7A7A'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(name, bx + 13, by + 13);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = fg; ctx.font = 'italic 600 13px ' + art.SERIF;
    lines.forEach(function (l, k) { ctx.fillText(l, bx + 13, by + 14 + 15 + k * 17 - 2); });
    ctx.restore();
  }

  function render(now) {
    var nf = clock.nf, z = cam.zoom;
    vx0 = cam.x - vw / (2 * z) - 40; vx1 = cam.x + vw / (2 * z) + 40; vy0 = cam.y - vh / (2 * z) - 40; vy1 = cam.y + vh / (2 * z) + 40;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    drawBackdrop(nf);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * z), dpr * (vh / 2 - cam.y * z));
    drawDual(art.board, world, nf);
    var dyn = {};
    sim.chars.forEach(function (ch, i) {
      var st = sts[i]; if (!st.vis && st.alpha <= 0.02) return;
      var s = slotFor(st.x, st.y, st.z); (dyn[s] = dyn[s] || []).push({ k: 'char', ch: ch, st: st, key: st.x + st.y + 0.001 });
    });
    for (var s = 0; s <= B; s++) {
      var items = staticSlots[s], extra = dyn[s];
      if (extra) { items = items.concat(extra).sort(function (p, q) { return p.key - q.key; }); }
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        if (it.k === 'tree') drawTree(it.e, nf);
        else if (it.k === 'lamp') art.drawLamp(ctx, it.e.x, it.e.y, nf);
        else drawChar(it.ch, it.st, nf, now);
      }
      if (s < B) drawDual(art.building, bs[s], nf);
    }
    // screen-space pips and name tags
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var speaking = {};
    bubbles.forEach(function (b) { speaking[b.L.who] = true; });
    sim.chars.forEach(function (ch, i) {
      var st = sts[i], p = pipPos(i), sel = selected === ch.id;
      if (!sel && (speaking[i] || (cam.zoom > 2.1 && st.vis))) return;
      if (p.x < -30 || p.x > vw + 30 || p.y < -30 || p.y > vh + 30) return;
      ctx.save(); ctx.translate(p.x, p.y);
      var night = nf > 0.5, bg = night ? '#F2F2F2' : '#0A0A0A', fg = night ? '#0A0A0A' : '#FFFFFF';
      if (sel) {
        var label = ch.first.toUpperCase(); ctx.font = '700 10px ' + art.SANS; if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
        var w = ctx.measureText(label).width + 22;
        ctx.fillStyle = bg; AH.rr(ctx, -w / 2, -22, w, 20, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-4, -2.5); ctx.lineTo(0, 3); ctx.lineTo(4, -2.5); ctx.fill();
        ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, -11.5);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      } else {
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, -8, 9, 0, 6.3); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-3.5, -0.5); ctx.lineTo(0, 4); ctx.lineTo(3.5, -0.5); ctx.fill();
        ctx.fillStyle = fg; ctx.font = '800 11px ' + art.SERIF; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch.initial, 0, -7.5);
      }
      ctx.restore();
    });
    bubbles.forEach(function (b) { drawBubble(b, nf); });
  }

  /* ---------- input ---------- */
  var pointers = {}, npt = 0, pinch = null, moved = false, downAt = null;
  function breakFollow() { if (follow >= 0) { follow = -1; syncUI(false); } }
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY }; npt++;
    if (npt === 1) { moved = false; downAt = { x: e.clientX, y: e.clientY }; }
    if (npt === 2) { var k = Object.keys(pointers), a = pointers[k[0]], b = pointers[k[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; moved = true; }
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId]; if (!p) return;
    if (npt === 1) {
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!moved && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) { moved = true; breakFollow(); }
      if (moved) { cam.x -= dx / cam.zoom; cam.y -= dy / cam.zoom; clampCam(); }
    } else if (npt === 2 && pinch) {
      p.x = e.clientX; p.y = e.clientY;
      var k = Object.keys(pointers), a = pointers[k[0]], b = pointers[k[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.d > 0) zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch.d = d; return;
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  function up(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId]; npt = Math.max(0, npt - 1);
    if (npt < 2) pinch = null;
    if (npt === 0 && !moved && e.type === 'pointerup') tap(e.clientX, e.clientY);
  }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY); }, { passive: false });

  var tipT = 0;
  function tip(msg) { var t = $('tip'); t.textContent = msg; t.classList.add('on'); clearTimeout(tipT); tipT = setTimeout(function () { t.classList.remove('on'); }, 2600); }
  function tap(sx, sy) {
    var best = -1, bd = 26;
    sim.chars.forEach(function (ch, i) {
      var st = sts[i], p = pipPos(i), cy = st.vis ? p.y + 8 : p.y - 8;
      var d = Math.hypot(p.x - sx, cy - sy); if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { select(best, true); return; }
    var w = toWorld(sx, sy), hit = null;
    for (var i = B - 1; i >= 0 && !hit; i--) {
      var b = bs[i];
      for (var zz = E + b.H; zz >= E && !hit; zz -= 6) {
        var g = AH.unIso(w.x, w.y, zz);
        if (g.x >= b.x0 && g.x <= b.x1 && g.y >= b.y0 && g.y <= b.y1) hit = b;
      }
    }
    if (hit) tip(hit.name + ' · ' + KIND[hit.kind]);
  }

  var keys = {};
  window.addEventListener('keydown', function (e) {
    if (!$('cover').classList.contains('gone')) return;
    if (anyOverlay()) { if (e.key === 'Escape') closeOverlays(); return; }
    keys[e.key.toLowerCase()] = true;
    if (e.key >= '1' && e.key <= '3') select(+e.key - 1, true);
    else if (e.key === 'Escape') select(-1);
    else if (e.key.toLowerCase() === 'f' && selected >= 0) toggleFollow();
    else if (e.key === '+' || e.key === '=') zoomAt(1.2, vw / 2, vh / 2);
    else if (e.key === '-') zoomAt(1 / 1.2, vw / 2, vh / 2);
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  function keyPan(dt) {
    var dx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0), dy = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
    if (dx || dy) { breakFollow(); cam.x += dx * 520 * dt / cam.zoom; cam.y += dy * 520 * dt / cam.zoom; clampCam(); }
  }

  /* ---------- UI: citizen card ---------- */
  var chipEls = [], uiCache = {}, bondKey = '';
  function setText(id, v) { if (uiCache[id] !== v) { uiCache[id] = v; $(id).textContent = v; } }
  function buildChips() {
    var host = $('chips'); host.innerHTML = ''; chipEls = [];
    sim.chars.forEach(function (ch, i) {
      var b = document.createElement('button'); b.className = 'chip'; b.setAttribute('aria-label', ch.name);
      b.innerHTML = '<div class="av s' + ch.style + '"><span>' + ch.initial + '</span></div><div class="nm">' + ch.first + '</div>';
      b.addEventListener('click', function () { select(selected === i ? -1 : i, true); });
      host.appendChild(b); chipEls.push(b);
    });
  }
  function select(i, andFollow) {
    selected = i; follow = (i >= 0 && andFollow) ? i : -1;
    if (follow >= 0) zoomGoal = Math.max(cam.zoom, 1.9);
    syncUI(true);
  }
  function toggleFollow() { if (selected < 0) return; follow = follow === selected ? -1 : selected; if (follow >= 0) zoomGoal = Math.max(cam.zoom, 1.9); syncUI(false); }
  var focus = { x: 0, y: 0 };
  function updateFocus() {
    var r = $('sheet').getBoundingClientRect(), open = selected >= 0;
    if (!open) { focus.x = vw / 2; focus.y = vh / 2; }
    else if (vw >= 900) { focus.x = (r.right + vw) / 2; focus.y = vh / 2; }
    else { focus.x = vw / 2; focus.y = (56 + r.top) / 2; }
  }
  function meter(label, v, lo, hot) {
    // lo = true: value runs -1..1 from the centre; otherwise 0..1 from the left
    var l = lo ? (v >= 0 ? 50 : 50 + v * 50) : 0, w = lo ? Math.abs(v) * 50 : v * 100;
    return '<div class="meter' + (hot ? ' neg' : '') + '"><span>' + label + '</span><i style="--l:' + l.toFixed(1) + '%;--w:' + w.toFixed(1) + '%"></i></div>';
  }
  function isHot(label) { return label === 'Rival' || label === 'Bitter'; }
  function refreshCard(force) {
    if (selected < 0) return;
    var ch = sim.chars[selected], t = sim.t, g = sim.goal(ch.id, t), s = sim.view(t);
    setText('dGoal', g.text);
    var th = sim.thought(ch.id, t), te = $('dThought');
    if (uiCache.th !== th) { uiCache.th = th; te.hidden = !th; te.textContent = th; te.classList.toggle('bad', th.indexOf('Still bothered') === 0); }
    var h = '', key = selected + '|';
    sim.chars.forEach(function (o) {
      if (o.id === ch.id) return;
      var r = s.rel[ch.id][o.id], lab = AH.relLabel(r);
      key += lab + r.a + r.t + r.r + '|';
      h += '<button class="bond" data-b="' + o.id + '"><span class="who">' + esc(o.first) + ' ' + esc(o.last) + '</span><span class="lbl' + (isHot(lab) ? ' hot' : '') + '">' + lab + '</span>' +
        '<span class="bars">' + meter('AFFINITY', r.a, true, r.a < -0.25) + meter('TRUST', r.t, false, r.t < 0.35) + meter('RIVALRY', r.r, false, r.r > 0.45) + '</span></button>';
    });
    if (force || key !== bondKey) { bondKey = key; $('dBonds').innerHTML = h; }
  }
  function syncUI(full) {
    updateFocus(); setTimeout(updateFocus, 420);
    chipEls.forEach(function (c, i) { c.classList.toggle('on', i === selected); });
    $('sheet').classList.toggle('open', selected >= 0);
    $('followBtn').classList.toggle('on', follow >= 0 && follow === selected);
    $('followTxt').textContent = (follow >= 0 && follow === selected) ? 'FOLLOWING' : 'FOLLOW';
    if (selected >= 0 && full) {
      var ch = sim.chars[selected];
      $('dName').textContent = ch.name; $('dJob').textContent = ch.job.title + ' · ' + ch.job.b.name; $('dBio').textContent = ch.bio;
      var h = '';
      AH.TRAIT_KEYS.forEach(function (k) {
        var n = Math.round(ch.traits[k] * 8), d = '';
        for (var q = 0; q < 8; q++) d += '<b' + (q < n ? ' class="f"' : '') + '></b>';
        h += '<div class="tr"><span>' + k + '</span><span class="dots">' + d + '</span></div>';
      });
      $('dTraits').innerHTML = h;
      uiCache.th = null; $('detail').scrollTop = 0;
      refreshCard(true);
    }
  }
  $('dBonds').addEventListener('click', function (e) {
    var b = e.target.closest('.bond'); if (b) openWeb(selected, +b.getAttribute('data-b'));
  });
  function updateUI() {
    setText('dayTxt', 'DAY ' + (clock.day + 1) + ' · ' + clock.dayName);
    setText('timeTxt', clock.str);
    var night = clock.nf > 0.5;
    if (night !== document.body.classList.contains('night')) {
      document.body.classList.toggle('night', night);
      var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', night ? '#0B0B0B' : '#F1F1F1');
    }
    if (selected >= 0 && sts[selected]) setText('dNow', sts[selected].label);
  }

  /* ---------- red toast on conflict ---------- */
  var alertT = 0, alertEv = null;
  function showAlert(ev) {
    var el = $('alert'); alertEv = ev;
    $('alertTxt').textContent = ev.head;
    el.hidden = false; void el.offsetWidth; el.classList.add('on');
    clearTimeout(alertT); alertT = setTimeout(hideAlert, 7500);
  }
  function hideAlert() { var el = $('alert'); el.classList.remove('on'); clearTimeout(alertT); alertT = setTimeout(function () { el.hidden = true; }, 350); }
  $('alert').addEventListener('click', function () { if (alertEv) select(alertEv.a, true); hideAlert(); });

  /* ---------- away report ---------- */
  function topEvents(from, to) {
    var evs = sim.eventsBetween(from, to).filter(function (e) { return e.at <= to; });
    var pick = evs.slice().sort(function (p, q) { return q.imp - p.imp || p.at - q.at; }).slice(0, 4).sort(function (p, q) { return p.at - q.at; });
    return { all: evs.length, pick: pick };
  }
  function fillAway(listEl, from, to) {
    var r = topEvents(from, to); listEl.innerHTML = '';
    r.pick.forEach(function (ev) {
      var li = document.createElement('li'); if (ev.tone === 'tense') li.className = 'hot';
      li.innerHTML = '<time>' + stamp(ev.at) + '</time><span>' + esc(ev.head) + '</span>';
      listEl.appendChild(li);
    });
    return r;
  }
  function awayOverlay(from, to) {
    var r = fillAway($('awayOvList'), from, to);
    $('awayOvSub').textContent = dur(to - from) + ' passed · ' + (r.all ? r.all + (r.all === 1 ? ' thing' : ' things') + ' happened' : 'a quiet stretch');
    if (!r.all) $('awayOvList').innerHTML = '<li><time></time><span>Nothing much. Everyone carried on.</span></li>';
    closeOverlays(); $('awayOv').hidden = false;
  }

  /* ---------- ledger (history) overlay ---------- */
  var histFilter = -1;
  function openHist() {
    closeOverlays(); histFilter = -1; buildHist(); $('hist').hidden = false;
  }
  function buildHist() {
    var f = $('histFilters'); f.innerHTML = '';
    [{ id: -1, n: 'Everyone' }].concat(sim.chars.map(function (c) { return { id: c.id, n: c.first }; })).forEach(function (o) {
      var b = document.createElement('button'); b.className = 'fl' + (histFilter === o.id ? ' on' : ''); b.textContent = o.n;
      b.addEventListener('click', function () { histFilter = o.id; buildHist(); }); f.appendChild(b);
    });
    var evs = sim.events.filter(function (e) { return e.at <= sim.t && (histFilter < 0 || e.a === histFilter || e.b === histFilter); }).slice().reverse().slice(0, 160);
    var out = '', day = -1;
    evs.forEach(function (ev) {
      var d = Math.floor(ev.at / DAYLEN);
      if (d !== day) { day = d; out += '<div class="hday">DAY ' + (d + 1) + ' · ' + ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][((d % 7) + 7) % 7] + '</div>'; }
      out += '<details class="hrow ' + ev.tone + '"><summary><time>' + hhmm(ev.at) + '</time><i class="dot ' + ev.tone + '"></i><span>' + esc(ev.head) + '</span></summary><div class="say">';
      ev.lines.forEach(function (L) { out += '<div><b>' + esc(sim.chars[L.who].first.toUpperCase()) + '</b>' + esc(L.text) + '</div>'; });
      out += '</div></details>';
    });
    $('histList').innerHTML = out || '<p class="hempty">Nothing has happened yet. Give the city a few hours.</p>';
  }

  /* ---------- relationship web ---------- */
  var webPos = null, webSel = null, webT = 0;
  function pairScore(s, i, j) { return (AH.relScore(s.rel[i][j]) + AH.relScore(s.rel[j][i])) / 2; }
  function layoutWeb(s) {
    var n = sim.chars.length, i, j, it, P = [];
    for (i = 0; i < n; i++) P.push({ x: 210 + 90 * Math.cos(6.2832 * i / n - 1.5708), y: 150 + 90 * Math.sin(6.2832 * i / n - 1.5708), fx: 0, fy: 0 });
    for (it = 0; it < 320; it++) {
      P.forEach(function (p) { p.fx = (210 - p.x) * 0.01; p.fy = (150 - p.y) * 0.01; });
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        var dx = P[j].x - P[i].x, dy = P[j].y - P[i].y, d = Math.max(8, Math.hypot(dx, dy)), ux = dx / d, uy = dy / d;
        var L = 150 - 80 * Math.max(-1, Math.min(1, pairScore(s, i, j))), f = (d - L) * 0.06 - 2600 / (d * d);
        P[i].fx += ux * f; P[i].fy += uy * f; P[j].fx -= ux * f; P[j].fy -= uy * f;
      }
      var cool = 0.6 * (1 - it / 340);
      P.forEach(function (p) { p.x += Math.max(-8, Math.min(8, p.fx)) * cool; p.y += Math.max(-8, Math.min(8, p.fy)) * cool; });
    }
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    P.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
    var sc = Math.min(1.8, 330 / Math.max(40, x1 - x0), 170 / Math.max(40, y1 - y0));
    webPos = P.map(function (p) { return { x: 210 + (p.x - (x0 + x1) / 2) * sc, y: 150 + (p.y - (y0 + y1) / 2) * sc }; });
  }
  function openWeb(a, b) {
    webSel = (a == null || a < 0) ? null : (b == null ? { a: a } : { a: a, b: b });
    closeOverlays(); layoutWeb(sim.view(sim.t)); renderWeb(); $('web').hidden = false;
    clearInterval(webT); webT = setInterval(function () { if ($('web').hidden) clearInterval(webT); else renderWeb(); }, 1500);
  }
  function renderWeb() {
    var s = sim.view(sim.t), n = sim.chars.length, i, j, svg = '';
    var sel = webSel, focusPair = sel && sel.b != null;
    svg += '<defs><pattern id="wdots" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" style="fill:var(--card)"/><circle cx="3" cy="3" r="1.1" style="fill:var(--ink)"/></pattern></defs>';
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var ra = s.rel[i][j], rb = s.rel[j][i], sc = pairScore(s, i, j), bad = sc < -0.12 || Math.max(ra.r, rb.r) > 0.5, la = AH.relLabel(ra), lb = AH.relLabel(rb);
      var dim = sel && !(sel.b != null ? (sel.a === i && sel.b === j) || (sel.a === j && sel.b === i) : (sel.a === i || sel.a === j));
      var A = webPos[i], Bp = webPos[j], mid = { x: (A.x + Bp.x) / 2, y: (A.y + Bp.y) / 2 };
      // sit the label beside its line, on the side away from the middle of the web, so it never lands on a person
      var ex = Bp.x - A.x, ey = Bp.y - A.y, el = Math.max(1, Math.hypot(ex, ey)), nx = -ey / el, ny = ex / el, cx = 0, cy = 0;
      webPos.forEach(function (q) { cx += q.x / n; cy += q.y / n; });
      if ((mid.x - cx) * nx + (mid.y - cy) * ny > 0) { nx = -nx; ny = -ny; }   // labels tuck inside the triangle, names sit outside
      mid = { x: mid.x + nx * 16, y: mid.y + ny * 16 + 3 };
      var lab = AH.relLabel({ a: (ra.a + rb.a) / 2, t: (ra.t + rb.t) / 2, r: Math.max(ra.r, rb.r), met: ra.met + rb.met }), asym = la !== lb;
      svg += '<g data-a="' + i + '" data-b="' + j + '"><line class="tie' + (bad ? ' bad' : '') + (dim ? ' dim' : '') + '" x1="' + A.x.toFixed(1) + '" y1="' + A.y.toFixed(1) + '" x2="' + Bp.x.toFixed(1) + '" y2="' + Bp.y.toFixed(1) + '" style="stroke-width:' + (1.5 + 4.5 * Math.min(1, Math.abs(sc))).toFixed(1) + '"/>' +
        '<line class="hit" x1="' + A.x.toFixed(1) + '" y1="' + A.y.toFixed(1) + '" x2="' + Bp.x.toFixed(1) + '" y2="' + Bp.y.toFixed(1) + '"/>' +
        '<text class="tl' + (bad ? ' bad' : '') + (dim ? ' dim' : '') + '" x="' + mid.x.toFixed(1) + '" y="' + mid.y.toFixed(1) + '">' + esc(lab) + (asym ? ' *' : '') + '</text></g>';
    }
    sim.chars.forEach(function (ch, k) {
      var p = webPos[k], dim = sel && (focusPair ? !(sel.a === k || sel.b === k) : false), on = sel && (sel.a === k || sel.b === k);
      var fill = ch.style === 0 ? 'var(--ink)' : ch.style === 1 ? 'var(--card)' : 'url(#wdots)', fg = ch.style === 0 ? 'var(--paper)' : 'var(--ink)';
      svg += '<g class="node' + (dim ? ' dim' : '') + '" data-n="' + k + '"><circle class="c" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (on ? 27 : 23) + '" style="fill:' + fill + '"/>' +
        '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 1).toFixed(1) + '" style="fill:' + fg + '">' + ch.initial + '</text>' +
        '<text class="nm" x="' + p.x.toFixed(1) + '" y="' + (p.y + (p.y > 150 ? 42 : -36)).toFixed(1) + '">' + esc(ch.first.toUpperCase()) + '</text></g>';
    });
    $('webSvg').innerHTML = svg;
    var h = '';
    if (!sel) h = '<p class="hint">Tap a person to see how they feel about everyone, or a line to see the memories behind that tie. A dashed red line means trouble. A star means the two feel differently about each other.</p>';
    else if (!focusPair) {
      var me = sim.chars[sel.a];
      h = '<h3>' + esc(me.name) + '</h3><div class="sub" style="margin:4px 0 10px">' + esc(me.job.title) + ' · ' + esc(sim.goal(me.id, sim.t).text) + '</div>';
      sim.chars.forEach(function (o) {
        if (o.id === me.id) return;
        var r1 = s.rel[me.id][o.id], r2 = s.rel[o.id][me.id], l1 = AH.relLabel(r1), l2 = AH.relLabel(r2);
        h += '<button class="bond" data-t="' + o.id + '" style="margin-bottom:6px"><span class="who">' + esc(o.name) + '</span><span class="lbl' + (isHot(l1) ? ' hot' : '') + '">' + l1 + '</span>' +
          '<span class="bars" style="font:11px/1.4 var(--sans);letter-spacing:.08em;color:var(--mute)">' + esc(o.first) + ' sees ' + esc(me.first) + ' as: ' + l2 + '</span></button>';
      });
    } else {
      var A2 = sim.chars[sel.a], B2 = sim.chars[sel.b];
      h = '<h3>' + esc(A2.first) + ' &amp; ' + esc(B2.first) + '</h3>';
      [[A2, B2], [B2, A2]].forEach(function (pr) {
        var r = s.rel[pr[0].id][pr[1].id], lab = AH.relLabel(r);
        h += '<div class="dir"><div class="t"><span>' + esc(pr[0].first) + ' &rarr; ' + esc(pr[1].first) + '</span><em class="' + (isHot(lab) ? 'hot' : '') + '"' + (isHot(lab) ? ' style="color:var(--alert)"' : '') + '>' + lab + '</em></div><div class="bars" style="display:flex;gap:10px">' +
          meter('AFFINITY', r.a, true, r.a < -0.25) + meter('TRUST', r.t, false, r.t < 0.35) + meter('RIVALRY', r.r, false, r.r > 0.45) + '</div></div>';
      });
      var mems = [];
      [[A2, B2], [B2, A2]].forEach(function (pr) { s.mem[pr[0].id].forEach(function (m) { if (m.other === pr[1].id) mems.push(m); }); });
      mems.sort(function (p, q) { return q.s - p.s; });
      h += '<div class="sec" style="margin-top:14px">BEHIND IT</div>';
      if (!mems.length) h += '<p class="hint">No lasting memories yet. They have barely crossed paths, or it has all faded.</p>';
      mems.slice(0, 8).forEach(function (m) {
        h += '<div class="mem' + (m.v < 0 ? ' bad' : '') + '" style="opacity:' + (0.45 + 0.55 * Math.min(1, m.s)).toFixed(2) + '"><span>' + esc(sim.chars[m.owner].first) + ' remembers: ' + esc(m.text.charAt(0).toLowerCase() + m.text.slice(1)) + '</span><small>' + ago(m.day, sim.t) + '</small></div>';
      });
    }
    if (uiCache.webH !== h) { uiCache.webH = h; $('webPanel').innerHTML = h; }
  }
  $('webSvg').addEventListener('click', function (e) {
    var g = e.target.closest('g'); if (!g) return;
    if (g.hasAttribute('data-n')) { var n = +g.getAttribute('data-n'); webSel = (webSel && webSel.b == null && webSel.a === n) ? null : { a: n }; }
    else if (g.hasAttribute('data-a')) webSel = { a: +g.getAttribute('data-a'), b: +g.getAttribute('data-b') };
    uiCache.webH = null; renderWeb();
  });
  $('webPanel').addEventListener('click', function (e) {
    var b = e.target.closest('.bond'); if (!b || !webSel) return;
    webSel = { a: webSel.a, b: +b.getAttribute('data-t') }; uiCache.webH = null; renderWeb();
  });
  $('web').querySelector('.sub').addEventListener('click', function () { webSel = null; uiCache.webH = null; renderWeb(); });

  /* ---------- overlays & specimens ---------- */
  var OVER = ['menu', 'spec', 'hist', 'web', 'awayOv'];
  function anyOverlay() { return OVER.some(function (id) { return !$(id).hidden; }); }
  function closeOverlays() { OVER.forEach(function (id) { $(id).hidden = true; }); }
  function buildSpecimens() {
    var grid = $('specGrid'); grid.innerHTML = '';
    var sd = Math.floor(Math.random() * 1e6);
    ['hall', 'cafe', 'print', 'shop', 'office', 'flat', 'home', 'warehouse'].forEach(function (k, i) {
      var b = art.makeSpecimen(k, sd + i * 77), cell = document.createElement('div'); cell.className = 'sp';
      var d = art.building(b, 'day'), n = art.building(b, 'night');
      var w = d.c.width / SS, h = d.c.height / SS, c = document.createElement('canvas'); c.width = w * 2; c.height = h; var g = c.getContext('2d');
      g.drawImage(d.c, 0, 0, w, h); g.drawImage(n.c, w, 0, w, h);
      c.style.width = '100%'; cell.appendChild(c);
      var s = document.createElement('small'); s.textContent = KIND[k]; cell.appendChild(s); grid.appendChild(cell);
    });
    ['round', 'lolli', 'pine'].forEach(function (k, i) {
      var t = { kind: k, seed: sd + i * 31, s: 1.3 }, d = art.tree(t, 'day'), n = art.tree(t, 'night'), cell = document.createElement('div'); cell.className = 'sp';
      var w = d.c.width / SS, h = d.c.height / SS, c = document.createElement('canvas'); c.width = w * 2; c.height = h; var g = c.getContext('2d');
      g.drawImage(d.c, 0, 0, w, h); g.drawImage(n.c, w, 0, w, h); cell.appendChild(c);
      var s = document.createElement('small'); s.textContent = 'Tree · ' + k; cell.appendChild(s); grid.appendChild(cell);
    });
    var fc = document.createElement('div'); fc.className = 'sp';
    var c2 = document.createElement('canvas'); c2.width = 330; c2.height = 110; var g2 = c2.getContext('2d');
    [0, 1, 2].forEach(function (st) {
      [0, 1].forEach(function (nt) {
        g2.save(); g2.fillStyle = nt ? '#171717' : '#F1F1F1'; g2.fillRect(st * 55 + nt * 0, nt * 55, 55, 55); g2.restore();
        g2.save(); g2.scale(2.2, 2.2); art.drawFigure(g2, { x: (st * 55 + 27) / 2.2, y: (nt * 55 + 46) / 2.2, style: st, acc: ['bun', 'cap', 'bob'][st], dir: 1, phase: 1.1, moving: true, nf: nt, t: 0 }); g2.restore();
      });
    });
    [0, 1, 2].forEach(function (st) {
      g2.save(); g2.fillStyle = '#F1F1F1'; g2.fillRect(165 + st * 55, 0, 55, 55); g2.scale(2.2, 2.2); art.drawFigure(g2, { x: (165 + st * 55 + 27) / 2.2, y: 46 / 2.2, style: st, acc: ['bun', 'cap', 'bob'][st], dir: 1, sit: true, nf: 0, t: 0 }); g2.restore();
    });
    fc.appendChild(c2); var s2 = document.createElement('small'); s2.textContent = 'Citizens · walking, sitting'; fc.appendChild(s2); grid.appendChild(fc);
  }

  /* ---------- performance budget ---------- */
  var showFps = /fps/.test(location.hash);
  function adapt(now, work) {
    perf.ms = work; perf.ema += (work - perf.ema) * 0.06;
    if (showFps) { $('fps').hidden = false; $('fps').textContent = perf.ema.toFixed(1) + ' ms · dpr ' + dpr.toFixed(2); }
    if (now - perf.lastAdj < 3000) return;
    var base = Math.min(window.devicePixelRatio || 1, 2.5);
    if (perf.ema > 13 && dpr > 1.01) { perf.scale = Math.max(1 / base, perf.scale - 0.2); perf.lastAdj = now; resize(); }
    else if (perf.ema < 5 && perf.scale < 1) { perf.scale = Math.min(1, perf.scale + 0.2); perf.lastAdj = now; resize(); }
  }

  /* ---------- boot & loop ---------- */
  var last = 0, lastSave = 0, ready = false, lastCard = 0, hiddenAt = 0;
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!ready) { requestAnimationFrame(frame); return; }
    var t0 = performance.now();
    var covered = !$('cover').classList.contains('gone');
    if (!covered) sim.advance(dt);
    clock = sim.clock(sim.t);
    if (clock.hf > 22.5) sim.catchUp(clock.day + 1, 3);       // settle tomorrow before midnight so the turn of the day never stutters
    for (var i = 0; i < sim.chars.length; i++) sts[i] = sim.state(sim.chars[i], sim.t);
    computePipOffsets();
    if (sim.t > lastT && !covered) {
      sim.todayLines(sim.t).forEach(function (ev) { if (ev.kind === 'argument' && ev.at > lastT && ev.at <= sim.t) showAlert(ev); });
    }
    lastT = sim.t;
    bubbles = covered ? [] : activeBubbles(sim.t);
    keyPan(dt);
    if (follow >= 0 && sts[follow]) {
      var st = sts[follow], b = AH.iso(st.x, st.y, st.vis ? st.z : E), ty = b.y - (st.vis ? 8 : (st.inB ? st.inB.H * 0.4 : 8)), k = Math.min(1, dt * 4.5);
      cam.x += (b.x - (focus.x - vw / 2) / cam.zoom - cam.x) * k; cam.y += (ty - (focus.y - vh / 2) / cam.zoom - cam.y) * k;
    }
    if (zoomGoal != null) { cam.zoom += (zoomGoal - cam.zoom) * Math.min(1, dt * 4); if (Math.abs(zoomGoal - cam.zoom) < 0.01) zoomGoal = null; }
    clampCam();
    render(now); updateUI();
    if (now - lastCard > 500) { lastCard = now; refreshCard(false); }
    if (now - lastSave > 5000) { lastSave = now; save(); }
    adapt(now, performance.now() - t0);
    requestAnimationFrame(frame);
  }

  // cut every sprite once, behind the cover, so nothing stutters when the city first appears
  function warmTasks() {
    var tasks = [function () { art.board(world, 'day'); }, function () { art.board(world, 'night'); }, function () { art.backdrop('day'); }, function () { art.backdrop('night'); }];
    world.buildings.forEach(function (b) { tasks.push(function () { art.building(b, 'day'); }, function () { art.building(b, 'night'); }); });
    world.trees.forEach(function (t) { tasks.push(function () { art.tree(t, 'day'); }, function () { art.tree(t, 'night'); }); });
    return tasks;
  }
  function prepare(done) {
    var targetDay = Math.floor(sim.t / DAYLEN), tasks = warmTasks(), k = 0, total = tasks.length, bar = $('progBar');
    (function step() {
      var until = performance.now() + 14;
      sim.catchUp(targetDay, 10);
      while (k < total && performance.now() < until) tasks[k++]();
      var p = 0.5 * Math.min(1, (sim.settled() + 1) / (targetDay + 1)) + 0.5 * (k / total);
      bar.style.width = Math.round(p * 100) + '%';
      if (sim.settled() >= targetDay && k >= total) done(); else setTimeout(step, 0);
    })();
  }

  function boot() {
    start();
    resize(); fit(); prepareScene(); buildChips();
    var g = document.createElement('canvas'); g.width = g.height = 160; g.getContext('2d').drawImage(AH.grainTile(7), 0, 0);
    $('grain').style.backgroundImage = 'url(' + g.toDataURL() + ')';
    $('seedTxt').textContent = 'CITY No. ' + seed;
    requestAnimationFrame(function (t) { last = t; frame(t); });
    prepare(function () {
      if (awayMin >= 60) {
        var el = $('awayTxt'), r = fillAway($('awayList'), awayFrom, awayFrom + awayMin);
        el.hidden = false;
        $('awayHead').textContent = 'While you were away, ' + dur(awayMin) + ' passed in the city. ' + (r.all ? (r.all === 1 ? 'One thing happened.' : r.all + ' things happened' + (r.pick.length < r.all ? '. The biggest:' : ':')) : 'It was a quiet stretch. Everyone carried on without you.');
      }
      clock = sim.clock(sim.t); for (var i = 0; i < sim.chars.length; i++) sts[i] = sim.state(sim.chars[i], sim.t);
      computePipOffsets();
      ready = true; syncUI(true); updateUI();
      $('enterBtn').disabled = false; $('enterTxt').textContent = 'ENTER THE CITY'; document.querySelector('.cv-prog').classList.add('done');
    });
  }

  $('enterBtn').addEventListener('click', function () { if ($('enterBtn').disabled) return; lastT = sim.t; $('cover').classList.add('gone'); });
  $('menuBtn').addEventListener('click', function () { closeOverlays(); $('menu').hidden = false; });
  $('specBtn').addEventListener('click', function () { $('menu').hidden = true; buildSpecimens(); $('spec').hidden = false; });
  $('webBtn').addEventListener('click', function () { openWeb(selected >= 0 ? selected : null); });
  $('histBtn').addEventListener('click', openHist);
  $('respec').addEventListener('click', buildSpecimens);
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', closeOverlays); });
  Array.prototype.forEach.call(document.querySelectorAll('.overlay'), function (o) { o.addEventListener('click', function (e) { if (e.target === o) closeOverlays(); }); });
  var newArmed = 0;
  $('newBtn').addEventListener('click', function () {
    var b = $('newBtn');
    if (!newArmed) { newArmed = 1; b.textContent = 'TAP AGAIN TO CONFIRM'; setTimeout(function () { newArmed = 0; b.textContent = 'NEW CITY'; }, 3200); return; }
    newArmed = 0; b.textContent = 'NEW CITY';
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    start(Math.floor(Math.random() * 900000) + 100000);
    fit(); prepareScene(); buildChips(); $('seedTxt').textContent = 'CITY No. ' + seed; hideAlert(); closeOverlays(); uiCache = {};
    clock = sim.clock(sim.t); for (var i = 0; i < sim.chars.length; i++) sts[i] = sim.state(sim.chars[i], sim.t);
    syncUI(true); save();
  });
  $('followBtn').addEventListener('click', toggleFollow);
  $('zin').addEventListener('click', function () { zoomAt(1.3, vw / 2, vh / 2); });
  $('zout').addEventListener('click', function () { zoomAt(1 / 1.3, vw / 2, vh / 2); });
  $('fit').addEventListener('click', function () { breakFollow(); fit(); });
  window.addEventListener('resize', function () { resize(); clampCam(); updateFocus(); });

  // returning to a suspended tab or installed app counts as being away too
  document.addEventListener('visibilitychange', function () {
    if (!ready) return;
    if (document.hidden) { hiddenAt = Date.now(); save(); return; }
    if (!hiddenAt) return;
    var el = (Date.now() - hiddenAt) / 1000; hiddenAt = 0;
    if (el < 60 || !$('cover').classList.contains('gone')) return;
    var from = sim.t; sim.t = from + Math.min(el, MAX_AWAY);
    sim.ensureDay(Math.floor(sim.t / DAYLEN)); lastT = sim.t;
    awayOverlay(from, sim.t); save();
  });
  window.addEventListener('pagehide', function () { if (ready) save(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  boot();
  AH.debug = {
    get cam() { return cam; }, select: select, fit: fit, get sim() { return sim; }, get world() { return world; }, get perf() { return perf; },
    setTime: function (t) { sim.ensureDay(Math.floor(t / DAYLEN)); sim.t = t; lastT = t; },
    openWeb: openWeb, openHist: openHist, awayOverlay: awayOverlay, get bubbles() { return bubbles; }
  };
})();
