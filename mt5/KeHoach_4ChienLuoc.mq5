//+------------------------------------------------------------------+
//| KeHoach_4ChienLuoc.mq5 — 4 chiến lược của web tin-hieu cho MT5   |
//| CHỈ BÁO + VẼ LÊN CHART, KHÔNG TỰ ĐẶT LỆNH                        |
//|                                                                  |
//|  XH  Phá biên phiên Á theo xu hướng (EMA34/89 H4+H1 cùng chiều   |
//|      lúc 13h VN → M15 đóng ngoài biên Á → LIMIT retest mép biên, |
//|      SL max(0.3 biên, 1 ATR M15), TP 2R, 1.5R dời hoà vốn)       |
//|  VUNG Vùng S/R H4/H1 + quét M15 → MSS M15 (chấm điểm ≥ 2), TP 3R  |
//|  HS  Hồi sâu qua EMA89 ≥ 12 giá + quét swing M15 → TP 12 giá     |
//|  PBA Phá biên phiên Á: BUY/SELL STOP ngoài biên Á, TP 2.5R       |
//|                                                                  |
//| Tinh chỉnh theo kiểm lịch sử (web tin-hieu, 11–14/11/2026):      |
//|  VÀNG  (Dukascopy 2 năm): bật cả 4                               |
//|  BTC   (OKX 12 tháng): chỉ XH (mặc định) + PBA (TP 2R, SL ≤ 1%,  |
//|        biên ≤ 3%). VUNG lỗ mọi biến thể, HS không có lợi thế →   |
//|        tắt cho BTC.                                              |
//| Luật "không vào khi" (vàng, XH/VUNG/HS): 23h–7h VN, ±30 phút tin |
//| Mỹ quan trọng (lịch kinh tế MT5), đã thua 2 lệnh/ngày, đang có   |
//| lệnh khác → vẫn báo nhưng ghi "KHÔNG VÀO".                       |
//| Lot gợi ý cố định 0.01 — EA ghi rủi ro $ theo lot này.            |
//| Giờ: tự quy đổi giờ máy chủ → UTC → giờ VN (UTC+7).              |
//+------------------------------------------------------------------+
#property copyright "tin-hieu · Letuan"
#property version   "1.00"

input double InpLot          = 0.01;   // Lot gợi ý (chỉ để tính rủi ro $)
input double InpSpread       = 0;      // Spread giả định (giá). 0 = tự: vàng 0.35, BTC 18
input bool   InpPush         = true;   // Gửi thông báo lên MT5 điện thoại (nếu đã cài MetaQuotes ID)
input bool   InpSound        = true;   // Hộp Alert + âm thanh
input bool   InpUseNews      = true;   // Dùng lịch kinh tế MT5 để chặn ±30 phút tin USD quan trọng
input int    InpDrawDays     = 5;      // Vẽ tín hiệu trong N ngày gần nhất
input bool   InpDrawEMA      = true;   // Thêm EMA34/89 lên chart
input int    InpManualGMTOffsetH = -99;// Giờ máy chủ lệch GMT (giờ). -99 = tự tính

//--- dữ liệu
struct Bar { long t; long ct; double o, h, l, c; };
struct Piv { int i; double p; int conf; double r; };
struct Sig {
   string id; string strat; int side; long t; long ct; double entry, sl, tp, risk;
   string state; long fillT; long exitT; double exitP; double pts; string info; string gate; long expT;
   double rlo, rhi; bool plan;
};
struct Zone { double lo, hi, score; int touch, h4, h1; bool flip; };

bool   IS_XAU = false, IS_BTC = false;
double SP = 0.35;
long   GMTOFF = 0;           // giây: giờ máy chủ - UTC
datetime lastM5 = 0;
string PFX = "KH4_";
string seenKeys[];           // id|state đã báo
bool   firstRun = true;
Sig    SIGS[];
Zone   ZNOW[]; double ZA4 = 0;
long   newsT[]; string newsN[];

// tham số theo mã
bool   EN_XH = true, EN_VUNG = true, EN_HS = true, EN_PBA = true;
double PBA_rr = 2.5, PBA_cap = 0.6, PBA_maxPct = 1.6, PBA_minPct = 0.3;

//+------------------------------------------------------------------+
int OnInit()
{
   string s = _Symbol; StringToUpper(s);
   IS_XAU = StringFind(s, "XAU") >= 0 || StringFind(s, "GOLD") >= 0;
   IS_BTC = StringFind(s, "BTC") >= 0;
   if(!IS_XAU && !IS_BTC) { Alert("KeHoach_4ChienLuoc: chỉ dùng cho vàng (XAU) hoặc BTC. Mã hiện tại: ", _Symbol); }
   SP = InpSpread > 0 ? InpSpread : (IS_BTC ? 18.0 : 0.35);
   if(IS_BTC) { EN_VUNG = false; EN_HS = false; PBA_rr = 2.0; PBA_cap = 1.0; PBA_maxPct = 3.0; }
   if(InpManualGMTOffsetH != -99) GMTOFF = (long)InpManualGMTOffsetH * 3600;
   else { long d = (long)(TimeTradeServer() - TimeGMT()); GMTOFF = (long)MathRound(d / 1800.0) * 1800; }
   if(InpDrawEMA) {
      int h34 = iMA(_Symbol, _Period, 34, 0, MODE_EMA, PRICE_CLOSE), h89 = iMA(_Symbol, _Period, 89, 0, MODE_EMA, PRICE_CLOSE);
      if(h34 != INVALID_HANDLE) ChartIndicatorAdd(0, 0, h34);
      if(h89 != INVALID_HANDLE) ChartIndicatorAdd(0, 0, h89);
   }
   EventSetTimer(30);
   Recalc();
   return(INIT_SUCCEEDED);
}
void OnDeinit(const int reason) { EventKillTimer(); ObjectsDeleteAll(0, PFX); Comment(""); }
void OnTick()
{
   datetime t = iTime(_Symbol, PERIOD_M5, 0);
   if(t != lastM5) { lastM5 = t; Recalc(); }
}
void OnTimer() { datetime t = iTime(_Symbol, PERIOD_M5, 0); if(t != lastM5) { lastM5 = t; Recalc(); } }

