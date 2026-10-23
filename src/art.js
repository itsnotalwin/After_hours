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
