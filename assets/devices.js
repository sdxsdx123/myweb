/* ============================================================
   devices.js · 设备详情页
   ============================================================ */
(function () {
  'use strict';
  var Q = function (id) { return document.getElementById(id); };

  var filterLine = 'ALL';
  var search = '';
  var trendKey = 'temp';

  // 支持从告警中心带设备编号跳转：devices.html?id=CNC-03
  var wanted = null;
  try { wanted = new URLSearchParams(location.search).get('id'); } catch (e) { wanted = null; }
  if (wanted && PLANT.devices.some(function (d) { return d.id === wanted; })) PLANT.select(wanted);

  var TREND = {
    temp:  { label: '主轴温度', unit: '℃', color: '#31d4c4', key: 'temp',  note: '采样 1 s · 环形缓冲 90 点 · 温度越线 8 秒后自动转预警' },
    cycle: { label: '节拍',     unit: 's',  color: '#76e8da', key: 'cycle', note: '采样 1 s · 环形缓冲 90 点 · 节拍变长通常先于故障出现' },
    oee:   { label: 'OEE',      unit: '%',  color: '#bf8a3f', key: 'oee',   note: '采样 1 s · 环形缓冲 90 点 · 停机 12 秒后 OEE 明显下探' }
  };

  function num(v, d) { return (v == null || !isFinite(v)) ? '—' : v.toFixed(d == null ? 1 : d); }
  function comma(v) { return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function badge(st) {
    var s = PLANT.STATE[st];
    return '<span class="st ' + s.cls + '"><i></i>' + s.label + ' · ' + s.key + '</span>';
  }
  function hhmmss(ts) {
    var d = new Date(ts), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function list() {
    return PLANT.devices.filter(function (d) {
      var okLine = filterLine === 'ALL' || d.line === filterLine;
      var okTxt = !search || (d.id + d.name + d.kindLabel).toLowerCase().indexOf(search.toLowerCase()) > -1;
      return okLine && okTxt;
    });
  }

  /* ---------- 设备列表 ---------- */
  function renderList() {
    var sel = PLANT.selectedId;
    var arr = list();
    Q('devCount').textContent = arr.length + ' 台';
    Q('devList').innerHTML = arr.map(function (d) {
      var st = PLANT.STATE[d.state];
      return '<div class="dev-item' + (d.id === sel ? ' on' : '') + '" data-id="' + d.id + '">' +
        '<span class="di-n"><i style="width:6px;height:6px;background:' + st.color + ';display:inline-block;box-shadow:0 0 6px ' + st.color + '"></i>' + d.id + '</span>' +
        '<span class="di-t">' + d.name + ' · ' + d.line + '</span>' +
        '<span class="di-o">' + num(d.oee, 0) + '<span style="font-size:9px;color:#414c4d">%</span></span>' +
        '</div>';
    }).join('') || '<div class="empty">没有匹配的设备</div>';
  }

  /* ---------- 详情 ---------- */
  function renderDetail() {
    var d = PLANT.selected();
    var k = PLANT.KIND[d.kind];
    Q('dName').textContent = d.id;
    Q('dType').textContent = d.name + ' / ' + d.line + ' / ' + d.kind;
    Q('dState').innerHTML = badge(d.state);

    Q('mOee').innerHTML = num(d.oee) + '<small> %</small>';
    Q('mTemp').innerHTML = num(d.metrics.temp) + '<small> ℃</small>';
    Q('mCycle').innerHTML = (d.metrics.cycle ? num(d.metrics.cycle) : '—') + '<small> s</small>';
    Q('mVib').innerHTML = num(d.metrics.vib) + '<small> mm/s</small>';

    var oeeBar = Q('mOeeBar');
    oeeBar.style.width = Math.min(100, d.oee) + '%';
    oeeBar.className = d.oee >= 85 ? '' : d.oee >= 70 ? 'wn' : 'ft';

    var tHi = k.temp[1];
    var tBar = Q('mTempBar');
    tBar.style.width = Math.min(100, (d.metrics.temp / (tHi + 14)) * 100) + '%';
    tBar.className = d.metrics.temp > tHi + 4 ? 'ft' : d.metrics.temp > tHi ? 'wn' : '';

    var cBar = Q('mCycleBar');
    cBar.style.width = Math.min(100, (d.metrics.cycle / ((k.cycle[1] || 40) * 1.8)) * 100) + '%';
    cBar.className = d.metrics.cycle > k.cycle[1] * 1.25 ? 'wn' : '';

    var vBar = Q('mVibBar');
    vBar.style.width = Math.min(100, (d.metrics.vib / 3.5) * 100) + '%';
    vBar.className = d.metrics.vib > 2.2 ? 'wn' : '';

    // 工单
    var pct = Math.min(100, (d.output / d.plan) * 100);
    Q('dOrder').textContent = d.order;
    Q('dProduct').textContent = (d.kind === 'CNC' ? '壳体 · ' : d.kind === 'QC' ? '抽检 · ' : '总成 · ') + d.line;
    Q('dPlan').textContent = comma(d.plan) + ' 件';
    Q('dDone').textContent = comma(d.output) + ' 件';
    Q('dTarget').textContent = (k.cycle[1] || '—') + ' s';
    Q('dGood').textContent = num(d.good * 100, 2) + ' %';
    Q('dPower').textContent = d.metrics.power + ' kW';
    Q('dProg').style.width = pct.toFixed(1) + '%';
    Q('dProgTxt').textContent = num(pct, 0) + '%';

    CHART.gauge(Q('oeeGauge'), {
      value: Math.min(100, d.oee),
      target: 85,
      color: d.oee >= 85 ? '#31d4c4' : d.oee >= 70 ? '#bf8a3f' : '#b0543e',
      label: 'OEE % / 目标 85'
    });

    renderTrend(d);
    renderPoints(d);
    renderAlarms(d);
  }

  function renderTrend(d) {
    var cfg = TREND[trendKey];
    var labels = [], data = [];
    var now = Date.now();
    (d.hist[cfg.key] || []).forEach(function (v, i, a) {
      labels.push(hhmmss(now - (a.length - 1 - i) * 1000));
      data.push(v);
    });
    var lo = Math.min.apply(null, data);
    CHART.line(Q('trendChart'), {
      labels: labels,
      series: [{ name: cfg.label, color: cfg.color, data: data }],
      yMin: trendKey === 'oee' ? 40 : Math.max(0, Math.floor(lo - (trendKey === 'temp' ? 8 : 5))),
      target: trendKey === 'temp' ? PLANT.KIND[d.kind].temp[1] : trendKey === 'oee' ? 85 : null
    });
    Q('trendNote').textContent = cfg.note + ' · 单位 ' + cfg.unit;
  }

  function renderPoints(d) {
    var k = PLANT.KIND[d.kind];
    var rows = [
      ['PT-TEMP', '主轴温度', num(d.metrics.temp), '℃', d.metrics.temp > k.temp[1] + 4 ? 'DOWN' : d.metrics.temp > k.temp[1] ? 'WARN' : 'RUN'],
      ['PT-CYC', '节拍', num(d.metrics.cycle), 's', 'RUN'],
      ['PT-VIB', '振动幅值', num(d.metrics.vib, 2), 'mm/s', d.metrics.vib > 2.2 ? 'WARN' : 'RUN'],
      ['PT-PWR', '有功功率', String(d.metrics.power), 'kW', 'RUN'],
      ['PT-CNT', '产出计数', comma(d.output), '件', 'RUN'],
      ['PT-ST', '状态字', d.state, '—', d.state]
    ];
    Q('pointRows').innerHTML = rows.map(function (r) {
      var st = PLANT.STATE[r[4]];
      return '<tr><td class="mono">' + r[0] + '</td><td>' + r[1] + '</td><td class="mono" style="text-align:right;color:#e4ecea">' + r[2] + '</td><td class="mono">' + r[3] + '</td>' +
        '<td><span class="st ' + st.cls + '"><i></i>' + st.label + '</span></td></tr>';
    }).join('');
  }

  function renderAlarms(d) {
    var arr = PLANT.alarms.filter(function (a) { return a.deviceId === d.id; }).slice(0, 5);
    if (!arr.length) { Q('devAlarms').innerHTML = '<div class="empty">该设备暂无告警</div>'; return; }
    Q('devAlarms').innerHTML = arr.map(function (a) {
      var cls = a.level === 'DOWN' ? 'ft' : 'wn';
      var state = a.recoveredAt ? '<span style="color:#6b787a">已恢复</span>' : (a.ack ? '<span style="color:#bf8a3f">已确认</span>' : '<span style="color:#b0543e">未确认</span>');
      var t = new Date(a.ts), p = function (n) { return (n < 10 ? '0' : '') + n; };
      return '<div class="row-item">' +
        '<div class="ri-t"><b>' + a.msg + '</b><span class="tag ' + cls + '">' + (a.level === 'DOWN' ? '故障' : '预警') + '</span></div>' +
        '<div class="ri-s"><span>' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes()) + '</span><span>' + state + '</span><span>' + a.id + '</span></div>' +
        '</div>';
    }).join('');
  }

  /* ---------- 交互 ---------- */
  Q('devList').addEventListener('click', function (e) {
    var item = e.target.closest('.dev-item');
    if (!item) return;
    PLANT.select(item.dataset.id);
  });

  Q('devFilters').addEventListener('click', function (e) {
    var c = e.target.closest('.chip');
    if (!c) return;
    filterLine = c.dataset.line;
    Array.prototype.forEach.call(Q('devFilters').querySelectorAll('.chip'), function (x) {
      x.classList.toggle('on', x === c);
    });
    renderList();
  });

  Q('devSearch').addEventListener('input', function (e) {
    search = e.target.value.trim();
    renderList();
  });

  Q('trendChips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip');
    if (!c) return;
    trendKey = c.dataset.k;
    Array.prototype.forEach.call(Q('trendChips').querySelectorAll('.chip'), function (x) {
      x.classList.toggle('on', x === c);
    });
    renderTrend(PLANT.selected());
  });

  var btnPause = Q('btnPause');
  btnPause.addEventListener('click', function () {
    var p = PLANT.togglePause();
    btnPause.setAttribute('aria-pressed', p ? 'true' : 'false');
    btnPause.textContent = p ? '恢复采集' : '暂停采集';
    syncPill();
  });

  Q('btnFault').addEventListener('click', function () { PLANT.injectFault(PLANT.selectedId); });

  /* ---------- 时钟 / 订阅 ---------- */
  function syncPill() {
    var p = PLANT.paused;
    Q('livePill').classList.toggle('stale', p);
    Q('liveTxt').textContent = p ? '已冻结 · 数据陈旧' : '实时 · 虚拟数据';
  }
  function tickClock() {
    Q('clock').textContent = hhmmss(Date.now());
  }
  tickClock();
  setInterval(tickClock, 1000);

  PLANT.subscribe(function () {
    renderList();
    renderDetail();
    syncPill();
  });

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { renderTrend(PLANT.selected()); renderDetail(); }, 160);
  });
})();
