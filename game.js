'use strict';

/* ── IMAGES – all 12 shuffled each game ─────────────────────── */
const ALL_IMAGES = [
  '1gcLZtRW_400x400.jpg','3EYsjXBJ_400x400.jpg','40thn5N-_400x400.jpg',
  '78ltYa3K_400x400.jpg','94OhC2sa_400x400.jpg','DHwnyzUO_400x400.jpg',
  'Otg_8IR4_400x400.jpg','VE-vHOBq_400x400.jpg','WT0_5FL9_400x400.jpg',
  'WFeVCpRk_400x400.jpg','gUNzrxbE_400x400.jpg','photo_2025-12-27_16-44-09.jpg'
];
let TILE_IMAGES = [...ALL_IMAGES]; // shuffled per game

/* ── LEVEL CONFIG ────────────────────────────────────────────── */
const LEVEL_TARGETS = [0,10,25,45,70,100,140,190,250,320,400,490,590,700,830,970,1120,1280,1460,1650,1860,2090,2340,2610,2900,3210,3540,3890,4260,4650];
const LEVEL_MOVES  = [0,30,28,27,26,25,25,24,24,23,23,22,22,21,21,20,20,19,19,18,18,17,17,16,16,15,15,14,14,13,13];
function lvlCfg(l){ return { target:LEVEL_TARGETS[l]??l*160, moves:LEVEL_MOVES[l]??12, types:Math.min(3+Math.floor(l/5),Math.min(7,TILE_IMAGES.length)) }; }

/* ── CONSTANTS ───────────────────────────────────────────────── */
const GRID = 8;
const GAP  = 4;   // px gap between tiles
const PAD  = 6;   // board padding

/* ── STATE ───────────────────────────────────────────────────── */
let username='', level=1, score=0, movesLeft=0, target=0;
let board=[];         // board[r][c] = type index
let tileEls=[];       // tileEls[r][c] = DOM element
let CELL=60;          // tile size (computed)
let busy=false, selected=null;

/* ── SOUND (Web Audio API) ───────────────────────────────────── */
let _actx=null;
function actx(){ return _actx||(_actx=new(window.AudioContext||window.webkitAudioContext)()); }
function note(freq,type='sine',vol=.28,dur=.12,delay=0){
  try{
    const c=actx(), o=c.createOscillator(), g=c.createGain();
    o.type=type; o.frequency.value=freq;
    g.gain.setValueAtTime(vol,c.currentTime+delay);
    g.gain.exponentialRampToValueAtTime(.001,c.currentTime+delay+dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime+delay); o.stop(c.currentTime+delay+dur);
  }catch(e){}
}
function sfxClick(){ note(700,'sine',.2,.09); }
function sfxMatch(){ [523,659,784,1047].forEach((f,i)=>note(f,'sine',.3,.18,i*.07)); }
function sfxComet(){ [300,400,600,900,1200].forEach((f,i)=>note(f,'sine',.35,.25,i*.05)); }
function sfxError(){ note(180,'sawtooth',.2,.2); note(130,'sawtooth',.15,.15,.08); }
function sfxWin(){   [523,659,784,1047,1319].forEach((f,i)=>note(f,'sine',.35,.3,i*.09)); }

/* ── DOM REFS ────────────────────────────────────────────────── */
const boardEl = ()=>document.getElementById('board');
const $  = id  => document.getElementById(id);

/* ── STARTUP ─────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded',()=>{
  $('btn-start').onclick    = startGame;
  $('username-input').onkeydown = e=>e.key==='Enter'&&startGame();
  $('btn-settings').onclick = ()=>openOverlay('panel-settings');
  $('btn-resume').onclick   = ()=>closeOverlay('panel-settings');
  $('btn-restart').onclick  = ()=>{ closeOverlay('panel-settings'); loadLevel(level); };
  $('btn-home').onclick     = goHome;
  $('btn-next').onclick     = ()=>{ closeOverlay('panel-win'); loadLevel(level+1); };
  $('btn-win-home').onclick = goHome;
  $('btn-retry').onclick    = ()=>{ closeOverlay('panel-lose'); loadLevel(level); };
  $('btn-lose-home').onclick= goHome;
  $('btn-again').onclick    = ()=>{ closeOverlay('panel-victory'); startGame(true); };
  window.addEventListener('resize', resizeBoard);
});

/* ── SCREEN HELPERS ──────────────────────────────────────────── */
function showScreen(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); }
function openOverlay(id){ $(id).classList.remove('hidden'); busy=true; }
function closeOverlay(id){ $(id).classList.add('hidden'); busy=false; }
function goHome(){
  ['panel-settings','panel-win','panel-lose','panel-victory'].forEach(id=>$(id).classList.add('hidden'));
  showScreen('screen-login'); busy=false;
}