//+------------------------------------------------------------------+
//| tiện ích                                                         |
//+------------------------------------------------------------------+
double HourF(long t) { long s = t % 86400; if(s < 0) s += 86400; return s / 3600.0; }
int    HourVN(long t) { return (int)(((t + 7 * 3600) % 86400) / 3600); }
long   DayOf(long t) { return t / 86400; }
string VNtime(long t) { MqlDateTime m; TimeToStruct((datetime)(t + 7 * 3600), m); return StringFormat("%02d:%02d %02d/%02d", m.hour, m.min, m.day, m.mon); }
string F(double v) { return DoubleToString(v, _Digits); }
int    Sgn(double v) { return v > 0 ? 1 : (v < 0 ? -1 : 0); }

bool LoadBars(ENUM_TIMEFRAMES tf, int count, Bar &out[])
{
   MqlRates r[]; ArraySetAsSeries(r, false);
   int n = CopyRates(_Symbol, tf, 1, count, r);   // chỉ nến đã đóng
   if(n <= 0) { ArrayResize(out, 0); return false; }
   ArrayResize(out, n); long ps = PeriodSeconds(tf);
   for(int i = 0; i < n; i++) { out[i].t = (long)r[i].time - GMTOFF; out[i].ct = out[i].t + ps; out[i].o = r[i].open; out[i].h = r[i].high; out[i].l = r[i].low; out[i].c = r[i].close; }
   return true;
}
void EmaArr(const Bar &c[], int p, double &o[])
{
   int n = ArraySize(c); ArrayResize(o, n); if(n == 0) return; double k = 2.0 / (p + 1); double e = c[0].c;
   for(int i = 0; i < n; i++) { e = i ? c[i].c * k + e * (1 - k) : c[0].c; o[i] = e; }
}
void AtrArr(const Bar &c[], int p, double &o[])
{
   int n = ArraySize(c); ArrayResize(o, n); if(n == 0) return; double a = c[0].h - c[0].l;
   for(int i = 0; i < n; i++) {
      double tr = i ? MathMax(c[i].h - c[i].l, MathMax(MathAbs(c[i].h - c[i-1].c), MathAbs(c[i].l - c[i-1].c))) : c[i].h - c[i].l;
      a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a;
   }
}
// giá trị khung lớn H (đã đóng, ct <= ct nến nhỏ) gắn vào từng nến nhỏ
void MapHTF(const Bar &c[], const Bar &H[], const double &v[], double &o[])
{
   int n = ArraySize(c), m = ArraySize(H); ArrayResize(o, n); int j = -1;
   for(int i = 0; i < n; i++) { while(j + 1 < m && H[j+1].ct <= c[i].ct) j++; o[i] = j >= 0 ? v[j] : EMPTY_VALUE; }
}
void Pivots(const Bar &c[], int L, Piv &PH[], Piv &PL[])
{
   ArrayResize(PH, 0); ArrayResize(PL, 0); int n = ArraySize(c);
   for(int i = L; i < n - L; i++) {
      bool ph = true, pl = true;
      for(int k = 1; k <= L; k++) { if(c[i-k].h >= c[i].h || c[i+k].h > c[i].h) ph = false; if(c[i-k].l <= c[i].l || c[i+k].l < c[i].l) pl = false; }
      if(ph) { int s = ArraySize(PH); ArrayResize(PH, s + 1); PH[s].i = i; PH[s].p = c[i].h; PH[s].conf = i + L; PH[s].r = 0; }
      if(pl) { int s = ArraySize(PL); ArrayResize(PL, s + 1); PL[s].i = i; PL[s].p = c[i].l; PL[s].conf = i + L; PL[s].r = 0; }
   }
}
int AddSig(Sig &arr[], const Sig &s) { int n = ArraySize(arr); ArrayResize(arr, n + 1); arr[n] = s; return n; }
void NewSig(Sig &s) { s.id = ""; s.strat = ""; s.side = 0; s.t = 0; s.ct = 0; s.entry = 0; s.sl = 0; s.tp = 0; s.risk = 0; s.state = ""; s.fillT = 0; s.exitT = 0; s.exitP = 0; s.pts = 0; s.info = ""; s.gate = ""; s.expT = 0; s.rlo = 0; s.rhi = 0; s.plan = false; }
void Finish(Sig &s, string st, double px, long t) { s.state = st; s.exitP = px; s.exitT = t; s.pts = s.side * (px - s.entry); }

