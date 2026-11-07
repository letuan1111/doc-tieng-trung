// Bộ giờ cấm cho BOS M5 + retest (TP 1.2R): lọc theo giờ KHỚP hay giờ BOS (lúc đặt limit)
import { setups, run, show, m5 } from './bosretest.mjs';
const SYM = process.argv[2], BTC = SYM === 'BTC', hr = (t) => new Date(t + 252e5).getUTCHours();
const S3 = setups(3), o = { pad: 0, tol: 0, wait: 72, entry: 'limit', tp: 1.2 };
const SETS = BTC ? { 'xấu cả 2 nửa': [2, 3, 5, 6, 7, 12, 13, 17, 19], 'mọi giờ thua cả năm': [0, 2, 3, 5, 6, 7, 8, 10, 12, 13, 17, 19, 20, 22] }
  : { 'xấu cả 2 nửa': [1, 2, 11, 15, 17], 'xấu cả 2 nửa + giờ SL nhiều (4,6,8)': [1, 2, 4, 6, 8, 11, 15, 17], 'mọi giờ thua cả năm': [1, 2, 4, 6, 8, 11, 13, 15, 16, 17, 18, 20] };
console.log(`######## ${SYM}`); show('mọi giờ', run(S3, o));
for (const [nm, B] of Object.entries(SETS)) {
  show(`cấm giờ KHỚP ${nm} (${B.join(',')})`, run(S3, o).filter(r => !B.includes(r.h)));
  show(`cấm giờ BOS/đặt limit ${nm}`, run(S3.filter(s => !B.includes(hr(m5[s.k].ct))), o));
}
