//+------------------------------------------------------------------+
//| EMA21_Test_M30.mq5 — EA "Test EMA21 M30" cho XAUUSD                |
//| Cách có tỷ lệ thắng cao nhất khi kiểm 12 tháng (giống web          |
//| tin-hieu/ema21.js):                                                |
//|  1. Xu hướng M30: EMA34 > EMA89 → chỉ BUY; < → chỉ SELL, và        |
//|     ≥ 6 nến M30 liên tiếp đóng cửa cùng phía EMA21 M30             |
//|  2. Trong cây M30 kế tiếp giá hồi CHẠM EMA21 M30                   |
//|     (không xuyên quá 0.8 ATR M15)                                  |
//|  3. Nến M5 đóng cửa quay lại phía xu hướng, thân cùng chiều        |
//|     → VÀO NGAY (chờ tối đa 6 nến M5 sau khi hết cây M30)            |
//|  SL: ngoài râu chạm + 0.3 ATR M15 (+ spread với SELL), 0.5–15 giá  |
//|  TP: 1R · giữ tối đa 12 giờ · 0.02 lot cố định · 1 lệnh một lúc    |
//|  Bỏ cây M30 bắt đầu lúc 8h và 23h giờ VN (hay dính SL)             |
//| Kiểm 12 tháng (0.02 lot, spread 0.35): 322 lệnh, thắng 56%,        |
//|   +666 USD, sụt tối đa 132 USD, thua liên tiếp tối đa 5.            |
//| KHÔNG đảm bảo lời — chạy thử DEMO trước khi dùng tiền thật.         |
//+------------------------------------------------------------------+
#property copyright "tin-hieu V4 — Test EMA21 M30"
#property version   "1.00"
#include <Trade/Trade.mqh>

input group "=== Khối lượng & rủi ro ==="
input double InpFixedLot     = 0.02;   // Lot cố định
input double InpRR           = 1.0;    // TP = RR × khoảng SL
input bool   InpOnlyOneOnSym = true;   // Chỉ 1 lệnh trên symbol (tính cả lệnh của EA khác / lệnh tay)
input int    InpMaxTradesDay = 6;      // Số lệnh tối đa mỗi ngày (EA này)
input double InpMaxDailyLoss = 3.0;    // Ngừng vào lệnh trong ngày nếu lỗ ≥ % số dư (0 = tắt)
input double InpMaxSpreadUSD = 0.60;   // Không vào nếu spread > (giá)
input int    InpHoldHours    = 12;     // Đóng lệnh sau tối đa (giờ)
input double InpMinSL        = 0.5;    // SL tối thiểu (giá)
input double InpMaxSL        = 15;     // SL tối đa (giá) — 0.02 lot mất tối đa ~30 USD

input group "=== Cấu trúc ==="
input int    InpEmaFast    = 21;   // EMA test (khung M30)
input int    InpRunBars    = 6;    // Số nến M30 liên tiếp đóng cùng phía EMA21
input double InpPierceATR  = 0.8;  // Huỷ nếu râu xuyên qua EMA21 quá x ATR M15
input int    InpWaitBars   = 6;    // Chờ nến M5 xác nhận thêm tối đa N nến sau khi hết cây M30
input double InpPadATR     = 0.3;  // Đệm SL ngoài râu chạm (× ATR M15)

input group "=== Giờ (giờ Việt Nam) ==="
input string InpBadHoursVN = "8,23"; // Không vào ở các cây M30 bắt đầu giờ này

input group "=== Khác ==="
input long   InpMagic      = 21530;
input bool   InpAlertOnly  = false; // true = chỉ báo (Alert/Push), KHÔNG vào lệnh

CTrade trade;
int    hE21 = INVALID_HANDLE, hE34 = INVALID_HANDLE, hE89 = INVALID_HANDLE;
bool   badHour[24];
datetime lastBar = 0, lastArmedM30 = 0, lastTradeBarI = 0;
// trạng thái chờ test (2 ô: cây M30 trước còn chờ nến xác nhận, cây M30 mới bắt đầu chờ chạm)
struct Slot { bool on; bool touched; int dir; double lvl, atr, ext, e34, e89; datetime m30, barI, touchT; };
Slot SL_[2];
//+------------------------------------------------------------------+
int OnInit()
{
   hE21 = iMA(_Symbol, PERIOD_M30, InpEmaFast, 0, MODE_EMA, PRICE_CLOSE);
   hE34 = iMA(_Symbol, PERIOD_M30, 34, 0, MODE_EMA, PRICE_CLOSE);
   hE89 = iMA(_Symbol, PERIOD_M30, 89, 0, MODE_EMA, PRICE_CLOSE);
   if(hE21 == INVALID_HANDLE || hE34 == INVALID_HANDLE || hE89 == INVALID_HANDLE) { Print("Không tạo được EMA"); return INIT_FAILED; }
   for(int h = 0; h < 24; h++) badHour[h] = false;
   string parts[]; int n = StringSplit(InpBadHoursVN, ',', parts);
   for(int i = 0; i < n; i++) { string s = parts[i]; StringTrimLeft(s); StringTrimRight(s); if(s == "") continue; int h = (int)StringToInteger(s); if(h >= 0 && h < 24) badHour[h] = true; }
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(50);
   if(StringFind(_Symbol, "XAU") < 0) Print("CẢNH BÁO: EA được kiểm tra cho vàng (XAUUSD). Symbol hiện tại: ", _Symbol);
   Print("Test EMA21 M30 khởi động · lot ", DoubleToString(InpFixedLot, 2), " · bỏ giờ VN ", InpBadHoursVN, InpAlertOnly ? " · CHỈ BÁO" : "");
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason) { IndicatorRelease(hE21); IndicatorRelease(hE34); IndicatorRelease(hE89); }

