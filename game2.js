'use strict';

// ── TILE COLORS (fallback) ─────────────────────────────────────
const TILE_COLORS = [
  '#ff6b8a','#ffaa40','#ffd700','#4cd964',
  '#3b9eff','#a78bfa','#ff5cca','#40e0c0',
  '#ff7043','#26c6da','#aed581','#f06292'
];

// ── IMAGE ASSETS ──────────────────────────────────────────────
const TILE_IMAGES = [
  '1gcLZtRW_400x400.jpg','3EYsjXBJ_400x400.jpg',
  '40thn5N-_400x400.jpg','78ltYa3K_400x400.jpg',
  '94OhC2sa_400x400.jpg','DHwnyzUO_400x400.jpg',
  'Otg_8IR4_400x400.jpg','VE-vHOBq_400x400.jpg',
  'WT0_5FL9_400x400.jpg','WFeVCpRk_400x400.jpg',
  'gUNzrxbE_400x400.jpg','photo_2025-12-27_16-44-09.jpg',
];

// ── LEVEL CONFIG ──────────────────────────────────────────────
function levelConfig(lvl) {
  const targets = [0,10,25,45,70,100,140,190,250,320,400,490,590,700,830,970,1120,1280,1460,1650,1860,2090,2340,2610,2900,3210,3540,3890,4260,4650];
  const moves   = [0,30,28,27,26,25,25,24,24,23,23,22,22,21,21,20,20,19,19,18,18,17,17,16,16,15,15,14,14,13,13];
  return {
    target: targets[lvl] ?? lvl*150,
    moves:  moves[lvl]   ?? 12,
    types:  Math.min(3 + Math.floor(lvl/5), 7)
  };
}

// ── CONSTANTS ─────────────────────────────────────────────────
const GRID       = 8;
const ANIM_SWAP  = 200;
const ANIM_BLAST = 350;
const ANIM_FALL  = 300;
const TILE_RADIUS = 10;
const TILE_PAD    = 4;

// ── STATE ─────────────────────────────────────────────────────
let username = '';
let level    = 1;
let score    = 0;
let movesLeft = 0;
let target   = 0;
let board    = [];
let busy     = false;
let selected = null;
const images = [];

// Layout (recalculated each frame from window size)
let CELL = 60;
let OX   = 0;
let OY   = 0;

// Animation state
let swapAnim    = null;   // {r1,c1,r2,c2,t,dur}
let particles   = [];
let cometCells  = [];
let blastCells  = [];     // {r,c,t} for blast flash
let fallingTiles= [];     // {col, fromRow, toRow, t}

// ── DOM REFS ──────────────────────────────────────────────────
let canvas, ctx, pCanvas, pCtx;

// ── STARTUP ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  canvas  = document.getElementById('game-canvas');
  ctx     = canvas.getContext('2d');
  pCanvas = document.getElementById('particle-canvas');
  pCtx    = pCanvas.getContext('2d');

  // Load images (non-blocking)
  let loaded = 0;
  TILE_IMAGES.forEach((src, i) => {
    const img = new Image();
    img.onload = img.onerror = () => ++loaded;
    img.src = src;
    images[i] = img;
  });

  // Hero strip on login
  const strip = document.getElementById('hero-strip-login');
  TILE_IMAGES.slice(0,8).forEach((src) => {
    const el = document.createElement('img');
    el.src = src; el.alt = '';
    strip.appendChild(el);
  });

  // Wire buttons
  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('username-input').addEventListener('keydown', e => e.key==='Enter' && startGame());
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-resume').addEventListener('click', closeSettings);
  document.getElementById('btn-restart-level').addEventListener('click', () => { closeSettings(); loadLevel(level); });
  document.getElementById('btn-home').addEventListener('click', goHome);
  document.getElementById('btn-next-level').addEventListener('click', () => { hideOverlay('panel-win'); loadLevel(level+1); });
  document.getElementById('btn-win-home').addEventListener('click', goHome);
  document.getElementById('btn-retry').addEventListener('click', () => { hideOverlay('panel-lose'); loadLevel(level); });
  document.getElementById('btn-lose-home').addEventListener('click', goHome);
  document.getElementById('btn-play-again').addEventListener('click', () => { hideOverlay('panel-victory'); loadLevel(1); });

  // Pointer input
  canvas.addEventListener('pointerdown', onPointerDown, {passive:false});
  canvas.addEventListener('pointermove', onPointerMove, {passive:false});
  canvas.addEventListener('pointerup',   onPointerUp,   {passive:false});
  window.addEventListener('resize', recalcLayout);

  recalcLayout();
  requestAnimationFrame(loop);
});

