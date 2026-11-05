//+------------------------------------------------------------------+
//| EMA_Hoi_ICT.mq5 — EA "EMA hồi" (ICT/SMC) cho XAUUSD                 |
//| Chuỗi vào lệnh (giống nhật ký web tin-hieu / emapb.js):           |
//|  1. Xu hướng: EMA34 M30 > EMA89 M30 → chỉ BUY; < → chỉ SELL         |
//|  2. Giá HỒI về EMA34 (chạm EMA34, không thủng EMA89 quá 1 ATR M15)  |
//|     và QUÉT thanh khoản: đáy hồi thủng đáy swing M5 trước (SSL) /   |
//|     đỉnh hồi vượt đỉnh swing M5 trước (BSL)                         |
//|  3. PHÁ VỠ cấu trúc M5 (MSS/BOS): nến M5 đóng cửa vượt đỉnh/đáy     |
//|     swing gần nhất trước điểm hồi                                   |
//|  4. Nhịp phá vỡ có FVG M5 → VÀO NGAY ở nến kế tiếp                  |
//|  SL: ngoài đáy/đỉnh quét + 0.3 ATR M15 + spread · TP: 2R            |
//|  Chỉ vào trong giờ VN: 0,8,11,12,14,17,20,21 (thắng cao nhất)       |
//| Kiểm tra 12 tháng (OKX, 0.02 lot): giờ lọc 192 lệnh, thắng 48%.     |
//| KHÔNG đảm bảo lời — chạy thử DEMO trước khi dùng tiền thật.         |
//+------------------------------------------------------------------+
#property copyright "tin-hieu V4 — EMA hoi"
#property version   "1.00"
#include <Trade/Trade.mqh>

input group "=== Khối lượng & rủi ro ==="
input double InpRiskPct      = 0.5;    // Rủi ro mỗi lệnh (% số dư). 0 = dùng lot cố định
input double InpFixedLot     = 0.01;   // Lot cố định (khi rủi ro % = 0)
input double InpMaxLot       = 0.10;   // Lot tối đa mỗi lệnh
input double InpRR           = 2.0;    // TP = RR × khoảng SL
input int    InpMaxPositions = 1;      // Số lệnh mở cùng lúc tối đa (EA này)
input int    InpMaxTradesDay = 4;      // Số lệnh tối đa mỗi ngày
input double InpMaxDailyLoss = 2.0;    // Ngừng vào lệnh trong ngày nếu lỗ ≥ % số dư (0 = tắt)
input double InpMaxSpreadUSD = 0.60;   // Không vào nếu spread > (giá)
input int    InpHoldHours    = 48;     // Đóng lệnh sau tối đa (giờ)

input group "=== Cấu trúc ICT/SMC ==="
input ENUM_TIMEFRAMES InpEmaTF = PERIOD_M30; // Khung EMA34/89
input int    InpLookBars   = 36;   // Tìm điểm hồi trong N nến M5 gần nhất
input int    InpPivotL     = 2;    // Swing M5: số nến mỗi bên
input double InpTouchATR   = 0.1;  // Chạm EMA34: cho phép cách ≤ x ATR
input double InpDeepATR    = 1.0;  // Không thủng EMA89 quá x ATR
input double InpSlATR      = 0.3;  // Đệm SL ngoài điểm quét (× ATR M15)
input bool   InpNeedSweep  = true; // Bắt buộc quét SSL/BSL
input bool   InpNeedFVG    = true; // Bắt buộc có FVG M5 trong nhịp phá

input group "=== Giờ vào lệnh (giờ Việt Nam) ==="
input bool   InpUseHours   = true;
input string InpHoursVN    = "0,8,11,12,14,17,20,21";

input group "=== Khác ==="
input long   InpMagic      = 34895;
input bool   InpAlertOnly  = false; // true = chỉ báo (Alert/Push), KHÔNG vào lệnh

