/* 换盆用土清单 · 核心测试
 * 跑法：node --test tests/core.test.cjs
 * 纪律：
 *  - 锚点 A1–A9 来自 ../evidence/手算锚点.py（独立写的 Python，不读 core.js）；
 *  - ok=false 时断言「算不出来」与错误码，不断言 0；断言前先确认字段存在且是有限数字；
 *  - 建议里带的数字一律按它改输入重算一遍当断言；
 *  - 最后一组「人工注入错误」：每个注入都必须让至少一个锚点变红。
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC_PATH = path.join(__dirname, '..', 'core.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const C = require(SRC_PATH);

function loadFromSource(src) {
  const ctx = { console: console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.AppCore;
}
function near(a, b, eps, msg) {
  assert.ok(typeof a === 'number' && isFinite(a), (msg || '') + ' —— 期望有限数字，实际 ' + a);
  assert.ok(Math.abs(a - b) <= (eps == null ? 1e-6 : eps), (msg || '') + ' —— 期望 ' + b + '，实际 ' + a);
}
function S(mut) { const s = C.defaultState(); if (mut) mut(s); return s; }
function D(mut) { return C.compute(S(mut)); }
function codes(o) { return o.errors.map((e) => e.code); }

/* 锚点指纹：注入错误组用同一套断言判红 */
function anchors(A) {
  const o = A.compute(A.defaultState());
  const r = [];
  const chk = (name, cond) => r.push([name, !!cond]);
  const n = (a, b, e) => typeof a === 'number' && Math.abs(a - b) <= (e || 1e-6);
  chk('ok', o.ok);
  if (!o.ok) return r;
  chk('A1 圆盆土', n(o.pots[0].soilL, 6.296085));
  chk('A1 圆盆排水', n(o.pots[0].drainL, 0.804606));
  chk('A2 方盆土', n(o.pots[1].soilL, 4.058822));
  chk('A2 箱土', n(o.pots[2].soilL, 15.6));
  chk('A3 总土', n(o.soilL, 68.560808));
  chk('A3 总排水', n(o.drainL, 12.558009));
  chk('A3 要备', n(o.needL, 75.416888));
  chk('A4 泥炭袋', o.mats[0].bags === 1);
  chk('A4 珍珠岩袋', o.mats[1].bags === 2);
  chk('A4 珍珠岩剩', n(o.mats[1].leftL, 9.916622));
  chk('A4 蛭石袋', o.mats[2].bags === 1);
  chk('A4 椰糠袋', o.mats[3].bags === 2);
  chk('A5 陶粒要', n(o.drainMat && o.drainMat.needL, 13.81381));
  chk('A5 陶粒袋', o.drainMat && o.drainMat.bags === 2);
  chk('A6 合计', o.totalCost === 131);
  const f = o.actions.filter((a) => a.key === 'fewerBag')[0];
  chk('A7 少一袋 9.3', f && f.set.spare === '9.3' && f.save === 12);
  const m = o.actions.filter((a) => a.key === 'morePots')[0];
  chk('A8 再装 3 个圆盆', m && m.pot === 0 && m.add === 3);
  /* 正好整袋：10 个 1 L 方盆、多备 0、袋 10 L → 1 袋（防残渣 EPS 的锚点） */
  const ex = A.compute(Object.assign(A.defaultState(), {
    pots: [{ name: '方', shape: 'square', top: '10', top2: '10', bot: '10', bot2: '10', h: '12', n: '10' }],
    mats: [{ name: '土', parts: '1', bag: '10', price: '5', have: '0' }], drain: '0', head: '2', spare: '0' }));
  chk('整袋不多买', ex.ok && ex.mats[0].bags === 1);
  /* A10：排水材料卡脖子 —— 1 个圆盆、排水层 6 cm、陶粒每袋 5 L、泥炭每袋 70 L（手算：土可再装 3、排水只够 1 → 1） */
  const st10 = A.defaultState();
  st10.pots = [st10.pots[0]]; st10.pots[0].n = '1'; st10.drain = '6'; st10.dbag = '5'; st10.mats[0].bag = '70';
  const o10 = A.compute(st10);
  const m10 = o10.ok && o10.actions.filter((a) => a.key === 'morePots')[0];
  chk('A10 排水卡住只能再装 1', m10 && m10.add === 1);
  chk('A10 圆盆土', o10.ok && n(o10.pots[0].soilL, 5.406218));
  return r;
}

