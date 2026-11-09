// Lịch sử 🤖 AI trợ lý cho nhật ký: dùng XÁC SUẤT NGOÀI MẪU (walk-forward, mỗi tháng do mô hình chưa từng thấy tháng đó chấm)
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, load } from './core.mjs';
const rq = createRequire(import.meta.url), AI = rq(path.join(DIR, '..', 'tin-hieu', 'ai.js')), M = rq(path.join(DIR, '..', 'tin-hieu', 'ai-model.json')), F = path.join(DIR, '..', 'scanner', 'journal-seed.json');
const OOS = new Map(JSON.parse(fs.readFileSync(path.join(DIR, 'ai', 'oos-p.json'), 'utf8')).map(([t, d, p]) => [t + ':' + d, p]));
const m15 = load('XAU2Y', 'm15'), h1 = load('XAU2Y', 'h1'), SP = 0.35;
const { P, cands } = AI.scan({ m5: m15, m15, h1 }, { spread: SP });
const S = JSON.parse(fs.readFileSync(F, 'utf8')); S.trades = S.trades.filter(t => t.grade !== 'I');
let busy = -1, n = 0, w = 0, R = 0, usd = 0; const end = m15.at(-1).ct;
for (const cd of cands) { const p = OOS.get(cd.t + ':' + cd.d); if (p == null || p < M.thr || cd.k <= busy) continue;
  const tp = cd.entry + cd.d * M.rr * cd.risk, Fx = AI.follow(P.c, cd.k, cd.d, cd.entry, cd.sl, tp, SP, AI.CFG.hold); if (Fx.state === 'OPEN') break; busy = Fx.u;
  cd.p = p; const s = { id: `XAU-ai-${cd.t}-${cd.d > 0 ? 'B' : 'S'}`, tf: 'm15', model: AI.NAME, grade: 'I', side: cd.d, t: cd.t, ct: cd.ct, entry: cd.entry, sl: cd.sl, tp, risk: cd.risk, rr: M.rr, spread: SP, prob: p, types: cd.types,
    info: AI.whyText ? AI.whyText(cd) : [], hour: (new Date(cd.ct).getUTCHours() + 7) % 24, tgOK: true, fillT: cd.ct, state: Fx.state, exitP: Fx.exitP, exitT: Fx.exitT };
  s.pts = cd.d * (Fx.exitP - cd.entry); s.r = s.pts / cd.risk; n++; w += Fx.state === 'WIN'; R += s.r; usd += s.pts * 2;
  S.trades.push({ ...s, ver: AI.version, sym: 'XAU', src: 'Dukascopy XAUUSD (walk-forward, ngoài mẫu)', seen: end, dp: 2, live: false }); }
fs.writeFileSync(F, JSON.stringify(S)); console.log(`🤖 thêm ${n} lệnh · thắng ${(100 * w / n).toFixed(1)}% · ${R.toFixed(1)}R · ${usd.toFixed(0)} USD (0.02 lot) · seed ${S.trades.length}`);