// ── LAYOUT ─────────────────────────────────────────────
const HUD_H = 78;
function recalcLayout() {
  const W = window.innerWidth;
  const H = window.innerHeight - HUD_H;
  const avail = Math.min(W, H, 620);
  CELL = Math.max(30, Math.floor((avail * 0.97) / GRID));
  const boardPx = CELL * GRID;
  OX = Math.floor((W - boardPx) / 2);
  OY = Math.floor((H - boardPx) / 2);

  // Canvas fills the viewport below the HUD
  canvas.width  = pCanvas.width  = W;
  canvas.height = pCanvas.height = H;
  canvas.style.width  = pCanvas.style.width  = W + 'px';
  canvas.style.height = pCanvas.style.height = H + 'px';
}

// ── SCREEN / OVERLAY HELPERS ──────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showOverlay(id) { document.getElementById(id).classList.remove('hidden'); }
function hideOverlay(id) { document.getElementById(id).classList.add('hidden'); }
function openSettings()  { busy = true; showOverlay('panel-settings'); }
function closeSettings() { hideOverlay('panel-settings'); busy = false; }
function goHome() {
  ['panel-settings','panel-win','panel-lose','panel-victory'].forEach(hideOverlay);
  document.body.classList.remove('game-active');
  showScreen('screen-login'); busy = false;
}

// ── GAME FLOW ─────────────────────────────────────────────────
function startGame() {
  const val = document.getElementById('username-input').value.trim();
  if (!val) { document.getElementById('username-input').focus(); return; }
  username = val;
  showScreen('screen-game');
  document.body.classList.add('game-active');
  recalcLayout();
  loadLevel(1);
}

function loadLevel(lvl) {
  level = Math.min(lvl, 30);
  const cfg = levelConfig(level);
  score     = 0;
  movesLeft = cfg.moves;
  target    = cfg.target;
  board     = makeBoard(cfg.types);
  selected  = null;
  busy      = false;
  swapAnim  = null; particles = []; cometCells = []; blastCells = [];
  updateHUD();
}

// ── BOARD GENERATION ─────────────────────────────────────────────
function makeBoard(types) {
  let b, attempts = 0;
  do {
    b = [];
    for (let r = 0; r < GRID; r++) {
      b[r] = [];
      for (let c = 0; c < GRID; c++) {
        let t;
        do { t = rnd(types); }
        while (
          (c >= 2 && b[r][c-1] === t && b[r][c-2] === t) ||
          (r >= 2 && b[r-1][c] === t && b[r-2][c] === t)
        );
        b[r][c] = t;
      }
    }
  } while (!canMove(b, types) && ++attempts < 20);
  return b;
}
function rnd(n) { return Math.floor(Math.random()*n); }

// ── MATCH LOGIC ───────────────────────────────────────────────
function findMatches(b) {
  const M = Array.from({length:GRID}, () => new Array(GRID).fill(false));
  for (let r=0;r<GRID;r++) for (let c=0;c<GRID-2;c++) {
    const t = b[r][c]; if (t<0) continue;
    if (b[r][c+1]===t && b[r][c+2]===t) {
      let l=3; while(c+l<GRID && b[r][c+l]===t) l++;
      for (let k=0;k<l;k++) M[r][c+k]=true;
    }
  }
  for (let c=0;c<GRID;c++) for (let r=0;r<GRID-2;r++) {
    const t = b[r][c]; if (t<0) continue;
    if (b[r+1][c]===t && b[r+2][c]===t) {
      let l=3; while(r+l<GRID && b[r+l][c]===t) l++;
      for (let k=0;k<l;k++) M[r+k][c]=true;
    }
  }
  return M;
}
function countTrue(M) { return M.flat().filter(Boolean).length; }

