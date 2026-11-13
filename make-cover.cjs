/* 封面 cover.svg（1200×1200），数字全部来自 core.js 默认场景的同一次 compute；再用浏览器截成 cover.png。
 * 字体名用单引号（SVG 是 XML，裸双引号会让整张图变错误页，批次 64 踩过）。 */
const fs = require('node:fs'), path = require('node:path');
const A = require('./core.js');
const o = A.compute(A.defaultState());
if (!o.ok) throw new Error('默认场景算不出来');
const F = "-apple-system,'PingFang SC','Microsoft YaHei',sans-serif", M = 'ui-monospace,Menlo,Consolas,monospace';
const rows = o.mats.map((m) => [m.name, m.bags + ' 袋', '要 ' + A.fmtL(m.needL) + ' L · 剩 ' + A.fmtL(m.leftL) + ' L']).concat([[o.drainMat.name + '（排水层）', o.drainMat.bags + ' 袋', '要 ' + A.fmtL(o.drainMat.needL) + ' L']]);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#f2efe8"/>
  <rect x="60" y="60" width="1080" height="1080" fill="#fffdf9" stroke="#e2d9cc"/>
  <rect x="60" y="60" width="1080" height="12" fill="#6b4a33"/>
  <text x="120" y="200" font-family="${F}" font-size="80" font-weight="700" fill="#2d2620">换盆用土清单</text>
  <text x="120" y="262" font-family="${F}" font-size="32" fill="#8a7f72">${o.potCount} 个盆、泥炭 5 : 珍珠岩 2 : 蛭石 1 : 椰糠 2</text>
  <polygon points="860,170 1060,170 1035,330 885,330" fill="#6b4a33"/>
  <polygon points="881,305 1039,305 1035,330 885,330" fill="#c98a5e"/>
  <polyline points="855,160 885,330 1035,330 1065,160" fill="none" stroke="#2d2620" stroke-width="5"/>
  <text x="120" y="420" font-family="${F}" font-size="34" fill="#5a4f44">要配的土</text>
  <text x="640" y="420" font-family="${F}" font-size="34" fill="#5a4f44">一共要花</text>
  <text x="120" y="530" font-family="${M}" font-size="110" font-weight="700" fill="#6b4a33">${A.fmtL(o.needL)} L</text>
  <text x="640" y="530" font-family="${M}" font-size="110" font-weight="700" fill="#b4683f">${A.fmtV(o.totalCost, 2)} 元</text>
  <line x1="120" y1="590" x2="1080" y2="590" stroke="#e2d9cc" stroke-dasharray="10 10"/>
  ${rows.map((r, i) => `<rect x="120" y="${632 + i * 82}" width="34" height="34" fill="none" stroke="#8a7f72" stroke-width="3"/>
  <text x="180" y="${662 + i * 82}" font-family="${F}" font-size="38" font-weight="700" fill="#2d2620">${r[0]}</text>
  <text x="520" y="${662 + i * 82}" font-family="${F}" font-size="28" fill="#5a4f44">${r[2]}</text>
  <text x="1080" y="${664 + i * 82}" text-anchor="end" font-family="${M}" font-size="44" font-weight="700" fill="#6b4a33">${r[1]}</text>`).join('\n  ')}
  <text x="120" y="1090" font-family="${F}" font-size="24" fill="#8a7f72">默认场景为虚构示例 · 盆按直壁锥台计算 · 不推荐配方</text>
</svg>`;
fs.writeFileSync(path.join(__dirname, 'cover.svg'), svg);
console.log('cover.svg', fs.statSync(path.join(__dirname, 'cover.svg')).size, 'bytes');