//+------------------------------------------------------------------+
//| 1. XH — Phá biên Á theo xu hướng (xuhuong.js)                    |
//+------------------------------------------------------------------+
void RunXH(const Bar &c[], const Bar &m15[], const Bar &h1[], const Bar &h4[], Sig &out[])
{
   int n = ArraySize(c); if(n < 300 || ArraySize(m15) < 120 || ArraySize(h1) < 100 || ArraySize(h4) < 90) return;
   double v1a[], v1b[], v4a[], v4b[], e1a[], e1b[], e4a[], e4b[], a15[], A[];
   EmaArr(h1, 34, v1a); EmaArr(h1, 89, v1b); EmaArr(h4, 34, v4a); EmaArr(h4, 89, v4b);
   MapHTF(c, h1, v1a, e1a); MapHTF(c, h1, v1b, e1b); MapHTF(c, h4, v4a, e4a); MapHTF(c, h4, v4b, e4b);
   AtrArr(m15, 14, a15); MapHTF(c, m15, a15, A);
   long day = -1; double aH = 0, aL = 0; int T = 0; bool Tset = false, done = false; int qIdx = -1, qkb = 0;
   bool pos = false; int pIdx = -1, pd = 0; double psl = 0; bool pbe = false;
   for(int k = 1; k < n; k++) {
      Bar x = c[k]; long dk = DayOf(x.t); double h = HourF(x.t);
      if(dk != day) { day = dk; aH = -DBL_MAX; aL = DBL_MAX; Tset = false; T = 0; done = false; qIdx = -1; }
      if(pos) {
         Sig s = out[pIdx]; int d = pd; double lo = d > 0 ? x.l : x.l + SP, hi = d > 0 ? x.h : x.h + SP; bool closed = false;
         if(d > 0 ? lo <= psl : hi >= psl) { Finish(s, pbe ? "BE" : "LOSS", psl, x.ct); closed = true; }
         else if(d > 0 ? hi >= s.tp : lo <= s.tp) { Finish(s, "WIN", s.tp, x.ct); closed = true; }
         else {
            if(!pbe && (d > 0 ? hi >= s.entry + 1.5 * s.risk : lo <= s.entry - 1.5 * s.risk)) { pbe = true; psl = s.entry; }
            if(HourF(x.ct) >= 20) { Finish(s, "TIME", d > 0 ? x.c : x.c + SP, x.ct); closed = true; }
         }
         out[pIdx] = s; if(closed) pos = false;
      }
      if(h < 6) { aH = MathMax(aH, x.h); aL = MathMin(aL, x.l); continue; }
      if(!Tset) { Tset = true; if(e4a[k] != EMPTY_VALUE && e1a[k] != EMPTY_VALUE) { int d4 = Sgn(e4a[k] - e4b[k]), d1 = Sgn(e1a[k] - e1b[k]); T = d4 == d1 ? d4 : 0; } }
      double a = A[k]; if(T == 0 || done || a == EMPTY_VALUE || a <= 0 || aH == -DBL_MAX) continue;
      double lv = T > 0 ? aH : aL, rng = aH - aL; bool m15close = (x.ct % 900) == 0;
      if(qIdx < 0) {
         if(h < 15 && m15close && T * (x.c - lv) > 0) {
            double risk = MathMax(0.3 * rng, a); Sig s; NewSig(s);
            s.id = "XH-" + IntegerToString(x.t); s.strat = "XH"; s.side = T; s.t = x.t; s.ct = x.ct; s.entry = lv; s.sl = lv - T * risk; s.tp = lv + T * 2 * risk; s.risk = risk;
            s.state = "PENDING"; s.expT = c[MathMin(n - 1, k + 48)].ct; s.rlo = aL; s.rhi = aH; s.plan = true;
            s.info = StringFormat("EMA34/89 H4+H1 cung %s luc 13h VN · bien A %s–%s (%.1f gia) · M15 dong %s bien %s → LIMIT retest %s",
                     T > 0 ? "TANG" : "GIAM", F(aL), F(aH), rng, T > 0 ? "tren" : "duoi", F(x.c), F(lv));
            qIdx = AddSig(out, s); qkb = k;
         }
         continue;
      }
      Sig q = out[qIdx]; if(q.state != "PENDING") continue;
      if(T * ((T > 0 ? x.h : x.l) - q.tp) >= 0) { q.state = "EXPIRED"; q.exitT = x.ct; q.info += " · huy: gia chay toi TP truoc khi hoi ve"; done = true; out[qIdx] = q; continue; }
      if(k - qkb > 48) { q.state = "EXPIRED"; q.exitT = x.ct; q.info += " · huy: qua 4h khong hoi ve mep bien"; done = true; out[qIdx] = q; continue; }
      bool fill = T > 0 ? x.l + SP <= q.entry : x.h >= q.entry;
      if(fill) {
         done = true;
         if(pos) { q.state = "EXPIRED"; q.exitT = x.ct; q.info += " · bo: dang co lenh khac"; }
         else { q.state = "OPEN"; q.fillT = x.ct; pos = true; pIdx = qIdx; pd = T; psl = q.sl; pbe = false; }
         out[qIdx] = q;
      }
   }
}

//+------------------------------------------------------------------+
//| 2. PBA — Phá biên phiên Á (asianbo.js)                           |
//+------------------------------------------------------------------+
void RunPBA(const Bar &c[], const Bar &m15[], Sig &out[])
{
   int n = ArraySize(c); if(n < 100 || ArraySize(m15) < 30) return;
   double a15[]; AtrArr(m15, 14, a15); long bar = c[1].t - c[0].t; int minBars = (int)MathRound(60 * 300.0 / bar);
   int i = 0;
   while(i < n) {
      long k = DayOf(c[i].t); double hh = -DBL_MAX, ll = DBL_MAX; int nA = 0, j0 = -1, iEnd = i;
      while(iEnd < n && DayOf(c[iEnd].t) == k) { if(HourF(c[iEnd].t) < 6) { hh = MathMax(hh, c[iEnd].h); ll = MathMin(ll, c[iEnd].l); nA++; } else if(j0 < 0) j0 = iEnd; iEnd++; }
      if(nA >= minBars && j0 >= 0) {
         double mid = (hh + ll) / 2, w = hh - ll, pct = 100 * w / mid;
         if(pct >= PBA_minPct && pct <= PBA_maxPct) {
            int jj = -1; for(int u = 0; u < ArraySize(m15); u++) { if(m15[u].ct <= c[j0].t) jj = u; else break; }
            double a = a15[MathMax(0, jj)], buf = 0.1 * a, lvB = hh + buf, lvS = ll - buf; long endT = k * 86400 + 15 * 3600, exitAt = k * 86400 + 19 * 3600;
            for(int j = j0; j < n && c[j].t < endT; j++) {
               Bar z = c[j]; bool up = z.h + SP >= lvB, dn = z.l <= lvS; if(!up && !dn) continue; if(up && dn) break;
               int d = up ? 1 : -1; double entry = d > 0 ? lvB : lvS, slRaw = d > 0 ? ll - buf : hh + buf, cap = PBA_cap / 100 * entry;
               double sl0 = d * (entry - slRaw) > cap ? entry - d * cap : slRaw, risk = MathAbs(entry - sl0), tp = entry + d * PBA_rr * risk;
               Sig s; NewSig(s); s.id = "PBA-" + IntegerToString(k) + (d > 0 ? "B" : "S"); s.strat = "PBA"; s.side = d; s.t = z.t; s.ct = z.t + bar;
               s.entry = entry; s.sl = sl0; s.tp = tp; s.risk = risk; s.state = "OPEN"; s.fillT = z.t; s.rlo = ll; s.rhi = hh; s.plan = false;
               s.info = StringFormat("bien phien A %s–%s (%.2f%% gia) · %s STOP %s · SL %s · TP %.1fR · 1.5R doi hoa von · 2h sang VN dong", F(ll), F(hh), pct, d > 0 ? "BUY" : "SELL", F(entry), F(sl0), PBA_rr);
               double sl = sl0; bool be = false;
               if(d > 0 ? z.l <= sl : z.h + SP >= sl) Finish(s, "LOSS", sl, z.t + bar);
               else for(int u = j + 1; u < n; u++) {
                  Bar y = c[u]; double lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
                  if(y.t >= exitAt) { Finish(s, "TIME", d > 0 ? y.o : y.o + SP, y.t); break; }
                  if(d > 0 ? lo <= sl : hi >= sl) { Finish(s, be ? "BE" : "LOSS", sl, y.t + bar); break; }
                  if(d > 0 ? hi >= tp : lo <= tp) { Finish(s, "WIN", tp, y.t + bar); break; }
                  if(!be && (d > 0 ? y.h - entry : entry - lo) >= 1.5 * risk) { sl = entry + d * 0.1; be = true; s.sl = sl; }
               }
               AddSig(out, s); break;
            }
         }
      }
      i = iEnd;
   }
}

