/* AFTERHOURS — the clock, the citizens and the day ledger.
   Each in-game day is "settled" in order: plans are made from what people remember and feel, encounters are found from those plans,
   and the outcomes change tomorrow. Everything is seeded, so the same city always has the same history.
   Within a day any moment is still computed directly from that day's plans, so playback stays cheap.
   Phase 2b: a full town (about 40 people) with households, workplaces, retirees and routine versus chance conversations. */
(function () {
  'use strict';
  var AH = window.AH, E = AH.ISO.E;
  var SPEED = 1.15;   // tiles per game-minute
  var RATE = 1;       // game-minutes per real second (1 game hour per real minute)
  var DAY = 1440, STEP = 2;
  var DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  var MAX_CONV_DAY = 5;      // a person can hold at most this many conversations in a day
  var SIM_VERSION = 'p2b.1', SNAP_V = 1, SNAP_EVENTS = 1800;   // snapshots: a saved city resumes from the start of a day instead of replaying from day 0
  var EV_KINDS = ['chat', 'laugh', 'favour', 'argument'], EV_TONES = ['warm', 'neutral', 'tense'];

  var FIRST = ['Ada', 'Teo', 'Ines', 'Odile', 'Bram', 'Mina', 'Sol', 'Cass', 'Ravi', 'Noor', 'Pim', 'Hana', 'Jory', 'Lena', 'Anouk', 'Basil', 'Cleo', 'Dara', 'Eero', 'Faye',
    'Gus', 'Hugo', 'Iris', 'Jonas', 'Kemi', 'Lior', 'Maren', 'Nils', 'Opal', 'Pia', 'Quinn', 'Rafa', 'Sana', 'Tove', 'Uma', 'Viggo', 'Wren', 'Xavi', 'Yara', 'Zeke',
    'Abel', 'Bea', 'Caleb', 'Dinah', 'Emil', 'Frida', 'Gil', 'Hester', 'Isak', 'Juno', 'Kofi', 'Lotte', 'Milo', 'Nadia', 'Otto', 'Petra', 'Rhea', 'Sven', 'Tilda', 'Ugo',
    'Vera', 'Wim', 'Yusuf', 'Zora', 'Arlo', 'Beau', 'Cyrus', 'Dalia', 'Ewan', 'Flora', 'Gwen', 'Hiro', 'Ivy', 'Jude', 'Kai', 'Luz', 'Mateo', 'Nell', 'Orla', 'Pablo',
    'Rosa', 'Stan', 'Tara', 'Ulla', 'Vic', 'Willa', 'Yuki', 'Zane', 'Amara', 'Boris', 'Cora', 'Dev', 'Elio', 'Fern', 'Greta', 'Hal'];
  var LASTN = ['Quill', 'Marlow', 'Voss', 'Hartigan', 'Okafor', 'Brandt', 'Pell', 'Lind', 'Ashby', 'Vance', 'Fenwick', 'Aldous', 'Rooke', 'Tamsin', 'Gallo', 'Ibarra', 'Kessler',
    'Moreau', 'Nakagawa', 'Oyelaran', 'Prewitt', 'Rastogi', 'Silva', 'Tarkington', 'Ulloa', 'Whitlock', 'Sorensen', 'Thistle', 'Arkwright', 'Delacroix', 'Nkemelu', 'Ledger'];
  var TITLES = {
    cafe: ['Baker & owner', 'Barista', 'Pastry cook', 'Waiter', 'Dishwasher'],
    print: ['Typesetter', 'Pressman', 'Print clerk', 'Bookbinder', 'Proofreader'],
    hall: ['Records clerk', 'Town clerk', 'Inspector', 'Archivist', 'Janitor', 'Mayor’s aide', 'Usher'],
    shop: ['Shopkeeper', 'Shop assistant', 'Stock clerk', 'Window dresser'],
    office: ['Accountant', 'Surveyor', 'Insurance agent', 'Clerk', 'Lawyer', 'Bank teller', 'Secretary'],
    warehouse: ['Foreman', 'Dock hand', 'Carter', 'Stocktaker', 'Driver', 'Packer', 'Forklift minder']
  };
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
  // cut-paper looks: body pattern x head accessory x height. art.js knows how to draw each name.
  var STYLES = 4, ACCS = ['bun', 'cap', 'bob', 'hat', 'spike', 'pony', 'curl', 'bald', 'beanie'], SCALES = [0.94, 1, 1.06];
  var LANES = [[0.2, 0.2], [-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0, 0.26], [0.26, 0]];

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

  function create(world, seed, t0, opts) {
    opts = opts || {};
    var N = Math.max(1, opts.count || 40);
    var rng = new AH.RNG(seed ^ 0x51ed);
    var K = world.K, chars = [], i, k;

    /* ---------- the cast: households, then work ---------- */
    var homes = world.homes, hfill = [], hcount = [];
    homes.forEach(function () { hfill.push(0); hcount.push(0); });
    for (i = 0; i < N; i++) {
      var best = 0, bv = 1e9;
      homes.forEach(function (h, idx) { var v = hfill[idx] / h.cap + rng.next() * 0.06 + (hfill[idx] >= h.cap ? 3 : 0); if (v < bv) { bv = v; best = idx; } });
      hfill[best]++; hcount[best]++;
    }
    var firsts = rng.shuffle(FIRST.slice()), looks = [];
    for (i = 0; i < STYLES; i++) for (k = 0; k < ACCS.length; k++) for (var q = 0; q < SCALES.length; q++) looks.push({ style: i, acc: ACCS[k], sc: SCALES[q] });
    // spread looks out: shuffle, but make the first picks differ in both body and head
    rng.shuffle(looks);
    var firstUsed = 0, famIndex = 0;
    homes.forEach(function (h, hi) {
      var surname = h.kind === 'home' ? h.name.replace(/ House$/, '') : null, flatNames = [];
      for (var m = 0; m < hcount[hi]; m++) {
        var first = firsts[firstUsed++ % firsts.length], last;
        if (surname) last = surname;
        else if (flatNames.length && rng.next() < 0.28) last = rng.pick(flatNames);
        else { last = rng.pick(LASTN); flatNames.push(last); }
        var tr = {};
        TRAITS.forEach(function (kk) { tr[kk] = Math.round(rng.range(0.12, 0.96) * 100) / 100; });
        var hi2 = TRAITS[0], lo = TRAITS[0];
        TRAITS.forEach(function (kk) { if (tr[kk] > tr[hi2]) hi2 = kk; if (tr[kk] < tr[lo]) lo = kk; });
        var id = chars.length, look = looks[id % looks.length];
        chars.push({
          id: id, first: first, last: last, name: first + ' ' + last, initial: first[0], job: { title: '', b: null, kind: null }, role: 'work', home: h,
          traits: tr, style: look.style, acc: look.acc, sc: look.sc, lane: LANES[id % LANES.length],
          jit: [Math.round((rng.next() - 0.5) * 0.5 * 100) / 100, Math.round((rng.next() - 0.5) * 0.5 * 100) / 100],
          bio: BIO_HI[hi2] + ' ' + BIO_LO[lo], _dir: 1
        });
      }
    });
    N = chars.length;
    // who works where: a few are retired or between jobs, the rest are spread over the workplaces
    var order = rng.shuffle(chars.map(function (c) { return c.id; }));
    var nRet = N < 8 ? 0 : Math.round(N * 0.15), nIdle = N < 8 ? 0 : Math.round(N * 0.1);
    order.forEach(function (id, idx) {
      var c = chars[id];
      if (idx < nRet) { c.role = 'retired'; c.job = { title: 'Retired', b: null, kind: null }; }
      else if (idx < nRet + nIdle) { c.role = 'idle'; c.job = { title: 'Between jobs', b: null, kind: null }; }
    });
    var wp = world.workplaces, wfill = wp.map(function () { return 0; });
    order.forEach(function (id) {
      var c = chars[id]; if (c.role !== 'work') return;
      var bk = 0, bw = 1e9;
      wp.forEach(function (b, idx) { var v = wfill[idx] / b.jobs + rng.next() * 0.1 + (wfill[idx] >= b.jobs ? 3 : 0); if (v < bw) { bw = v; bk = idx; } });
      var b = wp[bk], titles = TITLES[b.kind] || ['Clerk'];
      c.job = { title: titles[wfill[bk] % titles.length], b: b, kind: b.kind }; wfill[bk]++;
    });
    var residents = {}, staff = {};
    chars.forEach(function (c) { (residents[c.home.id] = residents[c.home.id] || []).push(c.id); if (c.job.b) (staff[c.job.b.id] = staff[c.job.b.id] || []).push(c.id); });
    function kinOf(a, b) {
      if (chars[a].home === chars[b].home) return 'housemate';
      if (chars[a].job.b && chars[a].job.b === chars[b].job.b) return 'colleague';
      return null;
    }

    /* ---------- state: relationships and memories ---------- */
    function freshState() {
      var s = { rel: [], mem: [], lastGood: [] }, a, b;
      for (a = 0; a < N; a++) {
        s.rel[a] = []; s.mem[a] = []; s.lastGood[a] = -1;
        for (b = 0; b < N; b++) {
          if (a === b) { s.rel[a][b] = null; continue; }
          var ca = chars[a].traits, cb = chars[b].traits, kin = kinOf(a, b);
          var r = { a: 0.12 * (cb.sociability - 0.5) + 0.06 * (ca.sociability - 0.5), t: 0.5 + 0.1 * (cb.honesty - 0.5), r: 0.04 + 0.12 * Math.min(ca.ambition, cb.ambition), met: 0 };
          // people who live or work together already know each other
          if (kin === 'housemate') { r.a += 0.13; r.t += 0.08; r.r *= 0.6; r.met = 4; }
          else if (kin === 'colleague') { r.a += 0.05; r.t += 0.03; r.met = 2; }
          s.rel[a][b] = { a: r3(r.a), t: r3(r.t), r: r3(r.r), met: r.met };
        }
      }
      return s;
    }
    function cloneState(s) {
      var o = { rel: [], mem: [], lastGood: s.lastGood.slice() }, a, b;
      for (a = 0; a < N; a++) {
        o.rel[a] = []; o.mem[a] = s.mem[a].map(function (m) { var c = {}; for (var kk in m) c[kk] = m[kk]; return c; });
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
      ev.mems.forEach(function (m) { var c = {}; for (var kk in m) c[kk] = m[kk]; s.mem[m.owner].push(c); });
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
      return world.tileKind(tx, ty) === K.STREET ? { x: tx + 0.5 + ch.lane[0] + ch.jit[0] * 0.3, y: ty + 0.5 + ch.lane[1] + ch.jit[1] * 0.3 } : { x: tx + 0.5, y: ty + 0.5 };
    }
    function inLoc(b) { return { k: 'in', b: b, name: b.name }; }
    function outLoc(tx, ty, ch, label, extra) {
      var p = tilePt(tx, ty, ch), o = { k: 'out', tx: tx, ty: ty, x: p.x, y: p.y, name: label };
      if (extra) for (var kk in extra) o[kk] = extra[kk];
      return o;
    }
    function keyOf(loc) { return loc.k === 'in' ? 'b:' + loc.b.id : (loc.sit || loc.park ? 'park' : 'street'); }
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
      if (a.k === 'out' && (a.sit || a.park)) pts[0] = { x: a.x, y: a.y };
      if (b.k === 'in') pts.push({ x: b.b.doorEdge.x, y: b.b.doorEdge.y });
      else if (b.sit || b.park) pts[pts.length - 1] = { x: b.x, y: b.y };
      var clean = [pts[0]], cum = [0], len = 0;
      for (n = 1; n < pts.length; n++) {
        var d = Math.hypot(pts[n].x - clean[clean.length - 1].x, pts[n].y - clean[clean.length - 1].y);
        if (d < 1e-4) continue;
        len += d; clean.push(pts[n]); cum.push(len);
      }
      if (clean.length < 2) return null;
      return { pts: clean, cum: cum, len: len };
    }
    function wpick(r, opts2) {
      var tot = 0, kk;
      for (kk = 0; kk < opts2.length; kk++) tot += opts2[kk].w;
      var x = r.next() * tot;
      for (kk = 0; kk < opts2.length; kk++) { x -= opts2[kk].w; if (x <= 0) return opts2[kk]; }
      return opts2[opts2.length - 1];
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
    function nearLoc(loc, ch) {
      // a spot beside where someone else is, so the two of them stand or sit together
      if (loc.k === 'in') return inLoc(loc.b);
      if (loc.sit) {
        var seat = -loc.seat, sp = loc.spot, ns = loc.face === 'n' || loc.face === 's';      // take the other end of the bench
        return outLoc(loc.tx, loc.ty, ch, loc.name, { sit: true, x: sp.x + (ns ? seat : 0), y: sp.y + (ns ? 0 : seat), face: loc.face, spot: sp, seat: seat });
      }
      if (loc.park) return outLoc(loc.tx, loc.ty, ch, loc.name, { park: true, x: loc.tx + 0.5 + ch.jit[0], y: loc.ty + 0.5 + ch.jit[1], spot: loc.spot });
      return outLoc(loc.tx, loc.ty, ch, loc.name);
    }
    function buildPlan(ch, day, st, plans) {
      var r = new AH.RNG(world.seed + ':' + day + ':' + ch.id), tr = ch.traits, id = ch.id;
      var dow = ((day % 7) + 7) % 7, weekend = dow >= 5, free = weekend || !ch.job.b;
      var legs = [], t = 0, cur = inLoc(ch.home), homeLoc = inLoc(ch.home), workLoc = ch.job.b ? inLoc(ch.job.b) : null;
      var goal = goalFor(st, ch, day), cafeWorker = ch.job.b === world.cafe, lunchInfo = null;
      function holdLabel() { return cur.k === 'in' ? (cur.b === ch.home ? 'At home' : cur.b === ch.job.b ? 'Working at ' + cur.name : 'At ' + cur.name) : 'Waiting'; }
      function stay(until, label) { if (until > t) { legs.push({ t0: t, t1: until, type: 'stay', loc: cur, label: label }); t = until; } }
      function walk(dest, label) {
        var w = route(cur, dest, ch);
        if (w) { legs.push({ t0: t, t1: t + w.len / SPEED, type: 'walk', pts: w.pts, cum: w.cum, len: w.len, from: cur, to: dest, label: label }); t += w.len / SPEED; }
        cur = dest;
      }
      // is somebody else already sitting or standing on this spot during the window? (two people never share a seat)
      function taken(loc, a0, a1) {
        for (var j = 0; j < plans.length; j++) {
          var p = plans[j]; if (!p || j === id) continue;
          for (var q = 0; q < p.legs.length; q++) {
            var L = p.legs[q];
            if (L.type !== 'stay' || L.loc.k !== 'out' || !(L.loc.sit || L.loc.park)) continue;
            if (L.t0 < a1 && L.t1 > a0 && Math.abs(L.loc.x - loc.x) < 0.24 && Math.abs(L.loc.y - loc.y) < 0.24) return true;
          }
        }
        return false;
      }
      // if the exact seat or patch of lawn is taken, stand just beside it instead
      function freeNear(loc, a0, a1) {
        if (loc.k !== 'out' || !(loc.sit || loc.park) || !taken(loc, a0, a1)) return loc;
        var sp = loc.spot, offs = [[0.34, 0], [-0.34, 0], [0, 0.34], [0, -0.34], [0.34, 0.34], [-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.5, 0.1], [-0.5, -0.1]];
        for (var q = 0; q < offs.length; q++) {
          var c2 = outLoc(loc.tx, loc.ty, ch, loc.name, { park: true, x: sp.x + offs[q][0], y: sp.y + offs[q][1], spot: sp });
          if (!taken(c2, a0, a1)) return c2;
        }
        return loc;
      }
      // a place in the park. With a spot given (to sit beside someone) it takes the other end of the bench; otherwise it looks for a free one.
      function parkLoc(sp, a0, a1, seatHint) {
        var tries = sp ? 1 : 6, loc, q;
        for (q = 0; q < tries; q++) {
          var s2 = sp || r.pick(world.spots), tx = Math.floor(s2.x), ty = Math.floor(s2.y);
          if (s2.sit) {
            var seat = seatHint ? -seatHint : (r.next() < 0.5 ? -0.19 : 0.19), ns = s2.face === 'n' || s2.face === 's';
            loc = outLoc(tx, ty, ch, world.parkName, { sit: true, x: s2.x + (ns ? seat : 0), y: s2.y + (ns ? 0 : seat), face: s2.face, spot: s2, seat: seat });
          } else loc = outLoc(tx, ty, ch, world.parkName, { park: true, x: s2.x + ch.jit[0], y: s2.y + ch.jit[1], spot: s2 });
          if (a0 == null || !taken(loc, a0, a1)) break;
        }
        if (a0 != null) loc = freeNear(loc, a0, a1);
        return loc;
      }
      function parkLabel(loc) { return (loc.sit ? 'Sitting in ' : 'Lingering in ') + world.parkName; }

      var wake = Math.round(6 * 60 + 15 - tr.ambition * 50 + r.int(-10, 25) + (free ? 75 + r.int(0, 60) : 0));
      stay(wake, 'Asleep at home');
      if (!free) {
        stay(wake + r.int(30, 55), 'At home');
        walk(workLoc, 'Walking to ' + workLoc.name);
        stay(Math.max(t, 11 * 60 + 30), 'Working at ' + workLoc.name);
        // lunch: often together with a colleague who has already made their plan
        var buddy = null, bestS = -9;
        plans.forEach(function (p, j) {
          if (!p || j === id || !p.lunch || chars[j].job.b !== ch.job.b) return;
          var s = relScore(st.rel[id][j]); if (s > bestS && s > -0.1) { bestS = s; buddy = p.lunch; }
        });
        var follow = buddy && r.next() < 0.45 + 0.4 * Math.max(0, bestS), lunch;
        if (follow) {
          lunch = buddy.k === 'park' ? { k: 'park', loc: freeNear(parkLoc(buddy.spot, null, null, buddy.seat), buddy.arrive, buddy.end) } : { k: 'cafe', loc: inLoc(world.cafe) };
        } else {
          var wPark = (0.35 + tr.sociability * 0.3) * placeW(st, id, 'park') * (cafeWorker ? 2.2 : 1);
          var wCafe = cafeWorker ? 0 : 0.5 * placeW(st, id, 'b:' + world.cafe.id);
          lunch = wpick(r, [{ w: wPark, t: 'park' }, { w: wCafe, t: 'cafe' }]).t === 'park' ? { k: 'park', loc: parkLoc(null, 11 * 60 + 50, 13 * 60 + 30) } : { k: 'cafe', loc: inLoc(world.cafe) };
        }
        var lunchLabel = lunch.k === 'park' ? 'Lunch on the lawn in ' + world.parkName : 'Having lunch at ' + world.cafe.name;
        if (lunch.k === 'park' && lunch.loc.sit) lunchLabel = 'Lunch on a bench in ' + world.parkName;
        var go = route(workLoc, lunch.loc, ch), gt = go ? go.len / SPEED : 0;
        if (follow) { var leave = Math.max(t, 11 * 60, buddy.arrive - gt); stay(leave, 'Working at ' + workLoc.name); }
        else stay(Math.max(t, 12 * 60 + r.int(-15, 25)), 'Working at ' + workLoc.name);
        walk(lunch.loc, 'Walking to lunch');
        var arrive = t;
        stay(follow ? Math.max(t + 12, Math.min(buddy.end, t + 60)) : t + r.int(35, 60), lunchLabel);
        lunchInfo = { k: lunch.k, spot: lunch.loc.spot || null, seat: lunch.loc.seat || 0, arrive: arrive, end: t };
        walk(workLoc, 'Walking back to ' + workLoc.name);
        stay(17 * 60 + Math.round(tr.ambition * 70) + r.int(0, 25) + (goal.k === 'status' ? 45 : 0), 'Working at ' + workLoc.name);
      } else {
        stay(wake + r.int(20, 40), 'At home');
      }

      var endBy = (ch.role === 'retired' ? 21 * 60 + 30 : 22 * 60) + r.int(0, 50), acts = free ? 3 : r.int(1, 2), a, attempts;
      if (goal.k === 'company') acts++;
      var shops = world.buildings.filter(function (b) { return (b.kind === 'shop' || b.kind === 'office') && b !== ch.job.b; });
      for (a = 0; a < acts; a++) {
        var done = false;
        for (attempts = 0; attempts < 4 && !done; attempts++) {
          var opts2 = [], mult = { company: 1.6, peace: 0.8 }[goal.k] || 1;
          opts2.push({ w: (0.6 + (1 - tr.sociability) * 0.4) * placeW(st, id, 'park') * (goal.k === 'peace' ? 1.3 : goal.k === 'company' ? 0.8 : 1), t: 'park' });
          opts2.push({ w: (0.3 + tr.sociability * 0.5) * placeW(st, id, 'b:' + world.cafe.id) * (goal.k === 'company' ? 1.3 : goal.k === 'peace' ? 0.7 : 1), t: 'cafe' });
          if (shops.length) opts2.push({ w: (0.3 + tr.greed * 0.4) * (goal.k === 'money' ? 1.5 : 1), t: 'shop' });
          opts2.push({ w: 0.3 * placeW(st, id, 'street'), t: 'lamp' });
          plans.forEach(function (p, j) {
            if (!p || j === id) return;
            var s = relScore(st.rel[id][j]), seekRival = goal.k === 'score' && goal.other === j;
            if (s <= 0.12 && !seekRival) return;
            p.legs.forEach(function (L) {
              if (L.type !== 'stay' || L.t1 - L.t0 < 20 || L.t1 < t + 25 || L.t0 > endBy) return;
              if (L.loc.k === 'in' && L.loc.b === chars[j].home) return;
              opts2.push({ w: seekRival ? 3 : (0.4 + 2.2 * s) * mult, t: 'join', j: j, leg: L });
            });
          });
          var pick = wpick(r, opts2), loc, dur, label, walkLabel, arrive2 = null;
          if (pick.t === 'park') { dur = r.int(40, 90); loc = parkLoc(null, t, t + dur + 25); label = parkLabel(loc); walkLabel = 'Walking to ' + world.parkName; }
          else if (pick.t === 'cafe') { loc = inLoc(world.cafe); dur = r.int(30, 70); label = 'Having a coffee at ' + world.cafe.name; walkLabel = 'Walking to ' + world.cafe.name; }
          else if (pick.t === 'shop') { var sb = r.pick(shops); loc = inLoc(sb); dur = r.int(15, 40); label = 'Visiting ' + sb.name; walkLabel = 'Walking to ' + sb.name; }
          else if (pick.t === 'lamp') { var lp = r.pick(world.lamps); loc = outLoc(Math.floor(lp.x), Math.floor(lp.y), ch, 'a streetlamp'); dur = r.int(12, 30); label = 'Waiting under a streetlamp'; walkLabel = 'Walking to a streetlamp'; }
          else {
            var L0 = pick.leg, fo = chars[pick.j].first;
            loc = nearLoc(L0.loc, ch);
            label = 'Meeting up with ' + fo; walkLabel = 'Going to find ' + fo; arrive2 = L0;
          }
          var go2 = route(cur, loc, ch), back = route(loc, homeLoc, ch), wt = go2 ? go2.len / SPEED : 0, bt = back ? back.len / SPEED : 0, depart = t;
          if (arrive2) {
            var arr = Math.max(t + wt, arrive2.t0 + 3);
            if (arr > arrive2.t1 - 10) continue;
            depart = arr - wt; dur = Math.min(arrive2.t1, arr + r.int(25, 60)) - arr; loc = freeNear(loc, arr, arr + dur);
          }
          if (depart + wt + dur + bt > endBy) { if (arrive2) continue; a = acts; break; }
          // keep away from people we dislike
          var clash = false;
          if (!arrive2 && goal.k !== 'score') {
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
      return { legs: legs, wake: wake, weekend: weekend, goal: goal, lunch: lunchInfo };
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
    var bIx = {}, bKey = []; world.buildings.forEach(function (b, i) { bIx[b.id] = i; bKey.push('b:' + b.id); });
    // finds every stretch of time two people spent in the same place (indoors) or within a stride of each other (outdoors).
    // Hot loop: it samples every STEP minutes, so it walks each person's legs with pointers and allocates nothing per step.
    function detect(plans) {
      var cands = [], open = [], openList = [], m, a, b, c, step = 0, nB = world.buildings.length;
      var LI = new Int32Array(N), SI = new Int32Array(N), PX = new Float64Array(N), PY = new Float64Array(N), PS = new Uint8Array(N);
      var outs = new Int32Array(N), insN = new Int32Array(nB), insL = [], used = [];
      for (a = 0; a < N * N; a++) open.push(null);
      for (a = 0; a < N; a++) SI[a] = 1;
      for (a = 0; a < nB; a++) insL.push(new Int32Array(N));
      function close(o) { open[o.key] = null; if (o.t1 - o.t0 + STEP >= 6) cands.push(o); }
      function touch(a2, b2, pk, pn, sit) {
        var key = a2 * N + b2, o = open[key];
        if (o && o.placeKey !== pk) { close(o); var ix = openList.indexOf(o); if (ix >= 0) openList.splice(ix, 1); o = null; }
        if (!o) { o = open[key] = { key: key, a: a2, b: b2, t0: m, t1: m, last: m, placeKey: pk, place: pn, sit: sit, seen: step }; openList.push(o); }
        else { o.t1 = m; o.last = m; o.seen = step; if (!sit) o.sit = false; }
      }
      for (m = 0; m < DAY; m += STEP) {
        step++;
        var nOut = 0, nUsed = 0;
        for (c = 0; c < N; c++) {
          var plan = plans[c], legs = plan.legs, li = LI[c];
          while (li < legs.length - 1 && m >= legs[li].t1) { li++; SI[c] = 1; }
          LI[c] = li;
          var leg = legs[li];
          if (leg.type === 'stay') {
            var loc = leg.loc;
            if (loc.k === 'in') {
              if (loc.b === chars[c].home && (m < plan.wake || m >= 23 * 60)) continue;     // asleep
              var bi = bIx[loc.b.id];
              if (insN[bi] === 0) used[nUsed++] = bi;
              insL[bi][insN[bi]++] = c;
            } else { PX[c] = loc.x; PY[c] = loc.y; PS[c] = loc.sit ? 1 : 0; outs[nOut++] = c; }
          } else {
            var sd = (m - leg.t0) * SPEED; sd = sd < 0 ? 0 : sd > leg.len ? leg.len : sd;
            var cum = leg.cum, n = SI[c];
            while (n < cum.length - 1 && cum[n] < sd) n++;
            SI[c] = n;
            var rem = leg.len - sd, al = 1;
            if (leg.to.k === 'in' && rem < 0.5) al = rem / 0.5;
            if (leg.from.k === 'in' && sd < 0.5) { var a2 = sd / 0.5; if (a2 < al) al = a2; }
            if (al > 0.9) {
              var p0 = leg.pts[n - 1], p1 = leg.pts[n], seg = cum[n] - cum[n - 1], f = seg > 0 ? (sd - cum[n - 1]) / seg : 0;
              PX[c] = p0.x + (p1.x - p0.x) * f; PY[c] = p0.y + (p1.y - p0.y) * f; PS[c] = 0; outs[nOut++] = c;
            }
          }
        }
        for (var u = 0; u < nUsed; u++) {
          var bj = used[u], cnt = insN[bj], L = insL[bj], bb = world.buildings[bj];
          insN[bj] = 0;
          for (a = 0; a < cnt; a++) for (b = a + 1; b < cnt; b++) touch(L[a], L[b], bKey[bj], bb.name, false);
        }
        for (a = 0; a < nOut; a++) {
          var ca = outs[a];
          for (b = a + 1; b < nOut; b++) {
            var cb = outs[b], dx = PX[ca] - PX[cb], dy = PY[ca] - PY[cb];
            if (dx * dx + dy * dy <= 1.96) {
              var inPark = parkBlockTile(Math.floor(PX[ca]), Math.floor(PY[ca]));
              touch(ca < cb ? ca : cb, ca < cb ? cb : ca, inPark ? 'park' : 'street', inPark ? world.parkName : 'the street', PS[ca] === 1 && PS[cb] === 1);
            }
          }
        }
        for (a = openList.length - 1; a >= 0; a--) { var o = openList[a]; if (o.seen !== step && m - o.last > 4) { openList.splice(a, 1); close(o); } }
      }
      openList.slice().forEach(close);
      cands.forEach(function (cd) {
        var ctx = 'public';
        if (cd.placeKey.charAt(0) === 'b') {
          var bld = world.byId[cd.placeKey.slice(2)];
          if (chars[cd.a].home === bld && chars[cd.b].home === bld) ctx = 'home';
          else if (chars[cd.a].job.b === bld && chars[cd.b].job.b === bld) ctx = 'work';
        }
        cd.ctx = ctx;
      });
      return cands.sort(function (p, q) { return p.t0 - q.t0 || p.a - q.a || p.b - q.b; });
    }
    // turns stretches of shared time into conversations: nobody talks to two people at once, and housemates or colleagues only chat now and then
    function converse(cands, s, day, goals) {
      var r = new AH.RNG(world.seed + ':conv:' + day), wins = [];
      cands.forEach(function (c) {
        var A = chars[c.a], B = chars[c.b], dur = c.t1 - c.t0 + STEP, rab = s.rel[c.a][c.b], rba = s.rel[c.b][c.a];
        var sc = (relScore(rab) + relScore(rba)) / 2, soc = (A.traits.sociability + B.traits.sociability) / 2;
        var seeking = (goals[c.a].k === 'score' && goals[c.a].other === c.b) || (goals[c.b].k === 'score' && goals[c.b].other === c.a);
        var w0 = c.t0, len = dur, prio;
        if (dur < (c.ctx === 'public' ? 10 : 8)) return;
        if (c.ctx === 'public') {
          // being near someone is not the same as talking to them: friends and chatty people do, strangers less so
          var stranger = rab.met === 0 && rba.met === 0;
          var pTalk = clamp(0.12 + 0.4 * soc + 0.45 * Math.max(0, sc), 0.08, 0.95) * (stranger ? 0.55 : 1);
          if (!seeking && r.next() >= pTalk) return;
          if (dur > 75) { len = r.int(30, 70); w0 = c.t0 + r.int(0, Math.min(15, dur - len)); }
          prio = 1 + sc + (seeking ? 2 : 0) + r.next() * 0.5;
        } else {
          var p = c.ctx === 'home' ? 0.2 + 0.3 * soc : 0.14 + 0.3 * soc;
          if (!seeking && r.next() >= p) return;
          len = Math.min(dur, r.int(8, 24)); w0 = c.t0 + r.int(0, Math.max(0, dur - len));
          prio = 0.4 + sc * 0.5 + (seeking ? 2 : 0) + r.next() * 0.5;
        }
        wins.push({ a: c.a, b: c.b, t0: w0, t1: w0 + len - STEP, placeKey: c.placeKey, place: c.place, sit: c.sit, ctx: c.ctx, prio: prio });
      });
      wins.sort(function (p, q) { return q.prio - p.prio || p.t0 - q.t0 || p.a - q.a || p.b - q.b; });
      var busy = [], cnt = [], out = [], x;
      for (x = 0; x < N; x++) { busy.push([]); cnt.push({ all: 0, home: 0, work: 0 }); }
      function free(list, t0, t1) { for (var q = 0; q < list.length; q++) if (t0 < list[q][1] && t1 + STEP > list[q][0]) return false; return true; }
      wins.forEach(function (w) {
        if (cnt[w.a].all >= MAX_CONV_DAY || cnt[w.b].all >= MAX_CONV_DAY) return;
        if (w.ctx !== 'public' && (cnt[w.a][w.ctx] >= 1 || cnt[w.b][w.ctx] >= 1)) return;
        if (!free(busy[w.a], w.t0, w.t1) || !free(busy[w.b], w.t0, w.t1)) return;
        busy[w.a].push([w.t0, w.t1 + STEP + 2]); busy[w.b].push([w.t0, w.t1 + STEP + 2]);
        cnt[w.a].all++; cnt[w.b].all++; if (w.ctx !== 'public') { cnt[w.a][w.ctx]++; cnt[w.b][w.ctx]++; }
        out.push(w);
      });
      return out.sort(function (p, q) { return p.t0 - q.t0 || p.a - q.a || p.b - q.b; });
    }

    var evSeq = 0;
    function mem(owner, other, ev, v, s, text) { return { id: ev.id, owner: owner, other: other, at: ev.at, day: ev.day, kind: ev.kind, placeKey: ev.placeKey, place: ev.place, v: v, s: s, text: text }; }
    function resolve(enc, s, day, idx, goals) {
      var A = chars[enc.a], B = chars[enc.b], ta = A.traits, tb = B.traits, a = enc.a, b = enc.b;
      var rab = s.rel[a][b], rba = s.rel[b][a], r = new AH.RNG(world.seed + ':enc:' + day + ':' + idx);
      var d = enc.t1 - enc.t0 + STEP, scale = Math.min(1, d / 25), first = rab.met === 0 && rba.met === 0;
      var riv = Math.max(rab.r, rba.r), aff = (rab.a + rba.a) / 2, soc = (ta.sociability + tb.sociability) / 2, tmp = (ta.temper + tb.temper) / 2;
      var seeking = (goals[a].k === 'score' && goals[a].other === b) || (goals[b].k === 'score' && goals[b].other === a);
      var fric = clamp(0.05 + 0.26 * tmp + 0.3 * riv - 0.14 * aff + (seeking ? 0.35 : 0) + (enc.ctx === 'home' ? 0.03 : 0), 0.03, 0.85) * (first ? 0.5 : 1);   // strangers have no history to fight over
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
      var ev = { id: ++evSeq, day: day, at: day * DAY + enc.t0, end: day * DAY + enc.t1, a: a, b: b, kind: kind, ctx: enc.ctx, placeKey: enc.placeKey, place: enc.place, inside: enc.placeKey.charAt(0) === 'b', dl: [], mems: [], lines: [], first: first };
      var chatty = aff >= 0.1 || ta.sociability + tb.sociability > 1.1;
      ev.tone = kind === 'argument' ? 'tense' : (kind === 'chat' && !chatty) ? 'neutral' : 'warm';
      function dl(from, to, da, dt, dr) { ev.dl.push({ from: from, to: to, da: r3(da * scale), dt: r3(dt * scale), dr: r3(dr * scale) }); }
      function honestyBump(self, other) { return (chars[self].traits.honesty > 0.65 && chars[other].traits.honesty < 0.35) ? -0.03 : (chars[self].traits.honesty > 0.55 && chars[other].traits.honesty > 0.55) ? 0.02 : 0; }
      var pa = A.first, pb = B.first, pl = enc.place, head, verbA, verbB, vA, vB, where = enc.placeKey === 'street' ? ' in the street' : ' at ' + pl;
      if (kind === 'argument') {
        var inst = ta.temper >= tb.temper ? a : b, oth = inst === a ? b : a;
        dl(a, b, -0.16, -0.06, 0.16); dl(b, a, -0.16, -0.06, 0.16);
        dl(oth, inst, -0.05, -0.1, 0.06);
        head = pa + ' and ' + pb + ' had a row' + where;
        verbA = 'Argued with ' + pb; verbB = 'Argued with ' + pa; vA = vB = -0.8;
      } else if (kind === 'laugh') {
        dl(a, b, 0.14, 0.03 + honestyBump(a, b), -0.04); dl(b, a, 0.14, 0.03 + honestyBump(b, a), -0.04);
        head = first ? pa + ' and ' + pb + ' met and shared a laugh' + where : pa + ' and ' + pb + ' shared a laugh' + where;
        verbA = 'Laughed with ' + pb; verbB = 'Laughed with ' + pa; vA = vB = 0.7;
      } else if (kind === 'favour') {
        var rc = 1 - giver; giver = giver === 0 ? a : b; rc = giver === a ? b : a;
        dl(rc, giver, 0.16, 0.12, -0.08); dl(giver, rc, 0.05, 0.02, -0.04);
        var gn = chars[giver].first, rn = chars[rc].first;
        head = gn + ' helped ' + rn + where;
        verbA = giver === a ? 'Helped ' + pb : 'Was helped by ' + pb; verbB = giver === b ? 'Helped ' + pa : 'Was helped by ' + pa;
        vA = giver === a ? 0.5 : 0.9; vB = giver === b ? 0.5 : 0.9;
        giver = giver === a ? 0 : 1;
      } else {
        var big = d >= 40;
        dl(a, b, 0.08 + 0.05 * tb.sociability, 0.02 + honestyBump(a, b) * 0.5, -0.02); dl(b, a, 0.08 + 0.05 * ta.sociability, 0.02 + honestyBump(b, a) * 0.5, -0.02);
        head = first ? pa + ' and ' + pb + ' met for the first time' + where : pa + ' and ' + pb + (big ? ' had a long talk' : ' talked') + where;
        verbA = 'Chatted with ' + pb; verbB = 'Chatted with ' + pa; vA = vB = chatty ? 0.35 : 0.1;
      }
      var str = r3(0.5 + 0.4 * scale);
      ev.mems.push(mem(a, b, ev, vA, str, verbA + where), mem(b, a, ev, vB, str, verbB + where));
      ev.head = head;
      var base = { argument: 1, favour: 0.8, laugh: 0.5, chat: 0.35 }[kind];
      ev.imp = r3(base * (0.4 + 0.6 * scale) * (1 + Math.abs(ev.dl[0].da) * 2) + (first ? 0.25 : 0));
      // lines of speech, spaced so each bubble can be read
      var pair = [A, B];
      var prev = s.mem[a].filter(function (m) { return m.other === b && m.placeKey === enc.placeKey && m.s > 0.25; }).sort(function (p, q) { return Math.abs(q.v * q.s) - Math.abs(p.v * p.s); })[0];
      var cb = prev && enc.placeKey !== 'street' ? { good: prev.v > 0, pl: pl } : null;
      var txt = AH.dialogue.make(kind, pair, { pl: pl, minute: enc.t0, rel: [rab, rba], cb: cb, giver: giver === 1 ? 1 : 0, ctx: enc.ctx, kin: kinOf(a, b), first: first }, r);
      var n = Math.min(txt.length, Math.max(2, Math.floor(d / 5))), gap = Math.max(4, Math.floor((d - 2) / n));
      for (var kk = 0; kk < n; kk++) ev.lines.push({ at: ev.at + 1 + kk * gap, who: txt[kk].who, text: txt[kk].text });
      return ev;
    }

    /* ---------- the ledger ---------- */
    var days = {}, events = [], settled = -1, working = freshState();
    function restore(snap) {
      var a, b, s = { rel: [], mem: [], lastGood: snap.lastGood.slice() };
      if (snap.rel.length !== N || snap.mem.length !== N) throw new Error('snapshot is for a different cast');
      for (a = 0; a < N; a++) {
        s.rel[a] = [];
        for (b = 0; b < N; b++) { var q = snap.rel[a][b]; s.rel[a][b] = q ? { a: q[0], t: q[1], r: q[2], met: q[3] } : null; }
        s.mem[a] = snap.mem[a].map(function (m) { var c = {}; for (var kk in m) c[kk] = m[kk]; return c; });
      }
      var evs = snap.events.map(function (e) {
        // older days are kept as one-line records: what happened, not what was said
        return { id: e[0], day: e[1], at: e[2], end: e[2], a: e[3], b: e[4], kind: EV_KINDS[e[5]] || 'chat', tone: EV_TONES[e[6]] || 'warm', first: !!e[7], head: e[8], imp: 0, lines: [], dl: [], mems: [], old: true };
      });
      working = s; settled = snap.day - 1; evSeq = snap.evSeq;
      evs.forEach(function (e) { events.push(e); });
    }
    var snapIn = opts.snapshot;
    if (snapIn && snapIn.v === SNAP_V && snapIn.ver === SIM_VERSION && snapIn.seed === seed && snapIn.n === N && snapIn.day >= 1 && snapIn.day <= Math.floor(t0 / DAY)) {
      try { restore(snapIn); } catch (err) { working = freshState(); settled = -1; evSeq = 0; events.length = 0; }
    }
    function settleDay(d) {
      var seq0 = evSeq, start = cloneState(working);
      var order2 = new AH.RNG(world.seed + ':ord:' + d).shuffle(chars.map(function (c) { return c.id; }));
      var plans = []; for (var qq = 0; qq < N; qq++) plans.push(null);
      order2.forEach(function (id) { plans[id] = buildPlan(chars[id], d, start, plans); });
      var goals = plans.map(function (p) { return p.goal; });
      var evs = [];
      converse(detect(plans), working, d, goals).forEach(function (enc, idx) { var ev = resolve(enc, working, d, idx, goals); evs.push(ev); applyEvent(working, ev); });
      endOfDay(working);
      days[d] = { day: d, start: start, plans: plans, events: evs, goals: goals, evSeq0: seq0 };
      evs.forEach(function (e) { events.push(e); });
      settled = d;
      delete days[d - 3];
    }
    var sim = { world: world, chars: chars, N: N, t: t0, seed: seed, RATE: RATE, SPEED: SPEED, DAY: DAY, events: events, residents: residents, staff: staff };
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
    sim.eventsBetween = function (t0b, t1b) { return events.filter(function (e) { return e.at > t0b && e.at <= t1b; }); };
    sim.kin = kinOf;
    sim.thought = function (id, t, view) {
      var s = view || sim.view(t), best = null, bv = 0;
      s.mem[id].forEach(function (m) { var w = m.s * Math.abs(m.v); if (w > bv) { bv = w; best = m; } });
      if (!best || bv < 0.25) return '';
      var day = Math.floor(t / DAY), ago = day - best.day, when = ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago + ' days ago';
      return (best.v < 0 ? 'Still bothered: ' : 'Fondly recalls: ') + best.text.charAt(0).toLowerCase() + best.text.slice(1) + ', ' + when;
    };
    // the city as it stood when day d began (d = the day of minute t); resume from it with opts.snapshot
    sim.snapshot = function (t) {
      var d = Math.floor(t / DAY), D = days[d];
      if (!D || d < 1) return null;
      var s = D.start, rel = [], mem = [], a, b;
      for (a = 0; a < N; a++) {
        var row = []; for (b = 0; b < N; b++) { var r = s.rel[a][b]; row.push(r ? [r.a, r.t, r.r, r.met] : 0); }
        rel.push(row); mem.push(s.mem[a].map(function (m) { var c = {}; for (var kk in m) c[kk] = m[kk]; return c; }));
      }
      var evs = events.filter(function (e) { return e.day < d; }).slice(-SNAP_EVENTS).map(function (e) {
        return [e.id, e.day, e.at, e.a, e.b, Math.max(0, EV_KINDS.indexOf(e.kind)), Math.max(0, EV_TONES.indexOf(e.tone)), e.first ? 1 : 0, e.head];
      });
      return { v: SNAP_V, ver: SIM_VERSION, seed: seed, n: N, day: d, evSeq: D.evSeq0, rel: rel, mem: mem, lastGood: s.lastGood.slice(), events: evs };
    };
    // a fingerprint of everything the city remembers (for tests)
    sim.stateHash = function () {
      var h = 2166136261 >>> 0, str = JSON.stringify([working.rel, working.mem, working.lastGood, evSeq, settled]);
      for (var q = 0; q < str.length; q++) { h ^= str.charCodeAt(q); h = Math.imul(h, 16777619); }
      return h >>> 0;
    };
    sim.ledgerHash = function (fromDay) {
      var h = 2166136261 >>> 0;
      events.forEach(function (e) {
        if (fromDay && e.day < fromDay) return;
        var str = e.id + ':' + e.at + ':' + e.kind + ':' + e.a + e.b + ':' + e.placeKey + ':' + e.dl.map(function (x) { return x.da + ',' + x.dt + ',' + x.dr; }).join(';');
        for (var q = 0; q < str.length; q++) { h ^= str.charCodeAt(q); h = Math.imul(h, 16777619); }
      });
      return h >>> 0;
    };
    sim.relLabel = relLabel; sim.relScore = relScore;
    return sim;
  }

  AH.createSim = create;
  AH.TRAIT_KEYS = TRAITS;
  AH.LOOKS = { styles: STYLES, accs: ACCS, scales: SCALES };
  AH.relLabel = relLabel; AH.relScore = relScore;
})();
