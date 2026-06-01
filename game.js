'use strict';
/* =====================================================================
   GODZILLA SMASH — World 1 engine
   Tap a building -> Godzilla torches it -> destroy = bank its HP as money.
   Money buys: Stronger Claws, 5 MonsterVerse Evolutions, World 2 (pay-to-unlock).
   Everything persists (localStorage). Fully procedural canvas, no assets.
   Godzilla is a left-anchored side profile facing the city he's destroying.
   ===================================================================== */

/* ----------------------------- CONFIG ----------------------------- */
const CONFIG = {
  startAttack: 200,
  powerGrowth: 1.55,      // Stronger Claws multiplier per level
  baseUpgradeCost: 300,
  costGrowth: 1.9,
  respawnMs: 4500,        // razed building rebuild delay
  groundFrac: 0.86,
  saveKey: 'godzilla-save-v1',
  saveVersion: 1,
};

// The evolution ladder — drives BOTH economy (cost/mult) and art (palette/fx).
const EVOLUTIONS = [
  { name:'Godzilla', year:'2014', cost:0, mult:1,
    skin:'#3c3c3c', skinDark:'#1e1e1e', skinLight:'#565656',
    plate:'#2b2b2b', plateEdge:'#8fc2ee', plateGlow:'rgba(70,160,235,0.45)',
    breath:['#9bdcff','#ffffff'], breathGlow:'rgba(70,170,255,0.9)',
    eye:'#ffbe3a', aura:null, fx:null },
  { name:'Burning Godzilla', year:'2019', cost:50000, mult:3,
    skin:'#2c2622', skinDark:'#150f0b', skinLight:'#54381f',
    plate:'#3a1c0e', plateEdge:'#ff7a1a', plateGlow:'rgba(255,110,20,0.95)',
    breath:['#9ad0ff','#ffffff'], breathGlow:'rgba(90,170,255,0.85)',
    eye:'#ffd24a', aura:'rgba(255,90,20,0.18)', fx:'heat' },
  { name:'Godzilla · GvK', year:'2021', cost:500000, mult:9,
    skin:'#3e444b', skinDark:'#21262b', skinLight:'#647682',
    plate:'#33424c', plateEdge:'#cdecff', plateGlow:'rgba(70,180,255,0.65)',
    breath:['#36c9ff','#ffffff'], breathGlow:'rgba(54,201,255,0.95)',
    eye:'#ffcf4a', aura:'rgba(60,160,255,0.13)', fx:null },
  { name:'Evolved Godzilla', year:'2024', cost:5000000, mult:36,
    skin:'#2c2731', skinDark:'#16101a', skinLight:'#4c2942',
    plate:'#2a2330', plateEdge:'#ff6cc6', plateGlow:'rgba(255,70,185,0.9)',
    breath:['#ff7ad0','#ffe1f4'], breathGlow:'rgba(255,60,180,0.95)',
    eye:'#ffd6f2', aura:'rgba(255,40,160,0.18)', fx:'pink' },
  { name:'Supernova Godzilla', year:'2027', cost:50000000, mult:180, spec:true,
    skin:'#251440', skinDark:'#0d011a', skinLight:'#522485',
    plate:'#2a0a55', plateEdge:'#dcb0ff', plateGlow:'rgba(165,90,230,0.98)',
    breath:['#ffffff','#b07dff'], breathGlow:'rgba(200,120,255,0.98)',
    eye:'#ffffff', aura:'rgba(157,78,221,0.24)', fx:'cosmic' },
];
const WORLD2_COST = 100000000;

// Future "Characters" money sink — locked teaser only this build.
const CHARACTERS = [
  ['King Ghidorah','Triple lightning — hits 3 buildings at once'],
  ['Mothra','Aerial strafe + powder-cloud damage over time'],
  ['Mechagodzilla','Missile spray + laser grid'],
  ['Rodan','Divebomb + impact shockwave'],
  ['Gigan','Whirling slash — all adjacent targets'],
  ['Anguirus','Armored charge — knockback, level a row'],
  ['Destoroyah','Oxygen-destroyer pulse — % max-HP DoT'],
  ['Biollante','Root entangle — damaging zones'],
  ['SpaceGodzilla','Crystal turrets — static auto-damage'],
  ['King Kong','Ground pound — big AOE + stun'],
];

// World 1 building strip (HP = cash). Tiers control size/look.
const BTIERS = {
  shack:   { w:50,  h:64,  roof:true,  body:'#7d6b5e', roofC:'#52443a', win:false },
  house:   { w:62,  h:106, roof:true,  body:'#8a7a6b', roofC:'#473a30', win:false },
  midrise: { w:74,  h:178, roof:false, body:'#6f7c88', roofC:null,      win:true  },
  big:     { w:88,  h:250, roof:false, body:'#5f6b78', roofC:null,      win:true  },
  tower:   { w:100, h:346, roof:false, body:'#525e6b', roofC:null,      win:true  },
};
const WORLD1 = [
  ['shack',600],['shack',1000],['house',10000],['house',70000],['house',120000],
  ['midrise',500000],['midrise',1300000],['big',4500000],['tower',12000000],['tower',30000000],
];