function canMove(b, types) {
  for (let r=0;r<GRID;r++) for (let c=0;c<GRID;c++) {
    for (const [dr,dc] of [[0,1],[1,0]]) {
      const nr=r+dr, nc=c+dc;
      if (nr>=GRID||nc>=GRID) continue;
      const tmp = b.map(row=>[...row]);
      [tmp[r][c],tmp[nr][nc]] = [tmp[nr][nc],tmp[r][c]];
      if (countTrue(findMatches(tmp))>0) return true;
    }
  }
  return false;
}

// ── HUD ───────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('hud-level').textContent  = level;
  document.getElementById('hud-score').textContent  = score;
  document.getElementById('hud-moves').textContent  = movesLeft;
  document.getElementById('hud-target').textContent = target;
  document.getElementById('progress-bar-fill').style.width = Math.min(score/target*100,100)+'%';
}

// ── INPUT ─────────────────────────────────────────────────────
let dragOrigin = null;
function toGrid(clientX, clientY) {
  // canvas is fixed at top:HUD_H, left:0
  const x = clientX - OX;
  const y = clientY - HUD_H - OY;
  const c = Math.floor(x/CELL), r = Math.floor(y/CELL);
  return (r>=0&&r<GRID&&c>=0&&c<GRID) ? {r,c} : null;
}
function onPointerDown(e) {
  if (busy) return; e.preventDefault();
  const g = toGrid(e.clientX,e.clientY); if (!g) return;
  dragOrigin = g; selected = g;
}
function onPointerMove(e) {
  if (!dragOrigin||busy) return; e.preventDefault();
  const g = toGrid(e.clientX,e.clientY); if (!g) return;
  const dr=g.r-dragOrigin.r, dc=g.c-dragOrigin.c;
  if (Math.abs(dr)+Math.abs(dc)<1) return;
  const [tr,tc] = Math.abs(dr)>=Math.abs(dc)
    ? [dragOrigin.r+(dr>0?1:-1), dragOrigin.c]
    : [dragOrigin.r, dragOrigin.c+(dc>0?1:-1)];
  const orig = dragOrigin; dragOrigin = null;
  trySwap(orig.r, orig.c, tr, tc);
}
function onPointerUp(e) { e.preventDefault(); dragOrigin=null; }

// ── SWAP ──────────────────────────────────────────────────────
async function trySwap(r1,c1,r2,c2) {
  if (busy||r2<0||r2>=GRID||c2<0||c2>=GRID) return;
  busy=true; selected=null;
  swapAnim = {r1,c1,r2,c2,t:0,dur:ANIM_SWAP};
  await sleep(ANIM_SWAP); swapAnim=null;
  [board[r1][c1],board[r2][c2]] = [board[r2][c2],board[r1][c1]];
  let M = findMatches(board);
  if (countTrue(M)===0) {
    [board[r1][c1],board[r2][c2]] = [board[r2][c2],board[r1][c1]];
    swapAnim = {r1:r2,c1:c2,r2:r1,c2:c1,t:0,dur:ANIM_SWAP};
    await sleep(ANIM_SWAP); swapAnim=null;
    busy=false; return;
  }
  movesLeft--; updateHUD();
  await cascade();
  const cfg = levelConfig(level);
  if (!canMove(board,cfg.types)) reshuffleBoard(cfg.types);
  busy=false;
  await sleep(200);
  if (score>=target) { level>=30 ? showVictory() : showWin(); }
  else if (movesLeft<=0) showLose();
}

async function cascade() {
  let M = findMatches(board);
  while (countTrue(M)>0) {
    const n = countTrue(M);
    score += n>=5 ? n*30 : n>=4 ? n*20 : n*10;
    if (n>=5) cometCells.push(...getMatchCells(M).map(p=>({...p,t:0})));
    blastCells.push(...getMatchCells(M).map(p=>({...p,t:0})));
    spawnParticles(M);
    updateHUD();
    for(const p of getMatchCells(M)) board[p.r][p.c]=-1;
    await sleep(ANIM_BLAST);
    gravity(levelConfig(level).types);
    await sleep(ANIM_FALL);
    M = findMatches(board);
  }
}

function getMatchCells(M) {
  const out=[];
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++) if(M[r][c]) out.push({r,c});
  return out;
}

function gravity(types) {
  for(let c=0;c<GRID;c++) {
    let empty=GRID-1;
    for(let r=GRID-1;r>=0;r--) {
      if(board[r][c]>=0) { board[empty][c]=board[r][c]; if(empty!==r) board[r][c]=-1; empty--; }
    }
    for(let r=empty;r>=0;r--) board[r][c]=rnd(types);
  }
}

