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
