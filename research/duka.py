# Tải nến 1 phút Dukascopy (BID) → gộp M5/M15/H1 → research/data/{SYM}_{tf}.json  (chạy trong GitHub Actions)
import lzma, struct, json, os, sys, time, urllib.request, datetime as dt
from concurrent.futures import ThreadPoolExecutor
SYMS = {'XAU2Y': 'XAUUSD', 'OIL': 'LIGHTCMDUSD'}
START = dt.date.fromisoformat(os.environ.get('START', '2024-11-01'))
END = dt.date.today()
def get(url):
    for k in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404: return b''
        except Exception: pass
        time.sleep(2 * (k + 1))
    return None
def day(inst, d):
    if d.weekday() == 5: return []
    raw = get(f'https://datafeed.dukascopy.com/datafeed/{inst}/{d.year}/{d.month - 1:02d}/{d.day:02d}/BID_candles_min_1.bi5')
    if not raw: return []
    data = lzma.decompress(raw, format=lzma.FORMAT_ALONE)
    base = int(dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc).timestamp() * 1000); out = []
    for i in range(0, len(data) - 23, 24):
        s, o, c, l, h, v = struct.unpack('>iiiiif', data[i:i + 24])
        if v <= 0: continue
        out.append([base + s * 1000, o, h, l, c, v])
    return out
os.makedirs('research/data', exist_ok=True)
for name, inst in SYMS.items():
    days = [START + dt.timedelta(n) for n in range((END - START).days + 1)]
    with ThreadPoolExecutor(8) as ex: res = list(ex.map(lambda d: day(inst, d), days))
    m1 = [x for r in res for x in r]; m1.sort(key=lambda x: x[0])
    if not m1: print(name, 'không có dữ liệu'); continue
    # hệ số giá: Dukascopy lưu số nguyên × 10^digits
    div = 1000.0
    for x in m1: x[1:5] = [round(p / div, 3) for p in x[1:5]]
    print(name, 'M1', len(m1), dt.datetime.utcfromtimestamp(m1[0][0] / 1000), '→', dt.datetime.utcfromtimestamp(m1[-1][0] / 1000), 'giá đầu', m1[0][4], 'giá cuối', m1[-1][4])
    for tf, ms in (('m5', 3e5), ('m15', 9e5), ('h1', 36e5)):
        agg = []; cur = None
        for t, o, h, l, c, v in m1:
            s = int(t // ms * ms)
            if cur is None or cur[0] != s:
                if cur: agg.append(cur)
                cur = [s, o, h, l, c, v]
            else: cur[2] = max(cur[2], h); cur[3] = min(cur[3], l); cur[4] = c; cur[5] += v
        if cur: agg.append(cur)
        json.dump([[a[0], a[1], a[2], a[3], a[4], round(a[5], 2)] for a in agg], open(f'research/data/{name}_{tf}.json', 'w'), separators=(',', ':'))
        print(' ', tf, len(agg))