function reshuffleBoard(types) {
  let n=0;
  do {
    const flat=board.flat();
    for(let i=flat.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1)); [flat[i],flat[j]]=[flat[j],flat[i]];
    }
    let k=0;
    for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++) board[r][c]=flat[k++];
  } while(!canMove(board,types) && ++n<30);
}

// ── WIN/LOSE ──────────────────────────────────────────────────
function showWin() {
  busy=true;
  const bonus=movesLeft*5; score+=bonus; updateHUD();
  const s=score>=target*1.5?'⭐⭐⭐':score>=target*1.2?'⭐⭐':'⭐';
  document.getElementById('win-title').textContent=`Level ${level} Complete!`;
  document.getElementById('win-msg').textContent=`Score: ${score} (+${bonus} bonus) · Crushing it, ${username}!`;
  document.getElementById('win-stars').textContent=s;
  showOverlay('panel-win');
}
function showLose() {
  busy=true;
  document.getElementById('lose-msg').textContent=`${score}/${target} pts. Keep crushing, ${username}!`;
  showOverlay('panel-lose');
}
function showVictory() {
  busy=true;
  document.getElementById('victory-name').textContent=`${username} conquered all 30 levels with ${score} pts!`;
  showOverlay('panel-victory');
}

// ── PARTICLES ─────────────────────────────────────────────────
const PCOLS=['#3b9eff','#ffd700','#ff5a5a','#4cd964','#a78bfa','#ff9fd4','#ffa040'];
function spawnParticles(M) {
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++) {
    if(!M[r][c]) continue;
    const cx=OX+c*CELL+CELL/2, cy=OY+r*CELL+CELL/2;
    for(let i=0;i<10;i++) {
      const a=(Math.PI*2/10)*i+Math.random()*.5, sp=2+Math.random()*5;
      particles.push({x:cx,y:cy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,
        decay:.022+Math.random()*.018,size:3+Math.random()*5,
        color:PCOLS[Math.floor(Math.random()*PCOLS.length)]});
    }
  }
}

// ── GAME LOOP ─────────────────────────────────────────────────
let last=0;
function loop(ts) {
  const dt=ts-last; last=ts;
  if (board.length>0) { drawBoard(dt); drawFX(dt); }
  requestAnimationFrame(loop);
}

