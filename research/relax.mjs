import { createRequire } from 'node:module'; const R = createRequire(import.meta.url);
const { load } = await import('./core.mjs');
const V = R('../tin-hieu/v3.js'); const B = {}; for (const tf of V.TFS) B[tf] = { ...V.CFG[tf] };
const SP = { XAU: 0.35, BTC: 18, ETH: 1.2 }, S = Date.UTC(2026, 4, 5), F = Date.UTC(2025, 10, 5);
const D = {}; for (const sym of ['XAU', 'BTC', 'ETH']) D[sym] = { m15: load(sym, 'm15'), h1: load(sym, 'h1') };
const all = (o) => Object.fromEntries(V.TFS.map(t => [t, o]));
const VARS = {
  'Gốc (V4 đang chạy)': {},
  '+ quét đỉnh/đáy phiên Á': all({ liq: ['pd', 'asia'] }),
  '+ quét đỉnh/đáy London': all({ liq: ['pd', 'london'] }),
  '+ phiên Á + London': all({ liq: ['pd', 'asia', 'london'] }),
  '+ đỉnh/đáy tuần trước': all({ liq: ['pd', 'pw'] }),
  '+ đỉnh/đáy swing ngoài': all({ liq: ['pd', 'swing'] }),
  'đóng quay lại ≤6 nến': all({ back: 6 }),
  'chờ khớp lâu gấp đôi': { m15: { expiry: 24 }, m30: { expiry: 20 }, h1: { expiry: 16 } },
  'M15 bỏ lọc': { m15: { filter: null } },
  'M15 chỉ lọc EMA H4': { m15: { filter: x => x.emaH4 } },
  'H1 cả BUY': { h1: { sides: [1, -1] } },
  'mỗi khung 1 lệnh riêng': { _perTF: true },
};
const run = (name, v) => {
  for (const tf of V.TFS) V.CFG[tf] = { ...B[tf], ...(v[tf] || {}) };
  const seg = {}; let n = 0, nT = 0;
  for (const sym of ['XAU', 'BTC', 'ETH']) { const L = V.run(D[sym], { spread: SP[sym], perTF: !!v._perTF }).filter(s => s.r != null && s.ct >= F);
    for (const [pn, f] of [['trước', s => s.ct < S], ['gần', s => s.ct >= S]]) { const P = L.filter(f); seg[sym + ' ' + pn] = P.reduce((a, s) => a + s.r, 0); if (sym !== 'ETH') { n += P.length; } }
    if (sym !== 'ETH') nT += L.filter(s => s.state === 'WIN').length; }
  const vals = Object.values(seg), tot = vals.reduce((a, b) => a + b, 0), neg = vals.filter(x => x < 0).length;
  const xb = seg['XAU trước'] + seg['XAU gần'] + seg['BTC trước'] + seg['BTC gần'];
  console.log(name.padEnd(28), `${String(n).padStart(3)} lệnh XAU+BTC (${(n / 52 / 2).toFixed(1)}/tuần/cặp) · XAU+BTC ${xb >= 0 ? '+' : ''}${xb.toFixed(1)}R (${(xb / n).toFixed(2)}R/lệnh) · âm ${neg}/6 |`, Object.entries(seg).map(([k, x]) => `${k} ${x.toFixed(1)}`).join(' · '));
  return { name, n, xb, neg };
};
const res = []; for (const [k, v] of Object.entries(VARS)) res.push(run(k, v));
if (process.env.COMBO) { const m = (...a) => { const o = {}; for (const x of a) for (const [k, v] of Object.entries(x)) o[k] = k === '_perTF' ? v : { ...(o[k] || {}), ...v }; return o; };
  console.log('--- kết hợp');
  for (const [k, v] of Object.entries(JSON.parse(process.env.COMBO))) run(k, m(...v.map(n => VARS[n]))); }