//+------------------------------------------------------------------+
//| 3. HS — Hồi sâu qua EMA89 (hoisau.js) — chỉ vàng                 |
//+------------------------------------------------------------------+
void RunHS(const Bar &c[], Sig &out[])
{
   int n = ArraySize(c); if(n < 200) return;
   double e34[], e89[], A[]; EmaArr(c, 34, e34); EmaArr(c, 89, e89); AtrArr(c, 14, A);
   Piv PH[], PL[]; Pivots(c, 2, PH, PL); int busy = -1;
   for(int k = 120; k < n; k++) {
      Bar x = c[k]; double a = A[k];
      for(int dd = 0; dd < 2; dd++) {
         int d = dd == 0 ? 1 : -1;
         if(k <= busy || d * (e34[k] - e89[k]) <= 0 || d * (x.c - e89[k]) > -12.0) continue;
         // swing gần nhất (xác nhận trước nến k, trong 24 nến)
         int si = -1; double sp = 0;
         if(d > 0) { for(int q = ArraySize(PL) - 1; q >= 0; q--) if(PL[q].conf <= k - 1 && PL[q].i >= k - 24 && PL[q].i < k) { si = PL[q].i; sp = PL[q].p; break; } }
         else      { for(int q = ArraySize(PH) - 1; q >= 0; q--) if(PH[q].conf <= k - 1 && PH[q].i >= k - 24 && PH[q].i < k) { si = PH[q].i; sp = PH[q].p; break; } }
         if(si < 0) continue;
         bool fresh = true; for(int u = si + 1; u < k; u++) if(d > 0 ? c[u].l < sp : c[u].h > sp) { fresh = false; break; }
         if(!fresh || !(d > 0 ? (x.l < sp && x.c > sp) : (x.h > sp && x.c < sp))) continue;
         double ext = d > 0 ? x.l : x.h, entry = x.c + (d > 0 ? SP : 0), sl = ext - d * 0.2 * a + (d < 0 ? SP : 0), risk = d * (entry - sl);
         if(risk < 12) { risk = 12; sl = entry - d * risk; } if(risk > 20) continue;
         double tp = entry + d * 12.0;
         Sig s; NewSig(s); s.id = "HS-" + IntegerToString(x.t) + (d > 0 ? "B" : "S"); s.strat = "HS"; s.side = d; s.t = x.t; s.ct = x.ct;
         s.entry = entry; s.sl = sl; s.tp = tp; s.risk = risk; s.state = "OPEN"; s.fillT = x.ct; s.plan = true;
         s.info = StringFormat("EMA34 %s EMA89 M15 · gia hoi qua EMA89 %.1f gia · quet %s swing M15 %s roi dong lai", d > 0 ? ">" : "<", MathAbs(x.c - e89[k]), d > 0 ? "day" : "dinh", F(sp));
         int u = k + 1;
         for(; u < MathMin(n, k + 96); u++) { Bar y = c[u]; double lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
            if(d > 0 ? lo <= sl : hi >= sl) { Finish(s, "LOSS", sl, y.ct); break; } if(d > 0 ? hi >= tp : lo <= tp) { Finish(s, "WIN", tp, y.ct); break; } }
         if(s.state == "OPEN" && k + 96 < n) { Bar y = c[k + 95]; Finish(s, "TIME", d > 0 ? y.c : y.c + SP, y.ct); u = k + 95; }
         busy = s.state == "OPEN" ? INT_MAX : u; AddSig(out, s); break;
      }
   }
}