// ── DRAW BOARD ─────────────────────────────────────────────
function drawBoard(dt) {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (CELL<=0 || !canvas.width) return;
  const bw=CELL*GRID;

  // Board shadow bg
  ctx.save();
  ctx.shadowColor='rgba(59,158,255,0.22)'; ctx.shadowBlur=32;
  ctx.fillStyle='rgba(200,232,255,0.55)';
  rrect(ctx,OX-8,OY-8,bw+16,bw+16,20); ctx.fill();
  ctx.restore();

  // Checkerboard subtle tint
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++) {
    const x=OX+c*CELL, y=OY+r*CELL;
    ctx.fillStyle=(r+c)%2===0?'rgba(255,255,255,0.12)':'rgba(100,180,255,0.08)';
    rrect(ctx,x+1,y+1,CELL-2,CELL-2,6); ctx.fill();
  }

  // Update swap anim
  if(swapAnim) {
    swapAnim.t=Math.min(swapAnim.t+dt,swapAnim.dur);
    if(swapAnim.t>=swapAnim.dur) swapAnim=null;
  }

  // Tiles
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++) {
    const type=board[r][c]; if(type<0) continue;
    let x=OX+c*CELL, y=OY+r*CELL;

    // Swap offset
    if(swapAnim) {
      const {r1,c1,r2,c2,t,dur}=swapAnim;
      const p=ease(t/dur);
      if(r===r1&&c===c1){x+=(c2-c1)*CELL*p;y+=(r2-r1)*CELL*p;}
      if(r===r2&&c===c2){x+=(c1-c2)*CELL*p;y+=(r1-r2)*CELL*p;}
    }

    const sel=selected&&selected.r===r&&selected.c===c;
    const pad=TILE_PAD, sz=CELL-pad*2;

    ctx.save();
    if(sel){ctx.shadowColor='#3b9eff';ctx.shadowBlur=20;}

    // White tile bg
    ctx.fillStyle='rgba(255,255,255,0.82)';
    rrect(ctx,x+pad,y+pad,sz,sz,TILE_RADIUS); ctx.fill();

    // Image or color fallback
    ctx.save();
    rrect(ctx,x+pad,y+pad,sz,sz,TILE_RADIUS); ctx.clip();
    const img=images[type];
    if(img&&img.complete&&img.naturalWidth>0) {
      ctx.drawImage(img,x+pad,y+pad,sz,sz);
    } else {
      const base=TILE_COLORS[type%TILE_COLORS.length];
      const g=ctx.createRadialGradient(x+CELL/2,y+CELL/2,0,x+CELL/2,y+CELL/2,sz*0.7);
      g.addColorStop(0,'#fff'); g.addColorStop(.4,base); g.addColorStop(1,base+'bb');
      ctx.fillStyle=g; ctx.fillRect(x+pad,y+pad,sz,sz);
      ctx.fillStyle='rgba(255,255,255,0.9)';
      ctx.font=`bold ${Math.round(sz*.4)}px Nunito,sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(type+1,x+CELL/2,y+CELL/2);
    }
    ctx.restore();

    // Sheen
    const sh=ctx.createLinearGradient(x+pad,y+pad,x+pad,y+pad+sz*.55);
    sh.addColorStop(0,'rgba(255,255,255,0.42)'); sh.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=sh;
    rrect(ctx,x+pad,y+pad,sz,sz,TILE_RADIUS); ctx.fill();

    // Border
    ctx.strokeStyle=sel?'rgba(59,158,255,0.9)':'rgba(255,255,255,0.75)';
    ctx.lineWidth=sel?3:1.5;
    rrect(ctx,x+pad,y+pad,sz,sz,TILE_RADIUS); ctx.stroke();

    ctx.restore();
  }
}

// ── DRAW EFFECTS ──────────────────────────────────────────────
function drawFX(dt) {
  pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);

  // Blast flash
  blastCells=blastCells.filter(b=>{
    b.t+=dt/ANIM_BLAST;
    if(b.t>1) return false;
    const a=1-b.t;
    const cx=OX+b.c*CELL+CELL/2, cy=OY+b.r*CELL+CELL/2;
    const g=pCtx.createRadialGradient(cx,cy,0,cx,cy,CELL*0.65);
    g.addColorStop(0,`rgba(255,240,100,${a})`);
    g.addColorStop(.5,`rgba(255,160,50,${a*.7})`);
    g.addColorStop(1,'rgba(255,100,50,0)');
    pCtx.save(); pCtx.fillStyle=g;
    pCtx.beginPath(); pCtx.arc(cx,cy,CELL*0.65,0,Math.PI*2); pCtx.fill();
    pCtx.restore(); return true;
  });

  // Comet rings
  cometCells=cometCells.filter(c=>{
    c.t+=dt/600; if(c.t>1) return false;
    const cx=OX+c.c*CELL+CELL/2, cy=OY+c.r*CELL+CELL/2;
    const r=CELL*(0.3+c.t*1.2), a=1-c.t;
    const g=pCtx.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0,`rgba(200,220,255,${a})`);
    g.addColorStop(.4,`rgba(59,158,255,${a*.8})`);
    g.addColorStop(1,'rgba(167,139,250,0)');
    pCtx.save(); pCtx.globalAlpha=a; pCtx.fillStyle=g;
    pCtx.beginPath(); pCtx.arc(cx,cy,r,0,Math.PI*2); pCtx.fill();
    pCtx.restore(); return true;
  });

  // Particles
  particles=particles.filter(p=>{
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.18; p.life-=p.decay;
    if(p.life<=0) return false;
    pCtx.save();
    pCtx.globalAlpha=p.life;
    pCtx.fillStyle=p.color;
    pCtx.shadowColor=p.color; pCtx.shadowBlur=7;
    pCtx.beginPath();
    pCtx.arc(p.x,p.y,Math.max(1,p.size*p.life),0,Math.PI*2);
    pCtx.fill(); pCtx.restore(); return true;
  });
}

// ── UTILS ─────────────────────────────────────────────────────
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function ease(t){ return t<.5?2*t*t:-1+(4-2*t)*t; }
function rrect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}
