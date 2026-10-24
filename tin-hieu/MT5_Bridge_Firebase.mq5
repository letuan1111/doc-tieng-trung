//+------------------------------------------------------------------+
//| MT5_Bridge_Firebase.mq5                                           |
//| Gửi giá + nến M5/M15/H1/H4 từ MT5 (Exness) lên Firebase Realtime  |
//| Database để trang "Tín hiệu EMA·SMC" dùng ĐÚNG dữ liệu MT5.       |
//| EA này KHÔNG đặt lệnh, chỉ đọc giá và gửi đi.                     |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"
#property description "Cầu nối dữ liệu MT5 → Firebase cho web Tín hiệu EMA·SMC (không giao dịch)"

input string InpDbUrl        = "https://TEN-DU-AN-default-rtdb.asia-southeast1.firebasedatabase.app"; // Địa chỉ Firebase Realtime Database
input string InpRoot         = "mt5";                 // Thư mục gốc trong database
input string InpSymbols      = "XAUUSDm,BTCUSDm";     // Các mã gửi đi (đúng tên trong Market Watch)
input int    InpLiveSeconds  = 2;                     // Gửi giá trực tiếp mỗi N giây
input int    InpBarsM5       = 3000;
input int    InpBarsM15      = 1500;
input int    InpBarsH1       = 1000;
input int    InpBarsH4       = 600;
input int    InpFullEveryHrs = 6;                     // Gửi lại toàn bộ lịch sử mỗi N giờ (để dọn dữ liệu cũ)

ENUM_TIMEFRAMES TFS[4] = {PERIOD_M5, PERIOD_M15, PERIOD_H1, PERIOD_H4};
string          TFN[4] = {"m5", "m15", "h1", "h4"};
string   g_syms[];
string   g_base;
datetime g_lastFull = 0;
datetime g_lastTry  = 0;
long     g_srvOff   = 0;     // giờ server − GMT (giây)
bool     g_fullOk   = false;
int      g_okCount  = 0, g_errCount = 0;
string   g_lastErr  = "";

int BarsFor(int i) { return i == 0 ? InpBarsM5 : i == 1 ? InpBarsM15 : i == 2 ? InpBarsH1 : InpBarsH4; }

