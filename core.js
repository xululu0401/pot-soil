/* 换盆用土清单 · 核心（core.js）
 * 纯函数，不碰 DOM、不读时间、不用随机：同样的输入永远给同样的输出。
 *
 * 一条链：
 *   每种盆（锥台：上口、底、高、个数）→ 按「排水层 / 土 / 口沿留空」分三段算体积
 *   → 总土量 × (1 + 多备) → 按配方份数拆成每种材料多少升 → 扣家里已有 → 整袋取整、剩多少、多少钱
 *   → 两条反解：降多备少买一袋 / 用已买的袋子再多装几盆
 *
 * 做不到的情形一律返回 ok=false 和错误清单，绝不返回 0 冒充结果。
 * 页面上的每个数字都必须能从同一次 compute 的输出里找到。
 * 本页不推荐配方、不判断透气保水：配方由用户填，默认是虚构示例。
 */
(function (root) {
  'use strict';

  var EPS = 1e-9;
  var MAX_POTS = 8, MAX_MATS = 6, NAME_MAX = 40;

  var POT_FIELDS = {
    top:  { label: '上口', min: 0.5, max: 300 },
    top2: { label: '上口宽', min: 0.5, max: 300 },
    bot:  { label: '底', min: 0.5, max: 300 },
    bot2: { label: '底宽', min: 0.5, max: 300 },
    h:    { label: '盆高', min: 1, max: 300 },
    n:    { label: '个数', min: 0, max: 999, int: true }
  };
  var MAT_FIELDS = {
    parts: { label: '份数', min: 0, max: 1000 },
    bag:   { label: '每袋', min: 0.1, max: 1000 },
    price: { label: '每袋价格', min: 0, max: 100000 },
    have:  { label: '家里已有', min: 0, max: 10000 }
  };
  var FIELDS = {
    drain:  { label: '排水层厚度', unit: 'cm', min: 0, max: 100 },
    head:   { label: '口沿留空', unit: 'cm', min: 0, max: 100 },
    spare:  { label: '多备', unit: '%', min: 0, max: 100 },
    dbag:   { label: '排水材料每袋', unit: 'L', min: 0.1, max: 1000 },
    dprice: { label: '排水材料每袋价格', unit: '元', min: 0, max: 100000 },
    dhave:  { label: '排水材料家里已有', unit: 'L', min: 0, max: 10000 }
  };
  var SCALARS = ['drain', 'head', 'spare', 'dbag', 'dprice', 'dhave'];

  function P(name, shape, top, top2, bot, bot2, h, n) { return { name: name, shape: shape, top: top, top2: top2, bot: bot, bot2: bot2, h: h, n: n }; }
  function Mt(name, parts, bag, price, have) { return { name: name, parts: parts, bag: bag, price: price, have: have }; }

  var BASE = {
    pots: [
      P('圆盆', 'round', '25', '', '18', '', '22', '4'),
      P('方盆', 'square', '20', '20', '15', '15', '18', '3'),
      P('长条种植箱', 'square', '60', '20', '60', '20', '18', '2')
    ],
    mats: [
      Mt('泥炭', '5', '50', '45', '0'),
      Mt('珍珠岩', '2', '10', '12', '5'),
      Mt('蛭石', '1', '10', '12', '0'),
      Mt('椰糠', '2', '10', '10', '0')
    ],
    drain: '3', head: '2', spare: '10',
    dname: '陶粒', dbag: '10', dprice: '15', dhave: '0'
  };

  var PRESETS = [
    { key: 'default', name: '默认：阳台 9 个盆一起换',
      note: '圆盆 4 个、方盆 3 个、长条种植箱 2 个，泥炭 5 : 珍珠岩 2 : 蛭石 1 : 椰糠 2。价格与配方都是虚构示例。', state: {} },
    { key: 'succulent', name: '多肉小盆 × 20，颗粒土',
      note: '20 个 9 cm 小盆，赤玉土 4 : 鹿沼土 3 : 泥炭 3，不垫排水层。虚构示例。',
      state: { pots: [P('9 cm 小盆', 'round', '9', '', '6.5', '', '8', '20')],
        mats: [Mt('赤玉土', '4', '5', '28', '0'), Mt('鹿沼土', '3', '5', '25', '0'), Mt('泥炭', '3', '10', '15', '0')],
        drain: '0', head: '1', spare: '10' } },
    { key: 'veg', name: '种菜：两个大种植箱',
      note: '两个 80×40 cm、深 30 cm 的种植箱，园土 6 : 腐叶土 3 : 珍珠岩 1，家里还剩半袋园土。虚构示例。',
      state: { pots: [P('大种植箱', 'square', '80', '40', '76', '36', '30', '2')],
        mats: [Mt('园土', '6', '25', '20', '12'), Mt('腐叶土', '3', '20', '18', '0'), Mt('珍珠岩', '1', '10', '12', '0')],
        drain: '4', head: '3', spare: '5' } },
    { key: 'one', name: '只换一个大盆',
      note: '一个 40 cm 大圆盆，营养土单一配方，看「一袋到底够不够」。虚构示例。',
      state: { pots: [P('大圆盆', 'round', '40', '', '30', '', '35', '1')],
        mats: [Mt('营养土', '1', '50', '39', '0')], drain: '4', head: '3', spare: '10' } }
  ];

  function cloneState(s) { return JSON.parse(JSON.stringify(s)); }
  function defaultState() { return cloneState(BASE); }
  function stateFromPreset(key) {
    var p = PRESETS.filter(function (x) { return x.key === key; })[0];
    var s = defaultState();
    if (!p) return s;
    var o = cloneState(p.state);
    Object.keys(o).forEach(function (k) { s[k] = o[k]; });
    return s;
  }
  function presetKey(state) {
    var t = JSON.stringify(state);
    for (var i = 0; i < PRESETS.length; i++) if (JSON.stringify(stateFromPreset(PRESETS[i].key)) === t) return PRESETS[i].key;
    return null;
  }

  /* ── 解析：原文保留，非法的报出来 ── */
  function parseNum(raw, f) {
    var t = String(raw == null ? '' : raw).trim();
    if (t === '') return { code: 'empty' };
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return { code: 'nan' };
    var v = Number(t);
    if (!isFinite(v)) return { code: 'nan' };
    if (f.int && Math.floor(v) !== v) return { code: 'int' };
    if (v < f.min || v > f.max) return { code: 'range' };
    return { v: v };
  }
  function msg(code, label, f, unit) {
    var u = unit || f.unit || '';
    if (code === 'empty') return label + '没填';
    if (code === 'nan') return label + '要填数字';
    if (code === 'int') return label + '要填整数';
    return label + '要在 ' + f.min + '–' + f.max + (u ? ' ' + u : '') + ' 之间';
  }

  /* ── 几何 ── */
  /* 截面积（cm²）：z 从盆底量起，上下口按高度线性过渡。A(z) 是 z 的二次式 → Simpson 对它精确。 */
  function areaAt(g, z) {
    var t = z / g.h;
    var a = g.bot + (g.top - g.bot) * t;
    if (g.shape === 'round') return Math.PI * a * a / 4;
    var b = g.bot2 + (g.top2 - g.bot2) * t;
    return a * b;
  }
  function segVol(g, z1, z2) {
    if (z2 <= z1) return 0;
    return (z2 - z1) / 6 * (areaAt(g, z1) + 4 * areaAt(g, (z1 + z2) / 2) + areaAt(g, z2));
  }
  function bagsFor(net, bag) { return net <= 0 ? 0 : Math.ceil(net / bag - EPS); }

  function fmtV(v, d) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    var s = (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
    if (d > 0) s = s.replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s;
  }
  function fmtL(v) { return fmtV(v, Math.abs(v) < 10 ? 2 : 1); }
  function fmtPct(frac) { return fmtV(frac * 100, 1) + '%'; }

  /* ── 主计算 ── */
  function compute(state, noActs) {
    var errors = [], warnings = [];
    var sc = {};
    SCALARS.forEach(function (k) {
      var r = parseNum(state[k], FIELDS[k]);
      if (r.code) errors.push({ field: k, code: r.code, message: msg(r.code, FIELDS[k].label, FIELDS[k]) });
      else sc[k] = r.v;
    });
    var pots = Array.isArray(state.pots) ? state.pots : [];
    var mats = Array.isArray(state.mats) ? state.mats : [];
    if (pots.length < 1 || pots.length > MAX_POTS) errors.push({ field: 'pots', code: 'count', message: '盆要有 1–' + MAX_POTS + ' 行' });
    if (mats.length < 1 || mats.length > MAX_MATS) errors.push({ field: 'mats', code: 'count', message: '配方要有 1–' + MAX_MATS + ' 种材料' });

    var G = pots.slice(0, MAX_POTS).map(function (p, i) {
      p = p || {};
      var name = String(p.name == null ? '' : p.name).trim();
      var lab = '第 ' + (i + 1) + ' 种盆的';
      if (!name) errors.push({ field: 'pots', row: i, sub: 'name', code: 'empty', message: lab + '名字没填' });
      else if (name.length > NAME_MAX) errors.push({ field: 'pots', row: i, sub: 'name', code: 'long', message: lab + '名字最多 ' + NAME_MAX + ' 字' });
      var shape = p.shape === 'square' ? 'square' : p.shape === 'round' ? 'round' : null;
      if (!shape) errors.push({ field: 'pots', row: i, sub: 'shape', code: 'shape', message: lab + '形状只能是圆盆或方盆' });
      var g = { idx: i, name: name, shape: shape };
      var keys = shape === 'square' ? ['top', 'top2', 'bot', 'bot2', 'h', 'n'] : ['top', 'bot', 'h', 'n'];
      keys.forEach(function (k) {
        var f = POT_FIELDS[k];
        var label = shape === 'square' && k === 'top' ? '上口长' : shape === 'square' && k === 'bot' ? '底长' : f.label;
        var r = parseNum(p[k], f);
        if (r.code) errors.push({ field: 'pots', row: i, sub: k, code: r.code, message: msg(r.code, lab + label, f, k === 'n' ? '个' : 'cm') });
        else g[k] = r.v;
      });
      return g;
    });
    var M_ = mats.slice(0, MAX_MATS).map(function (m, i) {
      m = m || {};
      var name = String(m.name == null ? '' : m.name).trim();
      var lab = '第 ' + (i + 1) + ' 种材料的';
      if (!name) errors.push({ field: 'mats', row: i, sub: 'name', code: 'empty', message: lab + '名字没填' });
      else if (name.length > NAME_MAX) errors.push({ field: 'mats', row: i, sub: 'name', code: 'long', message: lab + '名字最多 ' + NAME_MAX + ' 字' });
      var o = { idx: i, name: name };
      Object.keys(MAT_FIELDS).forEach(function (k) {
        var f = MAT_FIELDS[k], u = k === 'price' ? '元' : k === 'parts' ? '份' : 'L';
        var r = parseNum(m[k], f);
        if (r.code) errors.push({ field: 'mats', row: i, sub: k, code: r.code, message: msg(r.code, lab + f.label, f, u) });
        else o[k] = r.v;
      });
      return o;
    });
    var dname = String(state.dname == null ? '' : state.dname).trim();
    if (sc.drain > 0 && !dname) errors.push({ field: 'dname', code: 'empty', message: '排水材料的名字没填' });
    if (dname.length > NAME_MAX) errors.push({ field: 'dname', code: 'long', message: '排水材料名字最多 ' + NAME_MAX + ' 字' });

    /* 跨字段：排水层 + 留空 必须小于盆高 */
    if (sc.drain != null && sc.head != null) {
      G.forEach(function (g) {
        if (g.h != null && sc.drain + sc.head >= g.h - EPS) {
          errors.push({ field: 'pots', row: g.idx, sub: 'h', code: 'nosoil',
            message: '「' + (g.name || '第 ' + (g.idx + 1) + ' 种盆') + '」高 ' + fmtV(g.h, 1) + ' cm，排水层 ' + fmtV(sc.drain, 1) + ' cm + 留空 ' + fmtV(sc.head, 1) + ' cm 已经占满，装不下土' });
        }
      });
    }
    if (!errors.length) {
      if (!G.some(function (g) { return g.n > 0; })) errors.push({ field: 'pots', code: 'none', message: '每种盆的个数都是 0，没有要换的盆' });
      var Psum = M_.reduce(function (a, m) { return a + m.parts; }, 0);
      if (!(Psum > 0)) errors.push({ field: 'mats', code: 'noparts', message: '配方的份数加起来是 0，没法拆' });
    }
    if (errors.length) return { ok: false, errors: errors, warnings: [] };

    var s = sc.spare / 100;
    var potsOut = G.map(function (g) {
      var top = g.h - sc.head;
      var soil = segVol(g, sc.drain, top) / 1000;
      var drain = segVol(g, 0, sc.drain) / 1000;
      var full = segVol(g, 0, g.h) / 1000;
      return { idx: g.idx, name: g.name, shape: g.shape, top: g.top, top2: g.top2 == null ? null : g.top2, bot: g.bot, bot2: g.bot2 == null ? null : g.bot2,
        h: g.h, n: g.n, soilL: soil, drainL: drain, fullL: full, soilTotal: soil * g.n, drainTotal: drain * g.n };
    });
    var M = potsOut.reduce(function (a, p) { return a + p.soilTotal; }, 0);
    var Q = potsOut.reduce(function (a, p) { return a + p.drainTotal; }, 0);
    var need = M * (1 + s);
    var Ps = M_.reduce(function (a, m) { return a + m.parts; }, 0);
    var matsOut = M_.map(function (m) {
      var share = m.parts / Ps;
      var nd = need * share;
      var net = Math.max(0, nd - m.have);
      var bags = bagsFor(net, m.bag);
      return { idx: m.idx, name: m.name, parts: m.parts, share: share, needL: nd, haveL: m.have, netL: net, bag: m.bag, price: m.price,
        bags: bags, buyL: bags * m.bag, leftL: bags * m.bag + m.have - nd, cost: bags * m.price, haveEnough: m.have >= nd - EPS && nd > 0 };
    });
    var drainMat = null;
    if (sc.drain > 0) {
      var dn = Q * (1 + s), dnet = Math.max(0, dn - sc.dhave), db = bagsFor(dnet, sc.dbag);
      drainMat = { name: dname, needL: dn, haveL: sc.dhave, netL: dnet, bag: sc.dbag, price: sc.dprice, bags: db, buyL: db * sc.dbag,
        leftL: db * sc.dbag + sc.dhave - dn, cost: db * sc.dprice, haveEnough: sc.dhave >= dn - EPS };
    }
    var totalCost = matsOut.reduce(function (a, m) { return a + m.cost; }, 0) + (drainMat ? drainMat.cost : 0);
    var totalBags = matsOut.reduce(function (a, m) { return a + m.bags; }, 0) + (drainMat ? drainMat.bags : 0);
    var potCount = potsOut.reduce(function (a, p) { return a + p.n; }, 0);

    /* 提示（不阻止计算） */
    if (s === 0) warnings.push({ code: 'nospare', message: '多备是 0%：浇水后土会往下沉，配得刚刚好通常不够填满。' });
    matsOut.forEach(function (m) {
      if (m.bags > 0 && m.leftL >= m.bag / 2 - EPS) warnings.push({ code: 'halfbag', idx: m.idx, message: m.name + '买 ' + m.bags + ' 袋会剩 ' + fmtL(m.leftL) + ' L，超过半袋。' });
    });
    potsOut.forEach(function (p) {
      if (p.n > 0 && p.top < p.bot) warnings.push({ code: 'inverted', idx: p.idx, message: '「' + p.name + '」上口比底小（收口盆）：按直壁锥台算，换盆时土不好倒出来。' });
    });

    var out = { ok: true, errors: [], warnings: warnings, pots: potsOut, soilL: M, drainL: Q, spare: s, needL: need, partsSum: Ps,
      mats: matsOut, drainMat: drainMat, totalCost: totalCost, totalBags: totalBags, potCount: potCount, actions: [] };
    out.actions = noActs ? [] : actions(state, out);
    return out;
  }

  /* ── 两条建议：每条都按它改输入后重算一遍，断言成立才给 ── */
  function actions(state, out) {
    var acts = [];
    /* 1) 降多备少买一袋：材料 i 袋数减 1 的最大多备 s' = ((b−1)·袋 + 已有)/(M·份额) − 1 */
    var best = null;
    out.mats.forEach(function (m) {
      if (m.bags < 1 || m.share <= 0 || out.soilL <= 0) return;
      var sp = ((m.bags - 1) * m.bag + m.haveL) / (out.soilL * m.share) - 1;
      if (sp < 0) return;
      var s2 = Math.floor(sp * 1000 + EPS) / 1000;      /* 向下取到 0.1 个百分点 */
      if (s2 >= out.spare - EPS) return;
      var st = cloneState(state); st.spare = fmtV(s2 * 100, 1);
      var o2 = compute(st, true);
      if (!o2.ok) return;
      if (!(o2.mats[m.idx].bags === m.bags - 1)) return;
      var save = out.totalCost - o2.totalCost;
      if (!(save > 0)) return;
      if (!best || save > best.save + EPS) best = { m: m, s2: s2, save: save, o2: o2, spareText: st.spare };
    });
    if (best) {
      acts.push({ key: 'fewerBag', set: { spare: best.spareText }, mat: best.m.idx, newSpare: best.s2, save: best.save,
        bagsAfter: best.o2.totalBags,
        text: '把多备从 ' + fmtPct(out.spare) + ' 降到 ' + best.spareText + '%：' + best.m.name + '少买 1 袋，一共省 ' + fmtV(best.save, 2) + ' 元' });
    }
    /* 2) 用已买的袋子再多装几盆：保持当前多备，袋数与花费都不变 */
    var cap = Infinity;
    out.mats.forEach(function (m) { if (m.share > 0) cap = Math.min(cap, (m.buyL + m.haveL) / m.share); });
    var extraSoil = cap / (1 + out.spare) - out.soilL;
    var extraDrain = out.drainMat ? (out.drainMat.buyL + out.drainMat.haveL) / (1 + out.spare) - out.drainL : Infinity;
    for (var k = 0; k < out.pots.length; k++) {
      var p = out.pots[k];
      if (!(p.soilL > 0)) continue;
      var add = Math.floor(extraSoil / p.soilL + EPS);
      if (out.drainMat && p.drainL > 0) add = Math.min(add, Math.floor(extraDrain / p.drainL + EPS));
      add = Math.min(add, POT_FIELDS.n.max - p.n);
      var tries = 0;
      while (add >= 1 && tries++ < 3) {
        var st2 = cloneState(state); st2.pots[k].n = String(p.n + add);
        var o3 = compute(st2, true);
        if (o3.ok && o3.totalBags === out.totalBags && Math.abs(o3.totalCost - out.totalCost) < EPS) {
          acts.push({ key: 'morePots', set: { pot: k, n: String(p.n + add) }, pot: k, add: add,
            text: '按现在要买的袋子，「' + p.name + '」还能再多装 ' + add + ' 个（袋数和花费都不变）' });
          break;
        }
        add--;
      }
      if (acts.length && acts[acts.length - 1].key === 'morePots') break;
    }
    return acts;
  }
  function applyAction(state, a) {
    var s = cloneState(state);
    if (!a || !a.set) return s;
    if (a.set.spare != null) s.spare = a.set.spare;
    if (a.set.pot != null && s.pots[a.set.pot]) s.pots[a.set.pot].n = a.set.n;
    return s;
  }

  /* ── 导出 ── */
  function csvCell(x) { var t = String(x == null ? '' : x); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
  function toCSV(out, stamp) {
    var R = [['换盆用土清单', '导出时间 ' + stamp]];
    if (!out.ok) { R.push(['还算不出来']); out.errors.forEach(function (e) { R.push([e.message]); }); return R.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n'; }
    R.push([]); R.push(['盆', '形状', '个数', '每个装土 L', '每个排水层 L', '合计土 L', '合计排水 L']);
    out.pots.forEach(function (p) { R.push([p.name, p.shape === 'round' ? '圆' : '方', p.n, fmtV(p.soilL, 3), fmtV(p.drainL, 3), fmtV(p.soilTotal, 3), fmtV(p.drainTotal, 3)]); });
    R.push(['合计', '', out.potCount, '', '', fmtV(out.soilL, 3), fmtV(out.drainL, 3)]);
    R.push([]); R.push(['材料', '份数', '要 L', '已有 L', '每袋 L', '买几袋', '买完剩 L', '花费 元']);
    out.mats.forEach(function (m) { R.push([m.name, fmtV(m.parts, 3), fmtV(m.needL, 3), fmtV(m.haveL, 3), fmtV(m.bag, 3), m.bags, fmtV(m.leftL, 3), fmtV(m.cost, 2)]); });
    if (out.drainMat) { var d = out.drainMat; R.push([d.name + '（排水层）', '', fmtV(d.needL, 3), fmtV(d.haveL, 3), fmtV(d.bag, 3), d.bags, fmtV(d.leftL, 3), fmtV(d.cost, 2)]); }
    R.push(['合计', '', fmtV(out.needL, 3) + '（含多备 ' + fmtPct(out.spare) + '）', '', '', out.totalBags, '', fmtV(out.totalCost, 2)]);
    if (out.actions.length) { R.push([]); out.actions.forEach(function (a) { R.push(['建议', a.text]); }); }
    R.push([]); R.push(['说明', '盆按直壁锥台计算；配方按体积份数；默认场景为虚构示例，不推荐配方']);
    return R.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  }
  function toMD(out, stamp) {
    var L = ['# 换盆用土清单', '', '导出时间 ' + stamp, ''];
    if (!out.ok) { L.push('还算不出来：', ''); out.errors.forEach(function (e) { L.push('- ' + e.message); }); return L.join('\n') + '\n'; }
    L.push('**一共要配 ' + fmtL(out.needL) + ' L 土**（' + out.potCount + ' 个盆装 ' + fmtL(out.soilL) + ' L，多备 ' + fmtPct(out.spare) + '），买 ' + out.totalBags + ' 袋，共 ' + fmtV(out.totalCost, 2) + ' 元。', '');
    L.push('## 每种盆', '', '| 盆 | 个数 | 每个装土 L | 每个排水层 L |', '|---|---|---|---|');
    out.pots.forEach(function (p) { L.push('| ' + p.name.replace(/\|/g, '\\|') + ' | ' + p.n + ' | ' + fmtV(p.soilL, 3) + ' | ' + fmtV(p.drainL, 3) + ' |'); });
    L.push('', '## 购物清单', '', '| 材料 | 要 L | 已有 L | 买几袋 | 买完剩 L | 花费 元 |', '|---|---|---|---|---|---|');
    out.mats.forEach(function (m) { L.push('| ' + m.name.replace(/\|/g, '\\|') + '（' + fmtV(m.parts, 3) + ' 份） | ' + fmtV(m.needL, 2) + ' | ' + fmtV(m.haveL, 2) + ' | ' + m.bags + ' × ' + fmtV(m.bag, 2) + ' L | ' + fmtV(m.leftL, 2) + ' | ' + fmtV(m.cost, 2) + ' |'); });
    if (out.drainMat) { var d = out.drainMat; L.push('| ' + d.name.replace(/\|/g, '\\|') + '（排水层） | ' + fmtV(d.needL, 2) + ' | ' + fmtV(d.haveL, 2) + ' | ' + d.bags + ' × ' + fmtV(d.bag, 2) + ' L | ' + fmtV(d.leftL, 2) + ' | ' + fmtV(d.cost, 2) + ' |'); }
    if (out.actions.length) { L.push('', '## 建议', ''); out.actions.forEach(function (a) { L.push('- ' + a.text); }); }
    if (out.warnings.length) { L.push('', '## 提示', ''); out.warnings.forEach(function (w) { L.push('- ' + w.message); }); }
    L.push('', '> 盆按直壁锥台计算；配方按体积份数，不含混合收缩与沉降（由多备兜着）。默认场景为虚构示例，本页不推荐配方。');
    return L.join('\n') + '\n';
  }

  var API = {
    MAX_POTS: MAX_POTS, MAX_MATS: MAX_MATS, NAME_MAX: NAME_MAX, FIELDS: FIELDS, POT_FIELDS: POT_FIELDS, MAT_FIELDS: MAT_FIELDS, SCALARS: SCALARS,
    PRESETS: PRESETS, defaultState: defaultState, stateFromPreset: stateFromPreset, presetKey: presetKey, cloneState: cloneState,
    compute: compute, applyAction: applyAction, segVol: segVol, areaAt: areaAt, bagsFor: bagsFor,
    fmtV: fmtV, fmtL: fmtL, fmtPct: fmtPct, toCSV: toCSV, toMD: toMD
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.AppCore = API;
})(typeof window !== 'undefined' ? window : this);
