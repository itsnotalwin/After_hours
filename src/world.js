/* AFTERHOURS — the city generator. One seed → one district: streets, blocks, buildings, trees, lamps. */
(function () {
  'use strict';
  var AH = window.AH;

  var N = 16;                       // tiles per side
  var STREETS = [0, 5, 10, 15];     // street rows / columns
  var K = { STREET: 0, LOT: 1, PARK: 2, OBST: 3 };
  var E = AH.ISO.E;

  var LAST = ['Marlow', 'Quill', 'Voss', 'Hartigan', 'Ledger', 'Okafor', 'Brandt', 'Pell', 'Sorensen', 'Vance', 'Thistle', 'Arkwright', 'Delacroix', 'Nkemelu', 'Ashby', 'Lind',
    'Fenwick', 'Aldous', 'Rooke', 'Tamsin', 'Gallo', 'Ibarra', 'Kessler', 'Moreau', 'Nakagawa', 'Oyelaran', 'Prewitt', 'Rastogi', 'Silva', 'Tarkington', 'Ulloa', 'Whitlock'];
  // how many people each kind of building can house or employ
  var RES_CAP = { home: { 4: 3, 8: 4, 16: 6 }, flat: { 4: 5, 8: 8, 16: 10 } };
  var JOB_SLOTS = { hall: 7, cafe: 5, print: 5, shop: 4, office: 7, warehouse: 7 };
  var CAP_TARGET = 46;              // enough beds for the biggest cast
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
    var hall = buildings.filter(function (b) { return b.block.layout === 'full'; })[0];
    hall.kind = 'hall'; hall.name = rng.pick(HALLS);
    var pool = buildings.filter(function (b) { return b !== hall; });
    rng.shuffle(pool);
    var usedNames = {};
    function take(pred) {
      var idx = -1, n;
      for (n = 0; n < pool.length; n++) if (pred(pool[n])) { idx = n; break; }
      if (idx < 0) idx = 0;
      return pool.splice(idx, 1)[0];
    }
    function uniq(list, prefix, suffix) {
      var nm, tries = 0;
      do { nm = (prefix || '') + rng.pick(list) + (suffix || ''); tries++; } while (usedNames[nm] && tries < 60);
      usedNames[nm] = 1; return nm;
    }
    var cafe = take(function (b) { return b.w * b.h >= 8; }); cafe.kind = 'cafe'; cafe.name = uniq(CAFES);
    var print = take(function (b) { return b.w * b.h >= 4; }); print.kind = 'print'; print.name = uniq(PRINTS);
    // housing: spread across the blocks, big buildings first, then top up with taller flats until there are beds for everyone
    var RES = Math.max(2, Math.min(pool.length - 3, 9)), homes = [], perBlock = {};
    while (homes.length < RES) {
      var bi = -1, bv = 1e9;
      pool.forEach(function (b, idx) { var v = (perBlock[b.block.bi + ',' + b.block.bj] || 0) * 10 - b.w * b.h * 0.3 + rng.next() * 2; if (v < bv) { bv = v; bi = idx; } });
      var rb = pool.splice(bi, 1)[0], area = rb.w * rb.h;
      perBlock[rb.block.bi + ',' + rb.block.bj] = (perBlock[rb.block.bi + ',' + rb.block.bj] || 0) + 1;
      rb.kind = rng.next() < (area >= 8 ? 0.75 : 0.35) ? 'flat' : 'home';
      homes.push(rb);
    }
    function capOf(b) { return RES_CAP[b.kind][b.w * b.h] || 4; }
    var capTotal = 0;
    homes.forEach(function (b) { capTotal += capOf(b); });
    homes.slice().sort(function (p, q) { return q.w * q.h - p.w * p.h; }).forEach(function (b) {
      if (capTotal >= CAP_TARGET || b.kind !== 'home') return;
      capTotal -= capOf(b); b.kind = 'flat'; capTotal += capOf(b);
    });
    homes.forEach(function (b) {
      b.name = b.kind === 'flat' ? uniq(LAST, '', ' Flats') : uniq(LAST, '', ' House');
      b.cap = capOf(b);
    });
    pool.forEach(function (b) {
      var area = b.w * b.h, r = rng.next();
      if (area >= 8 && r < 0.28) { b.kind = 'warehouse'; b.name = 'Freight Shed'; }
      else if (r < 0.62) { b.kind = 'shop'; b.name = uniq(SHOPS); }
      else { b.kind = 'office'; b.name = uniq(OFFICES); }
    });
    var workplaces = [hall, cafe, print].concat(pool);
    workplaces.forEach(function (b) { b.jobs = JOB_SLOTS[b.kind] || 3; });

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
    // standing room on the lawn ring, for people who stop to talk
    [[8, 6], [9, 7], [6, 8], [7, 9]].forEach(function (t, idx) { spots.push({ t: 'g', key: 'lawn' + idx, x: t[0] + 0.5, y: t[1] + 0.5, sit: false, name: 'the lawn' }); });

    /* ---- lamps ---- */
    [[5, 5], [10, 5], [5, 10], [10, 10], [0, 5], [15, 5], [5, 0], [5, 15], [0, 10], [15, 10], [10, 0], [10, 15]].forEach(function (p, idx) {
      lamps.push({ x: p[0] + 0.14, y: p[1] + 0.14, id: 'l' + idx });
    });

    /* ---- walkable grid ---- */
    var walk = new Uint8Array(N * N);
    for (i = 0; i < N * N; i++) walk[i] = (tiles[i] === K.STREET || tiles[i] === K.PARK) ? 1 : 0;

    var world = {
      seed: seed, N: N, K: K, E: E, tiles: tiles, walk: walk, blocks: blocks, buildings: buildings, byId: byId,
      trees: trees, lamps: lamps, benches: benches, spots: spots, homes: homes, workplaces: workplaces, capacity: capTotal,
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
    var pathCache = {};
    world.findPath = function (sx, sy, ex, ey) {
      var ck = (sy * N + sx) * 1024 + (ey * N + ex);
      if (pathCache[ck] !== undefined) return pathCache[ck];
      return (pathCache[ck] = solvePath(sx, sy, ex, ey));
    };
    function solvePath(sx, sy, ex, ey) {
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
    }

    return world;
  }

  AH.generateWorld = generateWorld;
  AH.buildingSpec = spec;
})();