/* ----------------------------- STATE ----------------------------- */
const state = {
  money:0, clawsLevel:0, evoTier:0, world2Unlocked:false, totalDestroyed:0, muted:false,
  buildings:[], particles:[], damageTexts:[], moneyTexts:[],
  shake:0, beam:null,
  gz:{ breathe:0, mouth:0, lunge:0, flash:0 },
  transition:null,           // {t,total}
  shopOpen:false, shopTab:'upgrades',
  introT:5.5,
};

/* --------------------------- SAVE / LOAD -------------------------- */
function save() {
  try {
    localStorage.setItem(CONFIG.saveKey, JSON.stringify({
      v:CONFIG.saveVersion, money:state.money, clawsLevel:state.clawsLevel,
      evoTier:state.evoTier, world2Unlocked:state.world2Unlocked,
      totalDestroyed:state.totalDestroyed, muted:state.muted,
    }));
  } catch(e) {}
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(CONFIG.saveKey) || 'null');
    if (!s || s.v !== CONFIG.saveVersion) return;
    state.money = s.money||0; state.clawsLevel = s.clawsLevel||0;
    state.evoTier = Math.min(s.evoTier||0, EVOLUTIONS.length-1);
    state.world2Unlocked = !!s.world2Unlocked;
    state.totalDestroyed = s.totalDestroyed||0; state.muted = !!s.muted;
  } catch(e) {}
}

/* ----------------------------- ECONOMY --------------------------- */
function form() { return EVOLUTIONS[state.evoTier]; }
function nextEvo() { return state.evoTier < EVOLUTIONS.length-1 ? EVOLUTIONS[state.evoTier+1] : null; }
function attackPower() { return Math.round(CONFIG.startAttack * form().mult * Math.pow(CONFIG.powerGrowth, state.clawsLevel)); }
function clawsCost() { return Math.round(CONFIG.baseUpgradeCost * Math.pow(CONFIG.costGrowth, state.clawsLevel)); }
function nextClawsAttack() { return Math.round(CONFIG.startAttack * form().mult * Math.pow(CONFIG.powerGrowth, state.clawsLevel+1)); }

function buyClaws() {
  const c = clawsCost();
  if (state.money < c) return deny();
  state.money -= c; state.clawsLevel++; sfx('buy'); save(); updateHUD(); refreshShop();
}
function buyEvolution() {
  const n = nextEvo(); if (!n) return;
  if (state.money < n.cost) return deny();
  state.money -= n.cost; state.evoTier++;
  triggerTransition(); sfx('evolve'); save(); updateHUD(); refreshShop();
  toast(`Evolved → ${form().name}!`);
}
function buyWorld2() {
  if (state.world2Unlocked) return;
  if (state.money < WORLD2_COST) return deny();
  state.money -= WORLD2_COST; state.world2Unlocked = true; sfx('evolve'); save(); updateHUD(); refreshShop();
  toast('World 2 unlocked — Coming soon! 🌆');
}
function deny() { sfx('deny'); const p=document.getElementById('shop-panel'); if(p&&p.animate){ p.animate([{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],{duration:160}); } }

/* ------------------------- CANVAS / LAYOUT ----------------------- */
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
let W=0, H=0, S=1, groundY=0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W*dpr); canvas.height = Math.floor(H*dpr);
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  S = clamp(Math.min(W/1280, H/780), 0.6, 1.3);
  groundY = H*CONFIG.groundFrac;
  layout();
}
function layout() {
  if (state.buildings.length === 0) {
    state.buildings = WORLD1.map(([tier,hp]) => ({
      tier, maxHp:hp, hp, destroyed:false, respawnAt:0, flash:0, hitShake:0,
      win: Math.floor(Math.random()*1000),
    }));
  }
  const n = state.buildings.length;
  const left = W*0.30, right = W - 24*S;        // city sits to the RIGHT of Godzilla
  const slot = (right-left)/n;
  state.buildings.forEach((b,i) => {
    const t = BTIERS[b.tier];
    b.w = t.w*S; b.h = t.h*S;
    b.cx = left + slot*(i+0.5); b.x = b.cx - b.w/2; b.y = groundY - b.h;
    b.roofH = t.roof ? b.w*0.5 : 0; b.top = b.y - b.roofH;
  });
}

/* ----------------------------- HELPERS --------------------------- */
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }
function rand(a,b){ return a + Math.random()*(b-a); }
function lerp(a,b,t){ return a+(b-a)*t; }
function fmt(n){ n=Math.max(0,Math.floor(n));
  if(n>=1e9) return trim(n/1e9)+'B'; if(n>=1e6) return trim(n/1e6)+'M';
  if(n>=1e3) return trim(n/1e3)+'k'; return ''+n; }
function trim(x){ return (Math.round(x*10)/10).toString(); }
function shade(hex,f){ const c=hex.replace('#',''); const n=parseInt(c,16);
  let r=clamp(Math.round(((n>>16)&255)*f),0,255), g=clamp(Math.round(((n>>8)&255)*f),0,255), b=clamp(Math.round((n&255)*f),0,255);
  return 'rgb('+r+','+g+','+b+')'; }

