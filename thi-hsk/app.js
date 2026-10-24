/* Thi thử HSK — tải đề PDF/mp3 để thi + đề HSK1 tự sinh */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), app = $('#app');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
  const AF = 'ABCDEF';

  // ---------------- IndexedDB: lưu bộ đề ngay trên máy ----------------
  const DB = {
    db: null,
    open() { return this.db ? Promise.resolve(this.db) : new Promise((res, rej) => { const r = indexedDB.open('thi-hsk', 1); r.onupgradeneeded = () => r.result.createObjectStore('sets', { keyPath: 'id' }); r.onsuccess = () => res(this.db = r.result); r.onerror = () => rej(r.error); }); },
    async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('sets', mode), st = t.objectStore('sets'), q = fn(st); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); },
    put(s) { return this.tx('readwrite', st => st.put(s)); },
    get(id) { return this.tx('readonly', st => st.get(id)); },
    all() { return this.tx('readonly', st => st.getAll()); },
    del(id) { return this.tx('readwrite', st => st.delete(id)); },
  };

  // ---------------- PDF ----------------
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  async function openPdf(file) { return pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; }
  async function pdfPages(file, onp) {
    const pdf = await openPdf(file), out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i), vp0 = pg.getViewport({ scale: 1 }), sc = Math.min(2.4, 1400 / vp0.width), vp = pg.getViewport({ scale: sc });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise;
      out.push(await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85)));
      onp && onp(i, pdf.numPages);
    }
    return out;
  }
  async function pdfText(file) {
    const pdf = await openPdf(file); let s = '';
    for (let i = 1; i <= pdf.numPages; i++) { const tc = await (await pdf.getPage(i)).getTextContent(); s += tc.items.map(x => x.str).join(' ') + '\n'; }
    return s;
  }
  function parseKey(text) {
    const key = new Array(40).fill(null), re = /(\d{1,2})\s*[．.、:：]\s*([×√✓✗✕✔xXAaBbCcDdEeFf])/g; let m;
    while ((m = re.exec(text))) {
      const n = +m[1]; if (n < 1 || n > 40 || key[n - 1]) continue;
      const c = m[2]; key[n - 1] = /[√✓✔]/.test(c) ? 'Y' : /[×✗✕xX]/.test(c) ? 'N' : c.toUpperCase();
    }
    return key;
  }
  const qType = (n) => (n <= 5 || (n >= 21 && n <= 25)) ? 'tf' : ((n >= 6 && n <= 10) || (n >= 16 && n <= 20)) ? 'abc' : 'af';
  const OPTS = { tf: ['Y', 'N'], abc: ['A', 'B', 'C'], af: ['A', 'B', 'C', 'D', 'E', 'F'] };
  const lab = (v) => v === 'Y' ? '√' : v === 'N' ? '×' : (v || '—');
  const PDF_PARTS = [[1, 5, 'Nghe – Phần 1'], [6, 10, 'Nghe – Phần 2'], [11, 15, 'Nghe – Phần 3'], [16, 20, 'Nghe – Phần 4'], [21, 25, 'Đọc – Phần 1'], [26, 30, 'Đọc – Phần 2'], [31, 35, 'Đọc – Phần 3'], [36, 40, 'Đọc – Phần 4']];

  // ---------------- YouTube làm file nghe ----------------
  function parseYT(u) {
    u = String(u || '').trim(); if (!u) return null;
    let id = null, t = 0;
    const m = u.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/) || u.match(/^([\w-]{11})$/);
    if (m) id = m[1];
    const tm = u.match(/[?&#](?:t|start)=(\d+h)?(\d+m)?(\d+)s?/);
    if (tm) t = (parseInt(tm[1]) || 0) * 3600 + (parseInt(tm[2]) || 0) * 60 + (parseInt(tm[3]) || 0);
    return id ? { id, t } : null;
  }
  let ytApi = null;
  function loadYTApi() {
    if (!ytApi) ytApi = new Promise((res) => { window.onYouTubeIframeAPIReady = () => res(window.YT); const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(sc); setTimeout(() => res(window.YT || null), 8000); });
    return ytApi;
  }
  function ytEditor(s) {
    overlay(`<h2 style="margin-top:0">File nghe từ YouTube · ${esc(s.name)}</h2>
      <p class="muted small">Dán link video YouTube chứa phần nghe của đề này (VD https://youtu.be/… hoặc link có &t=… để bắt đầu từ giây đó). Khi thi, trang phát video bằng trình phát YouTube, cần có mạng.</p>
      <input id="ytIn" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font:inherit" placeholder="https://www.youtube.com/watch?v=..." value="${s.yt ? 'https://youtu.be/' + s.yt.id + (s.yt.t ? '?t=' + s.yt.t : '') : ''}">
      <p id="ytMsg" class="small muted"></p>
      <div class="row" style="justify-content:flex-end">${s.yt ? '<button class="btn" id="ytDel">Bỏ link</button>' : ''}<button class="btn" id="ytCancel">Đóng</button><button class="btn pri" id="ytSave">Lưu</button></div>`);
    $('#ytCancel').onclick = closeOv;
    if ($('#ytDel')) $('#ytDel').onclick = async () => { delete s.yt; await DB.put(s); closeOv(); home(); };
    $('#ytSave').onclick = async () => {
      const v = parseYT($('#ytIn').value);
      if (!v) { $('#ytMsg').textContent = 'Link chưa đúng. Hãy dán link video YouTube (có mã video 11 ký tự).'; return; }
      s.yt = v; await DB.put(s); closeOv(); toast('Đã gắn file nghe YouTube'); home();
    };
  }

  // ---------------- giọng đọc tiếng Trung ----------------
  const TTS = {
    voices: [], off: null,
    init() { if (!('speechSynthesis' in window)) return; const load = () => { this.voices = speechSynthesis.getVoices().filter(v => /^(zh|cmn)/i.test(v.lang) && !/HK|TW|yue/i.test(v.lang)); }; load(); speechSynthesis.onvoiceschanged = load; },
    voice(who) {
      const v = this.voices; if (!v.length) return null;
      const isM = (x) => /kangkang|yunxi|yunjian|yunyang|yunhao|male|男/i.test(x.name);
      const m = v.filter(isM), f = v.filter(x => !isM(x));
      return who === '男' ? (m[0] || v[0]) : (f[0] || v[0]);
    },
    say(text, who) {
      return new Promise(res => {
        const u = new SpeechSynthesisUtterance(text), v = this.voice(who);
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'zh-CN';
        u.rate = 0.85; if (who === '男' && v && !/kangkang|yunxi|yunjian|yunyang|male/i.test(v.name)) u.pitch = 0.7;
        let done = false; const fin = () => { if (!done) { done = true; res(); } };
        u.onend = fin; u.onerror = fin; speechSynthesis.speak(u); setTimeout(fin, 12000);
      });
    },
    async offline(text) { // dự phòng khi máy không có giọng Trung: dùng "Giọng 1" (tải ~65MB lần đầu)
      if (!this.off) this.off = (async () => {
        const base = new URL('../', location.href).href;
        const load = (src) => new Promise((r, j) => { const s = document.createElement('script'); s.src = src; s.onload = r; s.onerror = j; document.head.appendChild(s); });
        toast('Máy chưa có giọng tiếng Trung – đang tải giọng chuẩn (~65MB, chỉ lần đầu)…');
        await load(base + 'ort.wasm.min.js'); ort.env.wasm.wasmPaths = base; await load('zh-tts.js');
        await ZhTTS.load(base, p => toast('Đang tải giọng đọc… ' + p + '%'));
        toast('Đã sẵn sàng giọng đọc');
      })();
      await this.off;
      for (const b of await ZhTTS.synth(text)) await new Promise(r => { const a = new Audio(URL.createObjectURL(b)); a.onended = r; a.onerror = r; a.play().catch(r); });
    },
    // giọng AI thu sẵn (Giọng 1 nữ + giọng nam) cho mọi câu nghe của đề tự sinh
    m: null, au: null, tok: 0,
    loadClips() { if (!this._m) this._m = fetch('audio/manifest.json').then(r => r.json()).then(j => (this.m = j)).catch(() => (this.m = {})); return this._m; },
    stop() { this.tok++; if (this.au) this.au.pause(); if ('speechSynthesis' in window) speechSynthesis.cancel(); },
    file(src) { return new Promise(res => { const a = this.au; a.onended = res; a.onerror = res; a.src = src; a.play().catch(res); }); },
    async play(items) {
      this.stop(); const my = ++this.tok;
      if (!this.au) { this.au = new Audio(); this.au.preload = 'auto'; }
      const m = this.m || await this.loadClips();
      for (const it of items) {
        if (my !== this.tok) return;
        const t = typeof it === 'string' ? it : it.t, who = typeof it === 'string' ? '女' : it.who, h = m[who + '|' + t];
        if (h) await this.file('audio/' + h + '.mp3');
        else if (this.voices.length) await this.say(t, who); else await this.offline(t);
        await sleep(700);
      }
    },
  };
  TTS.init(); TTS.loadClips();

  // ---------------- tiện ích giao diện ----------------
  function toast(msg) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 14px;border-radius:12px;z-index:80;max-width:92vw;font-size:14px'; document.body.appendChild(t); } t.textContent = msg; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 4000); }
  function overlay(html) { $('#ovc').innerHTML = html; $('#ov').classList.add('show'); }
  function closeOv() { $('#ov').classList.remove('show'); }
  const urls = []; const objURL = (b) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
  function freeURLs() { while (urls.length) URL.revokeObjectURL(urls.pop()); }

  // đồng hồ
  let timerH = null, endAt = 0, onTimeUp = null;
  function startTimer(min, cb) {
    stopTimer(); endAt = Date.now() + min * 60e3; onTimeUp = cb; $('#timer').classList.remove('hide');
    const tick = () => { const s = Math.max(0, Math.round((endAt - Date.now()) / 1000)); $('#timer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); if (s <= 0) { stopTimer(); onTimeUp && onTimeUp(); } };
    tick(); timerH = setInterval(tick, 1000);
  }
  function stopTimer() { clearInterval(timerH); timerH = null; $('#timer').classList.add('hide'); }
  function examChrome(on, submit) { $('#submitBtn').classList.toggle('hide', !on); $('#submitBtn').onclick = submit || null; if (!on) stopTimer(); }

  // ---------------- TRANG CHỦ ----------------
  async function home() {
    freeURLs(); examChrome(false); window.scrollTo(0, 0);
    TTS.stop();
    let sets = []; try { sets = (await DB.all()).sort((a, b) => b.created - a.created); } catch (e) { console.error(e); }
    const hist = LS.get('hsk.hist', {});
    const best = (id) => { const h = hist[id] || []; return h.length ? Math.max(...h.map(x => x.score)) : null; };
    const mine = sets.filter(s => !s.generated), gens = sets.filter(s => s.generated).slice(0, 6);
    app.innerHTML = `
      <h1>Thi thử HSK ngay trên web</h1>
      <p class="muted">Tải bộ đề (file đề PDF, đáp án, lời thoại, file nghe mp3) lên là thi được ngay, web tự chấm điểm. Hoặc để web tự soạn đề HSK1 mới đúng cấu trúc 40 câu.</p>
      <div class="card" style="margin-top:14px;border:2px solid var(--red)"><h2 style="margin-top:0">▶ Dán link YouTube để thi</h2>
        <p class="muted small" style="margin-top:0">Dán link video đề thi HSK trên YouTube (video có câu hỏi + phần nghe). Web tạo phiếu trả lời 40 câu và đồng hồ 40 phút.</p>
        <div class="row" style="align-items:stretch"><input id="ytNew" placeholder="Dán link YouTube vào đây: https://www.youtube.com/watch?v=..." style="flex:2 1 280px;min-width:0;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font:inherit">
        <input id="ytName" placeholder="Tên bộ đề (không bắt buộc)" style="flex:1 1 180px;min-width:0;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font:inherit">
        <button class="btn pri" id="ytNewBtn">Tạo bài thi</button></div>
        <p id="ytNewMsg" class="small" style="color:var(--bad);margin:6px 0 0"></p></div>
      <div class="grid" style="margin-top:14px">
        <div class="card"><h2 style="margin-top:0">🎲 Đề HSK1 tự sinh</h2><p class="muted small">Mỗi lần bấm là một đề mới: 20 câu nghe (giọng AI chuẩn, thu sẵn) + 20 câu đọc, có tranh, pinyin và giải thích tiếng Việt.</p>
          <button class="btn pri" id="genBtn">Tạo đề mới & thi</button></div>
        <div class="card"><h2 style="margin-top:0">📤 Tải bộ đề lên</h2>
          <div class="drop" id="drop"><div>Kéo thả file vào đây</div><div class="muted small">Đề .pdf · Đáp án (tên có “答案”) · Lời thoại (“听力材料”) · File nghe .mp3</div>
          <div class="row" style="justify-content:center;margin-top:10px"><label class="btn sm">Chọn file<input type="file" id="fFiles" multiple accept=".pdf,.mp3,.m4a,.wav,audio/*,application/pdf" hidden></label>
          <label class="btn sm">Chọn cả thư mục<input type="file" id="fDir" webkitdirectory multiple hidden></label></div></div>
          <p class="muted small" style="margin-bottom:0">Có thể tải nhiều bộ cùng lúc (web tự nhóm theo mã đề, VD H11003). Không có file mp3? Tải đề lên rồi bấm “Gắn link YouTube”. Đề được lưu ngay trên máy/trình duyệt này.</p></div>

      </div>
      <h2>Bộ đề của bạn</h2>
      ${mine.length ? '<div class="grid">' + mine.map(s => `<div class="card set"><h3>${esc(s.name)}</h3>
          <div class="muted small">${s.pages.length ? s.pages.length + ' trang đề' : 'đề trong video'} · ${s.yt ? '▶ nghe qua YouTube' : s.audio ? '🔊 có file nghe' : '⚠ chưa có file nghe'} · ${s.key.filter(Boolean).length}/40 đáp án${s.transcript && s.transcript.length ? ' · có lời thoại' : ''}</div>
          ${best(s.id) != null ? `<div style="margin-top:6px"><span class="badge ${best(s.id) >= 120 ? 'ok' : 'bad'}">Cao nhất: ${best(s.id)}/200</span> <span class="muted small">${(hist[s.id] || []).length} lần thi</span></div>` : ''}
          <div class="row"><button class="btn pri sm" data-go="${s.id}">Bắt đầu thi</button><button class="btn sm" data-yt="${s.id}">${s.yt ? 'Đổi link YouTube' : 'Gắn link YouTube'}</button><button class="btn sm" data-key="${s.id}">Đáp án</button>${s.transcript && s.transcript.length ? `<button class="btn sm" data-tr="${s.id}">Lời thoại</button>` : ''}<button class="btn sm" data-del="${s.id}">Xoá</button></div></div>`).join('') + '</div>'
        : '<p class="muted">Chưa có bộ đề nào. Hãy tải lên 4 file của một bộ đề.</p>'}
      ${gens.length ? '<h2>Đề tự sinh đã làm</h2><div class="grid">' + gens.map(s => `<div class="card set"><h3>${esc(s.name)}</h3>${best(s.id) != null ? `<span class="badge ${best(s.id) >= 120 ? 'ok' : 'bad'}">${best(s.id)}/200</span>` : ''}<div class="row"><button class="btn sm" data-go="${s.id}">Làm lại</button><button class="btn sm" data-del="${s.id}">Xoá</button></div></div>`).join('') + '</div>' : ''}
      <p class="muted small" style="margin-top:28px">Điểm HSK1: mỗi câu 5 điểm, nghe 100 + đọc 100 = 200; đạt từ 120 điểm. Đề tải lên chỉ lưu trên trình duyệt này, không gửi đi đâu.</p>`;
    $('#genBtn').onclick = () => examGen(HSK1.generate());
    $('#ytNewBtn').onclick = async () => {
      const v = parseYT($('#ytNew').value);
      if (!v) { $('#ytNewMsg').textContent = 'Link chưa đúng – hãy dán link video YouTube.'; return; }
      const nm = $('#ytName').value.trim() || 'Đề YouTube ' + new Date().toLocaleDateString('vi-VN');
      const st = { id: 'yt-' + v.id + '-' + Date.now(), code: 'YouTube', name: nm, created: Date.now(), pages: [], transcript: [], audio: null, yt: v, key: new Array(40).fill(null) };
      await DB.put(st); toast('Đã tạo bài thi. Nhập đáp án để được chấm điểm (có thể nhập sau).'); keyEditor(st);
    };
    const take = (fl) => fl && fl.length && importFiles([...fl]);
    $('#fFiles').onchange = (e) => take(e.target.files);
    $('#fDir').onchange = (e) => take(e.target.files);
    const d = $('#drop');
    d.ondragover = (e) => { e.preventDefault(); d.classList.add('over'); };
    d.ondragleave = () => d.classList.remove('over');
    d.ondrop = async (e) => { e.preventDefault(); d.classList.remove('over'); take(await dropFiles(e.dataTransfer)); };
    app.querySelectorAll('[data-go]').forEach(b => b.onclick = async () => { const s = await DB.get(b.dataset.go); s.generated ? examGen(s) : examPdf(s); });
    app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('Xoá bộ đề này khỏi máy?')) { await DB.del(b.dataset.del); home(); } });
    app.querySelectorAll('[data-yt]').forEach(b => b.onclick = async () => ytEditor(await DB.get(b.dataset.yt)));
    app.querySelectorAll('[data-key]').forEach(b => b.onclick = async () => keyEditor(await DB.get(b.dataset.key)));
    app.querySelectorAll('[data-tr]').forEach(b => b.onclick = async () => showTranscript(await DB.get(b.dataset.tr)));
  }

  // lấy cả file trong thư mục khi kéo thả
  async function dropFiles(dt) {
    const items = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!items.length) return [...dt.files];
    const out = [];
    const walk = async (en, path) => {
      if (en.isFile) await new Promise(r => en.file(f => { try { Object.defineProperty(f, 'relPath', { value: path + f.name }); } catch (_) {} out.push(f); r(); }, r));
      else if (en.isDirectory) { const rd = en.createReader(); let batch; do { batch = await new Promise(r => rd.readEntries(r, () => r([]))); for (const c of batch) await walk(c, path + en.name + '/'); } while (batch.length); }
    };
    for (const en of items) await walk(en, '');
    return out;
  }

  // ---------------- nhập bộ đề ----------------
  async function importFiles(files) {
    files = files.filter(f => /\.(pdf|mp3|m4a|wav|ogg)$/i.test(f.name));
    if (!files.length) return toast('Không thấy file .pdf hoặc .mp3');
    // nhóm theo mã đề (VD H11003) hoặc theo thư mục
    const groups = new Map();
    for (const f of files) {
      const path = f.relPath || f.webkitRelativePath || f.name, m = path.match(/H\d{5}/i), dir = path.includes('/') ? path.split('/').slice(-2, -1)[0] : '';
      const k = m ? m[0].toUpperCase() : (dir || 'Bộ đề');
      if (!groups.has(k)) groups.set(k, { code: k, dir, files: [] });
      groups.get(k).files.push(f);
    }
    overlay(`<h2 style="margin-top:0">Đang đọc bộ đề…</h2><p id="impMsg" class="muted">Chuẩn bị</p><div class="prog"><i id="impBar"></i></div>`);
    const msg = (t, p) => { $('#impMsg').textContent = t; if (p != null) $('#impBar').style.width = Math.round(p * 100) + '%'; };
    const done = [];
    try {
      let gi = 0;
      for (const g of groups.values()) {
        gi++;
        const pdfs = g.files.filter(f => /\.pdf$/i.test(f.name)), audio = g.files.find(f => !/\.pdf$/i.test(f.name));
        const keyF = pdfs.find(f => /答案|dap ?an|đáp án|answer|key/i.test(f.name));
        const trF = pdfs.find(f => /听力材料|听力|loi thoai|lời thoại|transcript|script/i.test(f.name) && f !== keyF);
        const examF = pdfs.filter(f => f !== keyF && f !== trF).sort((a, b) => b.size - a.size)[0];
        if (!examF) { toast('Bộ ' + g.code + ': không tìm thấy file đề PDF'); continue; }
        const pre = `Bộ ${gi}/${groups.size} (${g.code}): `;
        const pages = await pdfPages(examF, (i, n) => msg(pre + 'đọc trang đề ' + i + '/' + n, ((gi - 1) + i / n * 0.7) / groups.size));
        let key = new Array(40).fill(null);
        if (keyF) { msg(pre + 'đọc đáp án', ((gi - 1) + 0.75) / groups.size); key = parseKey(await pdfText(keyF)); }
        let transcript = [];
        if (trF) transcript = await pdfPages(trF, (i, n) => msg(pre + 'đọc lời thoại ' + i + '/' + n, ((gi - 1) + 0.8 + i / n * 0.2) / groups.size));
        const s = { id: 'set-' + g.code + '-' + Date.now(), code: g.code, name: (g.dir && !g.dir.includes(g.code) ? g.dir + ' · ' : '') + g.code, created: Date.now(), pages, transcript, audio: audio || null, audioName: audio ? audio.name : '', key };
        await DB.put(s); done.push(s);
      }
    } catch (e) { console.error(e); closeOv(); return toast('Lỗi khi đọc file: ' + e.message); }
    closeOv();
    if (!done.length) return;
    const miss = done.filter(s => s.key.filter(Boolean).length < 40);
    toast('Đã thêm ' + done.length + ' bộ đề' + (miss.length ? ' – có bộ thiếu đáp án, hãy nhập bổ sung' : ''));
    if (miss.length) return keyEditor(miss[0]);
    home();
  }

  // nhập / sửa đáp án
  function keyEditor(s) {
    overlay(`<h2 style="margin-top:0">Đáp án · ${esc(s.name)}</h2><p class="muted small">Web đã tự đọc ${s.key.filter(Boolean).length}/40 đáp án. Kiểm tra hoặc điền bổ sung (√ = đúng, × = sai).</p>
      <div class="keygrid">${s.key.map((v, i) => `<label>${i + 1}.<select data-i="${i}"><option value="">?</option>${OPTS[qType(i + 1)].map(o => `<option value="${o}" ${o === v ? 'selected' : ''}>${lab(o)}</option>`).join('')}</select></label>`).join('')}</div>
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" id="kCancel">Đóng</button><button class="btn pri" id="kSave">Lưu</button></div>`);
    $('#kCancel').onclick = () => { closeOv(); home(); };
    $('#kSave').onclick = async () => { $('#ovc').querySelectorAll('select').forEach(x => s.key[+x.dataset.i] = x.value || null); await DB.put(s); closeOv(); home(); };
  }
  function showTranscript(s) {
    freeURLs();
    overlay(`<div class="row" style="justify-content:space-between"><h2 style="margin:0">Lời thoại · ${esc(s.name)}</h2><button class="btn sm" id="trClose">Đóng</button></div>
      <div class="pages" style="margin-top:10px">${s.transcript.map(b => `<img src="${objURL(b)}" alt="Lời thoại">`).join('')}</div>`);
    $('#ovc').style.maxWidth = '900px'; $('#trClose').onclick = () => { closeOv(); $('#ovc').style.maxWidth = ''; };
  }

  // ---------------- THI ĐỀ PDF ----------------
  function examPdf(s) {
    freeURLs(); window.scrollTo(0, 0);
    const ans = new Array(40).fill(null);
    const aUrl = s.audio ? objURL(s.audio) : null;
    app.innerHTML = `
      <div class="row" style="justify-content:space-between"><h1 style="margin:0">${esc(s.name)}</h1><button class="btn sm" id="back">← Thoát</button></div>
      <div id="intro" class="card" style="margin-top:12px"><p style="margin-top:0"><b>Cấu trúc:</b> Nghe 20 câu (~15 phút) + Đọc 20 câu (17 phút). Thời gian làm bài 40 phút.</p>
        <p class="muted small">Bấm “Bắt đầu” để chạy đồng hồ và phát file nghe. Chọn đáp án trên phiếu trả lời; bấm “Nộp bài” khi xong (hết giờ sẽ tự nộp).</p>
        <button class="btn pri" id="start">▶ Bắt đầu thi</button></div>
      <div class="exam hide" id="ex">
        <div>${s.yt ? `<div class="audiobox"><div class="small muted" style="margin-bottom:6px">▶ File nghe từ YouTube${aUrl ? ' · <button class="btn sm" id="useMp3" type="button">Dùng file mp3</button>' : ''}</div><div style="${s.pages.length ? 'aspect-ratio:16/5;max-height:140px' : 'aspect-ratio:16/9'};border-radius:10px;overflow:hidden;background:#000"><div id="ytp" style="width:100%;height:100%"></div></div></div>` : aUrl ? `<div class="audiobox"><div class="small muted" style="margin-bottom:4px">🔊 File nghe: ${esc(s.audioName)}</div><audio id="au" controls preload="auto" src="${aUrl}"></audio></div>` : '<p class="muted">⚠ Bộ đề chưa có file nghe.</p>'}
          <div class="pages">${s.pages.map((b, i) => `<img id="pg${i}" src="${objURL(b)}" alt="Trang ${i + 1}" loading="lazy">`).join('')}</div></div>
        <aside class="card sheet" id="sheet"><div class="handle" id="hdl"><span>📝 Phiếu trả lời <span id="cnt">0/40</span></span><span>▲</span></div>
          ${PDF_PARTS.map(([a, b, t]) => `<div class="ptitle">${t}</div>` + Array.from({ length: b - a + 1 }, (_, k) => a + k).map(n => `<div class="qrow"><b>${n}.</b>${OPTS[qType(n)].map(o => `<button class="op" data-n="${n}" data-v="${o}">${lab(o)}</button>`).join('')}</div>`).join('')).join('')}
          <button class="btn pri" style="width:100%;margin-top:14px" id="sub2">Nộp bài</button></aside>
      </div>`;
    $('#back').onclick = () => { if (confirm('Thoát bài thi?')) home(); };
    $('#hdl').onclick = () => $('#sheet').classList.toggle('open');
    app.querySelectorAll('.op').forEach(b => b.onclick = () => {
      const n = +b.dataset.n; ans[n - 1] = ans[n - 1] === b.dataset.v ? null : b.dataset.v;
      app.querySelectorAll(`.op[data-n="${n}"]`).forEach(x => x.classList.toggle('on', x.dataset.v === ans[n - 1]));
      $('#cnt').textContent = ans.filter(Boolean).length + '/40';
    });
    const t0 = { v: 0 };
    let ytp = null;
    if (s.yt) loadYTApi().then(YT => {
      if (!YT || !$('#ytp')) { const el = $('#ytp'); if (el) el.outerHTML = `<iframe style="width:100%;height:100%;border:0" allow="autoplay; encrypted-media" src="https://www.youtube-nocookie.com/embed/${s.yt.id}?start=${s.yt.t || 0}&playsinline=1&rel=0"></iframe>`; return; }
      ytp = new YT.Player('ytp', { videoId: s.yt.id, width: '100%', height: '100%', playerVars: { start: s.yt.t || 0, playsinline: 1, rel: 0, modestbranding: 1 } });
    });
    if ($('#useMp3')) $('#useMp3').onclick = () => { try { ytp && ytp.pauseVideo(); } catch (_) {} delete s.yt; examPdf(s); };
    const submit = () => { const au = $('#au'); au && au.pause(); try { ytp && ytp.pauseVideo(); } catch (_) {} finish(s, ans, Date.now() - t0.v); };
    $('#sub2').onclick = () => confirm('Nộp bài?') && submit();
    $('#start').onclick = () => {
      $('#intro').classList.add('hide'); $('#ex').classList.remove('hide'); t0.v = Date.now();
      examChrome(true, () => confirm('Nộp bài?') && submit()); startTimer(40, submit);
      const au = $('#au'); if (s.yt) { try { ytp && ytp.playVideo ? ytp.playVideo() : toast('Bấm ▶ trên video để nghe'); } catch (_) { toast('Bấm ▶ trên video để nghe'); } } else au && au.play().catch(() => toast('Bấm ▶ trên trình phát để nghe'));
    };
  }

  // ---------------- THI ĐỀ TỰ SINH ----------------
  function pyBlock(zh, py, big) { return `<div><div class="small muted" data-py>${esc(py)}</div><div class="zh" style="font-size:${big ? 22 : 18}px">${esc(zh)}</div></div>`; }
  function examGen(s, review) {
    freeURLs(); window.scrollTo(0, 0);
    const Q = s.questions, ans = review ? review.ans : new Array(40).fill(null), P = HSK1.PARTS;
    const groupHTML = (q) => q.part === 'L3' || q.part === 'R2' ? `<div class="groupbox">${q.group.map((e, i) => `<div><b>${AF[i]}</b><span class="pic" style="font-size:40px">${e}</span></div>`).join('')}</div>`
      : q.part === 'R3' ? `<div class="groupbox" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">${q.group.map((a, i) => `<div><b>${AF[i]}</b>${pyBlock(a[0], a[1])}</div>`).join('')}</div>`
      : q.part === 'R4' ? `<div class="groupbox">${q.group.map((w, i) => `<div><b>${AF[i]}</b>${pyBlock(w[0], w[1], true)}</div>`).join('')}</div>` : '';
    const st = (q, v) => !review ? (ans[q.n - 1] === v ? 'on' : '') : (v === q.ans ? 'right' : (ans[q.n - 1] === v ? 'wrong' : ''));
    const qHTML = (q) => {
      const play = q.audio ? `<button class="play" data-play="${q.n}">▶ Nghe</button>` : '';
      let body = '';
      if (q.type === 'tf') body = `<div class="row"><span class="pic">${q.pic}</span>${q.word ? pyBlock(q.word[0], q.word[1], true) : ''}<div class="tfbtns" style="margin-left:auto">${['Y', 'N'].map(v => `<button class="op ${st(q, v)}" style="min-width:52px;height:44px;font-size:20px" data-n="${q.n}" data-v="${v}">${lab(v)}</button>`).join('')}</div></div>`;
      else if (q.type === 'abc') body = `<div class="pics">${q.pics.map((e, i) => `<button class="choice ${st(q, AF[i])}" data-n="${q.n}" data-v="${AF[i]}"><span class="L">${AF[i]}</span><span class="big">${e}</span></button>`).join('')}</div>`;
      else if (q.type === 'abct') body = `<div class="pics">${q.opts.map((o, i) => `<button class="choice ${st(q, AF[i])}" data-n="${q.n}" data-v="${AF[i]}"><span class="L">${AF[i]}</span>${pyBlock(o[0], o[1], true)}</button>`).join('')}</div>`;
      else body = `${q.text ? `<div style="margin:4px 0 8px">${pyBlock(q.text[0], q.text[1], true)}</div>` : ''}<div class="row">${AF.split('').map(v => `<button class="op ${st(q, v)}" data-n="${q.n}" data-v="${v}">${v}</button>`).join('')}</div>`;
      const exp = review ? `<div class="exp">${ans[q.n - 1] === q.ans ? '✅' : '❌'} Đáp án: <b>${lab(q.ans)}</b>${ans[q.n - 1] && ans[q.n - 1] !== q.ans ? ` · bạn chọn ${lab(ans[q.n - 1])}` : (!ans[q.n - 1] ? ' · bạn bỏ trống' : '')}<br>${esc(q.exp)}</div>` : '';
      return `<div class="q" id="q${q.n}"><div class="qh"><span class="qn">${q.n}.</span>${play}</div>${body}${exp}</div>`;
    };
    let html = `<div class="row" style="justify-content:space-between"><h1 style="margin:0">${esc(s.name)}</h1><div class="row"><label class="small"><input type="checkbox" id="pyT" checked> Pinyin</label><button class="btn sm" id="back">← ${review ? 'Trang chủ' : 'Thoát'}</button></div></div>`;
    if (review) html += review.head;
    else html += `<p class="muted">Bấm <b>▶ Nghe</b> ở mỗi câu phần nghe (mỗi lần bấm đọc 2 lần như đề thật). Thời gian 40 phút.</p>`;
    let cur = '';
    for (const q of Q) {
      if (q.part !== cur) { cur = q.part; html += `</div><div class="part"><h2>${P[cur].t}</h2><p class="muted small">${P[cur].d}</p>${groupHTML(q)}`; }
      html += qHTML(q);
    }
    html += '</div>' + (review ? '' : `<button class="btn pri" style="margin-top:16px" id="sub2">Nộp bài</button>`);
    app.innerHTML = html.replace('</div><div class="part">', '<div class="part">');
    $('#back').onclick = () => (review || confirm('Thoát bài thi?')) && home();
    $('#pyT').onchange = (e) => app.querySelectorAll('[data-py]').forEach(x => x.style.display = e.target.checked ? '' : 'none');
    app.querySelectorAll('[data-play]').forEach(b => b.onclick = async () => {
      const q = Q[+b.dataset.play - 1];
      app.querySelectorAll('[data-play]').forEach(x => x.disabled = true); b.textContent = '🔊 Đang đọc…';
      const items = q.part === 'L1' || q.part === 'L2' ? q.audio : [...q.audio, ...q.audio];
      try { await TTS.play(items); } catch (e) { toast('Không phát được giọng đọc: ' + e.message); }
      app.querySelectorAll('[data-play]').forEach(x => x.disabled = false); b.textContent = '▶ Nghe lại';
    });
    if (review) { examChrome(false); return; }
    app.querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
      const n = +b.dataset.n; ans[n - 1] = ans[n - 1] === b.dataset.v ? null : b.dataset.v;
      app.querySelectorAll(`[data-n="${n}"]`).forEach(x => x.classList.toggle('on', x.dataset.v === ans[n - 1]));
    });
    const t0 = Date.now(), submit = () => { TTS.stop(); finish(s, ans, Date.now() - t0); };
    $('#sub2').onclick = () => confirm('Nộp bài?') && submit();
    examChrome(true, () => confirm('Nộp bài?') && submit()); startTimer(40, submit);
  }

  // ---------------- CHẤM ĐIỂM ----------------
  async function finish(s, ans, ms) {
    stopTimer(); examChrome(false);
    const key = s.key, ok = (i) => key[i] && ans[i] === key[i];
    const L = [...Array(20).keys()].filter(ok).length, R = [...Array(20).keys()].map(i => i + 20).filter(ok).length;
    const score = (L + R) * 5, pass = score >= 120, noKey = key.filter(Boolean).length < 40;
    const hist = LS.get('hsk.hist', {}); (hist[s.id] = hist[s.id] || []).push({ t: Date.now(), score }); LS.set('hsk.hist', hist);
    if (s.generated) { try { await DB.put(s); } catch (_) {} }
    const mm = Math.floor(ms / 60000), ss = Math.round(ms / 1000) % 60;
    const head = `<div class="score" style="margin:14px 0">
        <div><span class="muted small">Tổng điểm</span><b style="color:${pass ? 'var(--ok)' : 'var(--bad)'}">${score}/200</b><span class="badge ${pass ? 'ok' : 'bad'}">${pass ? 'ĐẠT' : 'CHƯA ĐẠT'} (≥120)</span></div>
        <div><span class="muted small">Nghe</span><b>${L * 5}/100</b><span class="muted small">${L}/20 câu đúng</span></div>
        <div><span class="muted small">Đọc</span><b>${R * 5}/100</b><span class="muted small">${R}/20 câu đúng</span></div>
        <div><span class="muted small">Thời gian</span><b>${mm}:${String(ss).padStart(2, '0')}</b></div></div>
        ${noKey ? '<p class="badge bad">Bộ đề thiếu đáp án – điểm chưa đầy đủ</p>' : ''}`;
    window.scrollTo(0, 0);
    if (s.generated) return examGen(s, { ans, head: head + `<div class="row" style="margin-bottom:8px"><button class="btn pri" id="again">🎲 Làm đề mới</button></div>` }) || bindAgain();
    freeURLs();
    app.innerHTML = `<div class="row" style="justify-content:space-between"><h1 style="margin:0">Kết quả · ${esc(s.name)}</h1><button class="btn sm" id="back">← Trang chủ</button></div>${head}
      <div class="row"><button class="btn pri" id="redo">Thi lại</button>${s.transcript && s.transcript.length ? '<button class="btn" id="tr">Xem lời thoại</button>' : ''}<button class="btn" id="pages">Xem đề + đáp án</button></div>
      <h2>Chi tiết từng câu</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${PDF_PARTS.map(([a, b, t]) => `<div class="card" style="padding:10px 12px"><div class="ptitle" style="margin-top:0">${t}</div>${Array.from({ length: b - a + 1 }, (_, k) => a + k).map(n => {
        const i = n - 1, good = ok(i);
        return `<div class="qrow"><b>${n}.</b><span class="op ${good ? 'right' : 'wrong'}" style="display:inline-grid;place-items:center">${lab(ans[i])}</span>${good ? '' : `<span class="small muted">→ ${lab(key[i])}</span>`}</div>`;
      }).join('')}</div>`).join('')}</div>`;
    $('#back').onclick = home; $('#redo').onclick = () => examPdf(s);
    if ($('#tr')) $('#tr').onclick = () => showTranscript(s);
    $('#pages').onclick = () => { overlay(`<div class="row" style="justify-content:space-between"><h2 style="margin:0">Đề · ${esc(s.name)}</h2><button class="btn sm" id="pc">Đóng</button></div><div class="pages" style="margin-top:10px">${s.pages.map(b => `<img src="${objURL(b)}">`).join('')}</div>`); $('#ovc').style.maxWidth = '900px'; $('#pc').onclick = () => { closeOv(); $('#ovc').style.maxWidth = ''; }; };
  }
  function bindAgain() { const a = $('#again'); if (a) a.onclick = () => examGen(HSK1.generate()); }
  const _examGen = examGen;
  // gắn nút "Làm đề mới" sau khi vẽ trang xem lại
  examGen = function (s, review) { _examGen(s, review); if (review) bindAgain(); };

  $('#home').onclick = () => { if (!timerH || confirm('Thoát bài thi đang làm?')) home(); };
  $('#ov').onclick = (e) => { if (e.target.id === 'ov') closeOv(); };
  home();
})();
