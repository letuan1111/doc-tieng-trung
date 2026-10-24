// ZhTTS — đọc tiếng Trung bằng "Giọng 1" (Matcha-TTS baker-zh + Vocos) ngay trong trình duyệt bằng onnxruntime-web.
// Quy trình giống sherpa-onnx: chữ → từ (khớp dài nhất theo từ điển) → mã âm tiết, chèn ký tự đệm → Matcha → mel → Vocos → iSTFT.
(function (global) {
  'use strict';
  const SR = 22050, N_FFT = 1024, HOP = 256, PAD = 1;
  const PUNCT = { '，': 2, '、': 2, '；': 2, '：': 2, ',': 2, ';': 2, ':': 2, '。': 3, '.': 3, '！': 4, '!': 4, '？': 5, '?': 5 };

  // ---------- số → chữ Hán (thay cho bộ chuẩn hoá số của sherpa) ----------
  const DIG = '零一二三四五六七八九';
  function intZh(n) {
    if (n === 0) return '零';
    const units = ['', '十', '百', '千'], big = ['', '万', '亿'];
    let s = '', g = 0;
    while (n > 0) {
      const part = n % 10000; n = Math.floor(n / 10000);
      if (part) {
        let p = '', zero = false; const d = String(part).padStart(4, '0');
        for (let i = 0; i < 4; i++) {
          const c = +d[i];
          if (c === 0) { zero = p !== ''; continue; }
          if (zero) { p += '零'; zero = false; }
          p += DIG[c] + units[3 - i];
        }
        s = p + big[g] + (s && part < 1000 ? '零' : '') + s;
      }
      g++;
    }
    return s.replace(/^一十/, '十');
  }
  function normalize(t) {
    t = t.replace(/(\d+)\.(\d+)/g, (_, a, b) => intZh(+a) + '点' + [...b].map(c => DIG[+c]).join(''));
    t = t.replace(/(\d{4})(?=年)/g, (m) => [...m].map(c => DIG[+c]).join(''));
    t = t.replace(/(\d+)%/g, (_, a) => '百分之' + intZh(+a));
    t = t.replace(/\d{9,}/g, (m) => [...m].map(c => DIG[+c]).join(''));
    t = t.replace(/\d+/g, (m) => intZh(+m));
    return t;
  }

  // ---------- văn bản → mã ----------
  let LEX = null, MAXW = 1;
  function loadLexicon(text) {
    LEX = new Map();
    for (const line of text.split('\n')) {
      const i = line.indexOf(' ');
      if (i <= 0) continue;
      const w = line.slice(0, i);
      if (!LEX.has(w)) { LEX.set(w, line.slice(i + 1).split(' ').map(Number)); if (w.length > MAXW) MAXW = w.length; }
    }
  }
  function sentences(text) {
    text = normalize(String(text)).replace(/\s+/g, '');
    const chars = [...text], out = [];
    let cur = [], raw = '';
    for (let i = 0; i < chars.length;) {
      const c = chars[i];
      if (c in PUNCT) { if (cur.length) { cur.push(PUNCT[c]); out.push({ ids: cur, text: raw + c }); } cur = []; raw = ''; i++; continue; }
      let hit = false;
      for (let L = Math.min(MAXW, chars.length - i); L > 0; L--) {
        const w = chars.slice(i, i + L).join('');
        const ids = LEX.get(w);
        if (ids) { cur.push(...ids); raw += w; i += L; hit = true; break; }
      }
      if (!hit) { raw += c; i++; } // bỏ qua ký tự không đọc được (chữ Latin, ký hiệu)
    }
    if (cur.length) out.push({ ids: cur, text: raw });
    return out;
  }
  function intersperse(ids) {
    const r = new BigInt64Array(ids.length * 2 + 1).fill(BigInt(PAD));
    ids.forEach((t, i) => { r[2 * i + 1] = BigInt(t); });
    return r;
  }

  // ---------- iSTFT (n_fft 1024, hop 256, hann, center) ----------
  const WIN = new Float32Array(N_FFT).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N_FFT));
  const REV = new Uint32Array(N_FFT), COS = new Float32Array(N_FFT / 2), SIN = new Float32Array(N_FFT / 2);
  (function () {
    const bits = Math.log2(N_FFT);
    for (let i = 0; i < N_FFT; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); REV[i] = r; }
    for (let i = 0; i < N_FFT / 2; i++) { COS[i] = Math.cos(2 * Math.PI * i / N_FFT); SIN[i] = Math.sin(2 * Math.PI * i / N_FFT); }
  })();
  function ifft(re, im) { // tại chỗ, nghịch đảo, chưa chia N
    for (let i = 0; i < N_FFT; i++) { const j = REV[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= N_FFT; size <<= 1) {
      const half = size >> 1, step = N_FFT / size;
      for (let s = 0; s < N_FFT; s += size) for (let k = 0; k < half; k++) {
        const c = COS[k * step], sn = SIN[k * step], a = s + k, b = a + half;
        const tr = re[b] * c - im[b] * sn, ti = re[b] * sn + im[b] * c; // e^{+i}
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  function istft(mag, x, y, F, T) { // các mảng phẳng [F*T], hàng = tần số
    const L = N_FFT + HOP * (T - 1), out = new Float32Array(L), wsum = new Float32Array(L);
    const re = new Float32Array(N_FFT), im = new Float32Array(N_FFT);
    for (let t = 0; t < T; t++) {
      for (let f = 0; f < F; f++) { const m = mag[f * T + t]; re[f] = m * x[f * T + t]; im[f] = m * y[f * T + t]; }
      im[0] = 0; im[F - 1] = 0;
      for (let f = 1; f < F - 1; f++) { re[N_FFT - f] = re[f]; im[N_FFT - f] = -im[f]; }
      ifft(re, im);
      const o = t * HOP;
      for (let n = 0; n < N_FFT; n++) { out[o + n] += re[n] / N_FFT * WIN[n]; wsum[o + n] += WIN[n] * WIN[n]; }
    }
    for (let i = 0; i < L; i++) out[i] /= Math.max(wsum[i], 1e-8);
    return out.subarray(N_FFT / 2, L - N_FFT / 2);
  }

  function wavBlob(samples) {
    const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(samples[i]));
    const g = peak > 0.95 ? 0.95 / peak : 1;
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i] * g)) * 32767, true);
    return new Blob([buf], { type: 'audio/wav' });
  }

  // ---------- tải mô hình (có lưu đệm để lần sau không tải lại) ----------
  const CACHE = 'zh-tts-giong1-v3';
  // giải mã base64 (mô hình được lưu dạng văn bản .txt)
  function b64(bytes) {
    const str = new TextDecoder().decode(bytes).replace(/\s+/g, '');
    const bin = atob(str), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function fetchBytes(url, onBytes) {
    let res = null, cache = null;
    try { cache = await caches.open(CACHE); res = await cache.match(url); } catch (_) { cache = null; }
    if (!res) {
      res = await fetch(url);
      if (!res.ok) throw new Error('Không tải được ' + url + ' (' + res.status + ')');
      if (cache) { try { await cache.put(url, res.clone()); } catch (_) {} }
    }
    const reader = res.body.getReader(), parts = [];
    let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onBytes(value.length); }
    const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  const ZhTTS = {
    ready: false, loading: null, am: null, voc: null,
    /** base: thư mục chứa mô hình; onProgress(phần trăm 0–100) */
    load(base, onProgress = () => {}) {
      if (this.loading) return this.loading;
      this.loading = (async () => {
        const ort = global.ort;
        if (!ort) throw new Error('Chưa tải được thư viện onnxruntime-web');
        ort.env.wasm.numThreads = 1;
        const MAN = {"am": {"parts": ["am0.txt", "am1.txt", "am2.txt", "am3.txt"], "bytes": 34040803}, "voc": {"parts": ["voc0.txt", "voc1.txt"], "bytes": 13666669}};
        const lexBytes = 1268000;
        const TOTAL = lexBytes + Math.ceil(MAN.am.bytes * 4 / 3) + Math.ceil(MAN.voc.bytes * 4 / 3); let done = 0;
        const tick = (n) => { done += n; onProgress(Math.min(99, Math.round(done / TOTAL * 100))); };
        const lex = await fetchBytes(base + 'lexicon.txt', tick);
        loadLexicon(new TextDecoder().decode(lex));
        const getModel = async (m) => {
          const out = new Uint8Array(m.bytes); let o = 0;
          for (const part of m.parts) { const bin = b64(await fetchBytes(base + part, tick)); out.set(bin, o); o += bin.length; }
          return out;
        };
        const voc = await getModel(MAN.voc);
        const am = await getModel(MAN.am);
        const opt = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
        this.am = await ort.InferenceSession.create(am, opt);
        this.voc = await ort.InferenceSession.create(voc, opt);
        this.ready = true; onProgress(100);
      })();
      this.loading.catch(() => { this.loading = null; });
      return this.loading;
    },
    split: (text) => sentences(text),
    /** Tạo âm thanh cho một câu (đã tách) → Blob WAV */
    async synthIds(ids, { noise = 0.667, lengthScale = 1 } = {}) {
      const ort = global.ort;
      const x = intersperse(ids);
      const feeds = {
        x: new ort.Tensor('int64', x, [1, x.length]),
        x_length: new ort.Tensor('int64', BigInt64Array.from([BigInt(x.length)]), [1]),
        noise_scale: new ort.Tensor('float32', Float32Array.from([noise]), [1]),
        length_scale: new ort.Tensor('float32', Float32Array.from([lengthScale]), [1]),
      };
      const mel = (await this.am.run(feeds)).mel;
      const r = await this.voc.run({ mels: mel });
      const [, F, T] = r.mag.dims;
      const wav = istft(r.mag.data, r.x.data, r.y.data, F, T);
      const pad = new Float32Array(wav.length + Math.round(SR * 0.12)); pad.set(wav);
      return wavBlob(pad);
    },
    async synth(text) { const blobs = []; for (const s of sentences(text)) blobs.push(await this.synthIds(s.ids)); return blobs; },
  };
  global.ZhTTS = ZhTTS;
})(window);
