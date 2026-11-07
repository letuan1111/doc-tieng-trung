// Giờ thắng / giờ dính SL cho chiến lược BOS M5 + retest (TP 1.2R và TP swing) · chọn giờ ở nửa năm đầu, kiểm ở nửa năm sau
import fs from 'node:fs'; import path from 'node:path'; import { DIR } from './core.mjs';
import { setups, run, show, DAYS, T0, T1, NM } from './bosretest.mjs';
const S3 = setups(3), MID = T0 + (T1 - T0) / 2, pct = (a, b) => b ? Math.round(100 * a / b) : 0, out = {};
for (const [nm, o] of [['TP 1.2R', { pad: 0, tol: 0, wait: 72, entry: 'limit', tp: 1.2 }], ['TP swing RR≥1.2', { pad: 0, tol: 0, wait: 72, entry: 'limit', tp: 'best', minRR: 1.2 }]]) {
  const R = run(S3, o); console.log(`\n######## ${NM} · ${nm} · chờ test ≤ 6h`); const all = show('tất cả giờ', R);
  const H = [...Array(24).keys()].map(h => { const x = R.filter(r => r.h === h), a = x.filter(r => r.t < MID), b = x.filter(r => r.t >= MID), sR = (y) => y.reduce((s, r) => s + r.r, 0);
    return { h, n: x.length, tp: x.filter(r => r.res === 'TP').length, sl: x.filter(r => r.res === 'SL').length, win: pct(x.filter(r => r.res === 'TP').length, x.length), R: sR(x), Ra: sR(a), Rb: sR(b), usd: x.reduce((s, r) => s + r.usd, 0) }; });
  console.log(' giờ VN | lệnh | TP | SL | thắng | tổng R | R nửa đầu | R nửa sau');
  for (const x of H) if (x.n) console.log(`  ${String(x.h).padStart(2)}h  | ${String(x.n).padStart(4)} | ${String(x.tp).padStart(3)} | ${String(x.sl).padStart(3)} | ${String(x.win).padStart(3)}% | ${x.R.toFixed(1).padStart(6)} | ${x.Ra.toFixed(1).padStart(6)} | ${x.Rb.toFixed(1).padStart(6)}`);
  const pickA = H.filter(x => x.Ra > 0 && x.n >= 10).map(x => x.h), both = H.filter(x => x.Ra > 0 && x.Rb > 0).map(x => x.h), badBoth = H.filter(x => x.Ra < 0 && x.Rb < 0).map(x => x.h);
  console.log(`giờ tốt ở nửa đầu: ${pickA.join(',')}`); const B = R.filter(r => r.t >= MID);
  show('  → nửa sau, TẤT CẢ giờ', B); show('  → nửa sau, chỉ giờ chọn từ nửa đầu (kiểm thật)', B.filter(r => pickA.includes(r.h)));
  console.log(`giờ tốt cả 2 nửa: ${both.join(',')} · giờ xấu cả 2 nửa: ${badBoth.join(',')}`);
  show('  cả năm, bỏ giờ xấu cả 2 nửa', R.filter(r => !badBoth.includes(r.h)));
  out[nm] = { all, hours: H, pickA, both, badBoth };
}
fs.writeFileSync(path.join(DIR, 'data', `bosretest_hours_${process.argv[2]}.json`), JSON.stringify(out));
