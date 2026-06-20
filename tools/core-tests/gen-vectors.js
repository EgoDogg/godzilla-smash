// Ground-truth vector generator: load the REAL web utils.js, dump bit-exact outputs.
global.window = global; // utils.js attaches to window.GAME
require('/Users/MGitk/Projects/Godzilla Game/js/utils.js');
const U = global.GAME.Utils;

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

process.stdout.write(JSON.stringify(out,null,1));