//+------------------------------------------------------------------+
//| 4. VUNG — Vùng S/R H4/H1 + quét M15 → MSS (zones.js) — chỉ vàng  |
//+------------------------------------------------------------------+
struct ZPt { double p, w; int tf, k; };
struct Pend { int d; Zone z; int i0; double ex, lvl, a, a4; };
double React(const Bar &c[], const double &A[], int i, int kind)
{
   double m = 0; int n = ArraySize(c);
   for(int u = i + 1; u < MathMin(n, i + 13); u++) m = MathMax(m, kind > 0 ? c[i].h - c[u].l : c[u].h - c[i].l);
   return A[i] > 0 ? m / A[i] : 0;
}
void ZonesFrom(int k4, int k1, const Piv &P4H[], const Piv &P4L[], const Piv &P1H[], const Piv &P1L[], const double &A4[], Zone &Z[], double &a4)
{
   ArrayResize(Z, 0); a4 = 0; if(k4 < 30 || k1 < 30) return; a4 = A4[k4];
   ZPt pts[]; int np = 0;
   for(int s = 0; s < 4; s++) {
      int look = s < 2 ? 120 : 240, kk = s < 2 ? k4 : k1, tf = s < 2 ? 4 : 1; double w = s < 2 ? 2 : 1; int side = (s % 2 == 0) ? 1 : -1;
      int cnt = s == 0 ? ArraySize(P4H) : s == 1 ? ArraySize(P4L) : s == 2 ? ArraySize(P1H) : ArraySize(P1L);
      for(int q = 0; q < cnt; q++) {
         Piv pv; if(s == 0) pv = P4H[q]; else if(s == 1) pv = P4L[q]; else if(s == 2) pv = P1H[q]; else pv = P1L[q];
         if(pv.conf <= kk && pv.i >= kk - look) { ArrayResize(pts, np + 1); pts[np].p = pv.p; pts[np].w = w * (1 + MathMin(pv.r, 3) / 3); pts[np].tf = tf; pts[np].k = side; np++; }
      }
   }
   // sắp theo giá
   for(int a = 1; a < np; a++) { ZPt key = pts[a]; int b = a - 1; while(b >= 0 && pts[b].p > key.p) { pts[b+1] = pts[b]; b--; } pts[b+1] = key; }
   double sc[]; int nh4[], nh1[], hasH[], hasL[]; int nz = 0;
   for(int q = 0; q < np; q++) {
      if(nz > 0 && pts[q].p - Z[nz-1].hi <= 0.35 * a4) {
         Z[nz-1].hi = MathMax(Z[nz-1].hi, pts[q].p);
      } else {
         nz++; ArrayResize(Z, nz); ArrayResize(sc, nz); ArrayResize(nh4, nz); ArrayResize(nh1, nz); ArrayResize(hasH, nz); ArrayResize(hasL, nz);
         Z[nz-1].lo = pts[q].p; Z[nz-1].hi = pts[q].p; sc[nz-1] = 0; nh4[nz-1] = 0; nh1[nz-1] = 0; hasH[nz-1] = 0; hasL[nz-1] = 0;
      }
      sc[nz-1] += pts[q].w; if(pts[q].tf == 4) nh4[nz-1]++; else nh1[nz-1]++; if(pts[q].k > 0) hasH[nz-1] = 1; else hasL[nz-1] = 1;
   }
   for(int z = 0; z < nz; z++) {
      if(Z[z].hi - Z[z].lo < 0.2 * a4) { double m = (Z[z].lo + Z[z].hi) / 2; Z[z].lo = m - 0.1 * a4; Z[z].hi = m + 0.1 * a4; }
      Z[z].h4 = nh4[z]; Z[z].h1 = nh1[z]; Z[z].touch = nh4[z] + nh1[z]; Z[z].flip = (hasH[z] != 0 && hasL[z] != 0);
      Z[z].score = sc[z] + ((nh4[z] > 0 && nh1[z] > 0) ? 1 : 0) + (Z[z].flip ? 1 : 0);
   }
}
void RunVUNG(const Bar &m5[], const Bar &m15[], const Bar &h1[], const Bar &h4[], Sig &out[])
{
   int n15 = ArraySize(m15), nh1 = ArraySize(h1), nh4 = ArraySize(h4); if(nh1 < 200 || n15 < 200 || nh4 < 40) return;
   double A4[], A1[], A15[]; AtrArr(h4, 14, A4); AtrArr(h1, 14, A1); AtrArr(m15, 14, A15);
   Piv P4H[], P4L[], P1H[], P1L[], P15H[], P15L[]; Pivots(h4, 3, P4H, P4L); Pivots(h1, 4, P1H, P1L); Pivots(m15, 2, P15H, P15L);
   for(int q = 0; q < ArraySize(P4H); q++) P4H[q].r = React(h4, A4, P4H[q].i, 1);  for(int q = 0; q < ArraySize(P4L); q++) P4L[q].r = React(h4, A4, P4L[q].i, -1);
   for(int q = 0; q < ArraySize(P1H); q++) P1H[q].r = React(h1, A1, P1H[q].i, 1);  for(int q = 0; q < ArraySize(P1L); q++) P1L[q].r = React(h1, A1, P1L[q].i, -1);
   double E34[], E89[], F34[], F89[]; EmaArr(m15, 34, E34); EmaArr(m15, 89, E89); EmaArr(h4, 34, F34); EmaArr(h4, 89, F89);
   Zone Z[]; double a4 = 0; int k4 = -1, k1 = -1; bool have = false;
   Pend pend[]; int usedK[]; long usedT[];
   Pend cand[]; int candI[];
   for(int i = 120; i < n15; i++) {
      Bar x = m15[i]; double a = A15[i-1]; bool ch = false;
      while(k4 + 1 < nh4 && h4[k4+1].ct <= x.t) { k4++; ch = true; } while(k1 + 1 < nh1 && h1[k1+1].ct <= x.t) { k1++; ch = true; }
      if(ch || !have) { ZonesFrom(k4, k1, P4H, P4L, P1H, P1L, A4, Z, a4); have = true; }
      if(a4 <= 0) continue; Bar prev = m15[i-1];
      for(int z = 0; z < ArraySize(Z); z++) {
         if(Z[z].score < 4) continue; int key = (int)MathRound(Z[z].lo / (0.2 * a4)); long until = 0; int ui = -1;
         for(int u = 0; u < ArraySize(usedK); u++) if(usedK[u] == key) { ui = u; until = usedT[u]; break; }
         if(until > x.t) continue;
         for(int dd = 0; dd < 2; dd++) {
            int d = dd == 0 ? 1 : -1; bool hit = false;
            if(d > 0) hit = prev.l > Z[z].lo && x.l < Z[z].lo - 0.05 * a && x.l > Z[z].lo - 0.6 * a4 && x.c > Z[z].lo;
            else      hit = prev.h < Z[z].hi && x.h > Z[z].hi + 0.05 * a && x.h < Z[z].hi + 0.6 * a4 && x.c < Z[z].hi;
            if(!hit) continue;
            double lvl = 0; bool got = false;
            if(d > 0) { for(int q = ArraySize(P15H) - 1; q >= 0; q--) if(P15H[q].conf <= i && P15H[q].i < i && P15H[q].i >= i - 24) { lvl = P15H[q].p; got = true; break; } if(!got) { lvl = -DBL_MAX; for(int u = i - 6; u < i; u++) lvl = MathMax(lvl, m15[u].h); } }
            else      { for(int q = ArraySize(P15L) - 1; q >= 0; q--) if(P15L[q].conf <= i && P15L[q].i < i && P15L[q].i >= i - 24) { lvl = P15L[q].p; got = true; break; } if(!got) { lvl = DBL_MAX; for(int u = i - 6; u < i; u++) lvl = MathMin(lvl, m15[u].l); } }
            int np = ArraySize(pend); ArrayResize(pend, np + 1); pend[np].d = d; pend[np].z = Z[z]; pend[np].i0 = i; pend[np].ex = d > 0 ? x.l : x.h; pend[np].lvl = lvl; pend[np].a = a; pend[np].a4 = a4;
            if(ui < 0) { ui = ArraySize(usedK); ArrayResize(usedK, ui + 1); ArrayResize(usedT, ui + 1); usedK[ui] = key; }
            usedT[ui] = x.t + 12 * 3600;
         }
      }
      Pend keep[]; int nk = 0;
      for(int p = 0; p < ArraySize(pend); p++) {
         Pend P = pend[p];
         if(i == P.i0) { ArrayResize(keep, nk + 1); keep[nk++] = P; continue; }
         int d = P.d; double edge = d > 0 ? P.z.lo : P.z.hi;
         P.ex = d > 0 ? MathMin(P.ex, x.l) : MathMax(P.ex, x.h);
         if(d * (x.c - edge) < 0) continue;
         if(d * (P.ex - edge) < -0.6 * P.a4) continue;
         if(d * (x.c - P.lvl) > 0) { int nc = ArraySize(cand); ArrayResize(cand, nc + 1); ArrayResize(candI, nc + 1); cand[nc] = P; candI[nc] = i; continue; }
         if(i - P.i0 < 16) { ArrayResize(keep, nk + 1); keep[nk++] = P; }
      }
      ArrayResize(pend, nk); for(int p = 0; p < nk; p++) pend[p] = keep[p];
   }
   // vùng hiện tại (để vẽ)
   ArrayResize(ZNOW, 0); ZA4 = 0;
   { int K4 = -1, K1 = -1; long lct = m15[n15-1].ct; while(K4 + 1 < nh4 && h4[K4+1].ct <= lct) K4++; while(K1 + 1 < nh1 && h1[K1+1].ct <= lct) K1++;
     Zone Zn[]; double an = 0; ZonesFrom(K4, K1, P4H, P4L, P1H, P1L, A4, Zn, an); ZA4 = an; double px = m15[n15-1].c;
     for(int z = 0; z < ArraySize(Zn); z++) if(Zn[z].score >= 4 && MathAbs((Zn[z].lo + Zn[z].hi) / 2 - px) < 6 * an) { int s = ArraySize(ZNOW); ArrayResize(ZNOW, s + 1); ZNOW[s] = Zn[z]; } }
   // vào lệnh + mô phỏng
   long busyT = 0; int n5 = ArraySize(m5);
   for(int q = 0; q < ArraySize(cand); q++) {
      Pend P = cand[q]; int iC = candI[q]; Bar x = m15[iC]; int d = P.d;
      int trend = Sgn(E34[iC] - E89[iC]); int k4b = -1; for(int u = 0; u < nh4; u++) { if(h4[u].ct <= x.ct) k4b = u; else break; }
      int t4 = k4b < 0 ? 0 : Sgn(F34[k4b] - F89[k4b]); int h = HourVN(x.ct), bars = iC - P.i0, ai = 0; string why = "";
      if(trend == -d) { ai++; why += "nguoc M15 +1, "; } if(t4 == d) { ai++; why += "thuan H4 +1, "; }
      if(h == 8 || h == 9 || (h >= 19 && h <= 22)) { ai++; why += "gio manh +1, "; } if(h == 3 || h == 4 || h == 10 || h == 11) { ai--; why += "gio chet -1, "; }
      if(bars <= 4) { ai++; why += "MSS nhanh +1"; }
      double entry = d > 0 ? x.c + SP : x.c, sl = P.ex - d * (0.2 * P.a + (d < 0 ? SP : 0)), risk = d * (entry - sl), tp = entry + d * 3 * risk;
      if(!(risk > 0.3 * P.a) || risk > 1.5 * P.a4 || ai < 2 || x.ct < busyT) continue;
      Sig s; NewSig(s); s.id = "VUNG-" + IntegerToString(m15[P.i0].t) + (d > 0 ? "B" : "S"); s.strat = "VUNG"; s.side = d; s.t = m15[P.i0].t; s.ct = x.ct;
      s.entry = entry; s.sl = sl; s.tp = tp; s.risk = risk; s.state = "OPEN"; s.fillT = x.ct; s.rlo = P.z.lo; s.rhi = P.z.hi; s.plan = true;
      s.info = StringFormat("vung %s H4/H1 %s–%s (%.1f diem) · quet %s · MSS M15 %s sau %d nen · AI %d diem (%s) · TP 3R",
               d > 0 ? "ho tro" : "khang cu", F(P.z.lo), F(P.z.hi), P.z.score, F(P.ex), F(P.lvl), bars, ai, why);
      // mô phỏng trên M5 nếu có
      int j0 = -1; for(int u = 0; u < n5; u++) if(m5[u].t == x.ct) { j0 = u; break; }
      bool useM5 = j0 >= 0; int hold = useM5 ? 288 : 96; if(!useM5) j0 = iC + 1;
      int u = j0; int nB = useM5 ? n5 : n15;
      for(; u < MathMin(nB, j0 + hold); u++) { Bar y = useM5 ? m5[u] : m15[u]; double lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
         if(d > 0 ? lo <= sl : hi >= sl) { Finish(s, "LOSS", sl, y.ct); break; } if(d > 0 ? hi >= tp : lo <= tp) { Finish(s, "WIN", tp, y.ct); break; } }
      if(s.state == "OPEN" && u >= j0 + hold && u - 1 < nB) { Bar y = useM5 ? m5[u-1] : m15[u-1]; Finish(s, "TIME", d > 0 ? y.c : y.c + SP, y.ct); }
      busyT = s.state == "OPEN" ? LONG_MAX : s.exitT; AddSig(out, s);
   }
}

