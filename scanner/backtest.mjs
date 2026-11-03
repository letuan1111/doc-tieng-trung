// So sánh engine cũ / mới trên dữ liệu OKX thật (chạy: node scanner/backtest.mjs [ngày])
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const __dir = path.dirname(fileURLToPath(import.meta.url)), req = createRequire(import.meta.url);
req(path.join(__dir, '_old_ict.js')); const OLD = globalThis.ICT;
delete globalThis.ICT; req(path.join(__dir, '..', 'bot-tin-hieu', 'ict.js')); const NEW = globalThis.ICT;

const DAYS = +(process.argv[2] || 60), MS = { m5: 3e5, m15: 9e5, h1: 36e5 }, BAR = { m5: '5m', m15: '15m', h1: '1H' };
const SYM = { XAU: { okx: 'XAU-USDT-SWAP', spread: 0.3 }, BTC: { okx: 'BTC-USDT-SWAP', spread: 20 } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function j(u) { for (let k = 0; k < 4; k++) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch (_) {} await sleep(800); } throw new Error('fetch ' + u); }
async function candles(inst, tf, days) {
  const need = Math.ceil(days * 864e5 / MS[tf]) + 400; let out = (await j(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${BAR[tf]}&limit=300`)).data || [];
  while (out.length < need) { const a = (await j(`https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=${BAR[tf]}&limit=100&after=${out[out.length - 1][0]}`)).data || []; if (!a.length) break; out = out.concat(a); await sleep(120); }
  return out.reverse().map(k => ({ t: +k[0], ct: +k[0] + MS[tf], o: +k[1], h: +k[2], l: +k[3], c: +k[4] })).filter(x => x.ct <= Date.now());
}
const CFG = { rr: 2, minRR: 1.5, expiry: 20, maxBars: 48, cost: 0.0004, freshBars: 2, minGrade: 'A', htf: 'grade' };
function run(E, c, data, extra, from, to) {
  const cons = extra.noCons ? null : E.consensus(c, ['m5', 'm15', 'h1'].map(t => ({ name: t.toUpperCase(), c: data[t] })));
  const a = E.analyze(c, { ...CFG, cons, ...extra });
  const tr = a.bt.trades.filter(t => c[t.i].t >= from && c[t.i].t < to && (E.GRADE_RANK[t.grade] || 0) >= 2), done = tr.filter(t => t.r != null);
  let eq = 0, pk = 0, dd = 0; for (const t of done) { eq += t.r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  const gw = done.filter(t => t.r > 0).reduce((s, t) => s + t.r, 0), gl = -done.filter(t => t.r <= 0).reduce((s, t) => s + t.r, 0);
  const cnt = (s) => done.filter(t => t.state === s).length;
  return { n: done.length, win: cnt('WIN'), be: cnt('BE'), loss: cnt('LOSS'), time: cnt('TIME'), miss: tr.filter(t => t.state === 'MISSED' || t.state === 'EXPIRED').length,
    netR: +eq.toFixed(2), pf: gl ? +(gw / gl).toFixed(2) : (gw ? 99 : 0), dd: +dd.toFixed(2), avgRisk: done.length ? +(done.reduce((s, t) => s + t.risk, 0) / done.length).toFixed(2) : 0 };
}
const fmt = (r) => `${String(r.n).padStart(3)} lệnh | TP ${r.win} · ½+BE ${r.be} · SL ${r.loss} · hết giờ ${r.time} · lỡ ${r.miss} | ${r.netR >= 0 ? '+' : ''}${r.netR}R | PF ${r.pf} | DD ${r.dd}R | SL tb ${r.avgRisk}`;
const tot = {}, now = Date.now(), mid = now - 60 * 864e5, beg = now - DAYS * 864e5;
const PER = { 'cũ (chưa dùng để chọn)': [beg, mid], '60 ngày gần đây': [mid, now] };
for (const [sym, s] of Object.entries(SYM)) {
  const data = {}; for (const tf of ['h1', 'm15', 'm5']) data[tf] = await candles(s.okx, tf, DAYS + (tf === 'h1' ? 20 : 4));
  console.log(`\n=== ${sym} · nến m5 ${data.m5.length} m15 ${data.m15.length} h1 ${data.h1.length} · từ ${new Date(data.m5[0].t).toISOString().slice(0, 10)}`);
  for (const tf of ['m5', 'm15', 'h1']) for (const [pn, [f, t]] of Object.entries(PER)) {
    const V = { 'CŨ ': run(OLD, data[tf], data, {}, f, t), 'MỚI': run(NEW, data[tf], data, { spread: s.spread }, f, t) };
    for (const [k, r] of Object.entries(V)) {
      console.log(`${tf.padEnd(4)} ${pn.padEnd(22)} ${k} ${fmt(r)}`);
      const key = `${k} ${pn} ${tf === 'm5' ? 'M5' : 'M15+H1'}`, T = tot[key] = tot[key] || { n: 0, netR: 0, loss: 0, win: 0, be: 0 };
      T.n += r.n; T.netR += r.netR; T.loss += r.loss; T.win += r.win; T.be += r.be;
    }
  }
}
console.log('\n=== TỔNG XAU+BTC');
for (const [k, T] of Object.entries(tot).sort()) console.log(`${k.padEnd(40)} ${T.n} lệnh | TP ${T.win} · ½+BE ${T.be} · SL ${T.loss} | ${T.netR >= 0 ? '+' : ''}${T.netR.toFixed(1)}R`);
