// Kiểm kỹ 📐 Công thức (tin-hieu/congthuc.js) trên 12 tháng: vàng OKX, vàng Dukascopy, BTC OKX · M5/M15/M30
// node research/ct-test.mjs [XAU|XAU2Y|BTC] [hệ số spread]
import path from 'node:path'; import { createRequire } from 'node:module';
import { DIR, load } from './core.mjs';
const req = createRequire(import.meta.url), CT = req(path.join(DIR, '..', 'tin-hieu', 'congthuc.js'));
const SYMS = (process.argv[2] ? [process.argv[2]] : ['XAU', 'XAU2Y', 'BTC']), KSP = +(process.argv[3] || 1);
const VN = 7 * 36e5, hr = (t) => new Date(t + VN).getUTCHours();
const SESS = (h) => h >= 7 && h < 13 ? 'Á 7–13h' : h >= 13 && h < 19 ? 'London 13–19h' : h >= 19 ? 'Mỹ 19–24h' : 'Đêm 0–7h';
for (const SYM of SYMS) {
  const BTC = SYM === 'BTC', SP = (BTC ? 18 : 0.35) * KSP, USD = BTC ? 0.02 : 2;
  const m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15'), h1 = load(SYM, 'h1'), END = Math.min(m5.at(-1).ct, m15.at(-1).ct), ST = END - 365 * 864e5;
  const days = new Set(m15.filter(x => x.t >= ST).map(x => new Date(x.t + VN).toISOString().slice(0, 10))).size;
  const all = CT.run({ m5, m15, h1 }, { spread: SP }).filter(s => s.ct >= ST);
  const done = all.filter(s => ['WIN', 'LOSS', 'TIME'].includes(s.state));
  const st = (G) => { const w = G.filter(s => s.state === 'WIN').length, R = G.reduce((a, s) => a + s.r, 0), gw = G.filter(s => s.r > 0).reduce((a, s) => a + s.r, 0), gl = -G.filter(s => s.r < 0).reduce((a, s) => a + s.r, 0);
    let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0; for (const s of [...G].sort((a, b) => a.exitT - b.exitT)) { eq += s.r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = s.r < 0 ? ls + 1 : 0; ml = Math.max(ml, ls); }
    return { n: G.length, wr: G.length ? 100 * w / G.length : 0, R, exp: G.length ? R / G.length : 0, pf: gl ? gw / gl : Infinity, dd, ml, usd: G.reduce((a, s) => a + s.pts * USD, 0) }; };
  const f = (z) => `${String(z.n).padStart(4)}L · thắng ${z.wr.toFixed(0).padStart(2)}% · ${z.R >= 0 ? '+' : ''}${z.R.toFixed(1)}R (${z.exp >= 0 ? '+' : ''}${z.exp.toFixed(2)}R/lệnh) · PF ${z.pf === Infinity ? '∞' : z.pf.toFixed(2)} · DD ${z.dd.toFixed(1)}R · thua l.t. ${z.ml} · ${z.usd >= 0 ? '+' : ''}${Math.round(z.usd)}$`;
  const g = (G) => { const z = st(G); return `${z.n}L ${z.wr.toFixed(0)}% ${z.R >= 0 ? '+' : ''}${z.R.toFixed(1)}R`; };
  console.log(`\n######## ${SYM} · ${new Date(ST).toISOString().slice(0, 10)} → ${new Date(END).toISOString().slice(0, 10)} · ${days} ngày · spread ${SP} · 0.02 lot`);
  for (const tf of [...CT.CFG.tfs, 'ALL']) {
    const G = done.filter(s => tf === 'ALL' || s.tf === tf), A = all.filter(s => tf === 'ALL' || s.tf === tf);
    const c = (x) => A.filter(s => s.state === x).length;
    console.log(`\n[${tf === 'ALL' ? 'GỘP 3 KHUNG' : tf.toUpperCase()}] ${f(st(G))} · ${(G.length / days).toFixed(2)} lệnh/ngày`);
    console.log(`   tín hiệu ${A.length}: khớp ${G.length} · hết hạn ${c('EXPIRED')} · chạm TP trước khi khớp ${c('MISSED')} · huỷ vượt cú quét ${c('INVALID')} · đang chạy ${c('PENDING') + c('OPEN')} · hết giờ giữ ${c('TIME')}`);
    const q = [0, 1, 2, 3].map(i => G.filter(s => Math.min(3, Math.floor(4 * (s.fillT - ST) / (END - ST))) === i));
    console.log(`   4 quý: ${q.map((x, i) => 'Q' + (i + 1) + ' ' + g(x)).join(' · ')}`);
    console.log(`   BUY ${g(G.filter(s => s.side > 0))} · SELL ${g(G.filter(s => s.side < 0))}`);
    console.log(`   phiên: ${['Đêm 0–7h', 'Á 7–13h', 'London 13–19h', 'Mỹ 19–24h'].map(p => p + ' ' + g(G.filter(s => SESS(hr(s.fillT)) === p))).join(' · ')}`);
    if (tf !== 'ALL') console.log(`   SL TB ${(G.reduce((a, s) => a + s.risk, 0) / (G.length || 1)).toFixed(BTC ? 0 : 2)} giá · TP TB ${(2 * G.reduce((a, s) => a + s.risk, 0) / (G.length || 1)).toFixed(BTC ? 0 : 2)} giá · giữ lệnh TB ${(G.reduce((a, s) => a + (s.exitT - s.fillT), 0) / (G.length || 1) / 6e4).toFixed(0)} phút`);
  }
}