/* ------------------------------ AUDIO ---------------------------- */
let actx = null;
function ensureAudio(){ if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } if(actx&&actx.state==='suspended') actx.resume(); }
function tone(type,f0,f1,dur,g){ if(!actx) return; const o=actx.createOscillator(),ga=actx.createGain(),t=actx.currentTime;
  o.type=type; o.frequency.setValueAtTime(f0,t); if(f1) o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);
  ga.gain.setValueAtTime(g,t); ga.gain.exponentialRampToValueAtTime(0.001,t+dur);
  o.connect(ga); ga.connect(actx.destination); o.start(t); o.stop(t+dur); }
function noise(dur,g,freq){ if(!actx) return; const b=actx.createBuffer(1,Math.floor(actx.sampleRate*dur),actx.sampleRate);
  const d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  const s=actx.createBufferSource(); s.buffer=b; const f=actx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=freq;
  const ga=actx.createGain(),t=actx.currentTime; ga.gain.setValueAtTime(g,t); ga.gain.exponentialRampToValueAtTime(0.001,t+dur);
  s.connect(f); f.connect(ga); ga.connect(actx.destination); s.start(t); }
function sfx(type){ if(state.muted||!actx) return;
  if(type==='hit'){ tone('square',190,110,0.07,0.05); noise(0.05,0.04,1400); }
  else if(type==='destroy'){ tone('sine',120,40,0.34,0.16); noise(0.3,0.18,900); }
  else if(type==='buy'){ tone('triangle',620,880,0.1,0.06); }
  else if(type==='evolve'){ tone('sawtooth',120,420,0.55,0.12); noise(0.5,0.12,1600); tone('sine',300,120,0.5,0.08); }
  else if(type==='deny'){ tone('square',140,90,0.12,0.05); }
}

/* ------------------------------ INPUT ---------------------------- */
function onPointer(e){
  ensureAudio();
  if(state.shopOpen) return;
  const r = canvas.getBoundingClientRect();
  const px = e.clientX-r.left, py = e.clientY-r.top;
  for(let i=state.buildings.length-1;i>=0;i--){
    const b=state.buildings[i];
    if(b.destroyed) continue;
    if(px>=b.x && px<=b.x+b.w && py>=b.top && py<=groundY){ hitBuilding(b,px,py); return; }
  }
}

/* ---------------------------- GAME ACTIONS ----------------------- */
function hitBuilding(b,px,py){
  const dmg = attackPower();
  b.hp -= dmg; b.flash = 1; b.hitShake = 5*S;
  addShake(clamp(2+dmg/60000,2,9));
  gzAttack(b); sfx('hit');
  state.damageTexts.push({ x:px, y:py-8, vy:-42, t:0.85, txt:'-'+fmt(dmg) });
  spawnDebris(b,5,1);
  if(b.hp<=0){ b.hp=0; destroyBuilding(b); }
}
function destroyBuilding(b){
  b.destroyed=true; b.respawnAt=nowMs+CONFIG.respawnMs;
  state.money += b.maxHp; state.totalDestroyed += b.maxHp;
  addShake(11); sfx('destroy');
  state.moneyTexts.push({ x:b.cx, y:b.top-6, vy:-36, t:1.5, txt:'+'+fmt(b.maxHp) });
  spawnDebris(b,30,1);
  updateHUD(); if(state.shopOpen) refreshShop(); save();
}
function spawnDebris(b,count,intensity){
  const col = BTIERS[b.tier].body;
  for(let i=0;i<count;i++) state.particles.push({
    x:rand(b.x,b.x+b.w), y:rand(b.top,groundY),
    vx:rand(-130,130)*intensity, vy:rand(-260,-40)*intensity,
    g:640, size:rand(3,8)*S, t:rand(0.5,1.1), col });
}
function addShake(v){ state.shake=Math.max(state.shake,v); }
function gzAttack(b){
  const gz=state.gz; gz.mouth=1; gz.lunge=1;
  const m=gzMouth(); state.beam={ sx:m.x, sy:m.y, x:b.cx, y:b.top+b.h*0.35, t:0.16 };
}
function triggerTransition(){ state.transition={ t:1.1, total:1.1 }; state.gz.flash=1; addShake(8); }

/* ------------------------------ UPDATE --------------------------- */
let nowMs=0, last=0;
function update(dt){
  for(const arr of [state.damageTexts, state.moneyTexts])
    for(let i=arr.length-1;i>=0;i--){ const f=arr[i]; f.t-=dt; f.y+=f.vy*dt; f.vy*=0.92; if(f.t<=0) arr.splice(i,1); }
  for(let i=state.particles.length-1;i>=0;i--){ const p=state.particles[i];
    p.t-=dt; p.vy+=p.g*dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
    if(p.y>groundY){ p.y=groundY; p.vy*=-0.35; p.vx*=0.6; } if(p.t<=0) state.particles.splice(i,1); }
  for(const b of state.buildings){
    b.flash=Math.max(0,b.flash-dt*4); b.hitShake*=0.86;
    if(b.destroyed && nowMs>=b.respawnAt){ b.destroyed=false; b.hp=b.maxHp; b.flash=0.6; spawnDebris(b,8,0.5); }
  }
  const gz=state.gz;
  gz.breathe += dt;
  gz.mouth=Math.max(0,gz.mouth-dt*3); gz.lunge=Math.max(0,gz.lunge-dt*4); gz.flash=Math.max(0,gz.flash-dt*2.2);
  if(state.beam){ state.beam.t-=dt; if(state.beam.t<=0) state.beam=null; }
  if(state.transition){ state.transition.t-=dt; if(state.transition.t<=0) state.transition=null; }
  state.shake*=0.88;
  if(state.introT>0) state.introT-=dt;
}