//+------------------------------------------------------------------+
int HourVN(datetime srv)
{
   long off = (long)(TimeTradeServer() - TimeGMT());
   off = (long)MathRound(off / 1800.0) * 1800;
   datetime vn = (datetime)(srv - off + 7 * 3600);
   MqlDateTime t; TimeToStruct(vn, t); return t.hour;
}
// ATR Wilder 14 trên M15, tính tới nến M15 đã đóng trước thời điểm t
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
int CountPos(bool anyMagic)
{
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong tk = PositionGetTicket(i); if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(anyMagic || PositionGetInteger(POSITION_MAGIC) == InpMagic) n++;
   }
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
double NormLot(double lot)
{
   double st = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), mn = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), mx = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   lot = MathFloor(lot / st + 1e-9) * st;
   if(lot < mn) lot = mn;
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
// Thử "giăng" chờ test ở đầu mỗi cây M30 (m30s = giờ mở cây M30 đang chạy)
void TryArm(datetime m30s)
{
   if(m30s == lastArmedM30) return;
   lastArmedM30 = m30s;
   if(CountPos(InpOnlyOneOnSym) > 0) return;                   // đang có lệnh → bỏ cả cây M30 này
   int sh = iBarShift(_Symbol, PERIOD_M30, m30s, true); if(sh < 0) return;
   int N = 80;
   double e21[], e34[], e89[], cl[]; datetime tm[];
   ArraySetAsSeries(e21, true); ArraySetAsSeries(e34, true); ArraySetAsSeries(e89, true); ArraySetAsSeries(cl, true); ArraySetAsSeries(tm, true);
   if(CopyBuffer(hE21, 0, sh + 1, N, e21) != N || CopyBuffer(hE34, 0, sh + 1, 1, e34) != 1 || CopyBuffer(hE89, 0, sh + 1, 1, e89) != 1) return;
   if(CopyClose(_Symbol, PERIOD_M30, sh + 1, N, cl) != N || CopyTime(_Symbol, PERIOD_M30, sh + 1, N, tm) != N) return;
   // [0] = nến M30 vừa đóng (nến i)
   int side = (cl[0] > e21[0]) ? 1 : (cl[0] < e21[0] ? -1 : 0); if(side == 0) return;
   int run = 0;
   for(int k = 0; k < N; k++)
   {
      if(tm[k] <= lastTradeBarI) break;                          // đếm lại từ sau nến đã ra lệnh lần trước
      int s = (cl[k] > e21[k]) ? 1 : (cl[k] < e21[k] ? -1 : 0);
      if(s != side) break; run++;
   }
   if(run < InpRunBars) return;
   int tr = (e34[0] > e89[0]) ? 1 : (e34[0] < e89[0] ? -1 : 0); if(tr != side) return;
   if(badHour[HourVN(m30s)]) { PrintFormat("Bỏ cây M30 %s: giờ %dh VN hay dính SL", TimeToString(m30s), HourVN(m30s)); return; }
   double a = AtrM15(m30s); if(a <= 0) return;
   int q = SL_[0].on ? 1 : 0; if(SL_[q].on) return;
   SL_[q].on = true; SL_[q].touched = false; SL_[q].dir = side; SL_[q].lvl = e21[0]; SL_[q].atr = a; SL_[q].m30 = m30s; SL_[q].barI = tm[0]; SL_[q].e34 = e34[0]; SL_[q].e89 = e89[0]; SL_[q].ext = 0; SL_[q].touchT = 0;
}