test('浏览器全局形式与 require 形式行为一致', () => {
  const W = loadFromSource(SRC);
  assert.ok(W && typeof W.compute === 'function');
  assert.strictEqual(JSON.stringify(W.compute(W.defaultState())), JSON.stringify(C.compute(C.defaultState())));
});

test('A1–A8 默认场景锚点（独立 Python 手算）全部命中', () => {
  const r = anchors(C);
  const bad = r.filter((x) => !x[1]).map((x) => x[0]);
  assert.deepStrictEqual(bad, []);
  assert.ok(r.length >= 19, '锚点条数 ' + r.length);
});

test('A9 Simpson 与圆锥台闭式 / 长方体闭式一致（随机 300 组）', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 300; i++) {
    const top = 1 + rnd() * 100, bot = 1 + rnd() * 100, h = 2 + rnd() * 80;
    const z1 = rnd() * h * 0.4, z2 = z1 + rnd() * (h - z1);
    const g = { shape: 'round', top, bot, h };
    const D = (z) => bot + (top - bot) * z / h;
    const closed = Math.PI * (z2 - z1) / 12 * (D(z1) ** 2 + D(z1) * D(z2) + D(z2) ** 2);
    near(C.segVol(g, z1, z2), closed, 1e-9 * Math.max(1, closed), '圆台 #' + i);
    /* 方台：上下长宽各自线性 → 用 1 万段中点积分独立核对 */
    if (i < 30) {
      const q = { shape: 'square', top, top2: 1 + rnd() * 50, bot, bot2: 1 + rnd() * 50, h };
      let acc = 0; const N = 10000, dz = (z2 - z1) / N;
      for (let k = 0; k < N; k++) acc += C.areaAt(q, z1 + (k + 0.5) * dz) * dz;
      near(C.segVol(q, z1, z2), acc, 1e-6 * Math.max(1, acc), '方台 #' + i);
    }
  }
});

test('三段加起来 = 整盆；排水 0 时排水量为 0 且没有排水材料行', () => {
  const o = D();
  o.pots.forEach((p) => {
    const g = { shape: p.shape, top: p.top, top2: p.top2, bot: p.bot, bot2: p.bot2, h: p.h };
    const headL = C.segVol(g, p.h - 2, p.h) / 1000;
    near(p.soilL + p.drainL + headL, p.fullL, 1e-9, p.name);
  });
  const o0 = D((s) => { s.drain = '0'; });
  assert.ok(o0.ok);
  assert.strictEqual(o0.drainL, 0);
  assert.strictEqual(o0.drainMat, null);
  assert.ok(o0.soilL > o.soilL, '不垫排水层，土更多');
});

test('直壁方盆就是长方体：60×20×(18−3−2)=15.6 L；个数 0 的行不计入', () => {
  const o = D();
  near(o.pots[2].soilL, 60 * 20 * 13 / 1000, 1e-12);
  const z = D((s) => { s.pots[0].n = '0'; });
  near(z.soilL, 68.560808 - 4 * 6.296085, 1e-5);
  assert.strictEqual(z.potCount, 5);
});

test('配方拆分：各材料要的升数之和 = 要备总量，比例 = 份数/总份数', () => {
  for (const p of C.PRESETS) {
    const o = C.compute(C.stateFromPreset(p.key));
    assert.ok(o.ok, p.key);
    near(o.mats.reduce((a, m) => a + m.needL, 0), o.needL, 1e-9, p.key);
    o.mats.forEach((m) => near(m.share, m.parts / o.partsSum, 1e-15));
  }
});

test('整袋取整：正好整袋不多买（浮点残渣 EPS），多 0.001 L 就加一袋', () => {
  assert.strictEqual(C.bagsFor(20, 10), 2);
  assert.strictEqual(C.bagsFor(20.000000000001, 10), 2, '浮点残渣不该多买一袋');
  assert.strictEqual(C.bagsFor(20.001, 10), 3);
  assert.strictEqual(C.bagsFor(0, 10), 0);
  assert.strictEqual(C.bagsFor(-3, 10), 0);
  /* 构造正好整袋：单材料、直壁方盆 10×10×H，土高 10 cm = 1 L/个，10 个，多备 0 → 要 10 L、袋 10 L */
  const o = C.compute(S((s) => {
    s.pots = [{ name: '方', shape: 'square', top: '10', top2: '10', bot: '10', bot2: '10', h: '12', n: '10' }];
    s.mats = [{ name: '土', parts: '1', bag: '10', price: '5', have: '0' }];
    s.drain = '0'; s.head = '2'; s.spare = '0';
  }));
  assert.ok(o.ok);
  near(o.needL, 10, 1e-12);
  assert.strictEqual(o.mats[0].bags, 1);
  near(o.mats[0].leftL, 0, 1e-9);
});

