/* ============================================================
   overview.js · 总览大屏
   ============================================================ */
(function () {
  'use strict';

  var Q = function (id) { return document.getElementById(id); };
  var sel = {
    kOee: Q('kOee'), kOeeDelta: Q('kOeeDelta'), kOeeSpark: Q('kOeeSpark'),
    kOut: Q('kOut'), kPlan: Q('kPlan'), kRate: Q('kRate'), kOutSpark: Q('kOutSpark'),
    kUtil: Q('kUtil'), kRun: Q('kRun'), kIdle: Q('kIdle'), kUtilSpark: Q('kUtilSpark'),
    kAlarm: Q('kAlarm'), kUnack: Q('kUnack'), kAlarmSpark: Q('kAlarmSpark'), kpiAlarm: Q('kpiAlarm'),
    hudId: Q('hudId'), hudState: Q('hudState'), hudType: Q('hudType'), hudOee: Q('hudOee'),
    hudTemp: Q('hudTemp'), hudCycle: Q('hudCycle'), hudOut: Q('hudOut'), hudSpark: Q('hudSpark'),
    hudOrder: Q('hudOrder'), hudProg: Q('hudProg'), hudProgText: Q('hudProgText'), hudTs: Q('hudTs'),
    lineBars: Q('lineBars'), miniAlarms: Q('miniAlarms'), stateLegend: Q('stateLegend'),
    livePill: Q('livePill'), liveTxt: Q('liveTxt'), clock: Q('clock')
  };

  var hist = { oee: [], out: [], util: [], alarm: [] };
  var snap0 = null;

  function num(v, d) { return v.toFixed(d == null ? 1 : d); }
  function comma(v) { return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function badge(st) {
    var s = PLANT.STATE[st];
    return '<span class="st ' + s.cls + '"><i></i>' + s.label + '</span>';
  }
  function hhmm(ts) {
    var d = new Date(ts);
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }
  function lineStats() {
    return PLANT.lines.map(function (ln) {
      var ds = PLANT.devices.filter(function (d) { return d.line === ln.id && d.kind !== 'AGV'; });
      var out = 0, plan = 0, oee = 0;
      ds.forEach(function (d) { out += d.output; plan += d.plan; oee += d.oee; });
      return { line: ln, out: out, plan: plan, oee: oee / (ds.length || 1), run: ds.filter(function (d) { return d.state === 'RUN'; }).length, total: ds.length };
    });
  }

  /* ---------- KPI ---------- */
  function renderKpi(sum) {
    sel.kOee.textContent = num(sum.oee);
    var delta = sum.oee - 85;
    sel.kOeeDelta.textContent = (delta >= 0 ? '+' : '') + num(delta) + ' vs 目标';
    sel.kOeeDelta.className = delta >= 0 ? 'up' : 'down';

    sel.kOut.textContent = comma(sum.output);
    sel.kPlan.textContent = comma(sum.plan);
    sel.kRate.textContent = '达成 ' + num((sum.output / sum.plan) * 100, 0) + '%';

    sel.kUtil.textContent = num(sum.util, 0);
    sel.kRun.textContent = '运行 ' + sum.run + ' / 11';
    sel.kIdle.textContent = '待机 ' + sum.idle + ' · 预警 ' + sum.warn;

    sel.kAlarm.textContent = sum.active;
    sel.kUnack.textContent = '未确认 ' + sum.unack;
    sel.kpiAlarm.classList.toggle('hot', sum.active > 0);

    [['oee', sum.oee], ['out', sum.output], ['util', sum.util], ['alarm', sum.active]].forEach(function (p) {
      var a = hist[p[0]];
      a.push(p[1]);
      if (a.length > 40) a.shift();
    });
    CHART.spark(sel.kOeeSpark, { data: hist.oee, color: '#31d4c4' });
    CHART.spark(sel.kOutSpark, { data: hist.out, color: '#76e8da' });
    CHART.spark(sel.kUtilSpark, { data: hist.util, color: '#31d4c4' });
    CHART.spark(sel.kAlarmSpark, { data: hist.alarm, color: '#b0543e' });
  }

  /* ---------- 选中设备 ---------- */
  function renderHud() {
    var d = PLANT.selected();
    sel.hudId.textContent = d.id;
    sel.hudState.innerHTML = badge(d.state);
    sel.hudType.textContent = d.name + ' · ' + d.line + (d.state === 'DOWN' ? ' · 维修中' : '');
    sel.hudOee.innerHTML = num(d.oee) + '<em>%</em>';
    sel.hudTemp.innerHTML = num(d.metrics.temp) + '<em>℃</em>';
    sel.hudCycle.innerHTML = (d.metrics.cycle ? num(d.metrics.cycle) : '—') + '<em>s</em>';
    sel.hudOut.innerHTML = comma(d.output) + '<em>件</em>';
    sel.hudOrder.textContent = d.order;
    var pct = Math.min(100, (d.output / d.plan) * 100);
    sel.hudProg.style.width = pct.toFixed(1) + '%';
    sel.hudProg.className = pct < 60 ? 'wn' : '';
    sel.hudProgText.textContent = num(pct, 0) + '% · 计划 ' + comma(d.plan);
    sel.hudTs.textContent = 'TS ' + hhmm(Date.now());
    CHART.spark(sel.hudSpark, { data: d.hist.temp, color: PLANT.STATE[d.state].color });
  }

  /* ---------- 产线 / 告警 ---------- */
  function renderLines() {
    var html = lineStats().map(function (s) {
      var pct = Math.min(100, (s.out / s.plan) * 100);
      var cls = s.run === 0 ? 'idle' : pct < 72 ? 'wn' : '';
      return '<div class="hb">' +
        '<div class="hb-l"><span>' + s.line.id + ' ' + s.line.name + '</span><b>' + comma(s.out) + ' / ' + comma(s.plan) + '</b></div>' +
        '<div class="bar-track"><div class="bar-fill ' + cls + '" style="width:' + pct.toFixed(1) + '%"></div></div>' +
        '<div class="hb-l"><span>OEE ' + num(s.oee) + '%</span><span>运行 ' + s.run + '/' + s.total + '</span></div>' +
        '</div>';
    }).join('');
    sel.lineBars.innerHTML = html;
  }

  function renderAlarms() {
    var list = PLANT.alarms.filter(function (a) { return !a.recoveredAt; }).slice(0, 4);
    if (!list.length) { sel.miniAlarms.innerHTML = '<div class="empty">当前无活动告警</div>'; return; }
    sel.miniAlarms.innerHTML = list.map(function (a) {
      var cls = a.level === 'DOWN' ? 'ft' : 'wn';
      return '<div class="row-item">' +
        '<div class="ri-t"><b>' + a.deviceId + '</b><span class="tag ' + cls + '">' + (a.level === 'DOWN' ? '故障' : '预警') + '</span></div>' +
        '<div class="ri-s"><span>' + hhmm(a.ts) + '</span><span>' + a.msg + '</span></div>' +
        '</div>';
    }).join('');
  }

  /* ---------- 三张统计图 ---------- */
  function renderCharts() {
    var labels = [];
    for (var h = 0; h < 24; h++) labels.push((h < 10 ? '0' : '') + h);

    CHART.line(Q('chartProd'), {
      labels: labels,
      series: [
        { name: 'L1', color: '#31d4c4', data: PLANT.hourly.L1 },
        { name: 'L2', color: '#76e8da', data: PLANT.hourly.L2 },
        { name: 'L3', color: '#6b787a', data: PLANT.hourly.L3 }
      ],
      band: [13, 15],
      yMin: 0
    });

    var stats = lineStats();
    CHART.bars(Q('chartOee'), {
      items: stats.map(function (s) {
        return { label: s.line.id, value: s.oee, color: s.oee >= 85 ? '#31d4c4' : '#bf8a3f' };
      }),
      max: 100,
      target: 85
    });

    var counts = { RUN: 0, IDLE: 0, WARN: 0, DOWN: 0 };
    PLANT.devices.forEach(function (d) { counts[d.state]++; });
    var items = [
      { label: '运行', value: counts.RUN, color: '#31d4c4' },
      { label: '待机', value: counts.IDLE, color: '#6b787a' },
      { label: '预警', value: counts.WARN, color: '#bf8a3f' },
      { label: '故障', value: counts.DOWN, color: '#b0543e' }
    ];
    CHART.donut(Q('chartState'), { items: items, value: 12, label: 'DEVICES' });
    if (sel.stateLegend) {
      sel.stateLegend.innerHTML = items.map(function (it) {
        return '<span><i style="background:' + it.color + '"></i>' + it.label + ' <b>' + it.value + '</b></span>';
      }).join('');
    }
  }

  /* ---------- 交互 ---------- */
  function syncPill() {
    var p = PLANT.paused;
    sel.livePill.classList.toggle('stale', p);
    sel.liveTxt.textContent = p ? '已冻结 · 数据陈旧' : '实时 · 虚拟数据';
  }

  var btnPause = Q('btnPause');
  btnPause.addEventListener('click', function () {
    var p = PLANT.togglePause();
    btnPause.setAttribute('aria-pressed', p ? 'true' : 'false');
    btnPause.textContent = p ? '恢复采集' : '暂停采集';
    syncPill();
  });

  Q('btnFault').addEventListener('click', function () {
    var d = PLANT.injectFault();
    if (d && PLANT.selectedId !== d.id) PLANT.select(d.id);
  });
  Q('btnReset').addEventListener('click', function () { SCENE.reset(); });
  Q('btnZoomIn').addEventListener('click', function () { SCENE.zoomBy(1.12); });
  Q('btnZoomOut').addEventListener('click', function () { SCENE.zoomBy(0.9); });

  /* ---------- 时钟 ---------- */
  function tickClock() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    sel.clock.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  tickClock();
  setInterval(tickClock, 1000);

  /* ---------- 渲染循环 ---------- */
  var lastChart = 0;
  PLANT.subscribe(function (snap) {
    snap0 = snap;
    var sum = PLANT.summary();
    renderKpi(sum);
    renderHud();
    renderLines();
    renderAlarms();
    syncPill();
    var now = Date.now();
    if (now - lastChart > 900) { renderCharts(); lastChart = now; }
  });

  SCENE.init(Q('scene'), function (id) { PLANT.select(id); SCENE.select(id); });

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { renderCharts(); renderHud(); }, 160);
  });
})();