//+------------------------------------------------------------------+
//| luật "không vào khi" (vàng, XH/VUNG/HS)                          |
//+------------------------------------------------------------------+
void LoadNews()
{
   ArrayResize(newsT, 0); ArrayResize(newsN, 0); if(!InpUseNews) return;
   MqlCalendarValue v[]; datetime from = TimeTradeServer() - 3 * 86400, to = TimeTradeServer() + 3 * 86400;
   if(CalendarValueHistory(v, from, to, "US") <= 0) return;
   for(int i = 0; i < ArraySize(v); i++) { MqlCalendarEvent e; if(!CalendarEventById(v[i].event_id, e)) continue; if(e.importance != CALENDAR_IMPORTANCE_HIGH) continue;
      int s = ArraySize(newsT); ArrayResize(newsT, s + 1); ArrayResize(newsN, s + 1); newsT[s] = (long)v[i].time - GMTOFF; newsN[s] = e.name; }
}
void ApplyGates(Sig &arr[])
{
   if(!IS_XAU) return;
   for(int i = 0; i < ArraySize(arr); i++) {
      if(!arr[i].plan) continue; long t = arr[i].ct; int h = HourVN(t); string g = "";
      if(h >= 23 || h < 7) g = "ngoai gio 23h-7h VN";
      if(g == "") for(int k = 0; k < ArraySize(newsT); k++) if(MathAbs((double)(newsT[k] - t)) <= 1800) { g = "sat tin " + newsN[k]; break; }
      if(g == "") { long d0 = (t + 7 * 3600) / 86400; int loss = 0;
         for(int k = 0; k < ArraySize(arr); k++) if(k != i && arr[k].plan && arr[k].gate == "" && arr[k].state == "LOSS" && arr[k].exitT > 0 && arr[k].exitT <= t && (arr[k].exitT + 7 * 3600) / 86400 == d0) loss++;
         if(loss >= 2) g = "da thua 2 lenh hom nay"; }
      if(g == "") for(int k = 0; k < ArraySize(arr); k++) if(k != i && arr[k].plan && arr[k].gate == "" && arr[k].fillT > 0 && arr[k].fillT < t && (arr[k].exitT == 0 || arr[k].exitT > t)) { g = "dang co lenh khac cua ke hoach"; break; }
      arr[i].gate = g;
   }
}

