/* Early Reversal V1 — research / paper signals only. Closed candles only.
   Input: {m1,m5,m15} chronological OHLC candles with t,o,h,l,c.
   No broker orders, no claims of validated performance. */
(function(root){
'use strict';
const avg=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const ema=(a,n)=>{let v=a[0];const k=2/(n+1);for(let i=1;i<a.length;i++)v+=k*(a[i]-v);return v;};
const valid=a=>Array.isArray(a)&&a.length>=100&&a.every(x=>[x.o,x.h,x.l,x.c,x.t].every(Number.isFinite));
function run(data,opts={}){
 const {m1,m5,m15}=data||{};
 if(!valid(m1)||!valid(m5)||!valid(m15))return {state:'NO_DATA',reason:'Cần >=100 nến đã đóng trên M1/M5/M15'};
 const a=m1,b=m5,c=m15;const x=a.at(-1),p=a.at(-2),five=b.at(-1);
 if(x.t> Date.now() || five.t>Date.now())return {state:'NO_DATA',reason:'Dữ liệu có thời gian tương lai'};
 const h=b.slice(-21,-1),top=Math.max(...h.map(z=>z.h)),bottom=Math.min(...h.map(z=>z.l));
 const sweepSell=five.h>top&&five.c<top, sweepBuy=five.l<bottom&&five.c>bottom;
 const bodies=a.slice(-21,-1).map(z=>Math.abs(z.c-z.o));
 const big=Math.abs(x.c-x.o)>1.3*avg(bodies);
 const down=big&&x.c<x.o,up=big&&x.c>x.o;
 const localLow=Math.min(...a.slice(-12,-2).map(z=>z.l));
 const localHigh=Math.max(...a.slice(-12,-2).map(z=>z.h));
 const breakDown=x.c<localLow,breakUp=x.c>localHigh;
 const ema34=ema(a.slice(-90).map(z=>z.c),34);
 const m15e34=ema(c.map(z=>z.c),34),m15e89=ema(c.map(z=>z.c),89);
 const side=sweepSell?'SELL':sweepBuy?'BUY':null;
 if(!side)return {state:'WATCH',reason:'Chưa có sweep M5 đóng trở lại vùng 20 nến',trend:m15e34>=m15e89?'UP':'DOWN'};
 const displacement=side==='SELL'?down:up;
 const micro=side==='SELL'?breakDown:breakUp;
 const emaConfirm=side==='SELL'?x.c<ema34:x.c>ema34;
 const score=25+(displacement?25:0)+(micro?20:0)+(emaConfirm?15:0);
 const state=displacement&&micro?'EARLY':'WATCH';
 const invalidation=side==='SELL'?five.h:five.l;
 const risk=Math.abs(x.c-invalidation);
 return {state,side,score,trend:m15e34>=m15e89?'UP':'DOWN',
  reason:state==='EARLY'?'Sweep M5 + displacement M1 + phá swing nội bộ':'Đang chờ displacement và micro-CHoCH M1',
  entryReference:x.c,invalidation,risk,rr15Target:side==='SELL'?x.c-1.5*risk:x.c+1.5*risk,
  checks:{sweep:true,displacement,microChoch:micro,ema34:emaConfirm},
  candleTime:x.t,notice:'Cảnh báo nghiên cứu, không phải lệnh giao dịch. Chưa kiểm định backtest.'};
}
root.EarlyReversal={run};
})(typeof window!=='undefined'?window:globalThis);