/* ── GAME START ──────────────────────────────────────────────── */
function startGame(replay=false){
  const inp=$('username-input');
  if(!replay){ const v=inp.value.trim(); if(!v){inp.focus();return;} username=v; }
  // Shuffle image order each game
  TILE_IMAGES=[...ALL_IMAGES].sort(()=>Math.random()-.5);
  showScreen('screen-game');
  loadLevel(1);
}

function loadLevel(lvl){
  level=Math.min(lvl,30);
  const cfg=lvlCfg(level);
  score=0; movesLeft=cfg.moves; target=cfg.target;
  board=makeBoard(cfg.types);
  selected=null; busy=false;
  updateHUD();
  resizeBoard();
  renderBoard();
}

/* ── BOARD LOGIC ─────────────────────────────────────────────── */
function rnd(n){ return Math.floor(Math.random()*n); }

function makeBoard(types){
  let b, tries=0;
  do {
    b=[];
    for(let r=0;r<GRID;r++){
      b[r]=[];
      for(let c=0;c<GRID;c++){
        let t; do{ t=rnd(types); }
        while((c>=2&&b[r][c-1]===t&&b[r][c-2]===t)||(r>=2&&b[r-1][c]===t&&b[r-2][c]===t));
        b[r][c]=t;
      }
    }
  }while(!canMove(b,types)&&++tries<20);
  return b;
}

function findMatches(b){
  const M=Array.from({length:GRID},()=>new Array(GRID).fill(false));
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID-2;c++){
    const t=b[r][c]; if(t<0)continue;
    if(b[r][c+1]===t&&b[r][c+2]===t){ let l=3; while(c+l<GRID&&b[r][c+l]===t)l++; for(let k=0;k<l;k++)M[r][c+k]=true; }
  }
  for(let c=0;c<GRID;c++) for(let r=0;r<GRID-2;r++){
    const t=b[r][c]; if(t<0)continue;
    if(b[r+1][c]===t&&b[r+2][c]===t){ let l=3; while(r+l<GRID&&b[r+l][c]===t)l++; for(let k=0;k<l;k++)M[r+k][c]=true; }
  }
  return M;
}
function matchCells(M){ const a=[]; for(let r=0;r<GRID;r++)for(let c=0;c<GRID;c++)if(M[r][c])a.push({r,c}); return a; }
function countM(M){ return M.flat().filter(Boolean).length; }

function canMove(b,types){
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++){
    for(const[dr,dc]of[[0,1],[1,0]]){
      const nr=r+dr,nc=c+dc; if(nr>=GRID||nc>=GRID)continue;
      const t=b.map(row=>[...row]); [t[r][c],t[nr][nc]]=[t[nr][nc],t[r][c]];
      if(countM(findMatches(t))>0)return true;
    }
  }
  return false;
}

function reshuffleBoard(types){
  let n=0;
  do{
    const flat=board.flat(); for(let i=flat.length-1;i>0;i--){const j=rnd(i+1);[flat[i],flat[j]]=[flat[j],flat[i]];}
    let k=0; for(let r=0;r<GRID;r++)for(let c=0;c<GRID;c++)board[r][c]=flat[k++];
  }while(!canMove(board,types)&&++n<30);
}

/* ── LAYOUT ──────────────────────────────────────────────────── */
function resizeBoard(){
  const HUD=78, W=window.innerWidth, H=window.innerHeight-HUD;
  const avail=Math.min(W,H,600);
  CELL=Math.max(34,Math.floor((avail-PAD*2-GAP*(GRID-1))/GRID));
  const boardPx=CELL*GRID+GAP*(GRID-1)+PAD*2;
  const bd=boardEl(); if(!bd)return;
  bd.style.width=bd.style.height=boardPx+'px';
}

/* ── DOM RENDERING ───────────────────────────────────────────── */
function tileX(c){ return PAD+c*(CELL+GAP); }
function tileY(r){ return PAD+r*(CELL+GAP); }

function createTileEl(r,c,type,spawning=false){
  const el=document.createElement('div');
  el.className='tile'+(spawning?' spawning':'');
  el.dataset.r=r; el.dataset.c=c;
  el.style.cssText=`left:${tileX(c)}px;top:${tileY(r)}px;width:${CELL}px;height:${CELL}px;`;
  const img=document.createElement('img');
  img.src=TILE_IMAGES[type]??''; img.alt=''; img.draggable=false;
  el.appendChild(img);
  el.addEventListener('pointerdown',e=>onTileDown(e,el));
  el.addEventListener('pointermove', e=>onTileMove(e,el));
  el.addEventListener('pointerup',   e=>onTileUp(e,el));
  return el;
}

