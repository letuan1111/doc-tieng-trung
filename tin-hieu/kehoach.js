/* 📋 BÁO CÁO PHIÊN — kế hoạch giao dịch của Letuan (doc "Kế hoạch vào lệnh vàng — nếu mình là trader", 11/11/2026)
 *  Đầu mỗi phiên (Á 7h · London 13h · New York 19h VN) AI đọc thị trường và báo:
 *   1. Xu hướng EMA34/89 H4 · H1 · M15 (giá trên/dưới, khoảng cách, độ dốc) → hôm nay chỉ BUY / chỉ SELL / đứng ngoài setup chính
 *   2. Thanh khoản đã bị quét 24h qua (PDH/PDL, đỉnh/đáy phiên Á, London, New York, swing H1) — quét rồi đóng lại hay phá qua; thanh khoản còn nguyên
 *   3. Biên phiên Á và trạng thái phá biên
 *   4. Ba setup: 🧭 phá biên Á theo xu hướng → chờ retest · 🧱 quét vùng H4/H1 + MSS M15 · 🎯 hồi sâu qua EMA89 ≥ 12 giá + quét
 *      → chờ giá test / hồi về đâu, entry · SL · TP cụ thể
 *   5. Khi nào KHÔNG vào: tin Mỹ ±30 phút, sau 23h, đã thua 2 lệnh, SL > 15 giá
 */