test('家里已有：够用时买 0 袋、标 haveEnough；已有不会变成负的净需', () => {
  const o = D((s) => { s.mats[2].have = '100'; });
  assert.ok(o.ok);
  assert.strictEqual(o.mats[2].bags, 0);
  assert.strictEqual(o.mats[2].netL, 0);
  assert.strictEqual(o.mats[2].haveEnough, true);
  near(o.mats[2].leftL, 100 - 7.541689, 1e-5);
  assert.strictEqual(o.totalCost, 131 - 12);
});

test('份数为 0 的材料：要 0 L、买 0 袋，不参与「再装几盆」的上限', () => {
  const o = D((s) => { s.mats[3].parts = '0'; });
  assert.ok(o.ok);
  assert.strictEqual(o.mats[3].needL, 0);
  assert.strictEqual(o.mats[3].bags, 0);
  assert.strictEqual(o.partsSum, 8);
  assert.strictEqual(o.mats[3].haveEnough, false, '要 0 L 不应显示成「家里的够」');
});

test('非法输入：空、非数字、科学计数、范围外、小数个数、未知形状都报错，原文不被改写', () => {
  const cases = [
    [(s) => { s.drain = ''; }, 'empty'],
    [(s) => { s.spare = 'abc'; }, 'nan'],
    [(s) => { s.spare = '1e3'; }, 'nan'],
    [(s) => { s.head = '-1'; }, 'range'],
    [(s) => { s.pots[0].n = '2.5'; }, 'int'],
    [(s) => { s.pots[0].top = '0'; }, 'range'],
    [(s) => { s.pots[0].shape = 'hex'; }, 'shape'],
    [(s) => { s.mats[0].bag = '0'; }, 'range'],
    [(s) => { s.mats[0].name = '  '; }, 'empty'],
    [(s) => { s.pots[1].name = '长'.repeat(41); }, 'long'],
    [(s) => { s.dname = ''; }, 'empty'],
  ];
  cases.forEach(([mut, code], i) => {
    const st = S(mut), before = JSON.stringify(st);
    const o = C.compute(st);
    assert.strictEqual(o.ok, false, '#' + i);
    assert.ok(codes(o).includes(code), '#' + i + ' 期望 ' + code + ' 实际 ' + codes(o));
    assert.strictEqual(JSON.stringify(st), before, 'compute 不该改写输入');
    assert.strictEqual(o.soilL, undefined, '#' + i + ' 失败时不给数');
  });
  /* 排水 0 时排水材料名字可以空 */
  assert.ok(D((s) => { s.drain = '0'; s.dname = ''; }).ok);
});

test('排水层 + 留空 ≥ 盆高：装不下土（阈值两侧）', () => {
  /* 方盆高 18：drain 16 + head 2 = 18 → 报；drain 15.9 → 能算 */
  const bad = D((s) => { s.drain = '16'; });
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.code === 'nosoil' && e.row === 1));
  assert.ok(bad.errors.some((e) => e.code === 'nosoil' && e.row === 2));
  assert.ok(!bad.errors.some((e) => e.code === 'nosoil' && e.row === 0), '圆盆高 22 还装得下');
  const ok = D((s) => { s.drain = '15.9'; });
  assert.ok(ok.ok);
  near(ok.pots[2].soilL, 60 * 20 * 0.1 / 1000, 1e-9);
});

test('全部个数为 0 / 份数全 0 / 行数越界：算不出来', () => {
  assert.ok(codes(D((s) => { s.pots.forEach((p) => { p.n = '0'; }); })).includes('none'));
  assert.ok(codes(D((s) => { s.mats.forEach((m) => { m.parts = '0'; }); })).includes('noparts'));
  assert.ok(codes(D((s) => { s.pots = []; })).includes('count'));
  assert.ok(codes(D((s) => { while (s.mats.length < 7) s.mats.push({ name: 'x', parts: '1', bag: '1', price: '1', have: '0' }); })).includes('count'));
  assert.strictEqual(C.compute({}).ok, false);
});

test('收口盆（上口 < 底）能算且给提示；多备 0 给提示', () => {
  const o = D((s) => { s.pots[0].top = '15'; s.spare = '0'; });
  assert.ok(o.ok);
  assert.ok(o.warnings.some((w) => w.code === 'inverted' && w.idx === 0));
  assert.ok(o.warnings.some((w) => w.code === 'nospare'));
});