function renderBoard(){
  const bd=boardEl(); bd.innerHTML=''; tileEls=[];
  for(let r=0;r<GRID;r++){
    tileEls[r]=[];
    for(let c=0;c<GRID;c++){
      const el=createTileEl(r,c,board[r][c]);
      bd.appendChild(el); tileEls[r][c]=el;
    }
  }
}

/* ── INPUT ────────────────────────────────────────────────────── */
let dragOriginEl=null, dragOriginPt=null;

function onTileDown(e,el){
  if(busy)return; e.preventDefault();
  dragOriginEl=el; dragOriginPt={x:e.clientX,y:e.clientY};
  el.setPointerCapture(e.pointerId);
  const r=+el.dataset.r, c=+el.dataset.c;
  sfxClick();
  if(selected){
    const sr=selected.r, sc=selected.c;
    const adj=(Math.abs(r-sr)+Math.abs(c-sc))===1;
    if(adj){ tileEls[sr][sc]?.classList.remove('selected'); selected=null; trySwap(sr,sc,r,c); return; }
    tileEls[sr][sc]?.classList.remove('selected');
  }
  selected={r,c}; el.classList.add('selected');
}

function onTileMove(e,el){
  if(!dragOriginEl||busy||dragOriginEl!==el)return; e.preventDefault();
  const dx=e.clientX-dragOriginPt.x, dy=e.clientY-dragOriginPt.y;
  if(Math.abs(dx)+Math.abs(dy)<CELL*0.3)return;
  const r=+el.dataset.r, c=+el.dataset.c;
  let tr=r,tc=c;
  if(Math.abs(dx)>=Math.abs(dy)){ tc+=dx>0?1:-1; }else{ tr+=dy>0?1:-1; }
  dragOriginEl=null; el.classList.remove('selected'); selected=null;
  if(tr>=0&&tr<GRID&&tc>=0&&tc<GRID) trySwap(r,c,tr,tc);
}

function onTileUp(e,el){ dragOriginEl=null; }

/* ── SWAP ─────────────────────────────────────────────────────── */
async function trySwap(r1,c1,r2,c2){
  if(busy)return; busy=true;
  await animSwap(r1,c1,r2,c2);
  [board[r1][c1],board[r2][c2]]=[board[r2][c2],board[r1][c1]];
  const M=findMatches(board);
  if(countM(M)===0){
    sfxError();
    [board[r1][c1],board[r2][c2]]=[board[r2][c2],board[r1][c1]];
    await animSwap(r2,c2,r1,c1); busy=false; return;
  }
  movesLeft--; updateHUD();
  await cascade();
  const cfg=lvlCfg(level);
  if(!canMove(board,cfg.types)) reshuffleBoard(cfg.types), renderBoard();
  busy=false;
  await sleep(200);
  if(score>=target){ level>=30?showVictory():showWin(); }
  else if(movesLeft<=0) showLose();
}

async function animSwap(r1,c1,r2,c2){
  const a=tileEls[r1][c1], b=tileEls[r2][c2]; if(!a||!b)return;
  const dx=(c2-c1)*(CELL+GAP), dy=(r2-r1)*(CELL+GAP);
  a.style.transition='transform .2s ease'; b.style.transition='transform .2s ease';
  a.style.transform=`translate(${dx}px,${dy}px)`; b.style.transform=`translate(${-dx}px,${-dy}px)`;
  await sleep(210);
  a.style.transition=''; b.style.transition='';
  a.style.transform=''; b.style.transform='';
  // Update dataset + visual position
  a.dataset.r=r2; a.dataset.c=c2; a.style.left=tileX(c2)+'px'; a.style.top=tileY(r2)+'px';
  b.dataset.r=r1; b.dataset.c=c1; b.style.left=tileX(c1)+'px'; b.style.top=tileY(r1)+'px';
  [tileEls[r1][c1],tileEls[r2][c2]]=[tileEls[r2][c2],tileEls[r1][c1]];
}

/* ── CASCADE ──────────────────────────────────────────────────── */
async function cascade(){
  let M=findMatches(board);
  while(countM(M)>0){
    const cells=matchCells(M), n=cells.length;
    const pts=n>=5?n*30:n>=4?n*20:n*10;
    score+=pts; updateHUD();
    n>=5?sfxComet():sfxMatch();
    await animBlast(cells);
    cells.forEach(({r,c})=>{ board[r][c]=-1; });
    await animFall(lvlCfg(level).types);
    await sleep(60);
    M=findMatches(board);
  }
}

