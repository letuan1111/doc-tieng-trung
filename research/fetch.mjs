// Tải nến OKX (XAU, BTC) M5/M15/H1 trong N ngày → research/data/*.json
import fs from 'node:fs';
const DAYS = +(process.argv[2] || 190), MS = { m5: 3e5, m15: 9e5, h1: 36e5 }, BAR = { m5: '5m', m15: '15m', h1: '1H' };
const SYM = { XAU: 'XAU-USDT-SWAP', BTC: 'BTC-USDT-SWAP' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function j(u) { for (let k = 0; k < 6; k++) { try { const r = await fetch(u); if (r.ok) { const x = await r.json(); if (x.code === '0') return x; } } catch (_) {} await sleep(1000 * (k + 1)); } throw new Error('fetch ' + u); }
fs.mkdirSync('research/data', { recursive: true });
for (const [s, inst] of Object.entries(SYM)) for (const tf of ['h1', 'm15', 'm5']) {
  const need = Math.ceil(DAYS * 864e5 / MS[tf]); let out = (await j(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${BAR[tf]}&limit=300`)).data;
  while (out.length < need) { const a = (await j(`https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=${BAR[tf]}&limit=100&after=${out[out.length - 1][0]}`)).data; if (!a.length) break; out = out.concat(a); await sleep(110); }
  const c = out.reverse().map(k => [+k[0], +k[1], +k[2], +k[3], +k[4], +k[5]]);
  fs.writeFileSync(`research/data/${s}_${tf}.json`, JSON.stringify(c));
  console.log(s, tf, c.length, new Date(c[0][0]).toISOString(), '→', new Date(c[c.length - 1][0]).toISOString());
}
