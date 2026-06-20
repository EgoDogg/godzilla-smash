// Ground-truth vector generator: load the REAL web utils.js, dump bit-exact outputs.
// Paths are RELATIVE to this file (tools/core-tests/ -> ../../js/) so the repo can be renamed/moved freely.
const path = require('path');
const JS = (f) => path.resolve(__dirname, '../../js', f);
global.window = global; // utils.js attaches to window.GAME
require(JS('utils.js'));
const U = global.GAME.Utils;
require(JS('config.js')); // iso.js dep: Config.GRID — MUST load before iso.js
require(JS('iso.js'));     // attaches GAME.iso
const ISO = global.GAME.iso;

const out = {};
// --- clamp / lerp ---
out.clamp = [[5,0,10],[-3,0,10],[15,0,10],[0,0,0],[7.5,1.2,9.8],[-100,-50,50]].map(a=>({in:a,out:U.clamp(...a)}));
out.lerp  = [[0,10,0],[0,10,1],[0,10,0.5],[2,8,0.25],[-4,4,0.5],[1e9,12e9,0.33]].map(a=>({in:a,out:U.lerp(...a)}));

// --- fmt --- (every branch + boundaries + fractional + ROW_HP/WORLD2_COST)
out.fmt = [0,5,42,999,1000,1001,1234,1500,1999,9999,12345,999999,1000000,1500000,1750000,
           9999999,1e8,1e9,1050000000,1234567890,12000000000,1e12,1250000000000,9.99e11,
           16777216,16777217,1e9+1,-5,3.7,1234.9,
           // band-crossing edges: trim rounds up to "1000X" WITHOUT promoting the band
           999960000000,999950000,999950,9999990000,99999500000,
           // ROW_HP ladder + forms-economy magnitudes
           100000000000,1e11,5e11,999999999999].map(n=>({in:n,out:U.fmt(n)}));

// --- hash --- (int32 inputs incl. WORLD_SEED 0x9E3779B1)
out.hash = [0,1,2,-1,255,256,65535,65536,2654435761,-1640531535,0x45d9f3b,123456789,-123456789,
            2147483647,-2147483648].map(x=>({in:x,out:U.hash(x)}));

// --- mulberry32 (rng) --- first N floats per seed
function rngSeq(seed,n){const r=U.rng(seed);const a=[];for(let i=0;i<n;i++)a.push(r());return a;}
out.rng = {
  WORLD_SEED_0x9E3779B1: rngSeq(0x9E3779B1, 12),
  seed0:    rngSeq(0, 8),
  seed1:    rngSeq(1, 8),
  seed12345:rngSeq(12345, 8),
  seedMax:  rngSeq(0xFFFFFFFF, 6)
};

// --- utf8 --- byte arrays (emoji surrogate pair, multibyte) via code points to avoid shell mangling
const S = {
  empty:"", A:"A", AB:"AB",
  eacute:String.fromCodePoint(0xE9),          // é
  euro:String.fromCodePoint(0x20AC),          // €
  trex:String.fromCodePoint(0x1F996),         // 🦖
  jp:String.fromCodePoint(0x65E5,0x672C,0x8A9E), // 日本語
  mixed:"Hello, "+String.fromCodePoint(0x1F30D)+"!", // 🌍
  spaced:"a b"
};
out.utf8 = Object.entries(S).map(([k,s])=>({key:k,in:s,out:Array.from(U.utf8(s))}));

// --- crc32 --- (emoji + realistic GZS1-ish JSON payload)
const payload = JSON.stringify({v:4,money:12345678901,claws:7,forms:["gz2014","supernova"],rev:42});
out._payload = payload;
const crcInputs = {empty:"",a:"a",abc:"abc",hello:"hello",fox:"The quick brown fox",
                   trex:S.trex,jp:S.jp,payload:payload};
out.crc32 = Object.entries(crcInputs).map(([k,s])=>({key:k,in:s,out:U.crc32(s)}));

