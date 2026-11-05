// KHI NÀO giá M15 quay lại test EMA34 / EMA89, và đặt lệnh ở lần test đó (SL/TP) thế nào — vàng 12 tháng, 0.02 lot
// LƯU Ý: phần B ở đây tính TP ngay trên nến khớp nên quá lạc quan — kết quả đúng xem ematest3.mjs (mô phỏng M5).
import { load, ema, atr, pivots } from './core.mjs';
const c = load('XAU', 'm15'), n = c.length, E34 = ema(c.map(x => x.c), 34), E89 = ema(c.map(x => x.c), 89), A = atr(c), pv = pivots(c, 3);
const S = Date.UTC(2026, 4, 5), FROM = Date.UTC(2025, 10, 5), SP = 0.35;
const hr = (t) => (new Date(t).getUTCHours() + 7) % 24, pct = (a, b) => b ? Math.round(100 * a / b) : 0, trend = (i) => Math.sign(E34[i] - E89[i]);
// ===== A. "Rời EMA": giá đóng cửa cách EMA34 ≥ 1 ATR (lần đầu kể từ lần chạm trước). Sau đó bao lâu chạm lại EMA34 / EMA89?
const L = []; let away = false;
for (let i = 100; i < n; i++) { const x = c[i], touch = x.l <= E34[i] && x.h >= E34[i]; if (touch) { away = false; continue; }
  const dist = (x.c - E34[i]) / A[i]; if (away || Math.abs(dist) < 1 || x.t < FROM) continue; away = true;
  const up = dist > 0, withTr = (up ? 1 : -1) === trend(i), spread = Math.abs(E34[i] - E89[i]) / A[i];
  let t34 = null, t89 = null, maxRun = 0; for (let u = i + 1; u < Math.min(n, i + 192); u++) { const y = c[u];
    if (t34 == null) maxRun = Math.max(maxRun, up ? (y.h - x.c) : (x.c - y.l));
    if (t34 == null && (up ? y.l <= E34[u] : y.h >= E34[u])) t34 = u; if (t89 == null && (up ? y.l <= E89[u] : y.h >= E89[u])) { t89 = u; break; } }
  L.push({ i, t: x.t, up, withTr, spread, h: hr(x.t), t34: t34 == null ? null : t34 - i, t89: t89 == null ? null : t89 - i, h34: t34 == null ? null : hr(c[t34].t), run: maxRun / A[i] }); }
