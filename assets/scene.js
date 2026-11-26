/* ============================================================
   scene.js · 等轴测车间场景（Canvas 2D，无 WebGL 也能跑）
   状态色：机身灯带 + 地面光斑；点选即读数
   ============================================================ */
(function (global) {
  'use strict';

  var cv, ctx, W = 0, H = 0, dpr = 1;
  var yaw = -28 * Math.PI / 180, elev = 34 * Math.PI / 180, zoom = 1;
  var K = 41, OX = 0, OY = 0;       // K：当前像素/米；OX/OY：世界原点在画布上的位置
  var PAD = 22;                      // 视口内边距，保证最外侧标签不被裁切
  var dragging = false, lastX = 0, lastY = 0, moved = 0;
  var hitboxes = [], hoverId = null, selectedId = 'CNC-01';
  var onSelect = function () {};
  var raf = 0, visible = true;

  var WORLD = { x0: -11.4, x1: 11.4, z0: -9.4, z1: 10.2 };

  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.round(((n >> 16) & 255) * f));
    var g = Math.min(255, Math.round(((n >> 8) & 255) * f));
    var b = Math.min(255, Math.round((n & 255) * f));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function rot(x, z) {
    var c = Math.cos(yaw), s = Math.sin(yaw);
    return { X: x * c - z * s, Z: x * s + z * c };
  }

  function proj(x, y, z) {
    var r = rot(x, z);
    return {
      x: OX + r.X * K,
      y: OY + (r.Z * Math.sin(elev) - y * Math.cos(elev)) * K
    };
  }

  /* 按容器尺寸把整个场景（含设备顶部标签）等比装进视口，再叠加用户缩放 */
  function computeFit() {
    var c = Math.cos(yaw), s = Math.sin(yaw);
    var se = Math.sin(elev), ce = Math.cos(elev);
    var corners = [
      [WORLD.x0, WORLD.z0], [WORLD.x1, WORLD.z0],
      [WORLD.x1, WORLD.z1], [WORLD.x0, WORLD.z1]
    ];
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    // y=0 是地面，y=3.3 约等于最高设备顶部标签的上沿
    [0, 3.3].forEach(function (yy) {
      corners.forEach(function (p) {
        var X = p[0] * c - p[1] * s;
        var Z = p[0] * s + p[1] * c;
        var px = X, py = Z * se - yy * ce;
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
      });
    });
    var fit = Math.min((W - PAD * 2) / (x1 - x0), (H - PAD * 2) / (y1 - y0));
    if (!isFinite(fit) || fit <= 0) fit = 20;
    K = fit * zoom;
    OX = W / 2 - ((x0 + x1) / 2) * K;
    OY = H / 2 - ((y0 + y1) / 2) * K;
  }

  function poly(pts, fill, stroke, lw) {
    ctx.beginPath();
    pts.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }

  function quadPoint(q, u, v) {
    var a = 1 - u, b = 1 - v;
    return {
      x: q[0].x * a * b + q[1].x * u * b + q[2].x * u * v + q[3].x * a * v,
      y: q[0].y * a * b + q[1].y * u * b + q[2].y * u * v + q[3].y * a * v
    };
  }

  /* ---------- 地面 ---------- */
  function drawFloor() {
    var c = [proj(WORLD.x0, 0, WORLD.z0), proj(WORLD.x1, 0, WORLD.z0), proj(WORLD.x1, 0, WORLD.z1), proj(WORLD.x0, 0, WORLD.z1)];
    poly(c, '#070c0d');

    ctx.save();
    ctx.strokeStyle = 'rgba(39,64,63,.42)';
    ctx.lineWidth = 0.7;
    for (var x = -11; x <= 11; x += 2) {
      var a = proj(x, 0, WORLD.z0), b = proj(x, 0, WORLD.z1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (var z = -9; z <= 10; z += 2) {
      var p = proj(WORLD.x0, 0, z), q = proj(WORLD.x1, 0, z);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    // 通道分隔线
    ctx.strokeStyle = 'rgba(49,212,196,.18)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([7, 6]);
    [-3.6, 3.7].forEach(function (zz) {
      var p1 = proj(-10.6, 0, zz), p2 = proj(10.6, 0, zz);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    });
    ctx.restore();
  }

  /* ---------- 长方体 ---------- */
  function drawBox(cx, cz, w, d, h, tone) {
    var x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    var b = [proj(x0, 0, z0), proj(x1, 0, z0), proj(x1, 0, z1), proj(x0, 0, z1)];
    var t = [proj(x0, h, z0), proj(x1, h, z0), proj(x1, h, z1), proj(x0, h, z1)];
    var faces = [
      { q: [b[0], b[1], t[1], t[0]], n: 'n', avg: rot(cx, z0).Z },
      { q: [b[3], b[2], t[2], t[3]], n: 's', avg: rot(cx, z1).Z },
      { q: [b[0], b[3], t[3], t[0]], n: 'w', avg: rot(x0, cz).Z },
      { q: [b[1], b[2], t[2], t[1]], n: 'e', avg: rot(x1, cz).Z },
      { q: [t[0], t[1], t[2], t[3]], n: 'top', avg: rot(cx, cz).Z + 100 }
    ];
    faces.sort(function (a, bb) { return a.avg - bb.avg; });
    faces.forEach(function (f) {
      var fill;
      if (f.n === 'top') fill = shade(tone, 1.55);
      else if (f.n === 'n') fill = shade(tone, 1.08);
      else if (f.n === 's') fill = shade(tone, 0.72);
      else if (f.n === 'w') fill = shade(tone, 0.92);
      else fill = shade(tone, 0.62);
      poly(f.q, fill, 'rgba(3,6,7,.55)', 0.8);
    });
    return { faces: faces, front: faces[faces.length - 1], t: t, b: b };
  }

  function frontFace(box) {
    var sides = box.faces.filter(function (f) { return f.n !== 'top'; });
    return sides[sides.length - 1];
  }

  /* ---------- 设备 ---------- */
  function drawDevice(dv, t) {
    var k = PLANT.KIND[dv.kind];
    var st = PLANT.STATE[dv.state];
    var p = proj(dv.x, 0, dv.z);
    var pulse = 0.55 + 0.45 * Math.sin(t / 480);
    var glow = dv.state === 'WARN' ? 0.10 + 0.12 * pulse : dv.state === 'DOWN' ? 0.30 : dv.state === 'RUN' ? 0.16 : 0.05;

    // 地面光斑
    ctx.save();
    var rx = k.w * K * 0.72, ry = rx * Math.sin(elev) * 0.86;
    var grd = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, rx);
    grd.addColorStop(0, 'rgba(' + hexRgb(st.color) + ',' + glow + ')');
    grd.addColorStop(1, 'rgba(' + hexRgb(st.color) + ',0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, Math.max(4, ry), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var box = drawBox(dv.x, dv.z, k.w, k.d, k.h, '#1f282a');
    var ff = frontFace(box);

    // 正面观察窗
    poly([quadPoint(ff.q, .3, .42), quadPoint(ff.q, .7, .42), quadPoint(ff.q, .7, .72), quadPoint(ff.q, .3, .72)], 'rgba(7,19,19,.92)', 'rgba(49,212,196,.12)', 0.7);

    // 状态灯带
    var alpha = dv.state === 'IDLE' ? 0.42 : dv.state === 'WARN' ? 0.55 + 0.45 * pulse : 1;
    ctx.save();
    ctx.shadowColor = st.color;
    ctx.shadowBlur = dv.state === 'IDLE' ? 3 : 12;
    ctx.globalAlpha = alpha;
    poly([quadPoint(ff.q, .12, .16), quadPoint(ff.q, .88, .16), quadPoint(ff.q, .88, .23), quadPoint(ff.q, .12, .23)], st.color);
    ctx.restore();

    // 顶部结构线
    ctx.strokeStyle = 'rgba(120,150,148,.16)';
    ctx.lineWidth = 0.7;
    var ly = proj(dv.x, k.h, dv.z);
    ctx.beginPath();
    ctx.moveTo(box.t[0].x, box.t[0].y); ctx.lineTo(box.t[2].x, box.t[2].y);
    ctx.stroke();

    // 选中框
    var xs = box.t.concat(box.b).map(function (q) { return q.x; });
    var ys = box.t.concat(box.b).map(function (q) { return q.y; });
    var bb = { x0: Math.min.apply(null, xs) - 5, y0: Math.min.apply(null, ys) - 5, x1: Math.max.apply(null, xs) + 5, y1: Math.max.apply(null, ys) + 5, z: rot(dv.x, dv.z).Z };
    hitboxes.push({ id: dv.id, x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1, z: bb.z });

    if (dv.id === selectedId || dv.id === hoverId) {
      var on = dv.id === selectedId;
      ctx.save();
      ctx.strokeStyle = on ? 'rgba(49,212,196,.85)' : 'rgba(118,232,218,.45)';
      ctx.lineWidth = on ? 1.2 : 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(bb.x0, bb.y0, bb.x1 - bb.x0, bb.y1 - bb.y0);
      ctx.restore();
    }

    // 标签
    var lx = proj(dv.x, k.h + 0.55, dv.z);
    drawLabel(lx.x, lx.y, dv.id, st.color, dv.id === selectedId);
    return bb;
  }

  function drawLabel(x, y, text, color, strong) {
    ctx.save();
    ctx.font = (strong ? '600 ' : '') + '9px "JetBrains Mono",Consolas,monospace';
    var w = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(6,12,13,.82)';
    ctx.fillRect(x - w / 2, y - 11, w, 13);
    ctx.strokeStyle = strong ? 'rgba(49,212,196,.5)' : 'rgba(26,36,38,.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2, y - 11, w, 13);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - 4.5);
    ctx.restore();
  }

  function hexRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }

  /* ---------- 输送带 ---------- */
  function drawConveyor(cz, t) {
    drawBox(0, cz, 20.4, 0.95, 0.5, '#161d1f');
    ctx.save();
    for (var i = 0; i < 5; i++) {
      var wx = ((t / 42 + i * 4.2) % 20.4) - 10.2;
      var p = proj(wx, 0.5, cz);
      var s = 0.22 * K;
      ctx.fillStyle = 'rgba(118,232,218,.5)';
      ctx.fillRect(p.x - s / 2, p.y - s * 0.8, s, s * 0.7);
    }
    ctx.restore();
  }

  function drawLineTag(z, text) {
    var p = proj(-10.9, 0.02, z);
    ctx.save();
    ctx.font = '9px "JetBrains Mono",Consolas,monospace';
    ctx.fillStyle = 'rgba(49,212,196,.55)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, p.x, p.y);
    ctx.restore();
  }

  /* ---------- 主循环 ---------- */
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!visible || !ctx) return;
    var t = Date.now();
    computeFit();
    ctx.clearRect(0, 0, W, H);
    drawFloor();

    var list = PLANT.devices.slice().sort(function (a, b) { return rot(a.x, a.z).Z - rot(b.x, b.z).Z; });
    drawLineTag(-8.9, 'L1 加工线');
    drawLineTag(1.1, 'L2 装配线');
    drawLineTag(9.7, 'L3 总装线');
    drawConveyor(-8.0, t);
    drawConveyor(-1.0, t);
    drawConveyor(5.8, t);

    hitboxes = [];
    list.forEach(function (dv) { drawDevice(dv, t); });

    // 前视锥收边
    ctx.save();
    ctx.strokeStyle = 'rgba(49,212,196,.10)';
    ctx.lineWidth = 1;
    var f = [proj(WORLD.x0, 0, WORLD.z1), proj(WORLD.x1, 0, WORLD.z1)];
    ctx.beginPath();
    ctx.moveTo(f[0].x, f[0].y - 22); ctx.lineTo(f[1].x, f[1].y - 22);
    ctx.stroke();
    ctx.restore();
  }

  function resize() {
    if (!cv) return;
    var r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function hit(mx, my) {
    var sorted = hitboxes.slice().sort(function (a, b) { return b.z - a.z; });
    for (var i = 0; i < sorted.length; i++) {
      var b = sorted[i];
      if (mx >= b.x0 && mx <= b.x1 && my >= b.y0 && my <= b.y1) return b.id;
    }
    return null;
  }

  function pos(e) {
    var r = cv.getBoundingClientRect();
    var p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }

  var SCENE = {
    init: function (canvas, cb) {
      cv = canvas;
      ctx = cv.getContext('2d');
      onSelect = cb || function () {};
      resize();
      new ResizeObserver(resize).observe(cv);

      cv.addEventListener('pointerdown', function (e) {
        dragging = true; moved = 0;
        lastX = pos(e).x; lastY = pos(e).y;
        cv.classList.add('dragging');
        cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', function (e) {
        var p = pos(e);
        if (dragging) {
          var dx = p.x - lastX, dy = p.y - lastY;
          moved += Math.abs(dx) + Math.abs(dy);
          yaw = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, yaw + dx * 0.004));
          elev = Math.max(22 * Math.PI / 180, Math.min(55 * Math.PI / 180, elev + dy * 0.003));
          lastX = p.x; lastY = p.y;
        } else {
          var h = hit(p.x, p.y);
          if (h !== hoverId) { hoverId = h; cv.style.cursor = h ? 'pointer' : 'grab'; }
        }
      });
      function end(e) {
        if (!dragging) return;
        dragging = false;
        cv.classList.remove('dragging');
        var p = pos(e);
        if (moved < 6) {
          var id = hit(p.x, p.y);
          if (id) { selectedId = id; onSelect(id); }
        }
      }
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', function () { dragging = false; cv.classList.remove('dragging'); });
      cv.addEventListener('wheel', function (e) {
        e.preventDefault();
        zoom = Math.max(0.62, Math.min(1.5, zoom * (e.deltaY > 0 ? 0.94 : 1.06)));
      }, { passive: false });

      document.addEventListener('visibilitychange', function () { visible = !document.hidden; });
      frame();
    },
    select: function (id) { selectedId = id; },
    reset: function () { yaw = -28 * Math.PI / 180; elev = 34 * Math.PI / 180; zoom = 1; },
    zoomBy: function (f) { zoom = Math.max(0.62, Math.min(1.5, zoom * f)); }
  };

  global.SCENE = SCENE;
})(window);