/* ------------------------------ RENDER --------------------------- */
function render(){
  ctx.clearRect(0,0,W,H);
  drawSky();
  ctx.save();
  if(state.shake>0.2) ctx.translate(rand(-state.shake,state.shake), rand(-state.shake,state.shake));
  drawParallax();
  drawGround();
  drawGodzilla();
  for(const b of state.buildings) b.destroyed ? drawRubble(b) : drawBody(b);
  for(const b of state.buildings) if(!b.destroyed) drawLabel(b);
  drawBeam();
  drawParticles();
  drawTexts();
  ctx.restore();
  drawTransitionFlash();
  drawIntro();
}

function drawSky(){
  const g=ctx.createLinearGradient(0,0,0,H);
  const f=form();
  const top = f.fx==='cosmic' ? '#160a2e' : f.fx==='pink' ? '#241430' : '#141d34';
  g.addColorStop(0,top); g.addColorStop(0.55,'#2c2444'); g.addColorStop(1,'#5a3a52');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.save(); ctx.shadowColor='rgba(255,243,205,0.6)'; ctx.shadowBlur=40;
  ctx.fillStyle='rgba(255,243,205,0.9)'; ctx.beginPath(); ctx.arc(W*0.84,H*0.16,44*S,0,7); ctx.fill(); ctx.restore();
}
function drawParallax(){
  const layers=[{c:'rgba(20,24,46,0.45)',hf:0.55,step:64},{c:'rgba(14,16,32,0.6)',hf:0.8,step:48}];
  for(const L of layers){ ctx.fillStyle=L.c; let x=-20;
    for(let i=0;x<W+40;i++){ const w=(28+((i*53)%60))*S, h=(40+((i*97)%150))*S*L.hf;
      ctx.fillRect(x,groundY-h,w,h); x+=w+L.step*0.1*S+6*S; } }
}
function drawGround(){
  const g=ctx.createLinearGradient(0,groundY,0,H);
  g.addColorStop(0,'#241a2b'); g.addColorStop(1,'#150e1b');
  ctx.fillStyle=g; ctx.fillRect(0,groundY,W,H-groundY);
  ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(0,groundY+0.5); ctx.lineTo(W,groundY+0.5); ctx.stroke();
}

function drawBody(b){
  const jx=b.hitShake?rand(-b.hitShake,b.hitShake):0, t=BTIERS[b.tier];
  ctx.save(); ctx.translate(jx,0);
  // body with side shading (lit left edge, shadowed right)
  const g=ctx.createLinearGradient(b.x,0,b.x+b.w,0);
  g.addColorStop(0,shade(t.body,1.2)); g.addColorStop(0.12,shade(t.body,1.06));
  g.addColorStop(0.55,t.body); g.addColorStop(1,shade(t.body,0.72));
  ctx.fillStyle=g; ctx.fillRect(b.x,b.y,b.w,b.h);
  const dmg=1-b.hp/b.maxHp;
  if(dmg>0.02){ ctx.fillStyle='rgba(0,0,0,'+(dmg*0.45).toFixed(3)+')'; ctx.fillRect(b.x,b.y,b.w,b.h); }
  if(t.win) drawWindows(b);
  if(t.roof){
    ctx.fillStyle=t.roofC; ctx.beginPath(); ctx.moveTo(b.x-3*S,b.y); ctx.lineTo(b.cx,b.y-b.roofH); ctx.lineTo(b.x+b.w+3*S,b.y); ctx.closePath(); ctx.fill();
  } else {
    // flat-roof cap + rooftop details (tank + antenna with light)
    ctx.fillStyle=shade(t.body,0.8); ctx.fillRect(b.x-2*S,b.y,b.w+4*S,5*S);
    ctx.fillStyle=shade(t.body,0.66); ctx.fillRect(b.cx-b.w*0.26, b.y-7*S, b.w*0.26, 7*S);
    ctx.strokeStyle='rgba(255,255,255,0.16)'; ctx.lineWidth=2*S;
    ctx.beginPath(); ctx.moveTo(b.cx+b.w*0.22,b.y); ctx.lineTo(b.cx+b.w*0.22,b.y-15*S); ctx.stroke();
    ctx.save(); ctx.shadowColor='#ff5a5a'; ctx.shadowBlur=6; ctx.fillStyle='#ff6a6a';
    ctx.beginPath(); ctx.arc(b.cx+b.w*0.22,b.y-15*S,2.2*S,0,7); ctx.fill(); ctx.restore();
  }
  ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1.5; ctx.strokeRect(b.x,b.y,b.w,b.h);
  if(b.flash>0){ ctx.fillStyle='rgba(255,255,255,'+(b.flash*0.6).toFixed(3)+')'; ctx.fillRect(b.x,b.y,b.w,b.h); }
  ctx.restore();
}
function drawWindows(b){
  const cols=Math.max(2,Math.floor(b.w/(14*S))), rows=Math.max(2,Math.floor(b.h/(20*S)));
  const mx=b.w*0.16,my=b.h*0.07,cw=(b.w-mx*2)/cols,ch=(b.h-my*2)/rows;
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    const lit=((r*7+c*13+b.win)%5)<3;
    ctx.fillStyle=lit?'rgba(255,221,128,0.9)':'rgba(28,38,52,0.7)';
    ctx.fillRect(b.x+mx+c*cw+cw*0.18, b.y+my+r*ch+ch*0.18, cw*0.64, ch*0.6);
  }
}
function drawLabel(b){
  const dmg=1-b.hp/b.maxHp;
  const fs=clamp(b.w*0.32,12,24);
  ctx.font='700 '+fs+'px ui-monospace,Menlo,monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillText(fmt(b.hp), b.cx+1, b.y+b.h/2+1);
  ctx.fillStyle='#fff'; ctx.fillText(fmt(b.hp), b.cx, b.y+b.h/2);
  if(dmg>0.001){ const bw=b.w,bh=6*S,by=b.top-12*S;
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(b.x,by,bw,bh);
    ctx.fillStyle=b.hp/b.maxHp>0.3?'#5ad469':'#e0564b'; ctx.fillRect(b.x,by,bw*(b.hp/b.maxHp),bh);
  }
}
function drawRubble(b){
  ctx.fillStyle='rgba(50,40,46,0.9)'; const rw=b.w*1.05,rh=15*S;
  ctx.beginPath(); ctx.moveTo(b.cx-rw/2,groundY); ctx.quadraticCurveTo(b.cx,groundY-rh*2.4,b.cx+rw/2,groundY); ctx.closePath(); ctx.fill();
  const left=Math.max(0,(b.respawnAt-nowMs)/1000);
  ctx.font='600 '+(11*S)+'px ui-monospace,monospace'; ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillStyle='rgba(255,255,255,0.45)'; ctx.fillText('rebuilding '+left.toFixed(1)+'s', b.cx, groundY-rh*1.2);
}