const within = (G, key, bars) => pct(G.filter(e => e[key] != null && e[key] <= bars).length, G.length);
const row = (nm, G) => console.log(`  ${nm.padEnd(40)} ${String(G.length).padStart(4)} lần · về EMA34 trong 1h ${String(within(G, 't34', 4)).padStart(2)}% · 4h ${String(within(G, 't34', 16)).padStart(2)}% · 12h ${String(within(G, 't34', 48)).padStart(2)}% · 2 ngày ${within(G, 't34', 192)}% | về EMA89 trong 4h ${within(G, 't89', 16)}% · 12h ${within(G, 't89', 48)}% · 2 ngày ${within(G, 't89', 192)}%`);
console.log(`== A. Giá rời EMA34 M15 (đóng cửa cách ≥ 1 ATR): ${L.length} lần trong 12 tháng (${(L.length / 260).toFixed(1)}/ngày)`);
row('tất cả', L); row('rời CÙNG xu hướng (EMA34 trên/dưới EMA89)', L.filter(e => e.withTr)); row('rời NGƯỢC xu hướng', L.filter(e => !e.withTr));
row('xu hướng mạnh (EMA34–89 cách ≥ 1.5 ATR)', L.filter(e => e.withTr && e.spread >= 1.5)); row('xu hướng yếu (EMA34–89 cách < 0.5 ATR)', L.filter(e => e.spread < 0.5));
const med = (a) => { a = a.filter(v => v != null).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
console.log(`  thời gian trung vị để quay về EMA34: ${med(L.map(e => e.t34)) * 15} phút · về EMA89: ${(med(L.map(e => e.t89)) * 15 / 60).toFixed(1)} giờ · giá chạy thêm TB trước khi về: ${(L.filter(e => e.t34).reduce((a, e) => a + e.run, 0) / L.filter(e => e.t34).length).toFixed(1)} ATR`);
console.log(' · lần CHẠM EMA34 hay xảy ra lúc mấy giờ VN (% số lần chạm):'); { const H = new Array(24).fill(0); let N = 0; for (const e of L) if (e.h34 != null && e.t34 <= 48) { H[e.h34]++; N++; } const m = Math.max(...H);
  for (let h = 0; h < 24; h++) console.log(`    ${String(h).padStart(2, '0')}h ${String(pct(H[h], N)).padStart(2)}% ${'█'.repeat(Math.round(H[h] / m * 25))}`); }
console.log(' · rời EMA lúc mấy giờ thì quay về trong 4h nhiều nhất:'); { const H = {}; for (const e of L) (H[e.h] = H[e.h] || []).push(e);
  console.log('    ' + Object.keys(H).sort((a, b) => a - b).map(h => `${h}h ${within(H[h], 't34', 16)}%`).join(' · ')); }
// ===== B. ĐẶT LỆNH Ở LẦN TEST: xu hướng M15 (EMA34 > EMA89), giá đã rời EMA34 ≥ 1 ATR → đặt LIMIT tại EMA34 (cập nhật mỗi nến), vào theo xu hướng
function trade(o) { const R = []; let busy = -1, armed = null;
  for (let i = 100; i < n - 1; i++) { if (c[i].t < FROM) continue; const tr = trend(i), x = c[i];
    if (!armed && i > busy && tr && tr * (x.c - E34[i]) / A[i] >= (o.away ?? 1) && Math.abs(E34[i] - E89[i]) / A[i] >= (o.spread ?? 0)) {
      if (!o.hours || o.hours.includes(hr(x.t))) armed = { d: tr, from: i, ext: x.c }; continue; }
    if (!armed) continue; const d = armed.d; armed.ext = d > 0 ? Math.max(armed.ext, x.h) : Math.min(armed.ext, x.l);
    if (trend(i) !== d || i - armed.from > (o.exp ?? 32)) { armed = null; continue; }
    const y = c[i + 1], lvl = o.at === 89 ? E89[i] : o.at === 'mid' ? (E34[i] + E89[i]) / 2 : E34[i]; // giá limit đặt theo nến vừa đóng
    if (!(d > 0 ? y.l <= lvl : y.h + SP >= lvl)) continue; // khớp ở nến sau
    const entry = d > 0 ? Math.min(lvl, y.o) + 0 : Math.max(lvl, y.o), a = A[i];
    const sl = o.sl === '89' ? E89[i] - d * (o.slPad ?? 0.5) * a : entry - d * (o.slATR ?? 1) * a, risk = Math.abs(entry - sl); armed = null; if (!(risk > 0) || risk > 30) continue;
    const tp = o.tp === 'ext' ? armed?.ext ?? null : entry + d * (o.rr ?? 2) * risk;
    let res = null, ex = null, u = i + 1; const eTP = tp;
    for (; u < Math.min(n, i + 1 + (o.hold ?? 96)); u++) { const z = c[u], lo = d > 0 ? z.l : z.l + SP, hi = d > 0 ? z.h : z.h + SP;
      if (u === i + 1) { if (d > 0 ? z.l <= sl : z.h + SP >= sl) { if ((d > 0 ? z.c : z.c) && (d > 0 ? z.o > entry : z.o < entry)) { res = 'SL'; ex = sl; break; } } }
      if (d > 0 ? lo <= sl : hi >= sl) { res = 'SL'; ex = sl; break; } if (d > 0 ? hi >= eTP : lo <= eTP) { res = 'TP'; ex = eTP; break; } }
    if (!res) { u = Math.min(n - 1, u); res = 'TIME'; ex = d > 0 ? c[u].c : c[u].c + SP; } busy = u;
    R.push({ t: c[i].t, h: hr(c[i + 1].t), res, usd: d * (ex - entry) * 2 - (d > 0 ? SP * 2 : 0), risk }); }
  return R; }
const show = (nm, R) => { const w = R.filter(r => r.res === 'TP').length, U = (f) => R.filter(f).reduce((a, r) => a + r.usd, 0); let eq = 0, pk = 0, dd = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  console.log(`${(U(r => r.t < S) > 0 && U(r => r.t >= S) > 0) ? '✓' : ' '} ${nm.padEnd(50)} ${String(R.length).padStart(4)} lệnh (${(R.length / 260).toFixed(1)}/ngày) · thắng ${String(pct(w, R.length)).padStart(2)}% · SL TB ${(R.reduce((a, r) => a + r.risk, 0) / (R.length || 1)).toFixed(1)} giá · ${U(() => true) >= 0 ? '+' : ''}${U(() => true).toFixed(0)}$ (trước ${U(r => r.t < S).toFixed(0)} · gần ${U(r => r.t >= S).toFixed(0)}) · DD ${dd.toFixed(0)}$`); return R; };
console.log('\n== B. Lệnh LIMIT chờ giá test EMA M15, vào THEO xu hướng (giá đã rời EMA34 ≥ 1 ATR, hết hạn 8h, giữ ≤ 24h)');
for (const at of [34, 'mid', 89]) for (const [sn, so] of [['SL 1 ATR', { slATR: 1 }], ['SL 1.5 ATR', { slATR: 1.5 }], ['SL dưới/trên EMA89 + 0.5 ATR', { sl: '89' }]]) for (const rr of [1, 1.5, 2])
  show(`limit ở ${at === 'mid' ? 'giữa EMA34–89' : 'EMA' + at} · ${sn} · TP ${rr}R`, trade({ at, ...so, rr }));
console.log('\n== C. Thêm bộ lọc cho bản limit EMA34 · SL 1.5 ATR · TP 1.5R');
show('xu hướng mạnh (EMA34–89 ≥ 1 ATR)', trade({ at: 34, slATR: 1.5, rr: 1.5, spread: 1 })); show('giá rời ≥ 2 ATR', trade({ at: 34, slATR: 1.5, rr: 1.5, away: 2 }));
show('hết hạn 4h', trade({ at: 34, slATR: 1.5, rr: 1.5, exp: 16 })); show('hết hạn 24h', trade({ at: 34, slATR: 1.5, rr: 1.5, exp: 96 }));
