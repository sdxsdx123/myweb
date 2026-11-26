/* ============================================================
   plant.js · 数据引擎
   结构对齐方案里的设备快照：devices / points / alarms / orders
   三层造数：班次基线 + 节拍噪声 + 事件注入
   ============================================================ */
(function (global) {
  'use strict';

  var STATE = {
    RUN:  { key: 'RUN',  label: '运行', cls: 'run',  color: '#31d4c4' },
    IDLE: { key: 'IDLE', label: '待机', cls: 'idle', color: '#6b787a' },
    WARN: { key: 'WARN', label: '预警', cls: 'warn', color: '#bf8a3f' },
    DOWN: { key: 'DOWN', label: '故障', cls: 'down', color: '#b0543e' }
  };

  var KIND = {
    CNC: { label: '加工中心', w: 2.7, d: 2.0, h: 2.2, temp: [56, 68], cycle: [38, 46], vib: [1.2, 2.2], rate: 1.6 },
    ASM: { label: '装配工位', w: 2.2, d: 1.9, h: 1.8, temp: [40, 51], cycle: [24, 32], vib: [0.5, 1.1], rate: 2.2 },
    QC:  { label: '检测站',   w: 2.0, d: 2.0, h: 2.1, temp: [34, 44], cycle: [16, 23], vib: [0.2, 0.6], rate: 2.8 },
    AGV: { label: '物流 AGV', w: 1.7, d: 1.05, h: 1.0, temp: [30, 42], cycle: [0, 0],   vib: [0.3, 0.9], rate: 0 }
  };

  var LINES = [
    { id: 'L1', name: '加工线', base: 186 },
    { id: 'L2', name: '装配线', base: 214 },
    { id: 'L3', name: '总装线', base: 152 }
  ];

  var LAYOUT = [
    { id: 'CNC-01', kind: 'CNC', line: 'L1', x: -7.6, z: -6.6, rot: 0, order: 'WO-2411-08' },
    { id: 'CNC-02', kind: 'CNC', line: 'L1', x: -2.4, z: -6.6, rot: 0, order: 'WO-2411-08' },
    { id: 'CNC-03', kind: 'CNC', line: 'L1', x: 2.8,  z: -6.6, rot: 0, order: 'WO-2411-09' },
    { id: 'QC-01',  kind: 'QC',  line: 'L1', x: 8.0,  z: -6.6, rot: 0, order: 'WO-2411-09' },
    { id: 'ASM-01', kind: 'ASM', line: 'L2', x: -7.6, z: 0.4,  rot: 0, order: 'WO-2411-11' },
    { id: 'ASM-02', kind: 'ASM', line: 'L2', x: -2.4, z: 0.4,  rot: 0, order: 'WO-2411-11' },
    { id: 'ASM-03', kind: 'ASM', line: 'L2', x: 2.8,  z: 0.4,  rot: 0, order: 'WO-2411-12' },
    { id: 'ASM-04', kind: 'ASM', line: 'L2', x: 8.0,  z: 0.4,  rot: 0, order: 'WO-2411-12' },
    { id: 'CNC-04', kind: 'CNC', line: 'L3', x: -7.6, z: 7.2,  rot: 0, order: 'WO-2411-14' },
    { id: 'ASM-05', kind: 'ASM', line: 'L3', x: -2.4, z: 7.2,  rot: 0, order: 'WO-2411-14' },
    { id: 'QC-02',  kind: 'QC',  line: 'L3', x: 2.8,  z: 7.2,  rot: 0, order: 'WO-2411-15' },
    { id: 'AGV-01', kind: 'AGV', line: 'L3', x: 8.0,  z: 3.6,  rot: 0, order: '—' }
  ];

  var seed = 0;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function shiftFactor(hour) {
    // 白班 08–20 系数 1.0，夜班 0.82，交界处正弦过渡
    var day = 1, night = 0.82;
    if (hour >= 8 && hour < 20) return day;
    var d = hour < 8 ? Math.min(hour + 4, 4) : Math.min(24 - hour + 4, 4);
    var t = clamp(d / 5, 0, 1);
    return night + (day - night) * (0.5 - 0.5 * Math.cos(Math.PI * t));
  }

  function buildHourly() {
    var out = {};
    LINES.forEach(function (ln) {
      var arr = [];
      for (var h = 0; h < 24; h++) {
        var v = ln.base * shiftFactor(h) + rnd(-7, 7);
        if (h === 14) v *= 0.84;          // 交接班掉点
        if (h === 2) v *= 0.9;
        arr.push(Math.round(v));
      }
      out[ln.id] = arr;
    });
    return out;
  }

  var devices = LAYOUT.map(function (d, i) {
    var k = KIND[d.kind];
    var st = i === 7 ? 'WARN' : (i === 10 ? 'IDLE' : 'RUN');
    var temp = rnd(k.temp[0], k.temp[1]);
    var cycle = rnd(k.cycle[0], k.cycle[1]) || 0;
    return {
      id: d.id, kind: d.kind, kindLabel: k.label, line: d.line,
      x: d.x, z: d.z, rot: d.rot,
      name: k.label, state: st,
      metrics: {
        temp: temp, cycle: cycle, vib: rnd(k.vib[0], k.vib[1]),
        power: Math.round(rnd(4, 18))
      },
      order: d.order,
      plan: Math.round(rnd(700, 1200)),
      output: Math.round(rnd(120, 420)),
      oee: rnd(78, 92),
      good: rnd(0.975, 0.996),
      hist: { temp: [], cycle: [], oee: [] },
      timer: 0, phase: Math.random() * 6.28
    };
  });

  // 预填历史，曲线一打开就是满的
  devices.forEach(function (dv) {
    var k = KIND[dv.kind];
    for (var i = 0; i < 90; i++) {
      dv.hist.temp.push(clamp(dv.metrics.temp + rnd(-2.4, 2.4), k.temp[0] - 6, k.temp[1] + 8));
      dv.hist.cycle.push(clamp((dv.metrics.cycle || 1) + rnd(-2.2, 2.2), Math.max(6, k.cycle[0] - 6), k.cycle[1] + 8));
      dv.hist.oee.push(clamp(dv.oee + rnd(-3, 3), 55, 97));
    }
  });

  var alarms = [];
  var alarmSeq = 1180;

  function pushAlarm(level, device, msg) {
    var a = {
      id: 'ALM-' + (++alarmSeq),
      ts: Date.now(),
      level: level,
      deviceId: device.id,
      line: device.line,
      msg: msg,
      ack: false,
      recoveredAt: null
    };
    alarms.unshift(a);
    if (alarms.length > 80) alarms.pop();
    return a;
  }

  // 预置历史告警，告警中心一打开就有内容
  (function seedAlarms() {
    var now = Date.now();
    var seeds = [
      ['DOWN', 'CNC-03', '主轴过载停机', 46, false, 12],
      ['WARN', 'ASM-04', '扭矩连续 3 次接近上限', 18, false, null],
      ['WARN', 'CNC-01', '主轴温度 74.6℃ 超预警线', 63, true, null],
      ['DOWN', 'QC-01',  '视觉标定丢失', 122, true, 34],
      ['WARN', 'ASM-02', '气压波动 > 0.06MPa', 150, true, null],
      ['WARN', 'CNC-04', '振动幅值上穿 2.0mm/s', 198, true, 31]
    ];
    seeds.forEach(function (s) {
      var dv = devices.filter(function (d) { return d.id === s[1]; })[0];
      if (!dv) return;
      alarms.push({
        id: 'ALM-' + (++alarmSeq), ts: now - s[3] * 60000, level: s[0],
        deviceId: dv.id, line: dv.line, msg: s[2], ack: s[4],
        recoveredAt: s[5] == null ? null : now - s[3] * 60000 + s[5] * 60000
      });
    });
  })();

  var subscribers = [];
  var paused = false;
  var hourly = buildHourly();
  var selectedId = 'CNC-01';
  var lastAlarm = null;

  function notify() {
    var snap = {
      devices: devices, alarms: alarms, lines: LINES,
      selectedId: selectedId, paused: paused, hourly: hourly
    };
    subscribers.forEach(function (fn) { try { fn(snap); } catch (e) { console.error(e); } });
  }

  function rateFor(dv) {
    return KIND[dv.kind].rate * (dv.state === 'RUN' ? 1 : 0);
  }

  function step() {
    if (paused) return;
    var hourFactor = shiftFactor(new Date().getHours());

    devices.forEach(function (dv) {
      var k = KIND[dv.kind];
      dv.timer += 1;
      var h = dv.state;

      // —— 状态机 ——：
      if (h === 'RUN') {
        if (dv.metrics.temp > k.temp[1] + 6) {
          dv.state = 'WARN';
          pushAlarm('WARN', dv, '温度 ' + dv.metrics.temp.toFixed(1) + '℃ 超预警线');
        } else if (Math.random() < 0.004) {
          dv.state = 'IDLE';
        }
      } else if (h === 'IDLE') {
        if (Math.random() < 0.09) dv.state = 'RUN';
      } else if (h === 'WARN') {
        if (dv.warnLeft == null) dv.warnLeft = 8;
        dv.warnLeft -= 1;
        if (dv.warnLeft <= 0) { dv.state = 'RUN'; dv.warnLeft = null; }
      } else if (h === 'DOWN') {
        if (dv.downLeft == null) dv.downLeft = 12;
        dv.downLeft -= 1;
        if (dv.downLeft <= 0) {
          dv.downLeft = null; dv.state = 'WARN'; dv.warnLeft = 6;
          var a = alarms.filter(function (x) { return x.deviceId === dv.id && !x.recoveredAt; })[0];
          if (a) a.recoveredAt = Date.now();
        }
      }

      var running = dv.state === 'RUN';
      var idle = dv.state === 'IDLE' || dv.state === 'DOWN';

      // —— 指标：向目标值回归 + 噪声 ——
      var tTarget = running ? rnd(k.temp[0], k.temp[1]) : (dv.state === 'DOWN' ? k.temp[0] - 4 : k.temp[0] - 2);
      dv.metrics.temp += (tTarget - dv.metrics.temp) * 0.12 + rnd(-0.35, 0.35);
      var cTarget = running ? rnd(k.cycle[0], k.cycle[1]) : (k.cycle[1] || 10) * 1.35;
      dv.metrics.cycle = dv.metrics.cycle ? dv.metrics.cycle + (cTarget - dv.metrics.cycle) * 0.1 : cTarget;
      dv.metrics.vib = clamp(dv.metrics.vib + rnd(-0.09, 0.09) + (running ? 0 : -0.05), k.vib[0] - 0.3, k.vib[1] + 1.1);
      dv.metrics.power = Math.round(clamp(dv.metrics.power + rnd(-1.2, 1.2), running ? 5 : 1, 22));

      // —— 产量 / OEE ——
      if (running) {
        dv.output += rateFor(dv) * hourFactor * 0.42;
        if (dv.output > dv.plan) dv.plan += Math.round(rnd(200, 400));
      }
      var oeeTarget = running ? 88 : idle ? 52 : 74;
      dv.oee += (oeeTarget + rnd(-4, 4) - dv.oee) * 0.05;
      dv.good = clamp(dv.good + rnd(-0.0008, 0.0008), 0.955, 0.999);

      dv.hist.temp.push(dv.metrics.temp);
      dv.hist.cycle.push(dv.metrics.cycle || 0);
      dv.hist.oee.push(dv.oee);
      if (dv.hist.temp.length > 90) {
        dv.hist.temp.shift(); dv.hist.cycle.shift(); dv.hist.oee.shift();
      }
    });

    // AGV 沿通道往返
    var agv = devices.filter(function (d) { return d.kind === 'AGV'; })[0];
    if (agv) {
      agv.phase += 0.012;
      agv.x = Math.sin(agv.phase) * 9.4;
      agv.z = 3.6 + Math.cos(agv.phase * 0.6) * 0.5;
      agv.rot = Math.cos(agv.phase) > 0 ? 0 : Math.PI;
      agv.state = 'RUN';
      agv.output = Math.round(80 + (Math.sin(agv.phase) + 1) * 40);
    }

    // 当小时产量累加
    var hh = new Date().getHours();
    var runningCount = devices.filter(function (d) { return d.state === 'RUN'; }).length;
    if (runningCount) {
      LINES.forEach(function (ln, i) {
        var inc = (runningCount / 12) * (ln.base / 150) * hourFactor * 0.008;
        var arr = hourly[ln.id];
        if (arr) arr[hh] = Math.min(Math.round(ln.base * 1.2), Math.round(arr[hh] + inc));
      });
    }

    notify();
  }

  var timer = setInterval(step, 1000);

  var PLANT = {
    STATE: STATE,
    KIND: KIND,
    lines: LINES,
    devices: devices,
    get alarms() { return alarms; },
    get hourly() { return hourly; },
    get paused() { return paused; },
    get selectedId() { return selectedId; },
    selected: function () {
      return devices.filter(function (d) { return d.id === selectedId; })[0] || devices[0];
    },
    select: function (id) {
      if (selectedId === id) return;
      selectedId = id;
      notify();
    },
    togglePause: function () {
      paused = !paused;
      notify();
      return paused;
    },
    setPaused: function (v) { paused = !!v; notify(); },
    injectFault: function (id) {
      var cand = devices.filter(function (d) { return d.kind !== 'AGV' && d.state !== 'DOWN'; });
      var dv = id ? cand.filter(function (d) { return d.id === id; })[0] || pick(cand) : pick(cand);
      if (!dv) return null;
      dv.state = 'DOWN';
      dv.downLeft = 12;
      dv.warnLeft = null;
      var msgs = ['主轴过载停机', '伺服驱动器报警', '气动夹爪失压', '安全门联锁触发'];
      pushAlarm('DOWN', dv, pick(msgs));
      lastAlarm = dv;
      notify();
      return dv;
    },
    ackAlarm: function (id) {
      alarms.forEach(function (a) { if (a.id === id) a.ack = true; });
      notify();
    },
    ackAll: function () {
      alarms.forEach(function (a) { if (!a.recoveredAt) a.ack = true; });
      notify();
    },
    subscribe: function (fn) {
      subscribers.push(fn);
      fn({ devices: devices, alarms: alarms, lines: LINES, selectedId: selectedId, paused: paused, hourly: hourly });
      return function () {
        subscribers = subscribers.filter(function (f) { return f !== fn; });
      };
    },
    summary: function () {
      var sum = { oee: 0, output: 0, plan: 0, run: 0, idle: 0, warn: 0, down: 0, active: 0, unack: 0 };
      devices.forEach(function (d) {
        if (d.kind === 'AGV') return;
        sum.oee += d.oee;
        sum.output += d.output;
        sum.plan += d.plan;
        if (d.state === 'RUN') sum.run++;
        else if (d.state === 'IDLE') sum.idle++;
        else if (d.state === 'WARN') sum.warn++;
        else sum.down++;
      });
      sum.oee = sum.oee / 11;
      sum.util = (sum.run / 11) * 100;
      alarms.forEach(function (a) {
        if (!a.recoveredAt) { sum.active++; if (!a.ack) sum.unack++; }
      });
      return sum;
    },
    stop: function () { clearInterval(timer); }
  };

  global.PLANT = PLANT;
})(window);