/* ----------------------------- GODZILLA -------------------------- */
/* Side profile, anchored left, FACING RIGHT toward the city. */
function gzGeom(){ const gh=clamp(H*0.49,260,500); const gw=gh*0.52; return { gx:W*0.15, baseY:groundY+4, gh, gw }; }
function gzMouth(){ const G=gzGeom(); return { x:G.gx+G.gw*0.6, y:G.baseY-G.gh*0.81 }; }

function drawGodzilla(){
  const f=form(), gz=state.gz, G=gzGeom(), gh=G.gh, gw=G.gw;
  const breathe=(Math.sin(gz.breathe*1.6)+1)/2;
  ctx.save();
  ctx.translate(G.gx+gz.lunge*gw*0.12, G.baseY);
  if(state.transition){ const p=1-state.transition.t/state.transition.total; const s=1+Math.sin(p*Math.PI)*0.06; ctx.scale(s,s); }
  ctx.translate(0, -breathe*gh*0.012);
  // ground shadow
  ctx.fillStyle='rgba(0,0,0,0.30)'; ctx.beginPath(); ctx.ellipse(0,2,gw*0.95,gh*0.045,0,0,7); ctx.fill();
  gzBody(f,gh,gw,gz,breathe);
  ctx.restore();
}
function gzBody(f,gh,gw,gz,breathe){
  const skin=f.skin, dark=f.skinDark, light=f.skinLight;
  // aura
  if(f.aura){ const ag=ctx.createRadialGradient(gw*0.05,-gh*0.5,gh*0.08,gw*0.05,-gh*0.5,gh*0.72);
    ag.addColorStop(0,f.aura); ag.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=ag;
    ctx.beginPath(); ctx.arc(gw*0.05,-gh*0.5,gh*0.72,0,7); ctx.fill(); }

  // tail (behind, trailing left)
  ctx.fillStyle=dark; ctx.beginPath();
  ctx.moveTo(-gw*0.10,-gh*0.34);
  ctx.quadraticCurveTo(-gw*0.9,-gh*0.46,-gw*1.34,-gh*0.12);
  ctx.quadraticCurveTo(-gw*1.2,-gh*0.03,-gw*1.0,-gh*0.10);
  ctx.quadraticCurveTo(-gw*0.6,-gh*0.24,-gw*0.10,-gh*0.20);
  ctx.closePath(); ctx.fill();

  // far leg (back, darker)
  ctx.fillStyle=dark; gzLeg(-gw*0.18,gh,gw);

  // body silhouette with vertical shading (hunched back, belly front-right)
  const bg=ctx.createLinearGradient(0,-gh*0.9,0,-gh*0.1);
  bg.addColorStop(0,light); bg.addColorStop(0.5,skin); bg.addColorStop(1,dark);
  ctx.fillStyle=bg; ctx.beginPath();
  ctx.moveTo(-gw*0.36,-gh*0.30);
  ctx.quadraticCurveTo(-gw*0.48,-gh*0.66,-gw*0.16,-gh*0.78);   // back hump
  ctx.quadraticCurveTo(0,-gh*0.86,gw*0.24,-gh*0.80);           // shoulders
  ctx.quadraticCurveTo(gw*0.38,-gh*0.78,gw*0.44,-gh*0.64);     // neck base
  ctx.quadraticCurveTo(gw*0.54,-gh*0.48,gw*0.44,-gh*0.32);     // chest/belly
  ctx.quadraticCurveTo(gw*0.38,-gh*0.15,gw*0.08,-gh*0.15);     // lower belly
  ctx.quadraticCurveTo(-gw*0.18,-gh*0.15,-gw*0.36,-gh*0.30);
  ctx.closePath(); ctx.fill();

  // belly highlight
  ctx.save(); ctx.globalAlpha=0.4; ctx.fillStyle=light;
  ctx.beginPath(); ctx.ellipse(gw*0.18,-gh*0.36,gw*0.18,gh*0.17,0.2,0,7); ctx.fill(); ctx.restore();

  // near leg (front, lit) + near arm
  ctx.fillStyle=skin; gzLeg(gw*0.16,gh,gw);
  ctx.fillStyle=skin; gzArm(gw*0.34,-gh*0.52,gh,gw);

  // dorsal plates along the back
  gzPlates(f,gh,gw,breathe);

  // neck + head (snout right)
  const mo=gz.mouth*gh*0.045;
  ctx.fillStyle=skin;
  ctx.beginPath();
  ctx.moveTo(gw*0.14,-gh*0.78); ctx.quadraticCurveTo(gw*0.32,-gh*0.86,gw*0.44,-gh*0.84);
  ctx.lineTo(gw*0.46,-gh*0.68); ctx.quadraticCurveTo(gw*0.32,-gh*0.66,gw*0.20,-gh*0.66); ctx.closePath(); ctx.fill();
  // upper head + snout
  ctx.beginPath();
  ctx.moveTo(gw*0.34,-gh*0.84);
  ctx.quadraticCurveTo(gw*0.50,-gh*0.92,gw*0.62,-gh*0.85);
  ctx.quadraticCurveTo(gw*0.72,-gh*0.82,gw*0.72,-gh*0.795);
  ctx.lineTo(gw*0.67,-gh*0.785);
  ctx.quadraticCurveTo(gw*0.54,-gh*0.78,gw*0.46,-gh*0.79);
  ctx.quadraticCurveTo(gw*0.38,-gh*0.80,gw*0.34,-gh*0.81); ctx.closePath(); ctx.fill();
  // lower jaw (opens)
  ctx.beginPath();
  ctx.moveTo(gw*0.38,-gh*0.775);
  ctx.quadraticCurveTo(gw*0.55,-gh*0.745+mo,gw*0.66,-gh*0.765+mo*0.6);
  ctx.quadraticCurveTo(gw*0.54,-gh*0.725+mo,gw*0.40,-gh*0.745+mo*0.4); ctx.closePath(); ctx.fill();
  // teeth when open
  if(gz.mouth>0.15){ ctx.fillStyle='#f3ead7'; for(let i=0;i<3;i++){ const tx=gw*(0.48+i*0.06); ctx.beginPath(); ctx.moveTo(tx,-gh*0.785); ctx.lineTo(tx+gw*0.018,-gh*0.785); ctx.lineTo(tx+gw*0.009,-gh*0.76); ctx.closePath(); ctx.fill(); } }
  // brow
  ctx.fillStyle=dark; ctx.beginPath();
  ctx.moveTo(gw*0.48,-gh*0.86); ctx.quadraticCurveTo(gw*0.58,-gh*0.885,gw*0.63,-gh*0.84);
  ctx.lineTo(gw*0.59,-gh*0.825); ctx.quadraticCurveTo(gw*0.52,-gh*0.84,gw*0.48,-gh*0.84); ctx.closePath(); ctx.fill();
  // eye
  ctx.save(); ctx.shadowColor=f.eye; ctx.shadowBlur=16; ctx.fillStyle=f.eye;
  ctx.beginPath(); ctx.ellipse(gw*0.55,-gh*0.842,gw*0.035,gh*0.022,0,0,7); ctx.fill(); ctx.restore();
  ctx.fillStyle='#140a00'; ctx.beginPath(); ctx.ellipse(gw*0.565,-gh*0.842,gw*0.013,gh*0.015,0,0,7); ctx.fill();

  // rim light along the moonlit back
  ctx.save(); ctx.strokeStyle='rgba(255,250,235,0.22)'; ctx.lineWidth=2.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-gw*0.16,-gh*0.78);
  ctx.quadraticCurveTo(0,-gh*0.86,gw*0.24,-gh*0.80);
  ctx.quadraticCurveTo(gw*0.38,-gh*0.78,gw*0.44,-gh*0.64); ctx.stroke(); ctx.restore();

  // form FX
  if(f.fx==='heat') gzFx(gh,gw,'#ff7a1a','#ff6a1a',[[0.04,0.58,0.2,0.42],[0.2,0.5,0.34,0.4],[-0.04,0.5,0.1,0.4],[0.3,0.6,0.4,0.5]]);
  else if(f.fx==='pink') gzFx(gh,gw,'#ff7ad0','#ff4fbf',[[0.04,0.55,0.22,0.42],[0.18,0.46,0.34,0.42],[0.3,0.6,0.42,0.52]]);
  else if(f.fx==='cosmic') gzCosmic(gh,gw);
}
function gzLeg(x,gh,gw){ const w=gh*0.072;
  ctx.beginPath();
  ctx.moveTo(x-w,-gh*0.36);
  ctx.quadraticCurveTo(x-w*1.15,-gh*0.16,x-w*0.85,-gh*0.03);
  ctx.lineTo(x-w*0.9,0); ctx.lineTo(x+w*1.7,0);                 // foot points right
  ctx.quadraticCurveTo(x+w*1.2,-gh*0.05,x+w,-gh*0.13);
  ctx.quadraticCurveTo(x+w*1.15,-gh*0.27,x+w*0.9,-gh*0.36);
  ctx.closePath(); ctx.fill();
}
function gzArm(x,y,gh,gw){ const w=gh*0.038;
  ctx.beginPath(); ctx.moveTo(x-w,y);
  ctx.quadraticCurveTo(x+w*2.4,y+gh*0.02,x+w*2.1,y+gh*0.15);
  ctx.lineTo(x+w*0.9,y+gh*0.155);
  ctx.quadraticCurveTo(x-w*0.2,y+gh*0.05,x-w,y); ctx.closePath(); ctx.fill();
}
function gzPlates(f,gh,gw,breathe){
  const N=10; ctx.save(); ctx.shadowColor=f.plateGlow; ctx.shadowBlur=14+breathe*12;
  for(let i=0;i<=N;i++){ const t=i/N;
    const x=lerp(gw*0.28,-gw*0.52,t);
    const y=-(lerp(0.80,0.40,t)+Math.sin(t*Math.PI)*0.06)*gh;
    const size=(Math.sin(t*Math.PI)*0.13+0.045)*gh;
    ctx.fillStyle=f.skinLight; ctx.beginPath();
    ctx.moveTo(x+gw*0.06,y+size*0.30); ctx.lineTo(x-gw*0.01,y-size); ctx.lineTo(x-gw*0.10,y+size*0.30);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle=f.plateEdge; ctx.lineWidth=2.4; ctx.stroke();
  }
  ctx.restore();
}
function gzFx(gh,gw,stroke,glow,segs){ ctx.save(); ctx.shadowColor=glow; ctx.shadowBlur=10; ctx.strokeStyle=stroke; ctx.lineWidth=2.4; ctx.lineCap='round';
  for(const c of segs){ ctx.beginPath(); ctx.moveTo(c[0]*gw,-c[1]*gh); ctx.lineTo(c[2]*gw,-c[3]*gh); ctx.stroke(); } ctx.restore(); }