/* ── BLAST ANIMATION ─────────────────────────────────────────── */
async function animBlast(cells){
  cells.forEach(({r,c})=>{
    const el=tileEls[r][c]; if(!el)return;
    el.classList.add('blasting');
    const rect=el.getBoundingClientRect();
    const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    spawnSparkles(cx,cy); spawnGlowRing(cx,cy);
  });
  await sleep(460);
  cells.forEach(({r,c})=>{ tileEls[r][c]?.remove(); tileEls[r][c]=null; });
}

/* ── GRAVITY + SPAWN ─────────────────────────────────────────── */
async function animFall(types){
  const bd=boardEl();
  for(let c=0;c<GRID;c++){
    // Compact existing tiles downward
    let emptyRow=GRID-1;
    for(let r=GRID-1;r>=0;r--){
      if(board[r][c]>=0){
        if(emptyRow!==r){
          board[emptyRow][c]=board[r][c];
          const el=tileEls[r][c];
          if(el){ el.dataset.r=emptyRow; tileEls[emptyRow][c]=el; board[r][c]=-1; tileEls[r][c]=null;
            el.style.transition='top .3s ease-in'; el.style.top=tileY(emptyRow)+'px'; }
        }
        emptyRow--;
      }
    }
    // Spawn new tiles from above
    for(let r=emptyRow;r>=0;r--){
      const type=rnd(types); board[r][c]=type;
      const el=createTileEl(r,c,type,true);
      el.style.top=(-CELL-PAD-(emptyRow-r)*(CELL+GAP))+'px';
      bd.appendChild(el); tileEls[r][c]=el;
      // After a brief frame, transition to correct position
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        el.style.transition='top .3s ease-in'; el.style.top=tileY(r)+'px';
      }));
    }
  }
  await sleep(340);
  // Clean up transitions
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++){
    const el=tileEls[r][c]; if(el){ el.style.transition=''; el.classList.remove('spawning'); }
  }
}

/* ── PARTICLES ───────────────────────────────────────────────── */
const SPARKLE_COLS=['#ffd700','#ff9800','#a855f7','#ec4899','#3b9eff','#4cd964','#ff6b6b'];
function spawnSparkles(cx,cy){
  for(let i=0;i<10;i++){
    const p=document.createElement('div');
    p.className='sparkle';
    const angle=(Math.PI*2/10)*i+Math.random()*.4;
    const dist=35+Math.random()*40;
    p.style.cssText=`left:${cx}px;top:${cy}px;background:${SPARKLE_COLS[i%SPARKLE_COLS.length]};--dx:${Math.cos(angle)*dist}px;--dy:${Math.sin(angle)*dist}px;`;
    document.body.appendChild(p);
    setTimeout(()=>p.remove(),820);
  }
}
function spawnGlowRing(cx,cy){
  const r=document.createElement('div');
  r.className='glow-ring';
  r.style.cssText=`left:${cx}px;top:${cy}px;width:${CELL}px;height:${CELL}px;`;
  document.body.appendChild(r);
  setTimeout(()=>r.remove(),650);
}

/* ── HUD ──────────────────────────────────────────────────────── */
function updateHUD(){
  $('hud-level').textContent=level;
  $('hud-score').textContent=score;
  $('hud-moves').textContent=movesLeft;
  $('hud-target').textContent=target;
  $('progress-fill').style.width=Math.min(score/target*100,100)+'%';
}

/* ── WIN / LOSE / VICTORY ────────────────────────────────────── */
function showWin(){
  busy=true; sfxWin();
  const bonus=movesLeft*5; score+=bonus; updateHUD();
  const s=score>=target*1.5?'⭐⭐⭐':score>=target*1.2?'⭐⭐':'⭐';
  $('win-title').textContent=`Level ${level} Complete!`;
  $('win-msg').textContent=`Score: ${score}  (+${bonus} bonus moves) · Crushing it, ${username}!`;
  $('win-stars').textContent=s;
  openOverlay('panel-win'); busy=true;
}
function showLose(){
  busy=true;
  $('lose-msg').textContent=`${score} / ${target} pts needed. Keep crushing, ${username}!`;
  openOverlay('panel-lose'); busy=true;
}
function showVictory(){
  busy=true; sfxWin();
  $('victory-msg').textContent=`${username} crushed all 30 levels with ${score} total points!`;
  openOverlay('panel-victory'); busy=true;
}

/* ── UTIL ─────────────────────────────────────────────────────── */
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
