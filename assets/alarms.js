/* ============================================================
   alarms.js · 告警中心
   ============================================================ */
(function () {
  'use strict';
  var Q = function (id) { return document.getElementById(id); };

  var fLevel = 'ALL';
  var fStatus = 'ALL';
  var fText = '';

  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(ts) {
    var d = new Date(ts);
    return p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  }
  function dur(ms) {
    var m = ms / 60000;
    if (m < 1) return Math.max(1, Math.round(ms / 1000)) + ' s';
    if (m < 60) return Math.round(m) + ' min';
    return (m / 60).toFixed(1) + ' h';
  }

  function rowsData() {
    return PLANT.alarms.filter(function (a) {
      if (fLevel !== 'ALL' && a.level !== fLevel) return false;
      if (fStatus === 'OPEN' && a.recoveredAt) return false;
      if (fStatus === 'CLOSED' && !a.recoveredAt) return false;
      if (fText) {
        var s = (a.deviceId + a.msg + a.line).toLowerCase();
        if (s.indexOf(fText.toLowerCase()) < 0) return false;
      }
      return true;
    });
  }

  /* ---------- 统计 ---------- */
  function renderStats() {
    var dayAgo = Date.now() - 864e5;
    var recent = PLANT.alarms.filter(function (a) { return a.ts >= dayAgo; });
    var faults = recent.filter(function (a) { return a.level === 'DOWN'; });
    var warns = recent.filter(function (a) { return a.level === 'WARN'; });
    var unack = PLANT.alarms.filter(function (a) { return !a.recoveredAt && !a.ack; });
    var active = PLANT.alarms.filter(function (a) { return !a.recoveredAt; });
    var done = recent.filter(function (a) { return a.recoveredAt; });
    var mttr = done.length ? done.reduce(function (s, a) { return s + (a.recoveredAt - a.ts); }, 0) / done.length / 60000 : null;

    Q('sTotal').textContent = recent.length;
    Q('sFault').textContent = '故障 ' + faults.length;
    Q('sWarn').textContent = '预警 ' + warns.length;
    Q('sUnack').textContent = unack.length;
    Q('sActive').textContent = active.length;
    Q('sMttr').textContent = mttr == null ? '—' : mttr.toFixed(1);
    Q('rWarn').textContent = '连续 3 周期';
    Q('rDown').textContent = '停机 / 联锁';

    var items = [
      { label: '故障', value: faults.length, color: '#b0543e' },
      { label: '预警', value: warns.length, color: '#bf8a3f' }
    ];
    CHART.donut(Q('levelDonut'), { items: items, value: recent.length, label: 'ALARMS / 24H' });
    Q('levelLegend').innerHTML = items.map(function (it) {
      return '<span><i style="background:' + it.color + '"></i>' + it.label + ' <b>' + it.value + '</b></span>';
    }).join('') + '<span><i style="background:#6b787a"></i>已恢复 <b>' + done.length + '</b></span><span><i style="background:#31d4c4"></i>未恢复 <b>' + active.length + '</b></span>';

    var per = PLANT.lines.map(function (ln) {
      return {
        label: ln.id,
        value: recent.filter(function (a) { return a.line === ln.id; }).length,
        color: '#31d4c4'
      };
    });
    CHART.bars(Q('lineBars'), { items: per, max: Math.max(2, Math.max.apply(null, per.map(function (i) { return i.value; })) + 1) });
  }

  /* ---------- 列表 ---------- */
  function renderTable() {
    var arr = rowsData();
    Q('listCount').textContent = arr.length + ' 条 / 共 ' + PLANT.alarms.length + ' 条';
    if (!arr.length) {
      Q('alarmRows').innerHTML = '<tr><td colspan="8" style="text-align:center;padding:26px;color:#2b3536;font-family:var(--mono);font-size:10.5px">没有符合条件的告警</td></tr>';
      return;
    }
    Q('alarmRows').innerHTML = arr.map(function (a) {
      var lv = a.level === 'DOWN' ? '<span class="tag ft">故障</span>' : '<span class="tag wn">预警</span>';
      var state = a.recoveredAt
        ? '<span style="color:#6b787a">已恢复</span>'
        : (a.ack ? '<span style="color:#bf8a3f">已确认</span>' : '<span style="color:#b0543e">未确认</span>');
      var d = a.recoveredAt ? dur(a.recoveredAt - a.ts) : dur(Date.now() - a.ts) + ' +';
      var act = (!a.ack && !a.recoveredAt)
        ? '<button class="btn" data-ack="' + a.id + '" type="button" style="padding:2px 7px;font-size:9.5px">确认</button>'
        : '<span style="color:#2b3536">—</span>';
      return '<tr class="clickable" data-dev="' + a.deviceId + '">' +
        '<td class="mono" style="font-size:10.5px">' + stamp(a.ts) + '</td>' +
        '<td>' + lv + '</td>' +
        '<td><b class="mono">' + a.deviceId + '</b></td>' +
        '<td class="mono">' + a.line + '</td>' +
        '<td style="white-space:normal;min-width:180px">' + a.msg + '</td>' +
        '<td class="mono">' + d + '</td>' +
        '<td>' + state + '</td>' +
        '<td>' + act + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ---------- 交互 ---------- */
  Q('alFilter').addEventListener('click', function (e) {
    var c = e.target.closest('.chip');
    if (!c) return;
    var k = c.dataset.k, v = c.dataset.v;
    if (k === 'level') fLevel = v; else fStatus = v;
    Array.prototype.forEach.call(Q('alFilter').querySelectorAll('.chip[data-k="' + k + '"]'), function (x) {
      x.classList.toggle('on', x === c);
    });
    renderTable();
  });

  Q('alSearch').addEventListener('input', function (e) {
    fText = e.target.value.trim();
    renderTable();
  });

  Q('alarmRows').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-ack]');
    if (btn) {
      e.stopPropagation();
      PLANT.ackAlarm(btn.dataset.ack);
      return;
    }
    var tr = e.target.closest('tr[data-dev]');
    if (tr) location.href = 'devices.html?id=' + encodeURIComponent(tr.dataset.dev);
  });

  Q('btnAckAll').addEventListener('click', function () { PLANT.ackAll(); });

  var btnPause = Q('btnPause');
  btnPause.addEventListener('click', function () {
    var p = PLANT.togglePause();
    btnPause.setAttribute('aria-pressed', p ? 'true' : 'false');
    btnPause.textContent = p ? '恢复采集' : '暂停采集';
    syncPill();
  });

  Q('btnFault').addEventListener('click', function () { PLANT.injectFault(); });

  /* ---------- 时钟 / 订阅 ---------- */
  function syncPill() {
    var p = PLANT.paused;
    Q('livePill').classList.toggle('stale', p);
    Q('liveTxt').textContent = p ? '已冻结 · 数据陈旧' : '实时 · 虚拟数据';
  }
  function tickClock() {
    var d = new Date();
    Q('clock').textContent = p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  }
  tickClock();
  setInterval(tickClock, 1000);

  PLANT.subscribe(function () {
    renderStats();
    renderTable();
    syncPill();
  });

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { renderStats(); }, 160);
  });
})();
