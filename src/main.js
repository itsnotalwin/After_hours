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