bool Enter(const MqlRates &y, Slot &z)
{
   int d = z.dir; z.on = false;                            // ô này dùng xong; nếu vào lệnh được thì huỷ luôn ô còn lại
   double aExt = z.ext, aAtr = z.atr, aLvl = z.lvl, aE34 = z.e34, aE89 = z.e89; datetime aBarI = z.barI;
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), spr = ask - bid;
   double entry = d > 0 ? ask : bid;
   double sl = aExt - d * (InpPadATR * aAtr + (d < 0 ? spr : 0)), risk = d * (entry - sl);
   int hv = HourVN(y.time);
   string msg = StringFormat("Test EMA21 M30 %s %s · %dh VN · EMA21 M30 %.2f · rau cham %.2f · EMA34 %.2f / EMA89 %.2f", _Symbol, d > 0 ? "BUY" : "SELL", hv, aLvl, aExt, aE34, aE89);
   if(!(risk > InpMinSL) || risk > InpMaxSL) { Print("Bỏ qua: SL ", DoubleToString(risk, 2), " giá ngoài khoảng · ", msg); return false; }
   if(spr > InpMaxSpreadUSD) { Print("Bỏ qua: spread ", DoubleToString(spr, 2), " quá lớn · ", msg); return false; }
   if(CountPos(InpOnlyOneOnSym) > 0) { Print("Bỏ qua: đã có lệnh đang mở · ", msg); return false; }
   int nt; double pl; TodayStats(nt, pl);
   if(InpMaxTradesDay > 0 && nt >= InpMaxTradesDay) { Print("Bỏ qua: đủ số lệnh trong ngày · ", msg); return false; }
   if(InpMaxDailyLoss > 0 && pl <= -AccountInfoDouble(ACCOUNT_BALANCE) * InpMaxDailyLoss / 100.0) { Print("Bỏ qua: chạm giới hạn lỗ ngày · ", msg); return false; }
   double stops = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   if(risk < stops) { Print("Bỏ qua: SL quá sát (stops level) · ", msg); return false; }
   double tp = entry + d * InpRR * risk;
   int dg = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   sl = NormalizeDouble(sl, dg); tp = NormalizeDouble(tp, dg);
   msg += StringFormat(" · Entry %.2f SL %.2f TP %.2f", entry, sl, tp);
   lastTradeBarI = aBarI;                                        // đếm lại 6 nến M30 sau lệnh này
   SL_[0].on = false; SL_[1].on = false;
   if(InpAlertOnly) { Alert(msg); SendNotification(msg); return true; }
   double lot = NormLot(InpFixedLot);
   bool done = d > 0 ? trade.Buy(lot, _Symbol, 0, sl, tp, "Test EMA21 M30") : trade.Sell(lot, _Symbol, 0, sl, tp, "Test EMA21 M30");
   Print(done ? "ĐÃ VÀO LỆNH " : "LỖI vào lệnh ", DoubleToString(lot, 2), " lot · ", msg, " · ", trade.ResultRetcodeDescription());
   if(done) SendNotification("Đã vào lệnh · " + msg);
   return true;
}
// xử lý 1 nến M5 vừa đóng cho 1 ô chờ · trả về true nếu đã gọi vào lệnh
bool Step(const MqlRates &y, Slot &z)
{
   int j = (int)((y.time - z.m30) / 300);         // nến M5 thứ j của cây M30 đang chờ (0..5), 6.. = thời gian chờ thêm
   if(j < 0) return false;
   if(!z.touched)
   {
      if(j >= 6) { z.on = false; return false; }
      if(z.dir > 0 ? y.low <= z.lvl : y.high >= z.lvl) { z.touched = true; z.ext = z.dir > 0 ? y.low : y.high; z.touchT = y.time; }
      else return false;
   }
   z.ext = z.dir > 0 ? MathMin(z.ext, y.low) : MathMax(z.ext, y.high);
   if(z.dir * (z.ext - z.lvl) < -InpPierceATR * z.atr) { Print("Huỷ chờ: râu xuyên EMA21 quá sâu"); z.on = false; return false; }
   if(z.dir * (y.close - z.lvl) > 0 && z.dir * (y.close - y.open) > 0) return Enter(y, z);
   if(j >= 6 + InpWaitBars - 1) z.on = false;
   return false;
}
//+------------------------------------------------------------------+
void OnTick()
{
   CloseOld();
   datetime b0 = iTime(_Symbol, PERIOD_M5, 0);
   if(b0 == 0 || b0 == lastBar) return;          // chỉ xét khi có nến M5 mới (nến 1 vừa đóng)
   lastBar = b0;
   MqlRates r[]; ArraySetAsSeries(r, true);
   if(CopyRates(_Symbol, PERIOD_M5, 1, 1, r) != 1) return;
   MqlRates y = r[0];
   datetime m30s = iTime(_Symbol, PERIOD_M30, iBarShift(_Symbol, PERIOD_M30, y.time, false));
   // giăng ô mới ở nến M5 đầu cây M30, rồi xử lý ô cũ trước (giống thứ tự kiểm tra lịch sử)
   if(y.time == m30s) TryArm(m30s);
   int order[2]; order[0] = 0; order[1] = 1; if(SL_[0].on && SL_[1].on && SL_[1].m30 < SL_[0].m30) { order[0] = 1; order[1] = 0; }
   for(int w = 0; w < 2; w++)
   {
      int q = order[w]; if(!SL_[q].on) continue;
      if(Step(y, SL_[q])) return;                  // đã vào lệnh
   }
}
//+------------------------------------------------------------------+