function gzCosmic(gh,gw){ ctx.save(); const tt=state.gz.breathe; ctx.shadowColor='#c77dff'; ctx.shadowBlur=14; ctx.fillStyle='rgba(210,150,255,0.95)';
  for(let i=0;i<8;i++){ const a=i*1.7+tt; const x=gw*0.05+Math.cos(a)*gw*0.42; const y=-gh*0.52+Math.sin(a*1.3)*gh*0.26; const r=((Math.sin(tt*3+i)+1)/2)*3+1; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill(); } ctx.restore(); }

function drawBeam(){
  if(!state.beam) return; const b=state.beam, f=form(), segs=9;
  ctx.save(); ctx.lineCap='round'; ctx.shadowColor=f.breathGlow; ctx.shadowBlur=16;
  ctx.lineWidth=8*S; ctx.strokeStyle=f.breath[1];
  ctx.beginPath(); ctx.moveTo(b.sx,b.sy);
  for(let i=1;i<=segs;i++){ const t=i/segs; ctx.lineTo(b.sx+(b.x-b.sx)*t+rand(-6,6)*S, b.sy+(b.y-b.sy)*t+rand(-6,6)*S); }
  ctx.stroke();
  ctx.lineWidth=4*S; ctx.strokeStyle=f.breath[0]; ctx.stroke();
  ctx.fillStyle=f.breathGlow; ctx.beginPath(); ctx.arc(b.x,b.y,16*S,0,7); ctx.fill();
  ctx.restore();
}
function drawParticles(){ for(const p of state.particles){ ctx.globalAlpha=clamp(p.t,0,1); ctx.fillStyle=p.col; ctx.fillRect(p.x,p.y,p.size,p.size); } ctx.globalAlpha=1; }
function drawTexts(){
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(const f of state.damageTexts){ ctx.globalAlpha=clamp(f.t,0,1); ctx.font='800 '+(22*S)+'px ui-monospace,monospace'; ctx.fillStyle='#ffe08a'; ctx.fillText(f.txt,f.x,f.y); }
  for(const f of state.moneyTexts){ ctx.globalAlpha=clamp(f.t/1.5,0,1); ctx.font='900 '+(30*S)+'px ui-monospace,monospace'; ctx.fillStyle='#6dffa0'; ctx.fillText(f.txt+' 💰',f.x,f.y); }
  ctx.globalAlpha=1;
}
function drawTransitionFlash(){ if(!state.transition) return; const p=state.transition.t/state.transition.total;
  ctx.fillStyle='rgba(255,255,255,'+(Math.sin(p*Math.PI)*0.5).toFixed(3)+')'; ctx.fillRect(0,0,W,H); }
