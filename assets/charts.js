/* ============================================================
   charts.js · 轻量 SVG 图表（无第三方依赖，断网可用）
   line / bars / donut / gauge / spark / stack
   ============================================================ */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function box(el) {
    var r = el.getBoundingClientRect();
    return { w: Math.max(0, Math.round(r.width)), h: Math.max(0, Math.round(r.height)) };
  }
  function svg(w, h, body) {
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" xmlns="' + NS + '" role="img">' + body + '</svg>';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var FONT = 'font-family="JetBrains Mono,Consolas,monospace"';

  function gridLines(W, H, pad, min, max, rows) {
    var out = '', i;
    for (i = 0; i <= rows; i++) {
      var v = min + (max - min) * (i / rows);
      var y = H - pad.b - (i / rows) * (H - pad.t - pad.b);
      out += '<line x1="' + pad.l + '" y1="' + y.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + y.toFixed(1) + '" stroke="#101a1c" stroke-width="1"/>';
      out += '<text x="' + (pad.l - 6) + '" y="' + (y + 3).toFixed(1) + '" fill="#414c4d" font-size="9" text-anchor="end" ' + FONT + '>' + (v % 1 === 0 ? v : parseFloat(v.toFixed(1))) + '</text>';
    }
    return out;
  }

  /* 刻度取整：把跨度凑成 1/2/2.5/5 × 10ⁿ 的整数步长 */
  function niceStep(raw) {
    var mag = Math.pow(10, Math.floor(Math.log(raw > 0 ? raw : 1) / Math.LN10));
    var n = raw / mag;
    var f = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return f * mag;
  }

  /* ---------- 折线 / 面积 ---------- */
  function line(el, opt) {
    var s = box(el); if (s.w < 40 || s.h < 40) return;
    var W = s.w, H = s.h;
    var pad = { l: 34, r: 10, t: 12, b: 22 };
    var labels = opt.labels || [];
    var series = opt.series || [];
    var all = [];
    series.forEach(function (se) { all = all.concat(se.data.filter(function (v) { return isFinite(v); })); });
    var max = opt.yMax || Math.max.apply(null, all.concat([1]));
    var min = opt.yMin == null ? Math.min.apply(null, all.concat([0])) : opt.yMin;
    if (min === max) max = min + 1;
    var yTop = max + (max - min) * 0.08;
    var n = Math.max(labels.length, 2);
    var iw = W - pad.l - pad.r;

    // 轴刻度取整，避免出现 119 / 239 这类读数
    var step = niceStep((yTop - min) / 4);
    min = Math.floor(min / step) * step;
    yTop = Math.ceil(yTop / step) * step;
    var rows = Math.max(2, Math.round((yTop - min) / step));

    function X(i) { return pad.l + (i / (n - 1)) * iw; }
    function Y(v) { return H - pad.b - ((v - min) / (yTop - min)) * (H - pad.t - pad.b); }

    var body = gridLines(W, H, pad, min, yTop, rows);

    if (opt.band && opt.band[1] > opt.band[0]) {
      var bx = X(opt.band[0]), bw = X(opt.band[1]) - bx;
      body += '<rect x="' + bx.toFixed(1) + '" y="' + pad.t + '" width="' + bw.toFixed(1) + '" height="' + (H - pad.t - pad.b) + '" fill="rgba(49,212,196,.055)"/>';
      body += '<text x="' + (bx + bw / 2).toFixed(1) + '" y="' + (pad.t + 9) + '" fill="#6b787a" font-size="8.5" text-anchor="middle" ' + FONT + '>交接班</text>';
    }

    if (opt.target != null) {
      var ty = Y(opt.target);
      body += '<line x1="' + pad.l + '" y1="' + ty.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + ty.toFixed(1) + '" stroke="rgba(191,138,63,.55)" stroke-width="1" stroke-dasharray="3 4"/>';
      body += '<text x="' + (W - pad.r) + '" y="' + (ty - 5).toFixed(1) + '" fill="#bf8a3f" font-size="8.5" text-anchor="end" ' + FONT + '>目标 ' + opt.target + '</text>';
    }

    series.forEach(function (se, si) {
      var pts = se.data.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
      if (se.fill !== false && si === 0) {
        body += '<defs><linearGradient id="g' + si + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="' + se.color + '" stop-opacity=".22"/>' +
          '<stop offset="100%" stop-color="' + se.color + '" stop-opacity="0"/></linearGradient></defs>';
        body += '<polygon points="' + X(0) + ',' + (H - pad.b) + ' ' + pts + ' ' + X(n - 1) + ',' + (H - pad.b) + '" fill="url(#g' + si + ')"/>';
      }
      body += '<polyline points="' + pts + '" fill="none" stroke="' + se.color + '" stroke-width="' + (si === 0 ? 1.6 : 1.2) + '" stroke-linejoin="round" stroke-linecap="round" opacity="' + (si === 0 ? 1 : 0.85) + '"/>';
      var lastX = X(se.data.length - 1), lastY = Y(se.data[se.data.length - 1]);
      body += '<circle cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="2.4" fill="' + se.color + '"/>';
    });

    var step = Math.ceil(n / Math.max(4, Math.floor(iw / 46)));
    labels.forEach(function (lb, i) {
      if (i % step) return;
      body += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" fill="#414c4d" font-size="8.5" text-anchor="middle" ' + FONT + '>' + esc(lb) + '</text>';
    });

    if (series.length > 1 && W > 300) {
      var lx = pad.l + 2, ly = pad.t + 2;
      series.forEach(function (se) {
        body += '<rect x="' + lx + '" y="' + (ly - 4) + '" width="9" height="2" fill="' + se.color + '"/>';
        body += '<text x="' + (lx + 13) + '" y="' + ly + '" fill="#6b787a" font-size="8.5" ' + FONT + '>' + esc(se.name) + '</text>';
        lx += 13 + se.name.length * 8 + 12;
      });
    }
    el.innerHTML = svg(W, H, body);
  }

  /* ---------- 柱状 ---------- */
  function bars(el, opt) {
    var s = box(el); if (s.w < 40 || s.h < 40) return;
    var W = s.w, H = s.h;
    var pad = { l: 34, r: 10, t: 14, b: 26 };
    var items = opt.items || [];
    var max = opt.max || Math.max.apply(null, items.map(function (d) { return d.value; }).concat([1]));
    var innerH = H - pad.t - pad.b;
    var slot = (W - pad.l - pad.r) / items.length;
    var bw = Math.min(30, slot * 0.46);
    var body = '';

    for (var g = 0; g <= 4; g++) {
      var y = pad.t + (g / 4) * innerH;
      body += '<line x1="' + pad.l + '" y1="' + y.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + y.toFixed(1) + '" stroke="#101a1c"/>';
    }

    if (opt.target != null) {
      var ty = pad.t + innerH - (opt.target / max) * innerH;
      body += '<line x1="' + pad.l + '" y1="' + ty.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + ty.toFixed(1) + '" stroke="rgba(191,138,63,.6)" stroke-dasharray="3 4"/>';
      body += '<text x="' + pad.l + '" y="' + (ty - 4).toFixed(1) + '" fill="#bf8a3f" font-size="8.5" ' + FONT + '>目标 ' + opt.target + '</text>';
    }

    items.forEach(function (it, i) {
      var cx = pad.l + slot * i + slot / 2;
      var h = Math.max(1, (it.value / max) * innerH);
      var y = pad.t + innerH - h;
      var col = it.color || '#31d4c4';
      body += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + col + '" opacity=".82"/>';
      body += '<text x="' + cx.toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" fill="#c6d1d0" font-size="9" text-anchor="middle" ' + FONT + '>' + it.value.toFixed(it.value < 10 ? 1 : 0) + '</text>';
      body += '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" fill="#6b787a" font-size="8.5" text-anchor="middle" ' + FONT + '>' + esc(it.label) + '</text>';
    });

    el.innerHTML = svg(W, H, body);
  }

  /* ---------- 环形 ---------- */
  function donut(el, opt) {
    var s = box(el); if (s.w < 40 || s.h < 40) return;
    var W = s.w, H = s.h;
    var cx = W / 2, cy = H / 2;
    var r = Math.min(W, H) / 2 - 12;
    var C = 2 * Math.PI * r;
    var items = opt.items || [];
    var total = items.reduce(function (a, b) { return a + b.value; }, 0) || 1;
    var acc = 0, body = '';

    body += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#101a1c" stroke-width="10"/>';
    items.forEach(function (it) {
      var frac = it.value / total;
      var dash = Math.max(0, frac * C - 2);
      body += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + it.color + '" stroke-width="10" ' +
        'stroke-dasharray="' + dash.toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-acc * C).toFixed(1) + '" ' +
        'transform="rotate(-90 ' + cx + ' ' + cy + ')" stroke-linecap="butt"/>';
      acc += frac;
    });
    body += '<text x="' + cx + '" y="' + (cy - 2) + '" fill="#e4ecea" font-size="22" text-anchor="middle" font-weight="600" ' + FONT + '>' + esc(opt.value != null ? opt.value : total) + '</text>';
    body += '<text x="' + cx + '" y="' + (cy + 13) + '" fill="#414c4d" font-size="8.5" text-anchor="middle" ' + FONT + '>' + esc(opt.label || 'TOTAL') + '</text>';
    el.innerHTML = svg(W, H, body);
  }

  /* ---------- 仪表盘 ---------- */
  function gauge(el, opt) {
    var s = box(el); if (s.w < 40 || s.h < 40) return;
    var W = s.w, H = s.h;
    var cx = W / 2, cy = H * 0.72;
    var r = Math.min(W / 2 - 10, H * 0.62);
    function pt(a) {
      var rad = (a * Math.PI) / 180;
      return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
    }
    var p0 = pt(180), p1 = pt(360);
    var frac = Math.max(0, Math.min(1, opt.value / 100));
    var pv = pt(180 + 180 * frac);
    var large = frac > 0.5 ? 1 : 0;
    var body = '';
    body += '<path d="M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + '" fill="none" stroke="#101a1c" stroke-width="8"/>';
    body += '<path d="M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + pv[0].toFixed(1) + ' ' + pv[1].toFixed(1) + '" fill="none" stroke="' + (opt.color || '#31d4c4') + '" stroke-width="8" stroke-linecap="butt"/>';
    if (opt.target) {
      var tp = pt(180 + 180 * (opt.target / 100));
      var tp2 = pt(180 + 180 * (opt.target / 100) + 0.8);
      body += '<line x1="' + tp[0].toFixed(1) + '" y1="' + tp[1].toFixed(1) + '" x2="' + tp2[0].toFixed(1) + '" y2="' + tp2[1].toFixed(1) + '" stroke="#bf8a3f" stroke-width="2"/>';
    }
    body += '<text x="' + cx + '" y="' + (cy - 4) + '" fill="#e4ecea" font-size="' + Math.round(r * 0.5) + '" text-anchor="middle" font-weight="600" ' + FONT + '>' + opt.value.toFixed(1) + '</text>';
    body += '<text x="' + cx + '" y="' + (cy + 14) + '" fill="#414c4d" font-size="8.5" text-anchor="middle" ' + FONT + '>' + esc(opt.label || '% vs 目标 85') + '</text>';
    el.innerHTML = svg(W, H, body);
  }

  /* ---------- 迷你折线 ---------- */
  function spark(el, opt) {
    var s = box(el); if (s.w < 20 || s.h < 10) return;
    var W = s.w, H = s.h, pad = 3;
    var data = (opt.data || []).slice(-48);
    if (data.length < 2) { el.innerHTML = ''; return; }
    var max = Math.max.apply(null, data), min = Math.min.apply(null, data);
    if (max === min) { max += 1; min -= 1; }
    var col = opt.color || '#31d4c4';
    var pts = data.map(function (v, i) {
      return ((pad + (i / (data.length - 1)) * (W - pad * 2)).toFixed(1)) + ',' + (H - pad - ((v - min) / (max - min)) * (H - pad * 2)).toFixed(1);
    });
    var body = '<polygon points="' + pad + ',' + (H - pad) + ' ' + pts.join(' ') + ' ' + (W - pad) + ',' + (H - pad) + '" fill="' + col + '" opacity=".10"/>';
    body += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="1.2" stroke-linejoin="round"/>';
    var last = pts[pts.length - 1].split(',');
    body += '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2" fill="' + col + '"/>';
    el.innerHTML = svg(W, H, body);
  }

  /* ---------- 状态构成条 ---------- */
  function stack(el, opt) {
    var s = box(el); if (s.w < 40 || s.h < 10) return;
    var W = s.w, H = s.h;
    var items = (opt.items || []).filter(function (i) { return i.value > 0; });
    var total = items.reduce(function (a, b) { return a + b.value; }, 0) || 1;
    var x = 0, body = '';
    items.forEach(function (it) {
      var w = (it.value / total) * W;
      body += '<rect x="' + x.toFixed(1) + '" y="0" width="' + Math.max(0, w - 2).toFixed(1) + '" height="' + H + '" fill="' + it.color + '" opacity=".9"/>';
      x += w;
    });
    el.innerHTML = svg(W, H, body);
  }

  global.CHART = { line: line, bars: bars, donut: donut, gauge: gauge, spark: spark, stack: stack };
})(window);