//+------------------------------------------------------------------+
//| vẽ + báo                                                         |
//+------------------------------------------------------------------+
datetime SV(long utc) { return (datetime)(utc + GMTOFF); }
void Rect(string nm, long t1, double p1, long t2, double p2, color col, bool back = true)
{
   if(ObjectFind(0, nm) < 0) ObjectCreate(0, nm, OBJ_RECTANGLE, 0, SV(t1), p1, SV(t2), p2);
   ObjectSetInteger(0, nm, OBJPROP_TIME, 0, SV(t1)); ObjectSetDouble(0, nm, OBJPROP_PRICE, 0, p1); ObjectSetInteger(0, nm, OBJPROP_TIME, 1, SV(t2)); ObjectSetDouble(0, nm, OBJPROP_PRICE, 1, p2);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, col); ObjectSetInteger(0, nm, OBJPROP_FILL, true); ObjectSetInteger(0, nm, OBJPROP_BACK, back); ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
}
void Txt(string nm, long t, double p, string s, color col, int sz = 8)
{
   if(ObjectFind(0, nm) < 0) ObjectCreate(0, nm, OBJ_TEXT, 0, SV(t), p);
   ObjectSetInteger(0, nm, OBJPROP_TIME, 0, SV(t)); ObjectSetDouble(0, nm, OBJPROP_PRICE, 0, p); ObjectSetString(0, nm, OBJPROP_TEXT, s);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, col); ObjectSetInteger(0, nm, OBJPROP_FONTSIZE, sz); ObjectSetString(0, nm, OBJPROP_FONT, "Arial"); ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
}
void HLine(string nm, long t1, long t2, double p, color col, int style)
{
   if(ObjectFind(0, nm) < 0) ObjectCreate(0, nm, OBJ_TREND, 0, SV(t1), p, SV(t2), p);
   ObjectSetInteger(0, nm, OBJPROP_TIME, 0, SV(t1)); ObjectSetDouble(0, nm, OBJPROP_PRICE, 0, p); ObjectSetInteger(0, nm, OBJPROP_TIME, 1, SV(t2)); ObjectSetDouble(0, nm, OBJPROP_PRICE, 1, p);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, col); ObjectSetInteger(0, nm, OBJPROP_STYLE, style); ObjectSetInteger(0, nm, OBJPROP_RAY_RIGHT, false); ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
}
string StratName(string s) { return s == "XH" ? "Pha bien A theo xu huong" : s == "VUNG" ? "Vung S/R H4/H1" : s == "HS" ? "Hoi sau qua EMA89" : "Pha bien phien A"; }
string StateVI(string s) { return s == "PENDING" ? "CHO KHOP (LIMIT)" : s == "OPEN" ? "DANG CHAY" : s == "WIN" ? "CHAM TP" : s == "LOSS" ? "DINH SL" : s == "BE" ? "HOA VON" : s == "TIME" ? "DONG THEO GIO" : s == "EXPIRED" ? "HUY" : s; }
double RiskUSD(double pts)
{
   double tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE), ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   return ts > 0 ? pts / ts * tv * InpLot : 0;
}
void Notify(const Sig &s)
{
   string key = s.id + "|" + s.state;
   for(int i = 0; i < ArraySize(seenKeys); i++) if(seenKeys[i] == key) return;
   int n = ArraySize(seenKeys); ArrayResize(seenKeys, n + 1); seenKeys[n] = key;
   if(firstRun) return;                                   // lần đầu chỉ ghi nhớ, không báo dồn
   string side = s.side > 0 ? "BUY" : "SELL", head = _Symbol + " · " + StratName(s.strat) + " · " + side;
   string msg;
   if(s.state == "PENDING" || (s.state == "OPEN" && s.strat != "XH"))
      msg = StringFormat("%s %s %s | Entry %s SL %s TP %s | %.2f lot ~ %.0f$ rui ro", head, s.state == "PENDING" ? "LIMIT" : "VAO NGAY", s.gate != "" ? "[KHONG VAO: " + s.gate + "]" : "",
                         F(s.entry), F(s.sl), F(s.tp), InpLot, RiskUSD(s.risk));
   else msg = StringFormat("%s → %s%s", head, StateVI(s.state), s.state == "WIN" || s.state == "LOSS" || s.state == "TIME" || s.state == "BE" ? StringFormat(" (%+.1f gia ~ %+.0f$)", s.pts, RiskUSD(s.pts)) : "");
   if(InpSound) Alert(msg); else Print(msg);
   if(InpPush) SendNotification(msg);
}
void Draw(const Sig &arr[])
{
   ObjectsDeleteAll(0, PFX); long now = (long)TimeTradeServer() - GMTOFF, from = now - InpDrawDays * 86400;
   for(int i = 0; i < ArraySize(arr); i++) {
      Sig s = arr[i]; if(s.ct < from) continue;
      long t1 = s.fillT > 0 ? s.fillT : s.ct, t2 = s.exitT > 0 ? s.exitT : (s.state == "PENDING" ? (long)MathMax((double)s.expT, (double)now) : now); if(t2 <= t1) t2 = t1 + 900;
      string nm = PFX + s.id;
      color cTP = s.gate != "" ? clrDarkSlateGray : C'20,90,50', cSL = s.gate != "" ? clrDimGray : C'110,30,30';
      Rect(nm + "_tp", t1, s.entry, t2, s.tp, cTP); Rect(nm + "_sl", t1, s.entry, t2, s.sl, cSL);
      if(s.rhi > 0 && (s.strat == "XH" || s.strat == "PBA")) Rect(nm + "_asia", (s.t / 86400) * 86400, s.rlo, (s.t / 86400) * 86400 + 6 * 3600, s.rhi, C'60,50,10');
      if(s.strat == "VUNG") Rect(nm + "_zone", s.t - 4 * 3600, s.rlo, t1, s.rhi, C'40,40,80');
      string lab = StringFormat("%s %s %s @%s | %s%s", s.strat, s.side > 0 ? "BUY" : "SELL", s.state == "PENDING" ? "LIMIT" : "", F(s.entry), StateVI(s.state), s.gate != "" ? " | KHONG VAO: " + s.gate : "");
      Txt(nm + "_lb", t1, s.side > 0 ? MathMax(s.tp, s.entry) : MathMin(s.tp, s.entry), lab, s.gate != "" ? clrSilver : (s.side > 0 ? clrLime : clrTomato), 8);
   }
   // vùng H4/H1 hiện tại
   for(int z = 0; z < ArraySize(ZNOW); z++) { string nm = PFX + "Z" + IntegerToString(z); Rect(nm, now - 3 * 86400, ZNOW[z].lo, now + 86400, ZNOW[z].hi, C'45,45,90');
      Txt(nm + "_t", now - 3 * 86400, ZNOW[z].hi, StringFormat("Vung H4/H1 %.1f diem (%d lan cham%s)", ZNOW[z].score, ZNOW[z].touch, ZNOW[z].flip ? ", doi vai" : ""), clrLightSteelBlue, 7); }
   ChartRedraw();
}