test('建议「少买一袋」：按建议改输入重算，那种材料确实少 1 袋、省的钱等于建议所说；再多 0.1 个百分点就回到原袋数', () => {
  const st = S(), o = C.compute(st);
  const a = o.actions.find((x) => x.key === 'fewerBag');
  assert.ok(a);
  const o2 = C.compute(C.applyAction(st, a));
  assert.strictEqual(o2.mats[a.mat].bags, o.mats[a.mat].bags - 1);
  near(o.totalCost - o2.totalCost, a.save, 1e-9);
  const up = C.compute(S((s) => { s.spare = C.fmtV(a.newSpare * 100 + 0.1, 1); }));
  assert.strictEqual(up.mats[a.mat].bags, o.mats[a.mat].bags, '取的是最大可行多备');
  near(a.newSpare, 0.093, 1e-12);
});

test('建议「再装几盆」：按建议改个数重算，袋数与花费不变；再多 1 个就超', () => {
  for (const p of C.PRESETS) {
    const st = C.stateFromPreset(p.key), o = C.compute(st);
    const a = o.actions.find((x) => x.key === 'morePots');
    if (!a) continue;
    const o2 = C.compute(C.applyAction(st, a));
    assert.ok(o2.ok);
    assert.strictEqual(o2.totalBags, o.totalBags, p.key);
    assert.strictEqual(o2.totalCost, o.totalCost, p.key);
    const st3 = C.applyAction(st, a); st3.pots[a.pot].n = String(Number(st3.pots[a.pot].n) + 1);
    assert.ok(C.compute(st3).totalBags > o.totalBags, p.key + ' 再多 1 个应当要多买');
  }
});

test('随机 500 组不变量：成功时所有数有限、袋数为非负整数、剩余 ≥ 0、建议重算成立', () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let okN = 0;
  for (let i = 0; i < 500; i++) {
    const st = S((s) => {
      s.pots = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, k) => ({
        name: 'p' + k, shape: pick(['round', 'square']), top: String((5 + rnd() * 60).toFixed(1)), top2: String((5 + rnd() * 40).toFixed(1)),
        bot: String((5 + rnd() * 60).toFixed(1)), bot2: String((5 + rnd() * 40).toFixed(1)), h: String((5 + rnd() * 50).toFixed(1)), n: String(Math.floor(rnd() * 12)) }));
      s.mats = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => ({
        name: 'm' + k, parts: String(Math.floor(rnd() * 6)), bag: String(pick([5, 10, 20, 25, 50, 70])), price: String(Math.floor(rnd() * 60)), have: String(pick([0, 0, 2, 7.5])) }));
      s.drain = String(pick([0, 2, 3, 5])); s.head = String(pick([0, 1, 2, 3])); s.spare = String(pick([0, 5, 10, 15, 30]));
    });
    const o = C.compute(st);
    if (!o.ok) { assert.ok(o.errors.length > 0); continue; }
    okN++;
    o.mats.forEach((m) => {
      assert.ok(Number.isInteger(m.bags) && m.bags >= 0);
      assert.ok(m.leftL >= -1e-9, 'i=' + i + ' 剩余为负 ' + m.leftL);
      if (m.bags > 0) assert.ok(m.leftL < m.bag + 1e-9 || m.haveL > 0, 'i=' + i + ' 多买了一整袋');
    });
    if (o.drainMat) assert.ok(o.drainMat.leftL >= -1e-9);
    assert.ok(isFinite(o.totalCost) && o.totalCost >= 0);
    o.actions.forEach((a) => {
      const o2 = C.compute(C.applyAction(st, a));
      assert.ok(o2.ok, 'i=' + i + ' 建议改完算不出来');
      if (a.key === 'fewerBag') near(o.totalCost - o2.totalCost, a.save, 1e-9);
      if (a.key === 'morePots') assert.strictEqual(o2.totalCost, o.totalCost);
    });
  }
  assert.ok(okN > 200, '有效样本 ' + okN);
});

test('预设：每个都能算、presetKey 能认回来、改一个字段就不再是预设', () => {
  for (const p of C.PRESETS) {
    const st = C.stateFromPreset(p.key);
    assert.ok(C.compute(st).ok, p.key);
    assert.strictEqual(C.presetKey(st), p.key);
  }
  assert.strictEqual(C.presetKey(S((s) => { s.spare = '11'; })), null);
});