function drawIntro(){ if(state.introT<=0) return;
  ctx.globalAlpha=clamp(state.introT/2,0,1); ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='800 '+(24*S)+'px ui-monospace,monospace'; ctx.fillStyle='#fff';
  ctx.fillText('Tap a building to smash it! 🦖', W/2, groundY+(H-groundY)*0.42);
  ctx.font='600 '+(15*S)+'px ui-monospace,monospace'; ctx.fillStyle='rgba(255,255,255,0.7)';
  ctx.fillText('Open 🛒 Shop to evolve and get stronger', W/2, groundY+(H-groundY)*0.62);
  ctx.globalAlpha=1;
}

/* ------------------------------ HUD / SHOP ----------------------- */
function updateHUD(){
  document.getElementById('money').textContent='💰 '+fmt(state.money);
  const f=form();
  document.getElementById('form-badge').innerHTML=`🦖 ${f.name} <b>${f.year}</b> · ⚔ ${fmt(attackPower())}`;
}
function updateMuteBtn(){ document.getElementById('mute-btn').textContent=state.muted?'🔇':'🔊'; }
function toggleMute(){ state.muted=!state.muted; if(!state.muted) ensureAudio(); save(); updateMuteBtn(); }
function openShop(){ state.shopOpen=true; document.getElementById('shop').classList.remove('hidden'); refreshShop(); }
function closeShop(){ state.shopOpen=false; document.getElementById('shop').classList.add('hidden'); }
function switchTab(tab){ state.shopTab=tab; document.querySelectorAll('#shop-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab)); refreshShop(); }

function item(o){
  const cls=o.owned?'owned':o.locked?'locked':'';
  const sw=o.swatch?`<span class="sw" style="background:${o.swatch};color:${o.swatch}"></span>`:'';
  let right;
  if(o.action) right=`<button class="buy ${o.aff?'aff':''}" data-action="${o.action}" ${o.aff?'':'disabled'}>${o.btn}</button>`;
  else right=`<span class="tag">${o.btn}</span>`;
  return `<div class="shop-item ${cls}"><div class="si-l">${sw}<div><div class="si-t">${o.title}</div><div class="si-s">${o.sub||''}</div></div></div>${right}</div>`;
}
function refreshShop(){
  const body=document.getElementById('shop-body'); if(!body) return;
  let h=''; const tab=state.shopTab;
  if(tab==='upgrades'){
    const c=clawsCost();
    h+=item({ title:'Stronger Claws', sub:`Level ${state.clawsLevel} · ⚔ ${fmt(attackPower())} → ${fmt(nextClawsAttack())} per tap`,
      btn:'-'+fmt(c), action:'claws', aff:state.money>=c });
    h+=`<p class="hint">Multiplies your tap damage. Bridges you toward the next evolution.</p>`;
  } else if(tab==='evolutions'){
    EVOLUTIONS.forEach((e,i)=>{
      const owned=i<=state.evoTier, isNext=i===state.evoTier+1, aff=isNext&&state.money>=e.cost;
      let btn = owned ? (i===state.evoTier?'ACTIVE':'OWNED') : (isNext?('-'+fmt(e.cost)):('🔒 '+fmt(e.cost)));
      h+=item({ title:e.name, sub:`${e.year} · ×${e.mult} base damage${e.spec?' · speculative form':''}`,
        btn, action:isNext?'evolve':'', aff, owned, locked:!owned&&!isNext, swatch:e.plateEdge });
    });
    h+=`<p class="hint">Each evolution transforms Godzilla and multiplies his base power.</p>`;
  } else if(tab==='characters'){
    h+=`<p class="hint">Other Titans join in a future update — keep earning, you'll recruit them.</p>`;
    CHARACTERS.forEach(c=> h+=item({ title:'🔒 '+c[0], sub:c[1], btn:'Coming soon', locked:true }));
  } else if(tab==='worlds'){
    h+=item({ title:'World 1 — Metropolis', sub:'Current world', btn:'ACTIVE', owned:true });
    if(state.world2Unlocked) h+=item({ title:'World 2', sub:'Unlocked — content coming soon', btn:'Coming soon', owned:true });
    else h+=item({ title:'World 2 — ???', sub:'A new city, tougher Titans. Everything you own carries over.',
      btn:'-'+fmt(WORLD2_COST), action:'world2', aff:state.money>=WORLD2_COST, locked:state.money<WORLD2_COST });
    h+=`<p class="hint">World 2 is the capstone unlock. This build sets up the path; the city itself is coming soon.</p>`;
  }
  body.innerHTML=h;
  body.querySelectorAll('[data-action]').forEach(el=> el.onclick=()=>doAction(el.dataset.action));
}
function doAction(a){ if(a==='claws') buyClaws(); else if(a==='evolve') buyEvolution(); else if(a==='world2') buyWorld2(); }

let toastTimer=null;
function toast(msg){ const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),1900); }

/* ------------------------------ LOOP / INIT ---------------------- */
function loop(ts){ nowMs=ts; let dt=(ts-last)/1000; last=ts; if(!isFinite(dt)||dt>0.1) dt=0.016; update(dt); render(); requestAnimationFrame(loop); }
function init(){
  load();
  resize(); window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', onPointer);
  document.getElementById('shop-btn').onclick=openShop;
  document.getElementById('shop-close').onclick=closeShop;
  document.getElementById('shop-backdrop').onclick=closeShop;
  document.getElementById('mute-btn').onclick=toggleMute;
  document.querySelectorAll('#shop-tabs button').forEach(b=> b.onclick=()=>switchTab(b.dataset.tab));
  updateHUD(); updateMuteBtn(); refreshShop();
  requestAnimationFrame(loop);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