// --- b64u --- enc + round-trip dec
const b64Inputs = {empty:"",A:"A",hi:"hi",trex:S.trex+"rawr",jp:S.jp,payload:payload,
                   plusslash:"a+b/c=d",space:" "};
out.b64u = Object.entries(b64Inputs).map(([k,s])=>{
  const e=U.b64u.enc(s); return {key:k,in:s, enc:e, dec_roundtrip:U.b64u.dec(e)};
});
// decode-only of known url-safe inputs
out.b64u_dec_only = ["aGVsbG8","8J-mlg","5pel5pys6Kqe"].map(s=>({in:s,out:U.b64u.dec(s)}));

// --- iso.worldToScreen --- integer tiles, fractional centers, statue lift z=4, flyer altitude, corners, wz-omitted.
const wtsIn = [[0,0,0],[1,0,0],[0,1,0],[10,20,0],[20,57,0],[0.5,0.5,0],[10.5,20.5,0],
               [0,0,4],[5,5,2],[3.5,9.25,1.75],[0,57,0],[20,0,0],[10,20,undefined]];
out.worldToScreen = wtsIn.map(a=>{ const p=ISO.worldToScreen(a[0],a[1],a[2]); return {in:a,x:p.x,y:p.y}; });

// --- iso.depthKey --- building bias0, player +1, flyer alt+bias, lifted-flyer big bias, statue z=4, omitted fields.
const dkIn = [
  {wx:0,wy:0,wz:0,depthBias:0},{wx:0,wy:0,wz:0,depthBias:1},
  {wx:10,wy:20,wz:0,depthBias:0},{wx:10,wy:20,wz:0,depthBias:1},
  {wx:10.5,wy:20.5,wz:1.75,depthBias:1},
  {wx:5,wy:5,wz:2,depthBias:1+Math.ceil(Math.min(3,2*ISO.WZ/ISO.HH))*1024},
  {wx:3,wy:40,wz:0,depthBias:0},{wx:20,wy:57,wz:0,depthBias:0},
  {wx:0,wy:0,wz:4,depthBias:0},{wx:0,wy:0},{wx:2,wy:2,wz:0.5,depthBias:0}];
out.depthKey = dkIn.map(e=>({in:e,out:ISO.depthKey(e)}));
out.isoConst = {HW:ISO.HW,HH:ISO.HH,WZ:ISO.WZ,COLS:ISO.COLS,ROWS:ISO.ROWS};

// --- trauma --- faithful node mirror of iso.js camera.shake (:154-156 add) / camera.update (:137-140 decay) / (:140 offset),
// computed in V8 so the C# checks are a real V8<->.NET parity gate (the Math.pow ULP risk the spec flags).
const SHAKE_DECAY=0.02, SHAKE_TRAUMA_K=1/85, SHAKE_MAX=12, FLOOR=0.004;
const tAdd  = (t,mag)=> (mag>0) ? Math.min(t + mag*SHAKE_TRAUMA_K, 1) : t;
const tDecay= (t,dt)=> { if(t>FLOOR){ let e=dt>0?dt:0; t*=Math.pow(SHAKE_DECAY,e); if(t<FLOOR)t=0; } else t=0; return t; };
out.trauma_add = [[0,3],[0,9],[0,13],[0,14],[0.9,14],[0,0.5],[0.5,-3]].map(([t,m])=>({t,mag:m,out:tAdd(t,m)}));
out.trauma_decay = [[1,1/60],[1,1/30],[0.5,1/60],[0.0041,1/60],[0.004,1/60],[0.003,1/60],[0.106,0.1]].map(([t,dt])=>({t,dt,out:tDecay(t,dt)}));
out.trauma_offset = [0,0.0035,0.106,0.153,0.5,1].map(t=>({t,out:SHAKE_MAX*t}));
const seq=[]; let ts=tAdd(0,13); seq.push(ts); for(let i=0;i<30;i++){ ts=tDecay(ts,1/60); seq.push(ts); }
out.trauma_seq = {add:13, steps:30, dt:1/60, vals:seq};

process.stdout.write(JSON.stringify(out,null,1));