//--- gửi HTTP (PUT / PATCH) với nội dung JSON
bool Send(const string method, const string path, const string json)
  {
   char data[], res[];
   string rh;
   int n = StringToCharArray(json, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(n > 0) ArrayResize(data, n - 1); // bỏ ký tự kết thúc
   ResetLastError();
   int code = WebRequest(method, g_base + path + ".json", "Content-Type: application/json\r\n", 15000, data, res, rh);
   if(code == 200) { g_okCount++; return true; }
   g_errCount++;
   int err = GetLastError();
   if(code == -1 && err == 4014)
      g_lastErr = "Chưa cho phép WebRequest: vào Tools > Options > Expert Advisors, tích 'Allow WebRequest' và thêm " + InpDbUrl;
   else
      g_lastErr = StringFormat("HTTP %d (lỗi %d) %s", code, err, CharArrayToString(res, 0, MathMin(ArraySize(res), 200)));
   Print("Bridge: ", g_lastErr);
   return false;
  }

string Num(const double v, const int dg) { return DoubleToString(v, dg); }
long   Utc(const datetime t) { return (long)t - g_srvOff; }

string BarJson(const MqlRates &r, const int dg)
  {
   return "[" + Num(r.open, dg) + "," + Num(r.high, dg) + "," + Num(r.low, dg) + "," + Num(r.close, dg) + "]";
  }

//--- gửi toàn bộ lịch sử của một mã
bool FullUpload(const string sym)
  {
   int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   bool ok = true;
   for(int i = 0; i < 4; i++)
     {
      MqlRates r[];
      ArraySetAsSeries(r, false);
      int got = CopyRates(sym, TFS[i], 0, BarsFor(i), r);
      if(got < 50) { Print("Bridge: chưa đủ lịch sử ", sym, " ", TFN[i], " (", got, ")"); ok = false; continue; }
      string js = "{";
      for(int k = 0; k < got; k++)
        {
         if(k) js += ",";
         js += "\"" + IntegerToString(Utc(r[k].time)) + "\":" + BarJson(r[k], dg);
        }
      js += "}";
      if(!Send("PUT", "/" + InpRoot + "/" + sym + "/" + TFN[i], js)) ok = false;
     }
   return ok;
  }

//--- gửi giá trực tiếp + 2 nến cuối mỗi khung (một lệnh PATCH cho mỗi mã)
void LiveUpload(const string sym)
  {
   MqlTick tk;
   if(!SymbolInfoTick(sym, tk)) return;
   int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   string js = "{\"live\":{\"b\":" + Num(tk.bid, dg) + ",\"a\":" + Num(tk.ask, dg) + ",\"t\":" + IntegerToString(Utc(tk.time) * 1000) + "}";
   for(int i = 0; i < 4; i++)
     {
      MqlRates r[];
      ArraySetAsSeries(r, false);
      int got = CopyRates(sym, TFS[i], 0, 2, r);
      for(int k = 0; k < got; k++)
         js += ",\"" + TFN[i] + "/" + IntegerToString(Utc(r[k].time)) + "\":" + BarJson(r[k], dg);
     }
   js += "}";
   Send("PATCH", "/" + InpRoot + "/" + sym, js);
  }

void Status()
  {
   string s = "MT5 → Firebase bridge\n" + InpDbUrl + "\nMã: " + InpSymbols +
              StringFormat("\nGửi thành công: %d   Lỗi: %d", g_okCount, g_errCount) +
              (g_lastErr != "" ? "\nLỗi gần nhất: " + g_lastErr : "") +
              "\nLịch sử: " + (g_fullOk ? "đã gửi" : "đang chờ dữ liệu");
   Comment(s);
  }

int OnInit()
  {
   g_base = InpDbUrl;
   while(StringLen(g_base) > 0 && StringSubstr(g_base, StringLen(g_base) - 1) == "/") g_base = StringSubstr(g_base, 0, StringLen(g_base) - 1);
   if(StringFind(g_base, "https://") != 0 || StringFind(g_base, "TEN-DU-AN") >= 0)
     {
      Alert("Bridge: hãy nhập đúng địa chỉ Firebase Realtime Database trong phần Inputs.");
      return INIT_PARAMETERS_INCORRECT;
     }
   string parts[];
   int n = StringSplit(InpSymbols, ',', parts);
   ArrayResize(g_syms, 0);
   for(int i = 0; i < n; i++)
     {
      string s = parts[i];
      StringTrimLeft(s);
      StringTrimRight(s);
      if(s == "") continue;
      if(!SymbolSelect(s, true)) { Print("Bridge: không tìm thấy mã ", s); continue; }
      int k = ArraySize(g_syms);
      ArrayResize(g_syms, k + 1);
      g_syms[k] = s;
     }
   if(ArraySize(g_syms) == 0) { Alert("Bridge: không có mã hợp lệ."); return INIT_PARAMETERS_INCORRECT; }
   // chênh lệch giờ server so với GMT, làm tròn 30 phút
   long d = (long)(TimeTradeServer() - TimeGMT());
   g_srvOff = (long)MathRound(d / 1800.0) * 1800;
   Print("Bridge: giờ server lệch GMT ", g_srvOff / 3600.0, " giờ");
   EventSetTimer(MathMax(1, InpLiveSeconds));
   Status();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
  }

void OnTimer()
  {
   bool due = g_fullOk ? (TimeLocal() - g_lastFull >= InpFullEveryHrs * 3600) : (TimeLocal() - g_lastTry >= 30);
   if(due)
     {
      bool ok = true;
      g_lastTry = TimeLocal();
      for(int i = 0; i < ArraySize(g_syms); i++) ok = FullUpload(g_syms[i]) && ok;
      g_fullOk = ok;
      if(ok) g_lastFull = TimeLocal();
     }
   if(!g_fullOk) { Status(); return; }
   for(int i = 0; i < ArraySize(g_syms); i++) LiveUpload(g_syms[i]);
   Status();
  }

void OnTick() {}
//+------------------------------------------------------------------+