//+------------------------------------------------------------------+
void Recalc()
{
   Bar m5[], m15[], h1[], h4[];
   if(!LoadBars(PERIOD_M5, 2500, m5) || !LoadBars(PERIOD_M15, 3000, m15) || !LoadBars(PERIOD_H1, 2200, h1) || !LoadBars(PERIOD_H4, 700, h4)) { Comment("KeHoach_4ChienLuoc: dang tai lich su M5/M15/H1/H4..."); return; }
   LoadNews();
   Sig arr[];
   if(EN_XH)   RunXH(m5, m15, h1, h4, arr);
   if(EN_PBA)  RunPBA(m5, m15, arr);
   if(EN_HS)   RunHS(m15, arr);
   if(EN_VUNG) RunVUNG(m5, m15, h1, h4, arr);
   ApplyGates(arr);
   ArrayResize(SIGS, ArraySize(arr)); for(int i = 0; i < ArraySize(arr); i++) SIGS[i] = arr[i];
   long now = (long)TimeTradeServer() - GMTOFF;
   for(int i = 0; i < ArraySize(arr); i++) if(arr[i].ct > now - 2 * 86400) Notify(arr[i]);
   firstRun = false;
   Draw(arr);
   // bảng tóm tắt
   double e1a[], e1b[], e4a[], e4b[], e15a[], e15b[]; EmaArr(h1, 34, e1a); EmaArr(h1, 89, e1b); EmaArr(h4, 34, e4a); EmaArr(h4, 89, e4b); EmaArr(m15, 34, e15a); EmaArr(m15, 89, e15b);
   int n1 = ArraySize(h1) - 1, n4 = ArraySize(h4) - 1, n15 = ArraySize(m15) - 1;
   int d4 = Sgn(e4a[n4] - e4b[n4]), d1 = Sgn(e1a[n1] - e1b[n1]), d15 = Sgn(e15a[n15] - e15b[n15]);
   string txt = StringFormat("KE HOACH 4 CHIEN LUOC · %s · gio may chu GMT%+.1f · lot goi y %.2f\n", _Symbol, GMTOFF / 3600.0, InpLot);
   txt += StringFormat("EMA34/89: H4 %s · H1 %s · M15 %s → %s\n", d4 > 0 ? "TANG" : "GIAM", d1 > 0 ? "TANG" : "GIAM", d15 > 0 ? "TANG" : "GIAM",
                       d4 == d1 ? (d4 > 0 ? "chi tim BUY (XH)" : "chi tim SELL (XH)") : "H4/H1 lech nhau → nghi XH");
   txt += StringFormat("Bat: %s%s%s%s\n", EN_XH ? "XH " : "", EN_VUNG ? "VUNG " : "", EN_HS ? "HS " : "", EN_PBA ? StringFormat("PBA(TP %.1fR) ", PBA_rr) : "");
   int shown = 0;
   for(int i = ArraySize(arr) - 1; i >= 0 && shown < 6; i--) { if(arr[i].ct < now - 3 * 86400) continue; shown++;
      txt += StringFormat("%s %s %s %s @%s SL %s TP %s → %s%s\n", VNtime(arr[i].ct), arr[i].strat, arr[i].side > 0 ? "BUY" : "SELL", arr[i].state == "PENDING" ? "LIMIT" : "", F(arr[i].entry), F(arr[i].sl), F(arr[i].tp), StateVI(arr[i].state), arr[i].gate != "" ? " [khong vao: " + arr[i].gate + "]" : ""); }
   if(!shown) txt += "Chua co tin hieu trong 3 ngay qua.\n";
   for(int k = 0; k < ArraySize(newsT); k++) if(newsT[k] > now && newsT[k] < now + 86400) txt += "Tin My: " + VNtime(newsT[k]) + " " + newsN[k] + " (khong vao ±30 phut)\n";
   txt += "EA CHI BAO + VE, KHONG TU DAT LENH. Khong phai loi khuyen dau tu.";
   Comment(txt);
}
//+------------------------------------------------------------------+