test('导出：CSV 带合计 131、MD 无表格破坏、失败时也能导出错误', () => {
  const o = D((s) => { s.pots[0].name = '圆,盆|"x"'; });
  const csv = C.toCSV(o, 'T');
  assert.ok(csv.indexOf('"圆,盆|""x"""') >= 0, 'CSV 转义');
  assert.ok(/合计,,[\d.]+（含多备 10%）,,,8,,131/.test(csv), csv.split('\n').slice(-6).join(' / '));
  const md = C.toMD(o, 'T');
  assert.ok(md.indexOf('圆,盆\\|"x"') >= 0, 'MD 竖线转义');
  assert.ok(md.indexOf('131 元') >= 0);
  const bad = D((s) => { s.spare = 'x'; });
  assert.ok(C.toCSV(bad, 'T').indexOf('还算不出来') >= 0);
  assert.ok(C.toMD(bad, 'T').indexOf('多备要填数字') >= 0);
});

test('格式化：fmtL 两档、fmtV 去尾零、-0 → 0', () => {
  assert.strictEqual(C.fmtL(6.296085), '6.3');
  assert.strictEqual(C.fmtL(75.416888), '75.4');
  assert.strictEqual(C.fmtL(9.916622), '9.92');
  assert.strictEqual(C.fmtV(-0.0001, 2), '0');
  assert.strictEqual(C.fmtV(131, 2), '131');
  assert.strictEqual(C.fmtPct(0.093), '9.3%');
});

test('人工注入错误：每个注入都必须让锚点变红', () => {
  const MUT = [
    ['Simpson 中点系数 4→2', 'areaAt(g, (z1 + z2) / 2)', '0.5 * areaAt(g, (z1 + z2) / 2)'],
    ['圆面积少 /4', 'Math.PI * a * a / 4', 'Math.PI * a * a / 2'],
    ['土的下界不扣排水层', 'segVol(g, sc.drain, top)', 'segVol(g, 0, top)'],
    ['土的上界不扣留空', 'var top = g.h - sc.head;', 'var top = g.h;'],
    ['多备没乘', 'var need = M * (1 + s);', 'var need = M;'],
    ['排水不乘多备', 'var dn = Q * (1 + s)', 'var dn = Q'],
    ['已有没扣', 'Math.max(0, nd - m.have)', 'nd'],
    ['向上取整改四舍五入', 'Math.ceil(net / bag - EPS)', 'Math.round(net / bag)'],
    ['去掉防残渣 EPS 改成 +EPS', 'Math.ceil(net / bag - EPS)', 'Math.ceil(net / bag + 1e-6)'],
    ['线性插值方向反了', 'var a = g.bot + (g.top - g.bot) * t;', 'var a = g.top + (g.bot - g.top) * t;'],
    ['方盆宽用了长', 'var b = g.bot2 + (g.top2 - g.bot2) * t;', 'var b = a;'],
    ['少一袋取整到 1 个百分点', 'Math.floor(sp * 1000 + EPS) / 1000', 'Math.floor(sp * 100 + EPS) / 100'],
    ['再装几盆不看排水材料（同时去掉重算守卫）', ['add = Math.min(add, Math.floor(extraDrain / p.drainL + EPS));', 'if (o3.ok && o3.totalBags === out.totalBags'], ['', 'if (o3.ok || o3.totalBags === out.totalBags']],
    ['再装几盆忘了除多备（同时去掉重算守卫）', ['cap / (1 + out.spare) - out.soilL', 'if (o3.ok && o3.totalBags === out.totalBags'], ['cap - out.soilL', 'if (o3.ok || o3.totalBags === out.totalBags']],
    /* 「只去掉重算守卫」实测存活：公式正确时守卫本来就不会拦下任何东西（它是第二道防线）。
     * 第一版「只改公式」的两个注入也存活 —— 被守卫兜住了；所以这两条都要连守卫一起去掉才算测到公式本身。 */
    ['剩余没算已有', 'leftL: bags * m.bag + m.have - nd', 'leftL: bags * m.bag - nd'],
    ['合计漏了排水材料', '+ (drainMat ? drainMat.cost : 0);', ';'],
  ];
  const survivors = [];
  MUT.forEach(([name, from, to]) => {
    const F = [].concat(from), T = [].concat(to);
    let src = SRC;
    F.forEach((f, i) => { assert.ok(src.indexOf(f) >= 0, '注入点不存在：' + name + ' / ' + f); src = src.replace(f, T[i]); });
    let A;
    try { A = loadFromSource(src); } catch (e) { survivors.push(name + '（注入后加载失败，不能算抓到）'); return; }
    const r = anchors(A);
    if (r.every((x) => x[1])) survivors.push(name);
  });
  assert.deepStrictEqual(survivors, [], '这些注入错误没被锚点抓到');
});
