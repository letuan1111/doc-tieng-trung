// Nạp sẵn 12 tháng lệnh ICT/SMC (runAll: Chuẩn + Ghi nhận) vào nhật ký máy chủ: scanner/journal-seed.json
// Chỉ lệnh đã kết thúc và cũ hơn 2 ngày so với cuối dữ liệu; máy chủ chỉ thêm id chưa có (nhật ký thật luôn ưu tiên).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load } from './core.mjs';
const V3 = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'v3.js'));
const WAVE = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'wave.js'));
const SYMS = { XAU: { okx: 'XAU-USDT-SWAP', spread: 0.35, dp: 2 }, BTC: { okx: 'BTC-USDT-SWAP', spread: 18, dp: 1 } };
const out = [];
for (const [sym, S] of Object.entries(SYMS)) {
  const D = { m15: load(sym, 'm15'), h1: load(sym, 'h1') }; D.m30 = V3.resample(D.m15, V3.MS.m30);
  const end = D.m15[D.m15.length - 1].ct;
  for (const s of [...V3.runAll(D, { spread: S.spread, now: end }), ...(sym === 'XAU' ? V3.runBos(D, { spread: S.spread, now: end }) : [])]) {
    if (!V3.FINAL[s.state] || (s.exitT || s.ct) > end - 2 * 864e5) continue;
    out.push({ ...s, id: `${sym}-${s.id}`, sym, ver: V3.version, src: 'OKX ' + S.okx + ' (tính lại 12 tháng)', seen: end, lastT: end, dp: S.dp, live: false });
  }
}
{ const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), end = m5[m5.length - 1].ct;
  for (const s of WAVE.run({ m5, m15 }, { spread: 0.35 })) { if (!WAVE.FINAL[s.state] || (s.exitT || s.ct) > end - 2 * 864e5) continue; out.push({ ...s, id: 'XAU-' + s.id, sym: 'XAU', ver: WAVE.version, src: 'OKX XAU-USDT-SWAP (tính lại 12 tháng)', seen: end, dp: 2, live: false }); } }
fs.writeFileSync(path.join(DIR, '..', 'scanner', 'journal-seed.json'), JSON.stringify({ version: V3.version, made: Date.now(), trades: out }));
const c = {}; for (const t of out) { const k = t.sym + ' ' + t.grade + ' ' + t.state; c[k] = (c[k] || 0) + 1; }
console.log(out.length, 'lệnh', c, 'từ', new Date(Math.min(...out.map(t => t.ct))).toISOString().slice(0, 10));
