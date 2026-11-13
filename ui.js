/* 换盆用土清单 · 界面（ui.js）
 * 把输入读成 state → 交给 AppCore.compute → 把同一次输出画出来。页面不自己算数。 */
(function () {
  'use strict';
  var A = window.AppCore;
  var KEY = 'pot-soil:v1';
  var $ = function (id) { return document.getElementById(id); };
  var COLORS = ['#6b4a33', '#d9d2c3', '#c9a46a', '#8d6e52', '#a8b57a', '#5d7d8c'];
  var saved = load();
  var state = saved ? saved.state : A.defaultState();
  var checked = saved ? saved.checked : {};
  var out = null;

  function load() {
    try {
      var t = localStorage.getItem(KEY);
      if (!t) return null;
      var j = JSON.parse(t);
      var s = sanitize(j && j.state);
      if (!s) return null;
      return { state: s, checked: (j.checked && typeof j.checked === 'object') ? j.checked : {} };
    } catch (e) { return null; }
  }
  function str(v) { return String(v == null ? '' : v); }
  /* 只接受认识的字段，值一律转字符串（原文保留，非法的交给 compute 报错） */
  function sanitize(s) {
    if (!s || typeof s !== 'object') return null;
    var d = A.defaultState();
    A.SCALARS.concat(['dname']).forEach(function (k) { if (s[k] != null) d[k] = str(s[k]); });
    if (Array.isArray(s.pots) && s.pots.length) {
      d.pots = s.pots.slice(0, A.MAX_POTS).map(function (p) {
        p = p || {};
        return { name: str(p.name), shape: p.shape === 'square' ? 'square' : 'round', top: str(p.top), top2: str(p.top2), bot: str(p.bot), bot2: str(p.bot2), h: str(p.h), n: str(p.n) };
      });
    }
    if (Array.isArray(s.mats) && s.mats.length) {
      d.mats = s.mats.slice(0, A.MAX_MATS).map(function (m) {
        m = m || {};
        return { name: str(m.name), parts: str(m.parts), bag: str(m.bag), price: str(m.price), have: str(m.have) };
      });
    }
    return d;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ state: state, checked: checked })); $('saveTag').textContent = '· 已存到本机'; }
    catch (e) { $('saveTag').textContent = '· 没能存到本机'; }
  }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ── 预设 ── */
  function renderPresets() {
    var k = A.presetKey(state);
    $('presets').innerHTML = A.PRESETS.map(function (p) {
      return '<button type="button" class="chip" id="preset_' + p.key + '" data-p="' + p.key + '" aria-pressed="' + (k === p.key) + '">' + esc(p.name) + '</button>';
    }).join('');
    var cur = A.PRESETS.filter(function (p) { return p.key === k; })[0];
    $('presetNote').textContent = cur ? cur.note : '已按你的输入计算（不是预设）。';
  }
  $('presets').addEventListener('click', function (e) {
    var b = e.target.closest('[data-p]'); if (!b) return;
    state = A.stateFromPreset(b.getAttribute('data-p')); checked = {};
    fillAll(); update();
  });

  /* ── 盆的行 ── */
  function fld(id, label, val, extra) {
    return '<div class="f' + (extra || '') + '" id="f_' + id + '"><label for="' + id + '">' + label + '</label><input id="' + id + '" inputmode="decimal" value="' + esc(val) + '"></div>';
  }
  function renderPotRows() {
    $('potRows').innerHTML = state.pots.map(function (p, i) {
      var sq = p.shape === 'square';
      return '<div class="row potrow" data-row="' + i + '">' +
        '<div class="f nm" id="f_p' + i + '_name"><label for="p' + i + '_name">第 ' + (i + 1) + ' 种盆</label><input id="p' + i + '_name" data-k="pots" data-i="' + i + '" data-sub="name" value="' + esc(p.name) + '"></div>' +
        '<div class="f" id="f_p' + i + '_shape"><label for="p' + i + '_shape">形状</label><select id="p' + i + '_shape" data-k="pots" data-i="' + i + '" data-sub="shape"><option value="round"' + (sq ? '' : ' selected') + '>圆盆</option><option value="square"' + (sq ? ' selected' : '') + '>方盆</option></select></div>' +
        ['top', 'top2', 'bot', 'bot2', 'h', 'n'].map(function (k) {
          var lab = { top: sq ? '上口长 cm' : '上口直径 cm', top2: '上口宽 cm', bot: sq ? '底长 cm' : '底直径 cm', bot2: '底宽 cm', h: '高 cm', n: '几个' }[k];
          var off = !sq && (k === 'top2' || k === 'bot2');
          return '<div class="f' + (off ? ' off' : '') + '" id="f_p' + i + '_' + k + '"><label for="p' + i + '_' + k + '">' + lab + '</label><input id="p' + i + '_' + k + '" data-k="pots" data-i="' + i + '" data-sub="' + k + '" inputmode="decimal" value="' + esc(p[k]) + '"' + (off ? ' tabindex="-1" aria-hidden="true"' : '') + '></div>';
        }).join('') +
        '<div class="sect" id="sect' + i + '"></div>' +
        '<button type="button" class="btn ghost mini" data-delpot="' + i + '"' + (state.pots.length <= 1 ? ' disabled' : '') + ' aria-label="删掉第 ' + (i + 1) + ' 种盆">删</button>' +
        '<div class="rowout" id="potout' + i + '"></div><div class="rowmsg" id="potmsg' + i + '"></div></div>';
    }).join('');
    $('addPot').disabled = state.pots.length >= A.MAX_POTS;
  }
  function renderMatRows() {
    $('matRows').innerHTML = state.mats.map(function (m, i) {
      return '<div class="row matrow" data-row="' + i + '">' +
        '<div class="f nm" id="f_m' + i + '_name"><label for="m' + i + '_name"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + COLORS[i % COLORS.length] + ';margin-right:5px"></span>第 ' + (i + 1) + ' 种材料</label><input id="m' + i + '_name" data-k="mats" data-i="' + i + '" data-sub="name" value="' + esc(m.name) + '"></div>' +
        ['parts', 'bag', 'price', 'have'].map(function (k) {
          var lab = { parts: '份数', bag: '每袋 L', price: '每袋 元', have: '家里已有 L' }[k];
          return '<div class="f" id="f_m' + i + '_' + k + '"><label for="m' + i + '_' + k + '">' + lab + '</label><input id="m' + i + '_' + k + '" data-k="mats" data-i="' + i + '" data-sub="' + k + '" inputmode="decimal" value="' + esc(m[k]) + '"></div>';
        }).join('') +
        '<button type="button" class="btn ghost mini" data-delmat="' + i + '"' + (state.mats.length <= 1 ? ' disabled' : '') + ' aria-label="删掉第 ' + (i + 1) + ' 种材料">删</button>' +
        '<div class="rowmsg" id="matmsg' + i + '"></div></div>';
    }).join('');
    $('addMat').disabled = state.mats.length >= A.MAX_MATS;
  }
  function onRowInput(e) {
    var el = e.target; if (!el.hasAttribute('data-k')) return;
    var k = el.getAttribute('data-k'), i = +el.getAttribute('data-i'), sub = el.getAttribute('data-sub');
    state[k][i][sub] = el.value;
    if (sub === 'shape') {
      /* 换成方盆时，宽默认等于长（方盆最常见是正方形），不让新出现的格子是空的 */
      var p = state.pots[i];
      if (el.value === 'square') { if (!p.top2) p.top2 = p.top; if (!p.bot2) p.bot2 = p.bot; }
      renderPotRows();
    }
    update();
  }
  $('potRows').addEventListener('input', onRowInput);
  $('potRows').addEventListener('change', function (e) { if (e.target.tagName === 'SELECT') onRowInput(e); });
  $('matRows').addEventListener('input', onRowInput);
  $('potRows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-delpot]'); if (!b || b.disabled) return;
    state.pots.splice(+b.getAttribute('data-delpot'), 1); renderPotRows(); update();
  });
  $('matRows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-delmat]'); if (!b || b.disabled) return;
    state.mats.splice(+b.getAttribute('data-delmat'), 1); checked = {}; renderMatRows(); update();
  });
  $('addPot').addEventListener('click', function () {
    if (state.pots.length >= A.MAX_POTS) return;
    state.pots.push({ name: '新的盆', shape: 'round', top: '20', top2: '', bot: '15', bot2: '', h: '18', n: '1' });
    renderPotRows(); update();
  });
  $('addMat').addEventListener('click', function () {
    if (state.mats.length >= A.MAX_MATS) return;
    state.mats.push({ name: '新材料', parts: '1', bag: '10', price: '10', have: '0' });
    renderMatRows(); update();
  });

  A.SCALARS.concat(['dname']).forEach(function (k) {
    $(k).addEventListener('input', function () { state[k] = $(k).value; update(); });
  });
  function fillAll() {
    A.SCALARS.concat(['dname']).forEach(function (k) { $(k).value = state[k]; });
    renderPotRows(); renderMatRows();
  }

  /* ── 剖面小图：按这一行的真实比例画（宽 = 上口/底，高 = 盆高），三段分色 ── */
  function section(p, drainCm, headCm) {
    var W = 92, H = 70, pad = 4;
    var sc = Math.min((W - 2 * pad) / Math.max(p.top, p.bot), (H - 2 * pad) / p.h);
    var cx = W / 2, yb = H - pad;
    function wAt(z) { return (p.bot + (p.top - p.bot) * z / p.h) * sc / 2; }
    function band(z1, z2, color) {
      if (z2 <= z1) return '';
      var y1 = yb - z1 * sc, y2 = yb - z2 * sc;
      return '<polygon points="' + [cx - wAt(z1), y1, cx + wAt(z1), y1, cx + wAt(z2), y2, cx - wAt(z2), y2].map(function (v) { return v.toFixed(1); }).join(' ') + '" fill="' + color + '"/>';
    }
    var yt = yb - p.h * sc;
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(p.name) + ' 剖面">' +
      band(0, drainCm, '#c98a5e') + band(drainCm, p.h - headCm, '#6b4a33') +
      '<polyline points="' + [cx - wAt(p.h), yt, cx - wAt(0), yb, cx + wAt(0), yb, cx + wAt(p.h), yt].map(function (v) { return v.toFixed(1); }).join(' ') + '" fill="none" stroke="#2d2620" stroke-width="1.5"/></svg>';
  }

  /* ── 渲染 ── */
  function markErrors() {
    document.querySelectorAll('.f.bad').forEach(function (f) { f.classList.remove('bad'); });
    document.querySelectorAll('.rowmsg').forEach(function (m) { m.textContent = ''; });
    (out.errors || []).forEach(function (e) {
      var pre = e.field === 'pots' ? 'p' : e.field === 'mats' ? 'm' : null;
      if (pre && e.row != null) {
        var f = $('f_' + pre + e.row + '_' + (e.sub || 'name')); if (f) f.classList.add('bad');
        var mm = $((pre === 'p' ? 'potmsg' : 'matmsg') + e.row);
        if (mm) mm.textContent = (mm.textContent ? mm.textContent + ' ' : '') + e.message;
      } else if ($('f_' + e.field)) $('f_' + e.field).classList.add('bad');
    });
  }
  function render() {
    var bad = !out.ok;
    $('errBox').classList.toggle('hide', !bad);
    $('okHead').classList.toggle('hide', bad);
    $('shopCard').classList.toggle('hide', bad);
    $('drainCfg').classList.toggle('hide', !(Number(state.drain) > 0));
    state.pots.forEach(function (p, i) { $('potout' + i).innerHTML = ''; $('sect' + i).innerHTML = ''; });
    /* 配方条按份数比例画（失败时也按能读出来的份数画） */
    var parts = state.mats.map(function (m) { var v = Number(m.parts); return isFinite(v) && v > 0 ? v : 0; });
    var ps = parts.reduce(function (a, b) { return a + b; }, 0);
    $('recipeBar').innerHTML = ps > 0 ? parts.map(function (v, i) { return v > 0 ? '<i style="width:' + (v / ps * 100) + '%;background:' + COLORS[i % COLORS.length] + '" title="' + esc(state.mats[i].name) + '"></i>' : ''; }).join('') : '';
    if (bad) {
      $('errBox').innerHTML = '<b>还算不出来</b>，先把这些改对（原文都保留着）：<ul>' + out.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul>';
      return;
    }
    $('sNeed').textContent = A.fmtL(out.needL) + ' L';
    $('sNeedTx').textContent = '要配的土（' + out.potCount + ' 个盆装 ' + A.fmtL(out.soilL) + ' L + 多备 ' + A.fmtPct(out.spare) + '）';
    $('sBags').textContent = out.totalBags + ' 袋';
    $('sBagsTx').textContent = '要买的袋数' + (out.drainMat ? '（含排水层 ' + A.fmtL(out.drainMat.needL) + ' L）' : '');
    $('sCost').textContent = A.fmtV(out.totalCost, 2) + ' 元';
    var big = out.mats.slice().sort(function (a, b) { return b.cost - a.cost; })[0];
    $('lead').innerHTML = '最大的一笔是<b>' + esc(big.name) + '</b>：' + big.bags + ' 袋 ' + esc(A.fmtV(big.cost, 2)) + ' 元。' +
      (out.actions.length ? '下面有 ' + out.actions.length + ' 条可以直接点的调整。' : '');
    out.pots.forEach(function (p) {
      $('sect' + p.idx).innerHTML = section(p, Number(state.drain), Number(state.head));
      $('potout' + p.idx).innerHTML = '每个装土 <b>' + esc(A.fmtL(p.soilL)) + ' L</b>' + (p.drainL > 0 ? '、排水层 <b>' + esc(A.fmtL(p.drainL)) + ' L</b>' : '') +
        (p.n > 0 ? ' × ' + p.n + ' 个 = 土 <b>' + esc(A.fmtL(p.soilTotal)) + ' L</b>' : '（个数 0，这行不算）') + '　<span class="muted">整盆 ' + esc(A.fmtL(p.fullL)) + ' L</span>';
    });
    var items = out.mats.map(function (m) { return { key: 'm' + m.idx + ':' + m.name, m: m, drain: false }; });
    if (out.drainMat) items.push({ key: 'drain:' + out.drainMat.name, m: out.drainMat, drain: true });
    $('shop').innerHTML = items.map(function (it, i) {
      var m = it.m, done = !!checked[it.key];
      var qty = m.bags > 0 ? m.bags + ' 袋' : (m.needL > 0 ? '不用买' : '—');
      var why = m.needL > 0
        ? '要 ' + A.fmtL(m.needL) + ' L' + (m.haveL > 0 ? '，家里有 ' + A.fmtL(m.haveL) + ' L' : '') + (m.bags > 0 ? '，买 ' + m.bags + ' × ' + A.fmtV(m.bag, 2) + ' L，' + A.fmtV(m.cost, 2) + ' 元，用完剩 ' + A.fmtL(m.leftL) + ' L' : '，用完剩 ' + A.fmtL(m.leftL) + ' L')
        : '份数是 0，这次不用';
      return '<li class="' + (done ? 'done' : '') + (m.bags === 0 ? ' zero' : '') + '" id="shop' + i + '"><input type="checkbox" data-ck="' + esc(it.key) + '"' + (done ? ' checked' : '') + ' aria-label="买到了 ' + esc(m.name) + '">' +
        '<div class="what">' + esc(m.name) + (it.drain ? ' <span class="muted">排水层</span>' : ' <span class="muted">' + esc(A.fmtV(m.parts, 3)) + ' 份</span>') + '</div><div class="qty">' + qty + '</div><div class="why">' + esc(why) + '</div></li>';
    }).join('');
    $('warnBox').classList.toggle('hide', !out.warnings.length);
    $('warnBox').innerHTML = '<ul>' + out.warnings.map(function (w) { return '<li>' + esc(w.message) + '</li>'; }).join('') + '</ul>';
    $('actsBlock').classList.toggle('hide', !out.actions.length);
    $('acts').innerHTML = out.actions.map(function (a, i) { return '<button type="button" class="act" id="act_' + a.key + '" data-a="' + i + '">→ ' + esc(a.text) + '</button>'; }).join('');
  }
  $('shop').addEventListener('change', function (e) {
    var k = e.target.getAttribute('data-ck'); if (!k) return;
    if (e.target.checked) checked[k] = true; else delete checked[k];
    e.target.closest('li').classList.toggle('done', e.target.checked);
    save();
  });
  $('acts').addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    state = A.applyAction(state, out.actions[+b.getAttribute('data-a')]);
    fillAll(); update();
  });

  function update() {
    out = A.compute(state);
    markErrors(); render(); renderPresets(); save();
  }

  /* ── 导出 ── */
  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  $('dlCsv').addEventListener('click', function () { download('换盆用土清单.csv', new Blob(['\ufeff' + A.toCSV(out, stamp())], { type: 'text/csv;charset=utf-8' })); });
  $('dlMd').addEventListener('click', function () { download('换盆用土清单.md', new Blob([A.toMD(out, stamp())], { type: 'text/markdown;charset=utf-8' })); });
  $('dlJson').addEventListener('click', function () {
    download('换盆用土清单-备份.json', new Blob([JSON.stringify({ app: '换盆用土清单', slug: 'pot-soil', version: 1, exported_at: stamp(), state: state, checked: checked, out: out }, null, 2)], { type: 'application/json' }));
  });
  $('impJson').addEventListener('click', function () { $('impFile').click(); });
  $('impFile').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { importText(String(r.result)); };
    r.readAsText(f); this.value = '';
  });
  function importText(t) {
    var s = null, ck = {};
    try { var j = JSON.parse(t); s = sanitize(j && j.state ? j.state : j); if (j && j.checked && typeof j.checked === 'object') ck = j.checked; } catch (e) { s = null; }
    if (!s) { $('saveTag').textContent = '· 这个文件读不出来，没改动'; return false; }
    state = s; checked = ck; fillAll(); update(); return true;
  }
  $('reset').addEventListener('click', function () { state = A.defaultState(); checked = {}; fillAll(); update(); });

  /* PNG 清单 1080×1350：所有文字取自 out */
  function wrapText(ctx, text, maxW) {
    var lines = [], cur = '';
    Array.from(String(text)).forEach(function (ch) {
      if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch === ' ' ? '' : ch; } else cur += ch;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function drawCard() {
    var W = 1080, H = 1350, c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var F = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif', M = 'ui-monospace,Menlo,Consolas,monospace';
    g.fillStyle = '#f2efe8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fffdf9'; g.fillRect(48, 48, W - 96, H - 96);
    g.fillStyle = '#6b4a33'; g.fillRect(48, 48, W - 96, 10);
    var L = 92, R = W - 92, maxW = R - L, y = 135;
    function para(t, size, color, lh, max, bold) {
      g.font = (bold ? '700 ' : '') + size + 'px ' + F; g.fillStyle = color;
      var ls = wrapText(g, t, maxW); if (max && ls.length > max) { ls = ls.slice(0, max); ls[max - 1] = ls[max - 1].slice(0, -1) + '…'; }
      ls.forEach(function (l) { g.fillText(l, L, y); y += lh; });
    }
    g.font = '700 42px ' + F; g.fillStyle = '#2d2620'; g.fillText('换盆用土清单', L, y); y += 44;
    g.font = '22px ' + F; g.fillStyle = '#8a7f72'; g.fillText('导出时间 ' + stamp() + ' · 默认场景为虚构示例', L, y); y += 60;
    if (!out.ok) {
      para('还算不出来', 44, '#a3401f', 60, 1, true);
      out.errors.slice(0, 12).forEach(function (e) { para('· ' + e.message, 26, '#5a4f44', 38, 2); });
      return c;
    }
    g.font = '30px ' + F; g.fillStyle = '#5a4f44'; g.fillText('要配的土', L, y); g.fillText('一共要花', L + 520, y); y += 84;
    g.font = '700 76px ' + M; g.fillStyle = '#6b4a33'; g.fillText(A.fmtL(out.needL) + ' L', L, y);
    g.fillStyle = '#b4683f'; g.fillText(A.fmtV(out.totalCost, 2) + ' 元', L + 520, y); y += 50;
    para(out.potCount + ' 个盆装 ' + A.fmtL(out.soilL) + ' L，多备 ' + A.fmtPct(out.spare) + '，一共 ' + out.totalBags + ' 袋', 26, '#5a4f44', 38, 2);
    y += 18;
    g.strokeStyle = '#e2d9cc'; g.setLineDash([8, 8]); g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); g.setLineDash([]); y += 52;
    var rows = out.mats.map(function (m) { return [m.name, m.bags > 0 ? m.bags + ' 袋' : (m.needL > 0 ? '不用买' : '—'), '要 ' + A.fmtL(m.needL) + ' L' + (m.bags > 0 ? ' · ' + A.fmtV(m.cost, 2) + ' 元 · 剩 ' + A.fmtL(m.leftL) + ' L' : ' · 剩 ' + A.fmtL(m.leftL) + ' L')]; });
    if (out.drainMat) { var d = out.drainMat; rows.push([d.name + '（排水层）', d.bags > 0 ? d.bags + ' 袋' : '不用买', '要 ' + A.fmtL(d.needL) + ' L' + (d.bags > 0 ? ' · ' + A.fmtV(d.cost, 2) + ' 元 · 剩 ' + A.fmtL(d.leftL) + ' L' : '')]); }
    rows.forEach(function (r) {
      g.strokeStyle = '#8a7f72'; g.lineWidth = 2; g.strokeRect(L, y - 30, 32, 32); g.lineWidth = 1;
      g.font = '700 30px ' + F; g.fillStyle = '#2d2620';
      var nm = wrapText(g, r[0], maxW - 260)[0]; g.fillText(nm + (nm !== r[0] ? '…' : ''), L + 50, y);
      g.font = '700 34px ' + M; g.fillStyle = '#6b4a33'; g.textAlign = 'right'; g.fillText(r[1], R, y); g.textAlign = 'left'; y += 40;
      g.font = '24px ' + F; g.fillStyle = '#5a4f44'; g.fillText(r[2], L + 50, y); y += 54;
    });
    if (out.actions.length && y < H - 260) {
      g.strokeStyle = '#e2d9cc'; g.setLineDash([8, 8]); g.beginPath(); g.moveTo(L, y - 10); g.lineTo(R, y - 10); g.stroke(); g.setLineDash([]); y += 34;
      out.actions.forEach(function (a) { if (y < H - 200) { para('→ ' + a.text, 25, '#3f6b3a', 36, 3); y += 8; } });
    }
    g.font = '21px ' + F; g.fillStyle = '#8a7f72';
    g.fillText('盆按直壁锥台计算，配方按体积份数 · 不推荐配方', L, H - 92);
    return c;
  }
  $('dlPng').addEventListener('click', function () {
    drawCard().toBlob(function (b) { if (b) download('换盆用土清单-1080x1350.png', b); }, 'image/png');
  });

  window.__potUi = {
    state: function () { return JSON.parse(JSON.stringify(state)); },
    checked: function () { return JSON.parse(JSON.stringify(checked)); },
    out: function () { return out; },
    importText: importText, drawCard: drawCard, storageKey: KEY
  };

  fillAll(); update();
})();