CTrade trade;
int    hE34 = INVALID_HANDLE, hE89 = INVALID_HANDLE;
bool   hourOK[24];
datetime lastBar = 0, usedPullBuy = 0, usedPullSell = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   hE34 = iMA(_Symbol, InpEmaTF, 34, 0, MODE_EMA, PRICE_CLOSE);
   hE89 = iMA(_Symbol, InpEmaTF, 89, 0, MODE_EMA, PRICE_CLOSE);
   if(hE34 == INVALID_HANDLE || hE89 == INVALID_HANDLE) { Print("Không tạo được EMA"); return INIT_FAILED; }
   for(int h = 0; h < 24; h++) hourOK[h] = !InpUseHours;
   if(InpUseHours)
   {
      string parts[]; int n = StringSplit(InpHoursVN, ',', parts);
      for(int i = 0; i < n; i++) { string s = parts[i]; StringTrimLeft(s); StringTrimRight(s); int h = (int)StringToInteger(s); if(h >= 0 && h < 24) hourOK[h] = true; }
   }
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(50);
   if(StringFind(_Symbol, "XAU") < 0) Print("CẢNH BÁO: EA được kiểm tra cho vàng (XAUUSD). Symbol hiện tại: ", _Symbol);
   Print("EMA hồi ICT khởi động · rủi ro ", DoubleToString(InpRiskPct, 2), "% · giờ VN ", InpHoursVN, InpAlertOnly ? " · CHỈ BÁO" : "");
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason) { if(hE34 != INVALID_HANDLE) IndicatorRelease(hE34); if(hE89 != INVALID_HANDLE) IndicatorRelease(hE89); }

