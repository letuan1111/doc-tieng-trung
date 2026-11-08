// Trang tua 5 tháng cho chiến lược trong ảnh (ICT + SMC + EMA34/89 M5): lệnh + lý do vào + lý do SL
import fs from 'node:fs';
const D = JSON.parse(fs.readFileSync('/home/claude/replay/d155.json')), W = JSON.parse(fs.readFileSync('/home/claude/work/img-why.json')), VN = 7 * 36e5;
const fmt = (t) => new Date(t + VN).toISOString().slice(11, 16);
D.trades = W.T.map(x => ({ ea: 'IMG', side: x.d, t: x.t, entry: +x.entry.toFixed(2), sl: +x.sl.toFixed(2), tp: +x.tp.toFixed(2), state: x.pts > 0 ? 'WIN' : 'LOSS', exitT: x.et, exitP: +(x.entry + x.d * x.pts).toFixed(2), pts: +x.pts.toFixed(2), usd: +(x.pts * 2).toFixed(2),
  box: { hi: +x.fvg.top.toFixed(2), lo: +x.fvg.bot.toFixed(2) }, lv: x.lv,
  why: `Bias EMA34/89 M15 ${x.d > 0 ? 'tăng' : 'giảm'} · quét ${x.d > 0 ? 'SSL' : 'BSL'} ${x.lv.toFixed(2)} lúc ${fmt(x.sweepT)} (râu tới ${x.ext.toFixed(2)}) · CHoCH qua ${x.opp.toFixed(2)} lúc ${fmt(x.mssT)} · FVG ${Math.min(x.fvg.top, x.fvg.bot).toFixed(2)}–${Math.max(x.fvg.top, x.fvg.bot).toFixed(2)} · ${x.d > 0 ? 'BUY' : 'SELL'} LIMIT 50% FVG đặt lúc ${fmt(x.placeT)}, khớp sau ${Math.round((x.t - x.placeT) / 6e4)} phút · TP = ${x.d > 0 ? 'đỉnh BSL' : 'đáy SSL'} ${x.tp.toFixed(2)} (${(x.tpd / x.risk).toFixed(1)}R)`,
  why2: x.pts > 0 ? `giữ ${x.an.held} phút` : `🔍 Vì sao SL: ${x.why2 || ''} · lời tạm tối đa ${x.an.mfe.toFixed(1)} giá (${x.an.mfeR.toFixed(1)}R) · giữ ${x.an.held} phút` }));
for (const w of D.waves) { const c = D.trades.filter(t => t.side === w.d && t.t >= w.t0 && t.t <= w.t1); w.caught = c.map(t => 'lệnh ' + (t.state === 'WIN' ? 'TP' : 'SL')); delete w.why; delete w.anat; delete w.ctx; }
D.summary = '<pre style="white-space:pre-wrap;font:12.5px/1.5 ui-monospace,monospace;background:#20242e;padding:8px;border-radius:8px">' + W.text.replace(/</g, '&lt;') + '</pre>';
delete D.anatomy; fs.writeFileSync('/home/claude/replay/img.json', JSON.stringify(D)); console.log(D.trades.length, 'lệnh', D.bars.length, 'nến');
