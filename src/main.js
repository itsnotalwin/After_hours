/* AFTERHOURS — camera, input, rendering loop, UI. Phase 2b: built for a town of about forty. */
(function () {
  'use strict';
  var AH = window.AH, art = AH.art, E = AH.ISO.E, SS = art.SS;
  var SAVE_KEY = 'afterhours.v1';
  var DAYLEN = 1440, LINE_DUR = 4, MAX_AWAY = 30 * DAYLEN, POP = 40, TOP_BONDS = 6;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('view'), ctx = canvas.getContext('2d');
  var vw = 0, vh = 0, dpr = 1;
  var world, sim, seed, popN = POP, cam = { x: 0, y: 250, zoom: 1 }, zoomGoal = null;
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
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function nameList(names, max) {
    if (names.length <= max) return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : (names[0] || '');
    return names.slice(0, max).join(', ') + ' and ' + plural(names.length - max, 'other');
  }
  function clampN(x, a, b) { return x < a ? a : x > b ? b : x; }

  /* ---------- save / load ---------- */
  function loadSave() { try { var s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.v === 1 && typeof s.seed === 'number') return s; } catch (e) {} return null; }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, seed: seed, n: popN, t: sim.t, savedAt: Date.now() })); } catch (e) {} saveSnap(); }
  // The city's memory as it stood when the current day began. Loading from it means the history is never replayed from day 0,
  // so the wait does not grow as the city ages. (Older ledger entries are kept as one-liners, newest ~1800.)
  var SNAP_KEY = 'afterhours.snap.v1', snapDay = -1;
  function loadSnap(sd, n) { try { var s = JSON.parse(localStorage.getItem(SNAP_KEY)); if (s && s.seed === sd && s.n === n) return s; } catch (e) {} return null; }
  function saveSnap() {
    if (!sim) return;
    var d = Math.floor(sim.t / DAYLEN); if (d === snapDay) return;
    var snap = sim.snapshot(sim.t); if (!snap) return;
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(snap)); snapDay = d; }
    catch (e) { try { snap.events = snap.events.slice(-250); localStorage.setItem(SNAP_KEY, JSON.stringify(snap)); snapDay = d; } catch (e2) {} }
  }

  var awayMin = 0, awayFrom = 0;
  function start(newSeed) {
    var saved = newSeed ? null : loadSave();
    seed = newSeed || (saved ? saved.seed : Math.floor(Math.random() * 900000) + 100000);
    popN = (saved && saved.n > 0) ? Math.min(46, saved.n | 0) : POP;   // saves from before the town grew have no "n": they get the full town
    var t0 = saved ? saved.t : 7 * 60 + 10;
    awayMin = 0; awayFrom = t0;
    if (saved) { var el = (Date.now() - saved.savedAt) / 1000; if (el > 60) awayMin = Math.min(el * 1, MAX_AWAY); }
    world = AH.generateWorld(seed);
    sim = AH.createSim(world, seed, t0 + awayMin, { count: popN, snapshot: saved ? loadSnap(seed, popN) : null });
    popN = sim.N; snapDay = -1;
    lastT = sim.t;
    sts = []; talk = []; live = []; inside = {}; insideIds = [];
    selected = follow = -1;
    bondKey = ''; bondsAll = false; stripKey = ''; webPos = null; webSel = null; lastToast = -1e9;
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
  // The board is 1024 world px across. On a portrait phone the opening view is a legible crop of the middle (the empty corners fall
  // off the sides); `whole` is the fit button: the entire diamond, tips included, small but with the rooftop counts still readable.
  function fit(whole) {
    var portrait = vh > vw;
    cam.x = 0; cam.y = 236;
    if (portrait) cam.zoom = whole ? Math.max(0.3, Math.min(1.1, vw / 1060)) : Math.max(0.62, Math.min(1.1, vw / 640));
    else cam.zoom = Math.max(0.5, Math.min(1.5, Math.min(vw / 1120, (vh - 40) / 700)));
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
  var bs = [], bById = {}, staticSlots = [], B = 0, vx0 = 0, vx1 = 0, vy0 = 0, vy1 = 0;
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
    B = bs.length; staticSlots = []; bById = {};
    world.buildings.forEach(function (b) { bById[b.id] = b; });
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
    if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1 + 30) return;
    art.drawFigure(ctx, { x: p.x, y: p.y, style: ch.style, acc: ch.acc, sc: ch.sc, dir: st.dir, phase: st.walkDist * 3.1, moving: st.moving, sit: st.sit, nf: nf, alpha: st.alpha, t: now / 1000, selected: selected === ch.id && st.vis });
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

  /* ---------- who is where: rooftop counts, live conversations ---------- */
  var inside = {}, insideIds = [], talk = [], live = [];
  function updateInside() {
    inside = {}; insideIds.length = 0;
    for (var i = 0; i < sim.chars.length; i++) {
      var st = sts[i];
      if (!st.vis && st.inB) { var k = st.inB.id; if (!inside[k]) { inside[k] = []; insideIds.push(k); } inside[k].push(i); }
    }
  }
  // conversations that are going on right now (talk[i] is the one person i is in, if any)
  function updateLive() {
    var t = sim.t, n = sim.chars.length, i;
    for (i = 0; i < n; i++) talk[i] = null;
    live.length = 0;
    var evs = sim.todayLines(t);
    for (i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (t >= ev.at && t <= ev.end + 1) { live.push(ev); talk[ev.a] = ev; talk[ev.b] = ev; }
    }
    live.sort(function (p, q) { return ((q.tone === 'tense') - (p.tone === 'tense')) || q.imp - p.imp || p.id - q.id; });
  }
  // where a citizen's marker sits on screen: above the head outdoors, on the roof of their building indoors
  function roofPos(b) { var q = AH.iso(b.doorEdge.x, b.doorEdge.y, E); return toScreen(q.x, q.y - b.H - 10); }
  function pipPos(i) {
    var st = sts[i];
    if (st.vis) { var q = AH.iso(st.x, st.y, st.z); return toScreen(q.x, q.y - 22); }
    return roofPos(st.inB);
  }
  // where a speech bubble's tail should end for person i, given what is drawn at their marker
  function bubbleTop(i) {
    var st = sts[i], p = pipPos(i), sel = selected === i;
    if (st.vis) return sel ? p.y - 22 : p.y - 2;
    return sel ? (inside[st.inB.id].length > 1 ? p.y - 48 : p.y - 24) : p.y - 22;
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
  function measureBubble(L) {
    if (L._m) return L._m;
    ctx.font = 'italic 600 13px ' + art.SERIF;
    var lines = wrapText(L.text, 172), tw = 0;
    lines.forEach(function (l) { tw = Math.max(tw, ctx.measureText(l).width); });
    var name = sim.chars[L.who].first.toUpperCase();
    ctx.font = '700 9px ' + art.SANS; if ('letterSpacing' in ctx) ctx.letterSpacing = '1.4px';
    var nw = ctx.measureText(name).width;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    L._m = { lines: lines, name: name, w: Math.max(tw, nw) + 26, h: 14 + lines.length * 17 + 16 };
    return L._m;
  }
  function overlaps(x, y, w, h, rects) {
    for (var i = 0; i < rects.length; i++) { var r = rects[i]; if (x < r[0] + r[2] + 4 && x + w + 4 > r[0] && y < r[1] + r[3] + 4 && y + h + 4 > r[1]) return true; }
    return false;
  }
  // with forty people several conversations can be going on in view: keep the best few, and slide them apart so none sits on another
  function placeBubbles() {
    var cand = [], z = cam.zoom, maxN = z < 0.8 ? 3 : z < 1.4 ? 5 : 8;
    bubbles.forEach(function (b) {
      var i = b.L.who, p = pipPos(i);
      if (p.x < -20 || p.x > vw + 20 || p.y < 40 || p.y > vh + 40) return;
      var mine = selected === i || follow === i || (selected >= 0 && (b.ev.a === selected || b.ev.b === selected));
      cand.push({ b: b, p: p, i: i, pr: (mine ? 1000 : 0) + (b.ev.tone === 'tense' ? 200 : 0) + b.ev.imp * 20 - Math.hypot(p.x - vw / 2, p.y - vh / 2) * 0.05 });
    });
    cand.sort(function (x, y) { return y.pr - x.pr; });
    var out = [], rects = [];
    if (selected >= 0 && sts[selected]) {
      var sp = pipPos(selected), grp = !sts[selected].vis && inside[sts[selected].inB.id].length > 1;
      rects.push([sp.x - 34, sp.y - (grp ? 48 : 24), 68, grp ? 50 : 26]);
    }
    for (var k = 0; k < cand.length && out.length < maxN; k++) {
      var c = cand[k], m = measureBubble(c.b.L), top = bubbleTop(c.i), w = m.w, h = m.h;
      var bx0 = Math.max(8, Math.min(vw - 8 - w, c.p.x - w / 2)), by0 = Math.max(70, top - 12 - h), found = null;
      var spots = [[0, 0], [w + 10, 0], [-(w + 10), 0], [0, -(h + 8)], [w + 10, -(h + 8)], [-(w + 10), -(h + 8)], [0, -2 * (h + 8)]];
      for (var q = 0; q < spots.length && !found; q++) {
        var bx = bx0 + spots[q][0], by = by0 + spots[q][1];
        if (bx < 8 || bx + w > vw - 8 || by < 66) continue;
        if (!overlaps(bx, by, w, h, rects)) found = { x: bx, y: by };
      }
      if (!found && c.pr >= 1000) found = { x: bx0, y: by0 };
      if (!found) continue;
      rects.push([found.x, found.y, w, h]);
      out.push({ b: c.b, p: c.p, m: m, x: found.x, y: found.y, top: top });
    }
    return out;
  }
  function drawBubble(pl, nf) {
    var it = pl.b, tense = it.ev.tone === 'tense', night = nf > 0.5, m = pl.m, p = pl.p, top = pl.top, bx = pl.x, by = pl.y, w = m.w, h = m.h;
    var a = Math.max(0, Math.min(1, it.age / 0.4, (LINE_DUR - it.age) / 0.6));
    ctx.save(); ctx.globalAlpha = a;
    var fill = tense ? '#C8102E' : night ? '#171717' : '#FFFFFF', edge = tense ? '#7A0A1C' : night ? '#F2F2F2' : '#0A0A0A', fg = tense ? '#FFFFFF' : night ? '#F2F2F2' : '#0A0A0A';
    ctx.fillStyle = night ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.17)'; AH.rr(ctx, bx + 2.5, by + 3.5, w, h, 12); ctx.fill();
    ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = 1.5; AH.rr(ctx, bx, by, w, h, 12); ctx.fill(); ctx.stroke();
    if (by + h < top - 3) {
      var tx = Math.max(bx + 18, Math.min(bx + w - 18, p.x));
      ctx.beginPath(); ctx.moveTo(tx - 6, by + h - 1); ctx.lineTo(p.x, top - 2); ctx.lineTo(tx + 6, by + h - 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx - 6, by + h); ctx.lineTo(p.x, top - 2); ctx.lineTo(tx + 6, by + h); ctx.stroke();
      ctx.fillStyle = fill; ctx.fillRect(tx - 5, by + h - 2, 10, 3);
    }
    ctx.font = '700 9px ' + art.SANS; if ('letterSpacing' in ctx) ctx.letterSpacing = '1.4px';
    ctx.fillStyle = tense ? 'rgba(255,255,255,.8)' : (night ? '#8C8C8C' : '#7A7A7A'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(m.name, bx + 13, by + 13);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = fg; ctx.font = 'italic 600 13px ' + art.SERIF;
    m.lines.forEach(function (l, k) { ctx.fillText(l, bx + 13, by + 14 + 15 + k * 17 - 2); });
    ctx.restore();
  }

  /* screen-space markers: name tag for the chosen one, a count on every roof with people inside, small names when zoomed in */
  function drawTag(x, y, label, bg, fg) {
    ctx.save(); ctx.translate(x, y);
    ctx.font = '700 10px ' + art.SANS; if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
    var w = ctx.measureText(label).width + 22;
    ctx.fillStyle = bg; AH.rr(ctx, -w / 2, -22, w, 20, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, -2.5); ctx.lineTo(0, 3); ctx.lineTo(4, -2.5); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, -11.5);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.restore();
  }
  function drawDisc(x, y, txt, bg, fg) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, -8, 9, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-3.5, -0.5); ctx.lineTo(0, 4); ctx.lineTo(3.5, -0.5); ctx.fill();
    ctx.fillStyle = fg; ctx.font = '800 11px ' + art.SERIF; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, -7.5);
    ctx.restore();
  }
  function drawPill(x, y, txt, bg, fg) {
    ctx.save(); ctx.translate(x, y);
    ctx.font = '800 12px ' + art.SERIF;
    var w = Math.max(22, ctx.measureText(txt).width + 14);
    ctx.fillStyle = bg; AH.rr(ctx, -w / 2, -19, w, 18, 9); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-3.5, -1.5); ctx.lineTo(0, 4); ctx.lineTo(3.5, -1.5); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, -9.5);
    ctx.restore();
  }
  function drawMarkers(nf) {
    var night = nf > 0.5, bg = night ? '#F2F2F2' : '#0A0A0A', fg = night ? '#0A0A0A' : '#FFFFFF', i, p;
    // roofs: one person shows their initial, a group shows how many
    insideIds.forEach(function (bid) {
      var list = inside[bid], p2 = roofPos(bById[bid]);
      if (p2.x < -30 || p2.x > vw + 30 || p2.y < -10 || p2.y > vh + 70) return;
      if (list.length === 1) {
        var ch = sim.chars[list[0]];
        if (selected === ch.id) drawTag(p2.x, p2.y, ch.first.toUpperCase(), bg, fg); else drawDisc(p2.x, p2.y, ch.initial, bg, fg);
      } else {
        drawPill(p2.x, p2.y, String(list.length), bg, fg);
        if (list.indexOf(selected) >= 0) drawTag(p2.x, p2.y - 24, sim.chars[selected].first.toUpperCase(), bg, fg);
      }
    });
    // outdoors: the chosen one gets a tag; up close, everyone gets a small name
    var speaking = {}, close = cam.zoom >= 1.5, taken = [], order = [];
    bubbles.forEach(function (b) { speaking[b.L.who] = true; });
    for (i = 0; i < sim.chars.length; i++) {
      var st = sts[i]; if (!st.vis) continue;
      p = pipPos(i);
      if (p.x < -30 || p.x > vw + 30 || p.y < -30 || p.y > vh + 30) continue;
      if (selected === i) { drawTag(p.x, p.y, sim.chars[i].first.toUpperCase(), bg, fg); continue; }
      if (close && !speaking[i] && st.alpha >= 0.6 && st.slot === B) order.push({ i: i, p: p });
    }
    if (order.length) {
      order.sort(function (a, b) { return b.p.y - a.p.y; });     // the ones nearest the viewer get their names first
      ctx.save(); ctx.font = '700 9px ' + art.SANS; if ('letterSpacing' in ctx) ctx.letterSpacing = '1.3px';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.2;
      ctx.strokeStyle = night ? 'rgba(11,11,11,.85)' : 'rgba(241,241,241,.9)'; ctx.fillStyle = night ? '#F2F2F2' : '#0A0A0A';
      order.forEach(function (o) {
        var nm = sim.chars[o.i].first.toUpperCase(), w = ctx.measureText(nm).width + 4, x0 = o.p.x - w / 2, y0 = o.p.y - 12;
        if (overlaps(x0, y0, w, 13, taken)) return;
        taken.push([x0, y0, w, 13]);
        ctx.strokeText(nm, o.p.x, o.p.y - 5); ctx.fillText(nm, o.p.x, o.p.y - 5);
      });
      ctx.restore();
    }
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
      var s = st.slot = slotFor(st.x, st.y, st.z); (dyn[s] = dyn[s] || []).push({ k: 'char', ch: ch, st: st, key: st.x + st.y + 0.001 + ch.id * 1e-6 });
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMarkers(nf);
    placeBubbles().reverse().forEach(function (pl) { drawBubble(pl, nf); });   // best-placed bubbles end up on top
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
  // a building with people in it opens that list (or goes straight to the person if there is only one)
  function openInside(b) {
    var list = inside[b.id] || [];
    if (list.length === 1) { select(list[0], true); return; }
    if (list.length > 1) { openPeople(b); return; }
    var res = sim.residents[b.id], stf = sim.staff[b.id], info = res ? plural(res.length, 'person', 'people') + ' live here' : stf ? plural(stf.length, 'person', 'people') + ' work here' : '';
    tip(b.name + ' · ' + KIND[b.kind] + (info ? ' · ' + info : '') + ' · empty now');
  }
  function tap(sx, sy) {
    var bestD = 1e9, act = null, rad = Math.min(30, 18 + 6 * cam.zoom);
    sim.chars.forEach(function (ch, i) {
      var st = sts[i]; if (!st.vis) return;
      var q = AH.iso(st.x, st.y, st.z), c = toScreen(q.x, q.y - 11), d = Math.hypot(c.x - sx, c.y - sy);
      if (d < rad && d < bestD) { bestD = d; act = function () { select(i, true); }; }
    });
    insideIds.forEach(function (bid) {
      var p = roofPos(bById[bid]), d = Math.hypot(p.x - sx, p.y - 9 - sy);
      if (d < 21 && d < bestD) { bestD = d; act = function () { openInside(bById[bid]); }; }
    });
    if (act) { act(); return; }
    var w = toWorld(sx, sy), hit = null;
    for (var i = B - 1; i >= 0 && !hit; i--) {
      var b = bs[i];
      for (var zz = E + b.H; zz >= E && !hit; zz -= 6) {
        var g = AH.unIso(w.x, w.y, zz);
        if (g.x >= b.x0 && g.x <= b.x1 && g.y >= b.y0 && g.y <= b.y1) hit = b;
      }
    }
    if (hit) openInside(hit);
  }

  var keys = {};
  window.addEventListener('keydown', function (e) {
    if (!$('cover').classList.contains('gone')) return;
    if (anyOverlay()) { if (e.key === 'Escape') closeOverlays(); return; }
    var k = e.key.toLowerCase();
    keys[k] = true;
    if (e.key === ']' || k === 'n') step(1);
    else if (e.key === '[' || k === 'b') step(-1);
    else if (k === 'p') openPeople();
    else if (e.key === 'Escape') select(-1);
    else if (k === 'f' && selected >= 0) toggleFollow();
    else if (e.key === '+' || e.key === '=') zoomAt(1.2, vw / 2, vh / 2);
    else if (e.key === '-') zoomAt(1 / 1.2, vw / 2, vh / 2);
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  function keyPan(dt) {
    var dx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0), dy = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
    if (dx || dy) { breakFollow(); cam.x += dx * 520 * dt / cam.zoom; cam.y += dy * 520 * dt / cam.zoom; clampCam(); }
  }

  /* ---------- UI: the strip of live conversations, the citizen card ---------- */
  var uiCache = {}, bondKey = '', bondsAll = false, stripKey = '';
  function setText(id, v) { if (uiCache[id] !== v) { uiCache[id] = v; $(id).textContent = v; } }
  function isHot(label) { return label === 'Rival' || label === 'Bitter'; }
  function strength(r) { return Math.abs(AH.relScore(r)) + 0.6 * r.r + (r.met ? 0.04 : 0); }
  function avatar(ch, cls) { return '<i class="av s' + ch.style + (cls ? ' ' + cls : '') + '"><span>' + esc(ch.initial) + '</span></i>'; }
  function jobLine(ch) { return ch.job.b ? ch.job.title + ' · ' + ch.job.b.name : ch.job.title; }
  function homeLine(ch) {
    var mates = (sim.residents[ch.home.id] || []).filter(function (id) { return id !== ch.id; }).map(function (id) { return sim.chars[id].first; });
    return 'Lives at ' + ch.home.name + (mates.length ? ' with ' + nameList(mates, 3) : ', alone');
  }

  // conversations happening now, as chips: tap one to follow the people in it
  function refreshStrip(force) {
    var evs = live.slice(0, 6), key = evs.map(function (e) { return e.id; }).join(',') + '|' + selected;
    if (!force && key === stripKey) return;
    stripKey = key;
    var host = $('chips'), sl = host.scrollLeft;
    if (!evs.length) { host.innerHTML = '<span class="quiet">Nobody is talking right now. Tap anyone to follow them.</span>'; return; }
    var h = '';
    evs.forEach(function (ev) {
      var A = sim.chars[ev.a], Bc = sim.chars[ev.b], tense = ev.tone === 'tense';
      h += '<button class="chip' + (tense ? ' hot' : '') + (selected === ev.a || selected === ev.b ? ' on' : '') + '" data-a="' + ev.a + '" aria-label="' + esc(A.first + ' and ' + Bc.first + (tense ? ', arguing' : ', talking')) + '">' +
        '<span class="pair">' + avatar(A) + avatar(Bc) + '</span><span class="nm">' + esc(A.first) + ' &amp; ' + esc(Bc.first) + '</span></button>';
    });
    host.innerHTML = h; host.scrollLeft = sl;     // keep the place if the person has scrolled the row
  }
  $('chips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    select(+c.getAttribute('data-a'), true);
  });

  function select(i, andFollow) {
    if (i !== selected) { bondsAll = false; bondKey = ''; }
    selected = i; follow = (i >= 0 && andFollow) ? i : -1;
    if (follow >= 0) zoomGoal = Math.max(cam.zoom, 1.9);
    syncUI(true);
  }
  function step(dir) {
    var n = sim.chars.length; if (!n) return;
    select(selected < 0 ? (dir > 0 ? 0 : n - 1) : (selected + dir + n) % n, true);
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
  function meters(r) { return meter('AFFINITY', r.a, true, r.a < -0.25) + meter('TRUST', r.t, false, r.t < 0.35) + meter('RIVALRY', r.r, false, r.r > 0.45); }
  function refreshCard(force) {
    if (selected < 0) return;
    var ch = sim.chars[selected], t = sim.t, g = sim.goal(ch.id, t), s = sim.view(t);
    setText('dGoal', g.text);
    var th = sim.thought(ch.id, t, s), te = $('dThought');
    if (uiCache.th !== th) { uiCache.th = th; te.hidden = !th; te.textContent = th; te.classList.toggle('bad', th.indexOf('Still bothered') === 0); }
    var rows = [], known = 0;
    sim.chars.forEach(function (o) {
      if (o.id === ch.id) return;
      var r = s.rel[ch.id][o.id]; if (r.met) known++;
      rows.push({ o: o, r: r, lab: AH.relLabel(r), k: strength(r) });
    });
    rows.sort(function (p, q) { return q.k - p.k || p.o.id - q.o.id; });
    var shown = bondsAll ? rows : rows.filter(function (x) { return x.r.met; }).slice(0, TOP_BONDS);
    var key = selected + '|' + (bondsAll ? 1 : 0) + '|' + known + '|', h = '';
    shown.forEach(function (x) {
      var r = x.r, kin = sim.kin(ch.id, x.o.id);
      key += x.o.id + x.lab + r.a + r.t + r.r + '|';
      h += '<button class="bond" data-b="' + x.o.id + '"><span class="who">' + esc(x.o.first) + ' ' + esc(x.o.last) + (kin ? '<em>' + kin + '</em>' : '') + '</span><span class="lbl' + (isHot(x.lab) ? ' hot' : '') + '">' + x.lab + '</span>' +
        '<span class="bars">' + meters(r) + '</span></button>';
    });
    if (!shown.length) h = '<p class="hint small">Has not met anyone yet.</p>';
    var more = bondsAll ? 'Everyone, strongest feelings first. <button class="linkbtn" data-more="1">Show fewer</button>'
      : 'Knows ' + known + ' of ' + rows.length + (known > TOP_BONDS ? ', the ' + TOP_BONDS + ' strongest shown. ' : '. ') + '<button class="linkbtn" data-more="1">Show everyone</button>';
    if (force || key !== bondKey) { bondKey = key; $('dBonds').innerHTML = h; $('dMore').innerHTML = more; }
  }
  function syncUI(full) {
    updateFocus(); setTimeout(updateFocus, 420);
    $('sheet').classList.toggle('open', selected >= 0);
    $('followBtn').classList.toggle('on', follow >= 0 && follow === selected);
    $('followTxt').textContent = (follow >= 0 && follow === selected) ? 'FOLLOWING' : 'FOLLOW';
    refreshStrip(true);
    if (selected >= 0 && full) {
      var ch = sim.chars[selected];
      $('dName').textContent = ch.name; $('dJob').textContent = jobLine(ch); $('dHome').textContent = homeLine(ch); $('dBio').textContent = ch.bio;
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
  $('dMore').addEventListener('click', function (e) {
    if (!e.target.closest('[data-more]')) return;
    bondsAll = !bondsAll; refreshCard(true);
  });
  $('allBonds').addEventListener('click', function () { if (selected >= 0) openWeb(selected); });
  $('storyBtn').addEventListener('click', function () { if (selected >= 0) openHist(selected); });
  $('prevBtn').addEventListener('click', function () { step(-1); });
  $('nextBtn').addEventListener('click', function () { step(1); });
  $('closeBtn').addEventListener('click', function () { select(-1); });
  function updateUI() {
    setText('dayTxt', 'DAY ' + (clock.day + 1) + ' · ' + clock.dayName);
    setText('timeTxt', clock.str);
    var night = clock.nf > 0.5;
    if (night !== document.body.classList.contains('night')) {
      document.body.classList.toggle('night', night);
      var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', night ? '#0B0B0B' : '#F1F1F1');
    }
    if (selected >= 0 && sts[selected]) {
      var ev = talk[selected], lab = sts[selected].label;
      setText('dNow', ev ? (ev.tone === 'tense' ? 'Arguing with ' : 'Talking with ') + sim.chars[ev.a === selected ? ev.b : ev.a].first : lab);
    }
  }

  /* ---------- red toast on conflict: only when it matters ---------- */
  var alertT = 0, alertEv = null, lastToast = -1e9;
  function showAlert(ev) {
    var el = $('alert'); alertEv = ev;
    $('alertTxt').textContent = ev.head;
    el.hidden = false; void el.offsetWidth; el.classList.add('on');
    clearTimeout(alertT); alertT = setTimeout(hideAlert, 7500);
  }
  function hideAlert() { var el = $('alert'); el.classList.remove('on'); clearTimeout(alertT); alertT = setTimeout(function () { el.hidden = true; }, 350); }
  // a town of forty argues about ten times a day. Red stays meaningful: rows involving the person you are watching,
  // or the big ones, with a cooldown. Everything else is still in the ledger.
  function maybeAlert(ev) {
    if (anyOverlay()) return;
    var now = performance.now(), mine = selected >= 0 && (ev.a === selected || ev.b === selected);
    if (mine) { if (now - lastToast < 6000) return; }
    else if (ev.imp < 1.15 || now - lastToast < 45000) return;
    lastToast = now; showAlert(ev);
  }
  $('alert').addEventListener('click', function () { if (alertEv) select(alertEv.a, true); hideAlert(); });

  /* ---------- away report ---------- */
  function kindWord(k, n) { return { argument: ['row', 'rows'], laugh: ['laugh', 'laughs'], favour: ['favour', 'favours'], chat: ['chat', 'chats'] }[k][n === 1 ? 0 : 1]; }
  function summarize(evs) {
    var c = { argument: 0, laugh: 0, favour: 0, chat: 0 }, parts = [], first = 0;
    evs.forEach(function (e) { c[e.kind]++; if (e.first) first++; });
    ['argument', 'laugh', 'favour', 'chat'].forEach(function (k) { if (c[k]) parts.push(c[k] + ' ' + kindWord(k, c[k])); });
    var s = nameList(parts, 4);
    if (first) s += ', ' + (first === 1 ? 'one of them a first meeting' : first + ' of them first meetings');
    return s;
  }
  function topEvents(from, to) {
    var evs = sim.eventsBetween(from, to).filter(function (e) { return e.at <= to; }), per = {}, pick = [];
    evs.slice().sort(function (p, q) { return q.imp - p.imp || p.at - q.at; }).forEach(function (e) {
      if (pick.length >= 5 || (per[e.kind] || 0) >= 2) return;     // a mix: never five rows in a row
      per[e.kind] = (per[e.kind] || 0) + 1; pick.push(e);
    });
    pick.sort(function (p, q) { return p.at - q.at; });
    return { all: evs.length, pick: pick, evs: evs };
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
    $('awayOvSub').textContent = dur(to - from) + ' passed · ' + (r.all ? plural(r.all, 'thing') + ' happened' : 'a quiet stretch');
    if (r.all) { var li = document.createElement('li'); li.innerHTML = '<time>In all</time><span>' + esc(summarize(r.evs)) + '</span>'; $('awayOvList').appendChild(li); }
    if (!r.all) $('awayOvList').innerHTML = '<li><time></time><span>Nothing much. Everyone carried on.</span></li>';
    closeOverlays(); $('awayOv').hidden = false;
  }

  /* ---------- the people list ---------- */
  var ppl = { filter: 'all', q: '', place: null }, pplT = 0, pplTouch = false;
  var PFILTERS = [['all', 'Everyone'], ['now', 'Talking'], ['out', 'Outside'], ['trouble', 'Trouble']];
  function openPeople(place) {
    closeOverlays(); ppl.filter = 'all'; ppl.q = ''; ppl.place = (place && place.id) ? place : null; $('peopleQ').value = '';
    uiCache.pplH = uiCache.pplF = null; buildPeople(); $('people').hidden = false; $('peopleList').scrollTop = 0;
    clearInterval(pplT); pplT = setInterval(function () { if ($('people').hidden) clearInterval(pplT); else if (!pplTouch) buildPeople(); }, 1500);
  }
  function buildPeople() {
    var n = sim.chars.length, s = sim.view(sim.t), i, j, hotOf = [], q = ppl.q.trim().toLowerCase();
    var nTalk = 0, nOut = 0, nTrouble = 0;
    for (i = 0; i < n; i++) {
      var worst = -1, wv = 0;
      for (j = 0; j < n; j++) {
        if (i === j) continue;
        var r = s.rel[i][j];
        if (isHot(AH.relLabel(r))) { var v = r.r - r.a; if (v > wv) { wv = v; worst = j; } }
      }
      hotOf[i] = worst;
      if (talk[i]) nTalk++;
      if (sts[i].vis) nOut++;
      if (worst >= 0 || (talk[i] && talk[i].tone === 'tense')) nTrouble++;
    }
    function passes(i) {
      var ch = sim.chars[i], st = sts[i];
      if (ppl.place && !(st.inB === ppl.place && !st.vis)) return false;
      if (ppl.filter === 'now' && !talk[i]) return false;
      if (ppl.filter === 'out' && !st.vis) return false;
      if (ppl.filter === 'trouble' && !(hotOf[i] >= 0 || (talk[i] && talk[i].tone === 'tense'))) return false;
      if (q) {
        var hay = (ch.name + ' ' + ch.job.title + ' ' + (ch.job.b ? ch.job.b.name : '') + ' ' + ch.home.name).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }
    function row(i) {
      var ch = sim.chars[i], st = sts[i], ev = talk[i], now, hot = false;
      if (ev) { hot = ev.tone === 'tense'; now = (hot ? 'Arguing with ' : 'Talking with ') + sim.chars[ev.a === i ? ev.b : ev.a].first; }
      else now = st.label;
      var feud = hotOf[i] >= 0 ? '<span class="feud">Bad blood with ' + esc(sim.chars[hotOf[i]].first) + '</span>' : '';
      return '<button class="prow" data-i="' + i + '">' + avatar(ch) + '<span class="pwho"><b>' + esc(ch.name) + '</b><small>' + esc(jobLine(ch)) + '</small>' + feud + '</span><span class="pnow' + (hot ? ' hot' : '') + '">' + esc(now) + '</span></button>';
    }
    var out = '', count = 0, grouped = ppl.filter === 'all' && !q && !ppl.place;
    if (grouped) {
      world.homes.forEach(function (hm) {
        var ids = (sim.residents[hm.id] || []); if (!ids.length) return;
        out += '<div class="pgroup"><span>' + esc(hm.name.toUpperCase()) + '</span><span>' + plural(ids.length, 'person', 'people') + '</span></div>';
        ids.forEach(function (id) { out += row(id); count++; });
      });
    } else {
      var ids2 = []; for (i = 0; i < n; i++) if (passes(i)) ids2.push(i);
      ids2.sort(function (a, b) { return sim.chars[a].first < sim.chars[b].first ? -1 : sim.chars[a].first > sim.chars[b].first ? 1 : a - b; });
      ids2.forEach(function (id) { out += row(id); count++; });
    }
    if (!count) out = '<p class="hempty">' + (ppl.place ? 'Nobody is inside right now.' : 'Nobody matches.') + '</p>';
    // header, filters
    var title = ppl.place ? 'Inside ' + ppl.place.name : 'The people';
    setText('peopleTitle', title);
    setText('peopleSub', ppl.place ? plural(count, 'person', 'people') + ' inside · ' + KIND[ppl.place.kind] : plural(n, 'citizen') + ' · ' + nTalk + ' talking · ' + nOut + ' outside');
    var f = '';
    if (ppl.place) f = '<button class="fl on" data-clear="1">Inside ' + esc(ppl.place.name) + ' &times;</button>';
    else PFILTERS.forEach(function (x) {
      var c = x[0] === 'all' ? n : x[0] === 'now' ? nTalk : x[0] === 'out' ? nOut : nTrouble;
      f += '<button class="fl' + (ppl.filter === x[0] ? ' on' : '') + '" data-f="' + x[0] + '">' + x[1] + ' ' + c + '</button>';
    });
    if (uiCache.pplF !== f) { uiCache.pplF = f; $('peopleFilters').innerHTML = f; }
    if (uiCache.pplH !== out) { uiCache.pplH = out; $('peopleList').innerHTML = out; }
  }
  $('peopleFilters').addEventListener('click', function (e) {
    var b = e.target.closest('.fl'); if (!b) return;
    if (b.hasAttribute('data-clear')) ppl.place = null; else ppl.filter = b.getAttribute('data-f');
    uiCache.pplF = uiCache.pplH = null; buildPeople();
  });
  $('peopleQ').addEventListener('input', function () { ppl.q = this.value; uiCache.pplH = null; buildPeople(); });
  $('peopleList').addEventListener('click', function (e) {
    var b = e.target.closest('.prow'); if (!b) return;
    closeOverlays(); select(+b.getAttribute('data-i'), true);
  });
  $('peopleList').addEventListener('pointerdown', function () { pplTouch = true; });
  Array.prototype.forEach.call(['pointerup', 'pointercancel', 'pointerleave'], function (t) { $('peopleList').addEventListener(t, function () { setTimeout(function () { pplTouch = false; }, 120); }); });
  $('peopleBtn').addEventListener('click', function () { openPeople(); });

  /* ---------- ledger (history) overlay ---------- */
  var hist = { kind: 'all', who: -1, limit: 120 };
  var HKINDS = [['all', 'Everything'], ['argument', 'Rows'], ['warm', 'Warm'], ['first', 'First meetings']];
  function openHist(who) {
    closeOverlays(); hist.kind = 'all'; hist.who = (typeof who === 'number') ? who : -1; hist.limit = 120; buildHist(); $('hist').hidden = false; $('hist').scrollTop = 0;
  }
  function histMatch(e) {
    if (e.at > sim.t) return false;
    if (hist.who >= 0 && e.a !== hist.who && e.b !== hist.who) return false;
    if (hist.kind === 'argument') return e.kind === 'argument';
    if (hist.kind === 'warm') return e.tone === 'warm';
    if (hist.kind === 'first') return !!e.first;
    return true;
  }
  function buildHist() {
    var f = '';
    HKINDS.forEach(function (k) { f += '<button class="fl' + (hist.kind === k[0] ? ' on' : '') + '" data-k="' + k[0] + '">' + k[1] + '</button>'; });
    var names = sim.chars.slice().sort(function (a, b) { return a.first < b.first ? -1 : a.first > b.first ? 1 : a.id - b.id; });
    f += '<select class="fl sel' + (hist.who >= 0 ? ' on' : '') + '" id="histWho" aria-label="Whose story"><option value="-1">Everyone</option>';
    names.forEach(function (c) { f += '<option value="' + c.id + '"' + (hist.who === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; });
    f += '</select>';
    $('histFilters').innerHTML = f;
    var all = sim.events.filter(histMatch), shown = all.slice(-hist.limit).reverse(), perDay = {};
    all.forEach(function (e) { perDay[e.day] = (perDay[e.day] || 0) + 1; });
    var out = '', day = -1;
    shown.forEach(function (ev) {
      var d = Math.floor(ev.at / DAYLEN);
      if (d !== day) { day = d; out += '<div class="hday">DAY ' + (d + 1) + ' · ' + ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][((d % 7) + 7) % 7] + ' · ' + plural(perDay[d] || 0, 'EVENT', 'EVENTS') + '</div>'; }
      if (ev.old) { out += '<div class="hrow ' + ev.tone + ' flat"><div class="sum"><time>' + hhmm(ev.at) + '</time><i class="dot ' + ev.tone + '"></i><span>' + esc(ev.head) + '</span></div></div>'; return; }
      out += '<details class="hrow ' + ev.tone + '"><summary><time>' + hhmm(ev.at) + '</time><i class="dot ' + ev.tone + '"></i><span>' + esc(ev.head) + '</span></summary><div class="say">';
      ev.lines.forEach(function (L) { out += '<div><b>' + esc(sim.chars[L.who].first.toUpperCase()) + '</b>' + esc(L.text) + '</div>'; });
      out += '</div></details>';
    });
    $('histList').innerHTML = out || '<p class="hempty">' + (hist.kind === 'all' && hist.who < 0 ? 'Nothing has happened yet. Give the city a few hours.' : 'Nothing like that yet.') + '</p>';
    $('histSub').textContent = (hist.who >= 0 ? sim.chars[hist.who].name + ' · ' : '') + plural(all.length, 'event') + (all.length > shown.length ? ', newest ' + shown.length + ' shown' : ', newest first');
    $('histMore').hidden = all.length <= shown.length;
    $('histMore').textContent = 'SHOW EARLIER (' + (all.length - shown.length) + ' MORE)';
  }
  $('histFilters').addEventListener('click', function (e) {
    var b = e.target.closest('.fl[data-k]'); if (!b) return;
    hist.kind = b.getAttribute('data-k'); hist.limit = 120; buildHist();
  });
  $('histFilters').addEventListener('change', function (e) {
    if (e.target.id !== 'histWho') return;
    hist.who = +e.target.value; hist.limit = 120; buildHist();
  });
  $('histMore').addEventListener('click', function () { hist.limit += 160; buildHist(); });

  /* ---------- relationship web ---------- */
  var webPos = null, webSel = null, webT = 0, webFilter = 'all', webAll = false;
  function pairScore(s, i, j) { return (AH.relScore(s.rel[i][j]) + AH.relScore(s.rel[j][i])) / 2; }
  function pk(i, j) { return i < j ? i * 100 + j : j * 100 + i; }
  function webBig() { return sim.chars.length > 14; }
  function webDims() { return webBig() ? { w: 420, h: 420 } : { w: 420, h: 300 }; }
  // every pair that has met, strongest first
  function tieList(s) {
    var n = sim.chars.length, out = [], i, j;
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var ra = s.rel[i][j], rb = s.rel[j][i];
      if (!ra.met && !rb.met) continue;
      var sc = pairScore(s, i, j), rr = Math.max(ra.r, rb.r);
      out.push({ i: i, j: j, sc: sc, rr: rr, bad: sc < -0.12 || rr > 0.5, k: Math.abs(sc) + 0.6 * rr });
    }
    out.sort(function (p, q) { return q.k - p.k || p.i - q.i || p.j - q.j; });
    return out;
  }
  function layoutWeb(s) {
    var n = sim.chars.length, big = webBig(), D = webDims(), cx = D.w / 2, cy = D.h / 2, i, j, it, P = [], order = [];
    world.homes.forEach(function (h) { (sim.residents[h.id] || []).forEach(function (id) { order.push(id); }); });
    if (order.length !== n) { order = []; for (i = 0; i < n; i++) order.push(i); }
    var rad = Math.min(D.w, D.h) * (big ? 0.34 : 0.3);
    order.forEach(function (id, k) {     // start with households side by side on a ring
      var ang = 6.2832 * k / n - 1.5708, rr = rad * (big ? 0.7 + 0.3 * (k % 3) / 2 : 1);
      P[id] = { x: cx + rr * Math.cos(ang), y: cy + (big ? 1 : 0.9) * rr * Math.sin(ang), fx: 0, fy: 0 };
    });
    var springs = [];
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var met = s.rel[i][j].met + s.rel[j][i].met;
      if (!met && big) continue;
      var sc = clampN(pairScore(s, i, j), -1, 1);
      springs.push({ i: i, j: j, k: big ? 0.02 + 0.05 * Math.min(1, 0.25 + Math.abs(sc) * 2) : 0.06, L: big ? 58 - 30 * sc : 150 - 80 * sc });
    }
    var rK = big ? 3600 : 2600, grav = big ? 0.012 : 0.01, iters = big ? 280 : 320;
    for (it = 0; it < iters; it++) {
      for (i = 0; i < n; i++) { P[i].fx = (cx - P[i].x) * grav; P[i].fy = (cy - P[i].y) * grav; }
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        var dx = P[j].x - P[i].x, dy = P[j].y - P[i].y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2) || 1, rep = rK / Math.max(64, d2), ux = dx / d, uy = dy / d;
        P[i].fx -= ux * rep; P[i].fy -= uy * rep; P[j].fx += ux * rep; P[j].fy += uy * rep;
      }
      for (var q = 0; q < springs.length; q++) {
        var e = springs[q], a = P[e.i], b = P[e.j], ex = b.x - a.x, ey = b.y - a.y, ed = Math.max(1, Math.sqrt(ex * ex + ey * ey)), f = e.k * (ed - e.L);
        a.fx += ex / ed * f; a.fy += ey / ed * f; b.fx -= ex / ed * f; b.fy -= ey / ed * f;
      }
      var cool = 0.6 * (1 - it / (iters + 20));
      for (i = 0; i < n; i++) { P[i].x += clampN(P[i].fx, -8, 8) * cool; P[i].y += clampN(P[i].fy, -8, 8) * cool; }
    }
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    P.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
    var m = big ? 28 : 50, sc2 = Math.min(big ? 2.6 : 1.8, (D.w - 2 * m) / Math.max(40, x1 - x0), (D.h - 2 * m) / Math.max(40, y1 - y0));
    var pos = P.map(function (p) { return { x: cx + (p.x - (x0 + x1) / 2) * sc2, y: cy + (p.y - (y0 + y1) / 2) * sc2 }; });
    var MIN = big ? 27 : 56, pass;     // nobody sits on anybody
    for (pass = 0; pass < 60; pass++) {
      var moved = false;
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        var ddx = pos[j].x - pos[i].x, ddy = pos[j].y - pos[i].y, dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd < MIN) { var push = (MIN - dd) / 2 + 0.2, ux2 = dd > 0.01 ? ddx / dd : 1, uy2 = dd > 0.01 ? ddy / dd : 0; pos[i].x -= ux2 * push; pos[i].y -= uy2 * push; pos[j].x += ux2 * push; pos[j].y += uy2 * push; moved = true; }
      }
      pos.forEach(function (p) { p.x = clampN(p.x, m * 0.6, D.w - m * 0.6); p.y = clampN(p.y, m * 0.6, D.h - m * 0.6); });
      if (!moved) break;
    }
    webPos = pos;
  }
  function openWeb(a, b) {
    webSel = (a == null || a < 0) ? null : (b == null ? { a: a } : { a: a, b: b });
    webAll = false; webFilter = 'all';
    closeOverlays(); layoutWeb(sim.view(sim.t)); uiCache.webH = uiCache.webS = uiCache.webF = null; renderWeb(); $('web').hidden = false;
    clearInterval(webT); webT = setInterval(function () { if ($('web').hidden) clearInterval(webT); else renderWeb(); }, 1500);
  }
  function pairBtn(t, s) {
    var A = sim.chars[t.i], Bc = sim.chars[t.j], ra = s.rel[t.i][t.j], rb = s.rel[t.j][t.i];
    var lab = AH.relLabel({ a: (ra.a + rb.a) / 2, t: (ra.t + rb.t) / 2, r: Math.max(ra.r, rb.r), met: ra.met + rb.met });
    return '<button class="bond" data-pair="' + t.i + ',' + t.j + '" style="margin-bottom:6px"><span class="who">' + esc(A.first) + ' &amp; ' + esc(Bc.first) + '</span><span class="lbl' + (isHot(lab) || t.bad ? ' hot' : '') + '">' + lab + '</span></button>';
  }
  function renderWeb() {
    var s = sim.view(sim.t), n = sim.chars.length, big = webBig(), D = webDims(), sel = webSel, focusPair = !!(sel && sel.b != null), svg = '';
    var ties = tieList(s), shownTies = [], cap = Math.round(n * 2.2), nFriends = 0, nTrouble = 0;
    ties.forEach(function (t) {
      if (t.sc >= 0.22) nFriends++;
      if (t.bad) nTrouble++;
      var mine = sel && (t.i === sel.a || t.j === sel.a);
      if (webFilter === 'friends' ? t.sc < 0.22 : webFilter === 'trouble' ? !t.bad : false) return;
      if (webFilter === 'all' && big && !mine && shownTies.length >= cap) return;
      shownTies.push(t);
    });
    var labelled = {}, nbr = {};
    if (focusPair) labelled[pk(sel.a, sel.b)] = 1;
    else if (sel) {
      var c = 0;
      shownTies.forEach(function (t) { if (t.i === sel.a || t.j === sel.a) { nbr[t.i === sel.a ? t.j : t.i] = 1; if (!big && c < 5) { labelled[pk(t.i, t.j)] = 1; c++; } } });
    } else if (!big) shownTies.forEach(function (t) { labelled[pk(t.i, t.j)] = 1; });
    // names: the chosen ones and their neighbours, each placed where it does not sit on a person or another name
    var nameAt = {};
    if (big && sel) {
      var obst = [], want = [], R0 = 12;
      sim.chars.forEach(function (ch, k) { var p = webPos[k]; obst.push([p.x - R0, p.y - R0, 2 * R0, 2 * R0]); });
      shownTies.forEach(function (t) { if (t.i === sel.a || t.j === sel.a) want.push(t.i === sel.a ? t.j : t.i); });
      var ordr = [sel.a]; if (focusPair) ordr.push(sel.b);
      want.forEach(function (k) { if (ordr.indexOf(k) < 0) ordr.push(k); });
      ordr.forEach(function (k) {
        var p = webPos[k], nm = sim.chars[k].first.toUpperCase(), w = nm.length * 7.4 + 6, h = 12, Rk = (sel.a === k || sel.b === k) ? 15 : 11;
        var cands = [[0, Rk + 11], [0, -Rk - 6], [Rk + 5 + w / 2, 4], [-Rk - 5 - w / 2, 4]];
        for (var q = 0; q < cands.length; q++) {
          var cx2 = p.x + cands[q][0], cy2 = p.y + cands[q][1], bx = cx2 - w / 2, by = cy2 - h + 3;
          if (bx < 2 || bx + w > D.w - 2 || by < 2 || by + h > D.h - 2) continue;
          var clash = false;
          for (var z = 0; z < obst.length && !clash; z++) { var o = obst[z]; if (z !== k && bx < o[0] + o[2] && bx + w > o[0] && by < o[1] + o[3] && by + h > o[1]) clash = true; }
          if (clash) continue;
          obst.push([bx, by, w, h]); nameAt[k] = [cx2, cy2]; break;
        }
      });
    }
    var cxm = 0, cym = 0; webPos.forEach(function (q) { cxm += q.x / n; cym += q.y / n; });
    svg += '<defs><pattern id="wdots" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" style="fill:var(--card)"/><circle cx="3" cy="3" r="1.1" style="fill:var(--ink)"/></pattern>' +
      '<pattern id="whatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" style="fill:var(--card)"/><line x1="0" y1="0" x2="0" y2="5" style="stroke:var(--ink);stroke-width:1.3"/></pattern></defs>';
    shownTies.forEach(function (t) {
      var i = t.i, j = t.j, ra = s.rel[i][j], rb = s.rel[j][i], la = AH.relLabel(ra), lb = AH.relLabel(rb);
      var dim = sel && !(focusPair ? ((sel.a === i && sel.b === j) || (sel.a === j && sel.b === i)) : (sel.a === i || sel.a === j));
      var A = webPos[i], Bp = webPos[j], quiet = big && !sel && !t.bad && Math.abs(t.sc) < 0.3;
      var wdt = (big ? 1 : 1.5) + (big ? 3.4 : 4.5) * Math.min(1, Math.abs(t.sc));
      svg += '<g data-a="' + i + '" data-b="' + j + '"><line class="tie' + (t.bad ? ' bad' : '') + (dim ? ' dim' : '') + (quiet ? ' faint' : '') + '" x1="' + A.x.toFixed(1) + '" y1="' + A.y.toFixed(1) + '" x2="' + Bp.x.toFixed(1) + '" y2="' + Bp.y.toFixed(1) + '" style="stroke-width:' + wdt.toFixed(1) + '"/>' +
        '<line class="hit" x1="' + A.x.toFixed(1) + '" y1="' + A.y.toFixed(1) + '" x2="' + Bp.x.toFixed(1) + '" y2="' + Bp.y.toFixed(1) + '" style="stroke-width:' + (big ? 14 : 26) + '"/>';
      if (labelled[pk(i, j)]) {
        // sit the label beside its line, on the side away from the middle of the web, so it never lands on a person
        var mid = { x: (A.x + Bp.x) / 2, y: (A.y + Bp.y) / 2 }, ex = Bp.x - A.x, ey = Bp.y - A.y, el = Math.max(1, Math.hypot(ex, ey)), nx = -ey / el, ny = ex / el;
        if ((mid.x - cxm) * nx + (mid.y - cym) * ny > 0) { nx = -nx; ny = -ny; }
        mid = { x: mid.x + nx * (big ? 12 : 16), y: mid.y + ny * (big ? 12 : 16) + 3 };
        var lab = AH.relLabel({ a: (ra.a + rb.a) / 2, t: (ra.t + rb.t) / 2, r: Math.max(ra.r, rb.r), met: ra.met + rb.met });
        svg += '<text class="tl' + (t.bad ? ' bad' : '') + (dim ? ' dim' : '') + '" x="' + mid.x.toFixed(1) + '" y="' + mid.y.toFixed(1) + '">' + esc(lab) + (la !== lb ? ' *' : '') + '</text>';
      }
      svg += '</g>';
    });
    sim.chars.forEach(function (ch, k) {
      var p = webPos[k], on = sel && (sel.a === k || sel.b === k), dim = sel && !on && (focusPair || !nbr[k]);
      var R = big ? (on ? 15 : 11) : (on ? 27 : 23), fs = big ? (on ? 13 : 11) : 20;
      var fill = ch.style === 0 ? 'var(--ink)' : ch.style === 1 ? 'var(--card)' : ch.style === 2 ? 'url(#wdots)' : 'url(#whatch)', fg = ch.style === 0 ? 'var(--paper)' : 'var(--ink)';
      svg += '<g class="node' + (dim ? ' dim' : '') + '" data-n="' + k + '"><title>' + esc(ch.name) + '</title><circle class="c" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + R + '" style="fill:' + fill + '"/>' +
        '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 1).toFixed(1) + '" style="fill:' + fg + ';font-size:' + fs + 'px">' + esc(ch.initial) + '</text>';
      if (!big) svg += '<text class="nm" x="' + p.x.toFixed(1) + '" y="' + (p.y + (p.y > 150 ? 42 : -36)).toFixed(1) + '">' + esc(ch.first.toUpperCase()) + '</text>';
      else if (nameAt[k]) svg += '<text class="nm" x="' + nameAt[k][0].toFixed(1) + '" y="' + nameAt[k][1].toFixed(1) + '">' + esc(ch.first.toUpperCase()) + '</text>';
      svg += '</g>';
    });
    var svgEl = $('webSvg');
    if (uiCache.webV !== D.h) { uiCache.webV = D.h; svgEl.setAttribute('viewBox', '0 0 ' + D.w + ' ' + D.h); svgEl.setAttribute('class', big ? 'big' : ''); }
    if (uiCache.webS !== svg) { uiCache.webS = svg; svgEl.innerHTML = svg; }
    // filter chips
    var fh = '';
    [['all', 'All ties ' + ties.length], ['friends', 'Friends ' + nFriends], ['trouble', 'Trouble ' + nTrouble]].forEach(function (x) { fh += '<button class="fl' + (webFilter === x[0] ? ' on' : '') + '" data-f="' + x[0] + '">' + x[1] + '</button>'; });
    if (sel) fh += '<button class="fl" data-clear="1">Clear &times;</button>';
    if (uiCache.webF !== fh) { uiCache.webF = fh; $('webFilters').innerHTML = fh; }
    setText('webSub', plural(n, 'person', 'people') + ' · ' + plural(ties.length, 'known tie') + '. Tap a person or a line.');
    // panel
    var h = '';
    if (!sel) {
      h = '<p class="hint">Tap a person to see how they feel about everyone, or a line to see the memories behind that tie. A dashed red line means trouble. A star means the two feel differently about each other.</p>';
      var best = ties.filter(function (t) { return t.sc >= 0.22; }).sort(function (p, q) { return q.sc - p.sc; }).slice(0, 3);
      var worst = ties.filter(function (t) { return t.bad; }).sort(function (p, q) { return (q.rr - q.sc) - (p.rr - p.sc); }).slice(0, 3);
      if (best.length) { h += '<div class="sec" style="margin-top:14px">CLOSEST</div>'; best.forEach(function (t) { h += pairBtn(t, s); }); }
      if (worst.length) { h += '<div class="sec" style="margin-top:14px">TROUBLE</div>'; worst.forEach(function (t) { h += pairBtn(t, s); }); }
    } else if (!focusPair) {
      var me = sim.chars[sel.a], mine2 = [];
      sim.chars.forEach(function (o) { if (o.id !== me.id) { var r1 = s.rel[me.id][o.id]; mine2.push({ o: o, k: strength(r1) }); } });
      mine2.sort(function (p, q) { return q.k - p.k || p.o.id - q.o.id; });
      h = '<h3>' + esc(me.name) + '</h3><div class="sub" style="margin:4px 0 10px">' + esc(jobLine(me)) + ' · ' + esc(sim.goal(me.id, sim.t).text) + '</div>';
      (webAll ? mine2 : mine2.slice(0, 8)).forEach(function (x) {
        var o = x.o, r1 = s.rel[me.id][o.id], r2 = s.rel[o.id][me.id], l1 = AH.relLabel(r1), l2 = AH.relLabel(r2);
        h += '<button class="bond" data-t="' + o.id + '" style="margin-bottom:6px"><span class="who">' + esc(o.name) + '</span><span class="lbl' + (isHot(l1) ? ' hot' : '') + '">' + l1 + '</span>' +
          '<span class="bars" style="font:11px/1.4 var(--sans);letter-spacing:.08em;color:var(--mute)">' + esc(o.first) + ' sees ' + esc(me.first) + ' as: ' + l2 + '</span></button>';
      });
      if (mine2.length > 8) h += '<button class="linkbtn" data-all="1" style="margin:6px 0 2px">' + (webAll ? 'SHOW FEWER' : 'SHOW ALL ' + mine2.length) + '</button>';
    } else {
      var A2 = sim.chars[sel.a], B2 = sim.chars[sel.b];
      h = '<h3>' + esc(A2.first) + ' &amp; ' + esc(B2.first) + '</h3>';
      [[A2, B2], [B2, A2]].forEach(function (pr) {
        var r = s.rel[pr[0].id][pr[1].id], lab = AH.relLabel(r);
        h += '<div class="dir"><div class="t"><span>' + esc(pr[0].first) + ' &rarr; ' + esc(pr[1].first) + '</span><em class="' + (isHot(lab) ? 'hot' : '') + '"' + (isHot(lab) ? ' style="color:var(--alert)"' : '') + '>' + lab + '</em></div><div class="bars" style="display:flex;gap:10px">' + meters(r) + '</div></div>';
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
    if (g.hasAttribute('data-n')) { var n = +g.getAttribute('data-n'); webSel = (webSel && webSel.b == null && webSel.a === n) ? null : { a: n }; webAll = false; }
    else if (g.hasAttribute('data-a')) webSel = { a: +g.getAttribute('data-a'), b: +g.getAttribute('data-b') };
    uiCache.webH = uiCache.webS = null; renderWeb();
  });
  $('webPanel').addEventListener('click', function (e) {
    var all = e.target.closest('[data-all]'); if (all) { webAll = !webAll; uiCache.webH = null; renderWeb(); return; }
    var pr = e.target.closest('[data-pair]');
    if (pr) { var ab = pr.getAttribute('data-pair').split(','); webSel = { a: +ab[0], b: +ab[1] }; uiCache.webH = uiCache.webS = null; renderWeb(); return; }
    var b = e.target.closest('.bond'); if (!b || !webSel || b.getAttribute('data-t') == null) return;
    webSel = { a: webSel.a, b: +b.getAttribute('data-t') }; uiCache.webH = uiCache.webS = null; renderWeb();
  });
  $('webFilters').addEventListener('click', function (e) {
    var b = e.target.closest('.fl'); if (!b) return;
    if (b.hasAttribute('data-clear')) { webSel = null; webAll = false; } else webFilter = b.getAttribute('data-f');
    uiCache.webH = uiCache.webS = uiCache.webF = null; renderWeb();
  });
  $('webSub').addEventListener('click', function () { webSel = null; uiCache.webH = uiCache.webS = uiCache.webF = null; renderWeb(); });

  /* ---------- overlays & specimens ---------- */
  var OVER = ['menu', 'spec', 'hist', 'web', 'people', 'awayOv'];
  function anyOverlay() { return OVER.some(function (id) { return !$(id).hidden; }); }
  function closeOverlays() { OVER.forEach(function (id) { $(id).hidden = true; }); }
  function buildSpecimens() {
    var grid = $('specGrid'); grid.innerHTML = '';
    var sd = Math.floor(Math.random() * 1e6), L = AH.LOOKS;
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
    // citizens: four body patterns walking and sitting, by day and by night
    var fc = document.createElement('div'); fc.className = 'sp';
    var c2 = document.createElement('canvas'); c2.width = 440; c2.height = 110; var g2 = c2.getContext('2d');
    for (var st = 0; st < L.styles; st++) {
      for (var nt = 0; nt < 2; nt++) {
        [0, 1].forEach(function (sit) {
          var x0 = (sit ? 220 : 0) + st * 55, y0 = nt * 55;
          g2.save(); g2.fillStyle = nt ? '#171717' : '#F1F1F1'; g2.fillRect(x0, y0, 55, 55); g2.scale(2.2, 2.2);
          art.drawFigure(g2, { x: (x0 + 27) / 2.2, y: (y0 + 46) / 2.2, style: st, acc: L.accs[(st * 2 + sit) % L.accs.length], dir: 1, phase: 1.1, moving: !sit, sit: !!sit, nf: nt, t: 0 });
          g2.restore();
        });
      }
    }
    fc.appendChild(c2); var s2 = document.createElement('small'); s2.textContent = 'Citizens · four patterns, walking and sitting'; fc.appendChild(s2); grid.appendChild(fc);
    // nine heads, three heights
    var hc = document.createElement('div'); hc.className = 'sp';
    var c3 = document.createElement('canvas'); c3.width = 44 * L.accs.length; c3.height = 66; var g3 = c3.getContext('2d');
    L.accs.forEach(function (acc, k) {
      g3.save(); g3.fillStyle = '#F1F1F1'; g3.fillRect(k * 44, 0, 44, 66); g3.scale(2, 2);
      art.drawFigure(g3, { x: (k * 44 + 22) / 2, y: 54 / 2, style: k % L.styles, acc: acc, sc: L.scales[k % L.scales.length], dir: 1, phase: 1.3 * k, moving: k % 2 === 0, nf: 0, t: 0 });
      g3.restore();
    });
    hc.appendChild(c3); var s3 = document.createElement('small'); s3.textContent = 'Citizens · nine heads, three heights'; hc.appendChild(s3); grid.appendChild(hc);
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
    updateInside(); updateLive();
    if (sim.t > lastT && !covered) {
      sim.todayLines(sim.t).forEach(function (ev) { if (ev.kind === 'argument' && ev.at > lastT && ev.at <= sim.t) maybeAlert(ev); });
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
    if (now - lastCard > 500) { lastCard = now; refreshCard(false); refreshStrip(false); }
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
    var targetDay = Math.floor(sim.t / DAYLEN), tasks = warmTasks(), k = 0, total = tasks.length, bar = $('progBar'), base = sim.settled();
    (function step() {
      var until = performance.now() + 14;
      sim.catchUp(targetDay, 10);
      while (k < total && performance.now() < until) tasks[k++]();
      var p = 0.5 * (targetDay > base ? Math.min(1, (sim.settled() - base) / (targetDay - base)) : 1) + 0.5 * (k / total);
      bar.style.width = Math.round(p * 100) + '%';
      if (sim.settled() >= targetDay && k >= total) done(); else setTimeout(step, 0);
    })();
  }

  // everything that happens behind the paper-cutting cover: replay the city's history, cut the sprites, then let the person in
  function runCover() {
    ready = false; uiCache = {};
    $('cover').classList.remove('gone'); $('enterBtn').disabled = true; $('enterTxt').textContent = 'CUTTING THE PAPER';
    $('awayTxt').hidden = true; $('progBar').style.width = '0%'; document.querySelector('.cv-prog').classList.remove('done');
    $('seedTxt').textContent = 'CITY No. ' + seed + ' · ' + plural(sim.N, 'CITIZEN', 'CITIZENS');
    $('peopleCount').textContent = sim.N;
    prepare(function () {
      if (awayMin >= 60) {
        var el = $('awayTxt'), r = fillAway($('awayList'), awayFrom, awayFrom + awayMin);
        el.hidden = false;
        $('awayHead').textContent = 'While you were away, ' + dur(awayMin) + ' passed in the city. ' + (r.all ? plural(r.all, 'thing') + ' happened: ' + summarize(r.evs) + (r.pick.length < r.all ? '. The biggest:' : '.') : 'It was a quiet stretch. Everyone carried on without you.');
      }
      awayMin = 0;
      clock = sim.clock(sim.t); for (var i = 0; i < sim.chars.length; i++) sts[i] = sim.state(sim.chars[i], sim.t);
      updateInside(); updateLive();
      ready = true; syncUI(true); updateUI();
      $('enterBtn').disabled = false; $('enterTxt').textContent = 'ENTER THE CITY'; document.querySelector('.cv-prog').classList.add('done');
    });
  }
  function boot() {
    start();
    resize(); fit(); prepareScene();
    var g = document.createElement('canvas'); g.width = g.height = 160; g.getContext('2d').drawImage(AH.grainTile(7), 0, 0);
    $('grain').style.backgroundImage = 'url(' + g.toDataURL() + ')';
    requestAnimationFrame(function (t) { last = t; frame(t); });
    runCover();
  }

  $('enterBtn').addEventListener('click', function () { if ($('enterBtn').disabled) return; lastT = sim.t; $('cover').classList.add('gone'); });
  $('menuBtn').addEventListener('click', function () { closeOverlays(); $('menu').hidden = false; });
  $('specBtn').addEventListener('click', function () { $('menu').hidden = true; buildSpecimens(); $('spec').hidden = false; });
  $('webBtn').addEventListener('click', function () { openWeb(selected >= 0 ? selected : null); });
  $('histBtn').addEventListener('click', function () { openHist(-1); });
  $('respec').addEventListener('click', buildSpecimens);
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', closeOverlays); });
  Array.prototype.forEach.call(document.querySelectorAll('.overlay'), function (o) { o.addEventListener('click', function (e) { if (e.target === o) closeOverlays(); }); });
  var newArmed = 0;
  $('newBtn').addEventListener('click', function () {
    var b = $('newBtn');
    if (!newArmed) { newArmed = 1; b.textContent = 'TAP AGAIN TO CONFIRM'; setTimeout(function () { newArmed = 0; b.textContent = 'NEW CITY'; }, 3200); return; }
    newArmed = 0; b.textContent = 'NEW CITY';
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SNAP_KEY); } catch (e) {}
    ready = false; hideAlert(); closeOverlays();
    start(Math.floor(Math.random() * 900000) + 100000);
    fit(); prepareScene(); $('sheet').classList.remove('open'); updateFocus();
    save(); runCover();
  });
  $('followBtn').addEventListener('click', toggleFollow);
  $('zin').addEventListener('click', function () { zoomAt(1.3, vw / 2, vh / 2); });
  $('zout').addEventListener('click', function () { zoomAt(1 / 1.3, vw / 2, vh / 2); });
  $('fit').addEventListener('click', function () { breakFollow(); fit(true); });
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
    get cam() { return cam; }, select: select, step: step, fit: fit, get sim() { return sim; }, get world() { return world; }, get perf() { return perf; },
    get sts() { return sts; }, get live() { return live; }, get inside() { return inside; }, get selected() { return selected; },
    setTime: function (t) { sim.ensureDay(Math.floor(t / DAYLEN)); sim.t = t; lastT = t; },
    openWeb: openWeb, openHist: openHist, openPeople: openPeople, awayOverlay: awayOverlay, get bubbles() { return bubbles; },
    roofPos: function (bid) { return roofPos(bById[bid]); }, pipPos: function (i) { return pipPos(i); }
  };
})();