//+------------------------------------------------------------------+
// giờ VN của một thời điểm máy chủ
int HourVN(datetime srv)
{
   long off = (long)(TimeTradeServer() - TimeGMT());           // độ lệch máy chủ so với GMT (giây)
   off = (long)MathRound(off / 1800.0) * 1800;
   datetime vn = (datetime)(srv - off + 7 * 3600);
   MqlDateTime t; TimeToStruct(vn, t); return t.hour;
}
// ATR kiểu Wilder 14 trên M15, tính tới nến M15 đã đóng trước thời điểm t
double AtrM15(datetime t)
{
   MqlRates r[]; ArraySetAsSeries(r, false);
   int sh = iBarShift(_Symbol, PERIOD_M15, t, false); if(sh < 0) return 0;
   int got = CopyRates(_Symbol, PERIOD_M15, sh + 1, 300, r); if(got < 30) return 0;
   double a = r[0].high - r[0].low;
   for(int i = 0; i < got; i++)
   {
      double tr = (i == 0) ? r[i].high - r[i].low : MathMax(r[i].high - r[i].low, MathMax(MathAbs(r[i].high - r[i-1].close), MathAbs(r[i].low - r[i-1].close)));
      a = (i < 14) ? (a * i + tr) / (i + 1) : (a * 13 + tr) / 14;
   }
   return a;
}
// EMA khung lớn đã đóng tại thời điểm đóng nến M5 (ct)
bool EmaAt(datetime ct, double &e34, double &e89)
{
   int sh = iBarShift(_Symbol, InpEmaTF, ct, false); if(sh < 0) return false;
   double a[1], b[1];
   if(CopyBuffer(hE34, 0, sh + 1, 1, a) != 1 || CopyBuffer(hE89, 0, sh + 1, 1, b) != 1) return false;
   e34 = a[0]; e89 = b[0]; return true;
}
int CountMine()
{
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--) { ulong tk = PositionGetTicket(i); if(tk > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == InpMagic) n++; }
   return n;
}
void TodayStats(int &trades, double &pl)
{
   trades = 0; pl = 0;
   MqlDateTime d; TimeToStruct(TimeTradeServer(), d); d.hour = 0; d.min = 0; d.sec = 0;
   if(!HistorySelect(StructToTime(d), TimeTradeServer() + 60)) return;
   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
   {
      ulong tk = HistoryDealGetTicket(i); if(tk == 0) continue;
      if(HistoryDealGetInteger(tk, DEAL_MAGIC) != InpMagic || HistoryDealGetString(tk, DEAL_SYMBOL) != _Symbol) continue;
      long en = HistoryDealGetInteger(tk, DEAL_ENTRY);
      if(en == DEAL_ENTRY_IN) trades++;
      if(en == DEAL_ENTRY_OUT) pl += HistoryDealGetDouble(tk, DEAL_PROFIT) + HistoryDealGetDouble(tk, DEAL_SWAP) + HistoryDealGetDouble(tk, DEAL_COMMISSION);
   }
}
double LotFor(double riskPrice)
{
   double lot = InpFixedLot;
   if(InpRiskPct > 0)
   {
      double tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE), ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      if(tv <= 0 || ts <= 0) return 0;
      double perLot = riskPrice / ts * tv;                       // tiền mất mỗi 1 lot nếu chạm SL
      lot = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPct / 100.0 / perLot;
   }
   double st = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), mn = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), mx = MathMin(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX), InpMaxLot);
   lot = MathFloor(lot / st) * st;
   if(lot < mn) { PrintFormat("Lot tính ra %.3f < tối thiểu %.2f (vốn nhỏ so với SL) → bỏ lệnh", lot, mn); return 0; }
   return MathMin(lot, mx);
}
void CloseOld()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i); if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      if(TimeCurrent() - (datetime)PositionGetInteger(POSITION_TIME) >= InpHoldHours * 3600) { trade.PositionClose(tk); Print("Đóng lệnh do quá ", InpHoldHours, " giờ"); }
   }
}
//+------------------------------------------------------------------+
void OnTick()
{
   CloseOld();
   datetime b0 = iTime(_Symbol, PERIOD_M5, 0);
   if(b0 == 0 || b0 == lastBar) return;          // chỉ xét khi có nến M5 mới (nến 1 vừa đóng)
   lastBar = b0;

   int need = InpLookBars + 80;
   MqlRates c[]; ArraySetAsSeries(c, false);
   int n = CopyRates(_Symbol, PERIOD_M5, 1, need, c);   // c[n-1] = nến M5 vừa đóng
   if(n < need) return;
   int k = n - 1, L = InpPivotL;
   datetime ctK = c[k].time + 300;
   double a = AtrM15(ctK); if(a <= 0) return;
   double e34k, e89k; if(!EmaAt(ctK, e34k, e89k)) return;

   for(int dd = 0; dd < 2; dd++)
   {
      int d = (dd == 0) ? 1 : -1;
      if(d > 0 ? !(e34k > e89k) : !(e34k < e89k)) continue;
      // điểm hồi sâu nhất trong N nến
      int pi = k - 1;
      for(int u = MathMax(1, k - InpLookBars); u < k; u++) if(d > 0 ? c[u].low < c[pi].low : c[u].high > c[pi].high) pi = u;
      double pP = d > 0 ? c[pi].low : c[pi].high;
      if((d > 0 ? usedPullBuy : usedPullSell) == c[pi].time) continue;
      double e34p, e89p; if(!EmaAt(c[pi].time + 300, e34p, e89p)) continue;
      bool touch = d > 0 ? pP <= e34p + InpTouchATR * a : pP >= e34p - InpTouchATR * a;
      bool deep  = d > 0 ? pP < e89p - InpDeepATR * a : pP > e89p + InpDeepATR * a;
      if(!touch || deep) continue;
      // swing gần nhất trước điểm hồi (đã xác nhận tại k): đỉnh cho BUY / đáy cho SELL
      double P = 0; bool hasP = false;
      for(int i = pi - 1; i >= MathMax(L, pi - 30); i--)
      {
         if(i + L > k) continue;
         bool okP = true;
         for(int q = 1; q <= L; q++)
         {
            if(d > 0) { if(c[i-q].high >= c[i].high || c[i+q].high > c[i].high) { okP = false; break; } }
            else      { if(c[i-q].low  <= c[i].low  || c[i+q].low  < c[i].low)  { okP = false; break; } }
         }
         if(okP) { P = d > 0 ? c[i].high : c[i].low; hasP = true; break; }
      }
      if(!hasP) continue;
      if(d > 0 ? !(c[k].close > P && c[k-1].close <= P) : !(c[k].close < P && c[k-1].close >= P)) continue;   // phá vỡ M5
      if(d > 0) usedPullBuy = c[pi].time; else usedPullSell = c[pi].time;
      // quét SSL/BSL: điểm hồi vượt đáy/đỉnh swing trước đó
      bool swept = false;
      for(int i = pi - 1; i >= MathMax(L, pi - 40); i--)
      {
         if(i + L > k) continue;
         bool okS = true;
         for(int q = 1; q <= L; q++)
         {
            if(d > 0) { if(c[i-q].low  <= c[i].low  || c[i+q].low  < c[i].low)  { okS = false; break; } }
            else      { if(c[i-q].high >= c[i].high || c[i+q].high > c[i].high) { okS = false; break; } }
         }
         if(okS) { swept = d > 0 ? pP < c[i].low : pP > c[i].high; break; }
      }
      if(InpNeedSweep && !swept) continue;
      // FVG M5 trong nhịp phá (từ điểm hồi tới nến phá)
      bool fvg = false; double fTop = 0, fBot = 0;
      for(int m = pi + 2; m <= k; m++) { double bot = d > 0 ? c[m-2].high : c[m].high, top = d > 0 ? c[m].low : c[m-2].low; if(top > bot) { fvg = true; fTop = top; fBot = bot; } }
      if(InpNeedFVG && !fvg) continue;

      int hv = HourVN(c[k].time);
      string msg = StringFormat("EMA hoi %s %s · %dh VN · quet %s %.2f -> pha vo M5 %.2f · FVG %.2f-%.2f · EMA34 %.2f / EMA89 %.2f",
                                _Symbol, d > 0 ? "BUY" : "SELL", hv, d > 0 ? "SSL" : "BSL", pP, P, fBot, fTop, e34k, e89k);
      if(!hourOK[hv]) { Print("Bỏ qua (ngoài giờ tốt): ", msg); continue; }

      // kiểm tra an toàn
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), spr = ask - bid;
      if(spr > InpMaxSpreadUSD) { Print("Bỏ qua: spread ", DoubleToString(spr, 2), " quá lớn · ", msg); continue; }
      if(CountMine() >= InpMaxPositions) { Print("Bỏ qua: đã có lệnh EA đang mở · ", msg); continue; }
      int nt; double pl; TodayStats(nt, pl);
      if(nt >= InpMaxTradesDay) { Print("Bỏ qua: đủ số lệnh trong ngày · ", msg); continue; }
      if(InpMaxDailyLoss > 0 && pl <= -AccountInfoDouble(ACCOUNT_BALANCE) * InpMaxDailyLoss / 100.0) { Print("Bỏ qua: chạm giới hạn lỗ ngày · ", msg); continue; }

      double entry = d > 0 ? ask : bid;
      double sl = pP - d * (InpSlATR * a + spr), risk = MathAbs(entry - sl);
      if(d > 0 ? sl >= entry : sl <= entry) continue;
      double tp = entry + d * InpRR * risk;
      double stops = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
      if(risk < stops) { Print("Bỏ qua: SL quá sát (stops level) · ", msg); continue; }
      int dg = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
      sl = NormalizeDouble(sl, dg); tp = NormalizeDouble(tp, dg);
      msg += StringFormat(" · Entry %.2f SL %.2f TP %.2f", entry, sl, tp);

      if(InpAlertOnly) { Alert(msg); SendNotification(msg); continue; }
      double lot = LotFor(risk); if(lot <= 0) continue;
      bool done = d > 0 ? trade.Buy(lot, _Symbol, 0, sl, tp, "EMA hoi ICT") : trade.Sell(lot, _Symbol, 0, sl, tp, "EMA hoi ICT");
      Print(done ? "ĐÃ VÀO LỆNH " : "LỖI vào lệnh ", DoubleToString(lot, 2), " lot · ", msg, " · ", trade.ResultRetcodeDescription());
      if(done) SendNotification("Đã vào lệnh · " + msg);
   }
}
//+------------------------------------------------------------------+