(function (root, factory) { const E = factory(); if (typeof module === 'object' && module.exports) module.exports = E; else root.KEHOACH = E; })(typeof self !== 'undefined' ? self : this, function () {
  const version = 'kh-2026-11-11', VN = 7 * 36e5;
  function resample(c, ms) { const out = []; let cur = null; for (const x of c) { const s = Math.floor(x.t / ms) * ms; if (!cur || cur.t !== s) { if (cur) out.push(cur); cur = { t: s, ct: s + ms, o: x.o, h: x.h, l: x.l, c: x.c, last: x.ct }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.last = x.ct; } } if (cur && cur.last >= cur.ct) out.push(cur); return out; }
  function ema(v, p) { const k = 2 / (p + 1), o = new Array(v.length); let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o[i] = e; } return o; }
  function atr(c, p = 14) { const o = new Array(c.length); let a = c.length ? c[0].h - c[0].l : 0; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  function pivots(c, L) { const H = [], Lw = []; for (let i = L; i < c.length - L; i++) { let ph = true, pl = true; for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; } if (ph) H.push({ i, p: c[i].h, conf: i + L }); if (pl) Lw.push({ i, p: c[i].l, conf: i + L }); } return { H, L: Lw }; }
  const hm = (t) => { const d = new Date(t + VN); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  const dhm = (t) => { const d = new Date(t + VN); return `${hm(t)} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  function sessionOf(t) { const h = new Date(t + VN).getUTCHours(); return h >= 7 && h < 13 ? { key: 'A', name: 'Phiên Á (7h–13h VN)' } : h >= 13 && h < 19 ? { key: 'L', name: 'Phiên London (13h–19h VN)' } : h >= 19 && h < 23 ? { key: 'N', name: 'Phiên New York (19h–23h VN)' } : { key: 'X', name: 'Ngoài giờ (23h–7h VN) — thanh khoản mỏng' }; }

  // D = { m15, h1 } nến đã đóng · opt = { spread, dp, now, zr (ZONES.analyze), ai (AI status), xh (lệnh 🧭 gần nhất), news: [{t,title}], trades: lệnh hôm nay của kế hoạch }
  function report(D, opt) {
    opt = opt || {}; const m15 = D.m15, dp = opt.dp != null ? opt.dp : 2, f = (v) => v == null || !isFinite(v) ? '—' : (+v).toFixed(dp), g = (v) => (v >= 0 ? '+' : '') + (+v).toFixed(1);
    if (!m15 || m15.length < 300) return null;
    const h1 = D.h1 && D.h1.length > 100 ? D.h1 : resample(m15, 36e5), h4 = resample(h1, 144e5), n = m15.length, x = m15[n - 1], px = x.c, now = opt.now || x.ct;
    const A15 = atr(m15), a = A15[n - 1];
    // ---- 1. EMA34/89
    const emaTF = (c, nm, slopeBars) => { const v = c.map(z => z.c), E3 = ema(v, 34), E8 = ema(v, 89), k = c.length - 1, e3 = E3[k], e8 = E8[k], d = Math.sign(e3 - e8);
      return { nm, e34: e3, e89: e8, dir: d, gap: Math.abs(e3 - e8), d34: px - e3, d89: px - e8, slope: e3 - E3[Math.max(0, k - slopeBars)], pos: px > Math.max(e3, e8) ? 'trên cả 2 EMA' : px < Math.min(e3, e8) ? 'dưới cả 2 EMA' : 'nằm giữa EMA34 và EMA89' }; };
    const E = [emaTF(h4, 'H4', 3), emaTF(h1, 'H1', 4), emaTF(m15, 'M15', 8)];
    const T = E[0].dir === E[1].dir ? E[0].dir : 0, T15 = E[2].dir;
    const trendTxt = T > 0 ? 'H4 + H1 cùng TĂNG → hôm nay chỉ tìm BUY' : T < 0 ? 'H4 + H1 cùng GIẢM → hôm nay chỉ tìm SELL' : 'H4 và H1 lệch nhau → bỏ setup chính 🧭, chỉ chờ 🧱 vùng H4/H1';
    // ---- 2. mốc ngày / phiên (UTC)
    const day0 = Math.floor(x.t / 864e5) * 864e5, inR = (t0, t1) => m15.filter(z => z.t >= t0 && z.t < t1);
    const hl = (L) => L.length ? { h: Math.max(...L.map(z => z.h)), l: Math.min(...L.map(z => z.l)) } : null;
    const yday = hl(inR(day0 - 864e5, day0)), asia = hl(inR(day0, Math.min(day0 + 6 * 36e5, x.ct))), asiaDone = x.ct >= day0 + 6 * 36e5;
    const lonT = x.ct >= day0 + 12 * 36e5 ? [day0 + 6 * 36e5, day0 + 12 * 36e5] : [day0 - 18 * 36e5, day0 - 12 * 36e5], lon = hl(inR(...lonT));
    const nyT = [day0 - 12 * 36e5, day0 - 4 * 36e5], ny = hl(inR(...nyT));
    const lv = [];
    const add = (name, p, side, from) => { if (p != null && isFinite(p)) lv.push({ name, p, side, from }); };
    if (yday) { add('PDH (đỉnh hôm qua)', yday.h, 1, day0); add('PDL (đáy hôm qua)', yday.l, -1, day0); }
    if (asia && asiaDone) { add('Đỉnh phiên Á', asia.h, 1, day0 + 6 * 36e5); add('Đáy phiên Á', asia.l, -1, day0 + 6 * 36e5); }
    if (lon) { add('Đỉnh London', lon.h, 1, lonT[1]); add('Đáy London', lon.l, -1, lonT[1]); }
    if (ny) { add('Đỉnh New York', ny.h, 1, nyT[1]); add('Đáy New York', ny.l, -1, nyT[1]); }
    const pv = pivots(h1, 3); for (const q of pv.H.filter(q => h1[q.i].t >= now - 3 * 864e5 && q.conf < h1.length)) add('Đỉnh swing H1 ' + dhm(h1[q.i].t), q.p, 1, h1[q.conf].ct);
    for (const q of pv.L.filter(q => h1[q.i].t >= now - 3 * 864e5 && q.conf < h1.length)) add('Đáy swing H1 ' + dhm(h1[q.i].t), q.p, -1, h1[q.conf].ct);
    // gộp các mức trùng giá (vd PDH = đỉnh New York = đỉnh swing H1)
    lv.sort((u, v) => u.from - v.from); const LV = []; for (const L of lv) { const o = LV.find(z => z.side === L.side && Math.abs(z.p - L.p) < 0.1 * a); if (o) { if (!o.name.includes(L.name.split(' (')[0])) o.name += ' = ' + L.name.replace(/ \(.*\)/, ''); o.from = Math.min(o.from, L.from); } else LV.push({ ...L }); }
    lv.length = 0; lv.push(...LV);
    // quét hay phá: nến M15 đầu tiên vượt mức sau khi mức hình thành
    const swept = [], intact = [];
    for (const L of lv) { let k0 = -1; for (let k = 0; k < n; k++) if (m15[k].t >= L.from && (L.side > 0 ? m15[k].h > L.p : m15[k].l < L.p)) { k0 = k; break; }
      if (k0 < 0) { intact.push(L); continue; } if (m15[k0].ct < now - 864e5) continue;
      let back = false, ext = L.side > 0 ? m15[k0].h : m15[k0].l; for (let k = k0; k <= Math.min(n - 1, k0 + 2); k++) { ext = L.side > 0 ? Math.max(ext, m15[k].h) : Math.min(ext, m15[k].l); if (L.side > 0 ? m15[k].c < L.p : m15[k].c > L.p) { back = true; break; } }
      swept.push({ ...L, t: m15[k0].ct, ext, back, deep: Math.abs(ext - L.p) }); }
    swept.sort((u, v) => v.t - u.t);
    const above = intact.filter(z => z.side > 0 && z.p > px).sort((u, v) => u.p - v.p), below = intact.filter(z => z.side < 0 && z.p < px).sort((u, v) => v.p - u.p);
    // ---- 3. biên phiên Á
    const rng = asia ? asia.h - asia.l : null; let asiaTxt = '';
    let brk = null; if (asia && asiaDone) for (let k = 0; k < n; k++) { const z = m15[k]; if (z.t < day0 + 6 * 36e5) continue; if (z.c > asia.h) { brk = { d: 1, t: z.ct, c: z.c }; break; } if (z.c < asia.l) { brk = { d: -1, t: z.ct, c: z.c }; break; } }
    if (asia) asiaTxt = asiaDone ? `Biên phiên Á ${f(asia.l)} – ${f(asia.h)} (${rng.toFixed(1)} giá). ${brk ? `M15 đã ĐÓNG ${brk.d > 0 ? 'trên đỉnh' : 'dưới đáy'} biên lúc ${hm(brk.t)} (${f(brk.c)})${T && brk.d !== T ? ' — NGƯỢC xu hướng H4/H1, không dùng cho 🧭' : ''}.` : 'Chưa có nến M15 đóng ngoài biên.'}` : `Phiên Á đang tạo biên: ${f(asia.l)} – ${f(asia.h)} (${rng.toFixed(1)} giá) — chốt lúc 13h.`;
    // ---- 4. kế hoạch 3 setup
    const plans = []; const h = new Date(now + VN).getUTCHours();
    // 🧭
    if (!T) plans.push({ k: 'X', txt: '🧭 Phá biên Á theo xu hướng: NGHỈ hôm nay (H4 và H1 không cùng chiều).' });
    else if (asia) { const edge = T > 0 ? asia.h : asia.l, risk = Math.max(0.3 * rng, a), sl = edge - T * risk, tp = edge + T * 2 * risk, side = T > 0 ? 'BUY' : 'SELL', xs = opt.xh;
      if (xs && xs.t >= day0 && xs.state !== 'PENDING' && xs.state !== 'OPEN') plans.push({ k: 'X', txt: `🧭 Hôm nay đã có tín hiệu (${xs.state === 'WIN' ? 'chạm TP' : xs.state === 'LOSS' ? 'dính SL' : xs.state === 'EXPIRED' ? 'huỷ — ' + (xs.why || '') : 'đóng'}) → hết lượt cho ngày này.` });
      else if (xs && xs.t >= day0 && xs.state === 'OPEN') plans.push({ k: 'X', txt: `🧭 ĐANG GIỮ ${side} từ ${f(xs.entry)} · SL ${f(xs.sl)} · TP ${f(xs.tp)}. Lời 1.5R (${f(xs.entry + T * 1.5 * xs.risk)}) thì dời SL về ${f(xs.entry)}.` });
      else if (xs && xs.t >= day0 && xs.state === 'PENDING') plans.push({ k: 'X', txt: `🧭 M15 đã đóng ${T > 0 ? 'trên' : 'dưới'} biên → LIMIT ${side} chờ giá HỒI VỀ TEST ${f(xs.entry)} (cách ${Math.abs(px - xs.entry).toFixed(1)} giá) · SL ${f(xs.sl)} · TP ${f(xs.tp)} · huỷ lúc ${hm(xs.expT)} hoặc nếu giá chạm ${f(xs.tp)} trước.` });
      else if (!asiaDone) plans.push({ k: 'X', txt: `🧭 Sau 13h: chờ nến M15 ĐÓNG ${T > 0 ? 'trên đỉnh' : 'dưới đáy'} biên Á (hiện ${f(edge)}) → đặt LIMIT ${side} ở mép biên, SL ~${risk.toFixed(1)} giá, TP 2R. Không đuổi theo giá.` });
      else if (h < 22) plans.push({ k: 'X', txt: `🧭 Chờ nến M15 ĐÓNG ${T > 0 ? 'trên' : 'dưới'} ${f(edge)} (cách ${Math.abs(edge - px).toFixed(1)} giá) → LIMIT ${side} ${f(edge)} · SL ${f(sl)} (${risk.toFixed(1)} giá) · TP ${f(tp)} (2R). Chờ giá test lại tối đa 4h.` });
      else plans.push({ k: 'X', txt: '🧭 Quá 22h — không đặt lệnh mới cho setup này.' }); }
    // 🧱
    const zr = opt.zr; if (zr && zr.plan && zr.plan.length) for (const p of zr.plan.slice(0, 2)) { const side = p.side > 0 ? 'BUY' : 'SELL';
      plans.push({ k: 'Z', txt: `🧱 Vùng ${p.side > 0 ? 'hỗ trợ' : 'kháng cự'} H4/H1 ${f(p.zone.lo)} – ${f(p.zone.hi)} (${p.zone.score} điểm, cách ${p.dist.toFixed(1)} giá): chờ râu M15 ${p.side > 0 ? 'xuyên xuống dưới' : 'xuyên lên trên'} ${f(p.edge)} (không sâu quá ${f(p.maxSweep)}) rồi ĐÓNG lại trong vùng → M15 đóng ${p.side > 0 ? 'trên' : 'dưới'} swing ${f(p.mssNow)} (MSS) → ${side} ngay, SL ngoài râu, TP 3R.${p.need ? ` Cần thêm ${p.need} điểm AI (giờ mạnh 8–9h/19–22h, MSS ≤ 4 nến).` : ''}` }); }
    if (zr && zr.watch && zr.watch.length) for (const w of zr.watch) plans.push({ k: 'Z', txt: `🧱 ĐANG CHỜ MSS: đã quét ${w.side > 0 ? 'đáy' : 'đỉnh'} vùng ${f(w.zone.lo)}–${f(w.zone.hi)} (râu ${f(w.sweep)}) → chờ M15 đóng ${w.side > 0 ? 'trên' : 'dưới'} ${f(w.mss)} trước ${hm(w.until)}. M15 đóng thủng ${f(w.edge)} là huỷ.` });
    // 🎯
    if (T15) { const lvl = E[2].e89 - T15 * 12, side = T15 > 0 ? 'BUY' : 'SELL', dist = T15 * (px - lvl);
      plans.push({ k: 'H', txt: dist > 0 ? `🎯 Kèo hiếm: EMA34 ${T15 > 0 ? '>' : '<'} EMA89 M15. Nếu giá hồi ${T15 > 0 ? 'xuống dưới' : 'lên trên'} ${f(lvl)} (EMA89 ${T15 > 0 ? '−' : '+'}12, cách ${dist.toFixed(1)} giá) rồi nến M15 quét ${T15 > 0 ? 'đáy' : 'đỉnh'} swing và đóng lại → ${side}, TP 12 giá, SL 12–20 giá.` : `🎯 Giá ĐANG ở vùng hồi sâu (qua EMA89 ${Math.abs(px - E[2].e89).toFixed(1)} giá) → chờ nến M15 quét ${T15 > 0 ? 'đáy' : 'đỉnh'} swing M15 gần nhất rồi đóng lại → ${side} ngay, TP 12 giá.` }); }
    // ---- 5. không vào khi
    const warn = []; const news = (opt.news || []).filter(z => z.t > now - 30 * 6e4 && z.t < now + 8 * 36e5);
    for (const z of news) warn.push(`📰 ${dhm(z.t)} ${z.title} — không vào lệnh ${hm(z.t - 18e5)}–${hm(z.t + 18e5)}`);
    if (h >= 23 || h < 7) warn.push('🌙 Ngoài giờ thanh khoản tốt — không mở lệnh mới.');
    const lossToday = (opt.trades || []).filter(z => z.state === 'LOSS').length; if (lossToday >= 2) warn.push(`🛑 Hôm nay đã thua ${lossToday} lệnh → NGHỈ đến mai.`);
    // vị trí giá: giữa biên / sát EMA34
    if (asia && asiaDone && px > asia.l + 0.25 * rng && px < asia.h - 0.25 * rng && Math.abs(E[2].d34) < 0.5 * a) warn.push('⏸ Giá đang lơ lửng giữa biên Á và sát EMA34 M15 — không vào, chờ giá tới mép.');
    // ---- tin 3 sao hôm nay / ngày mai (giờ VN)
    const vday = (t) => Math.floor((t + VN) / 864e5), td = vday(now);
    const newsDay = (opt.newsAll || []).filter(z => vday(z.t) === td || vday(z.t) === td + 1).sort((u, v) => u.t - v.t)
      .map(z => ({ ...z, day: vday(z.t) === td ? 'hôm nay' : 'ngày mai', done: z.t < now }));
    // ---- tâm lý thị trường (tổng hợp, chỉ để tham khảo): giá · USD (DXY) · lợi suất Mỹ 10 năm · vị thế đám đông OKX · tin tức
    const M = opt.mkt || {}, why = []; let sc = 0;
    const k24 = (() => { let k = n - 1; while (k > 0 && m15[k].ct > now - 864e5) k--; return k; })(), ch = (px - m15[k24].c) / m15[k24].c * 100;
    if (T) { sc += T; why.push(`EMA34/89 H4+H1 cùng ${T > 0 ? 'tăng (+1 MUA)' : 'giảm (+1 BÁN)'}`); } else why.push('EMA34/89 H4/H1 lệch nhau (0)');
    if (Math.abs(ch) >= 0.4) { sc += Math.sign(ch); why.push(`vàng 24h ${ch >= 0 ? '+' : ''}${ch.toFixed(2)}% (${ch > 0 ? '+1 MUA' : '+1 BÁN'})`); } else why.push(`vàng 24h ${ch >= 0 ? '+' : ''}${ch.toFixed(2)}% (0)`);
    if (M.dxy) { const d = M.dxy.chPct; if (Math.abs(d) >= 0.15) { sc -= Math.sign(d); why.push(`USD (DXY ${M.dxy.last.toFixed(2)}) ${d >= 0 ? '+' : ''}${d.toFixed(2)}% 24h → ${d > 0 ? 'USD mạnh, ép vàng (+1 BÁN)' : 'USD yếu, đỡ vàng (+1 MUA)'}`); } else why.push(`DXY ${M.dxy.last.toFixed(2)} gần như đứng yên (${d >= 0 ? '+' : ''}${d.toFixed(2)}%)`); }
    if (M.us10y) { const d = M.us10y.chBp; if (Math.abs(d) >= 3) { sc -= Math.sign(d); why.push(`lợi suất Mỹ 10 năm ${M.us10y.last.toFixed(2)}% (${d >= 0 ? '+' : ''}${d.toFixed(0)} điểm cơ bản 24h → ${d > 0 ? '+1 BÁN' : '+1 MUA'})`); } else why.push(`lợi suất Mỹ 10 năm ${M.us10y.last.toFixed(2)}% gần như đứng yên`); }
    if (M.ls) { const r = M.ls.last; if (r >= 2) { sc -= 1; why.push(`đám đông OKX: ${r.toFixed(2)} tài khoản MUA / 1 BÁN → mua quá đông, dễ bị quét ngược (+1 BÁN)`); } else if (r <= 0.8) { sc += 1; why.push(`đám đông OKX: ${r.toFixed(2)} MUA / 1 BÁN → bán quá đông (+1 MUA)`); } else why.push(`đám đông OKX cân bằng (${r.toFixed(2)} MUA / 1 BÁN)`); }
    if (M.head) { const h = M.head.score; if (Math.abs(h) >= 2) { sc += Math.sign(h); why.push(`tin tức 24h nghiêng ${h > 0 ? 'TĂNG' : 'GIẢM'} (${M.head.bull} tin tăng / ${M.head.bear} tin giảm → +1 ${h > 0 ? 'MUA' : 'BÁN'})`); } else why.push(`tin tức 24h trung tính (${M.head.bull} tăng / ${M.head.bear} giảm)`); }
    const senti = { score: sc, side: sc >= 2 ? 1 : sc <= -2 ? -1 : 0, txt: sc >= 2 ? 'nghiêng phe MUA' : sc <= -2 ? 'nghiêng phe BÁN' : 'giằng co, chưa rõ phe', why, heads: (M.head && M.head.items || []).slice(0, 5) };
    const S = sessionOf(now);
    return { version, t: now, session: S, price: px, atr: +a.toFixed(dp), ema: E.map(z => ({ nm: z.nm, e34: +z.e34.toFixed(dp), e89: +z.e89.toFixed(dp), dir: z.dir, gap: +z.gap.toFixed(1), d34: +z.d34.toFixed(1), d89: +z.d89.toFixed(1), slope: +z.slope.toFixed(1), pos: z.pos })),
      T, trendTxt, asia: asia ? { h: asia.h, l: asia.l, done: asiaDone, brk } : null, asiaTxt,
      swept: swept.slice(0, 8).map(z => ({ name: z.name, p: z.p, t: z.t, ext: z.ext, back: z.back, deep: +z.deep.toFixed(1), side: z.side })),
      above: above.slice(0, 3).map(z => ({ name: z.name, p: z.p, dist: +(z.p - px).toFixed(1) })), below: below.slice(0, 3).map(z => ({ name: z.name, p: z.p, dist: +(px - z.p).toFixed(1) })),
      plans, warn, news: newsDay, senti, ai: opt.ai ? { biasTxt: opt.ai.biasTxt, now: opt.ai.now } : null, lossToday };
  }
  // văn bản Telegram (HTML)
  function text(R, sym, opt) {
    opt = opt || {}; if (!R) return ''; const dp = opt.dp != null ? opt.dp : 2, f = (v) => (+v).toFixed(dp), esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const L = [];
    L.push(`📋 <b>${sym} · ${esc(R.session.name)}</b> · ${hm(R.t)} · giá <b>${f(R.price)}</b> · ATR M15 ${R.atr}`);
    L.push(`\n<b>📰 Tin 3 sao</b>`);
    const nd = R.news || []; if (!nd.length) L.push('• Hôm nay và ngày mai không có tin tác động mạnh.');
    for (const z of nd) L.push(`• ${z.day} ${hm(z.t)} · ${esc(z.country)} ${esc(z.title)}${z.forecast ? ' · dự báo ' + esc(z.forecast) : ''}${z.previous ? ' · kỳ trước ' + esc(z.previous) : ''}${z.done ? ' · ĐÃ RA' : z.country === 'USD' ? ' · ⚠️ không vào lệnh ±30 phút' : ''}`);
    if (R.senti) { L.push(`\n<b>🧭 Tâm lý thị trường: ${R.senti.txt.toUpperCase()}</b> (điểm ${R.senti.score >= 0 ? '+' : ''}${R.senti.score})`); for (const w of R.senti.why) L.push('• ' + esc(w));
      if (R.senti.heads.length) { L.push('Tin nổi bật 24h:'); for (const h of R.senti.heads) L.push(`– ${h.s > 0 ? '🟢' : h.s < 0 ? '🔴' : '⚪'} ${esc(h.title)}`); }
      L.push('<i>Tâm lý chỉ để tham khảo — chưa kiểm được lợi thế, vào lệnh vẫn theo setup bên dưới.</i>'); }
    L.push(`\n<b>1. Xu hướng EMA34/89</b>`);
    for (const e of R.ema) L.push(`• ${e.nm}: EMA34 ${f(e.e34)} ${e.dir > 0 ? '&gt;' : '&lt;'} EMA89 ${f(e.e89)} (${e.dir > 0 ? 'TĂNG ▲' : 'GIẢM ▼'}, cách nhau ${e.gap}) · giá ${e.pos} (${e.d34 >= 0 ? '+' : ''}${e.d34} so với EMA34, ${e.d89 >= 0 ? '+' : ''}${e.d89} so với EMA89) · EMA34 ${e.slope > 0.5 ? 'dốc lên' : e.slope < -0.5 ? 'dốc xuống' : 'đi ngang'}`);
    L.push(`→ <b>${esc(R.trendTxt)}</b>`);
    L.push(`\n<b>2. Thanh khoản đã quét (24h)</b>`);
    if (!R.swept.length) L.push('• Chưa mức nào bị lấy.');
    for (const s of R.swept.slice(0, 6)) L.push(`• ${hm(s.t)} ${s.back ? 'QUÉT' : 'PHÁ QUA'} ${esc(s.name)} ${f(s.p)} (râu tới ${f(s.ext)}, sâu ${s.deep} giá)${s.back ? ` rồi đóng lại → ${s.side > 0 ? 'BSL' : 'SSL'} đã bị lấy` : ' — nến đóng hẳn bên ngoài'}`);
    L.push(`Còn nguyên phía trên: ${R.above.map(z => `${esc(z.name)} ${f(z.p)} (+${z.dist})`).join(' · ') || '—'}`);
    L.push(`Còn nguyên phía dưới: ${R.below.map(z => `${esc(z.name)} ${f(z.p)} (−${z.dist})`).join(' · ') || '—'}`);
    L.push(`\n<b>3. Biên phiên Á</b>\n${esc(R.asiaTxt)}`);
    L.push(`\n<b>4. Chờ gì / vào ở đâu</b>`); for (const p of R.plans) L.push(esc(p.txt));
    if (R.warn.length) { L.push(`\n<b>5. Không vào khi</b>`); for (const w of R.warn) L.push(esc(w)); }
    if (R.ai) L.push(`\n🤖 AI: ${esc(R.ai.biasTxt)} · ${esc(R.ai.now)}`);
    L.push(`\n<i>0.01 lot cho TK 500$ · mỗi lúc 1 lệnh · thua 2 lệnh/ngày thì nghỉ. Không phải lời khuyên đầu tư.</i>`);
    return L.join('\n');
  }
  return { report, text, sessionOf, version };
});
