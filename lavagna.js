// Lavagna V1 — the couple's one board (founder, 03/11/2026; boards Main and
// LavagnaAperta): a tile at the top of the Noi bacheca, the board full screen
// over Noi, drawn with a finger by both. Each stroke is simplified here and
// saved when the finger lifts; the partner sees it in a second or two through
// the one Realtime channel (no moving finger live). Four colours, two widths,
// the eraser, undo of your own last stroke, «Pulisci» for both after a
// confirmation. «X ha disegnato sulla lavagna» at most every 2 hours
// (send-web-push decides). The widget «Lavagna» gets the drawing as two
// pictures, Pastello and Midnight. Server: 20261103205050_lavagna_v1.sql.
(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.UsLavagna=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
// Board units: the server keeps x 0..1000 and y 0..1600 (the full screen's shape).
const BOARD=Object.freeze({w:1000,h:1600});
const COLORS=Object.freeze({rosa:'#ff7c96',lilla:'#a98bff',ambra:'#f3b76e',latte:'#f7efe9'});
// The widget on a light Home (Pastello): the same four, deep enough for cream paper.
const PASTEL=Object.freeze({rosa:'#e0567a',lilla:'#7a5ad9',ambra:'#d98a2e',latte:'#1a1020'});
const COLOR_NAMES=Object.freeze({rosa:'Rosa',lilla:'Lilla',ambra:'Ambra',latte:'Latte'});
const PEN=Object.freeze({1:7,2:16}),ERASER=Object.freeze({1:40,2:90});
const LIMITS=Object.freeze({points:600,strokes:1500});
const PUSH_GAP_MS=2*60*60*1000,PUSH_IDLE_MS=8000;
const COLS='id,couple_id,author_id,tool,color,width,points,created_at';
const PAGE=500;

// ---------------------------------------------------------------- pure
// Ramer–Douglas–Peucker: the points a stroke needs to keep its shape.
function simplify(pts,eps){
  if(pts.length<3)return pts.slice();
  const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;
  const stack=[[0,pts.length-1]];
  while(stack.length){
    const [a,b]=stack.pop(),[ax,ay]=pts[a],[bx,by]=pts[b];
    const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);
    let max=0,at=-1;
    for(let i=a+1;i<b;i++){
      const [px,py]=pts[i];
      const d=len?Math.abs(dy*px-dx*py+bx*ay-by*ax)/len:Math.hypot(px-ax,py-ay);
      if(d>max){max=d;at=i;}
    }
    if(at>0&&max>eps){keep[at]=1;stack.push([a,at],[at,b]);}
  }
  return pts.filter((_,i)=>keep[i]);
}
// Raw finger points (board units) → what the server keeps: whole units inside
// the board, simplified, 600 points at most. null when nothing was drawn.
function pack(raw){
  const pts=[];
  for(const p of raw||[]){
    if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1]))continue;
    const x=Math.round(Math.min(BOARD.w,Math.max(0,p[0]))),y=Math.round(Math.min(BOARD.h,Math.max(0,p[1])));
    const last=pts[pts.length-1];
    if(last&&last[0]===x&&last[1]===y)continue;
    pts.push([x,y]);
  }
  if(!pts.length)return null;
  let eps=1.2,out=simplify(pts,eps);
  while(out.length>LIMITS.points){eps*=1.6;out=simplify(pts,eps);}
  return out.flat();
}
function unpack(flat){const out=[];for(let i=0;i+1<(flat||[]).length;i+=2)out.push([flat[i],flat[i+1]]);return out;}
// What the pen drew (the eraser never widens it), with half a stroke around.
function contentBox(strokes){
  let box=null;
  for(const s of strokes||[]){
    if(s.tool==='eraser'||!Array.isArray(s.points))continue;
    const r=(PEN[s.width]||PEN[1])/2;
    for(let i=0;i+1<s.points.length;i+=2){
      const x=s.points[i],y=s.points[i+1];
      if(!box)box={x0:x-r,y0:y-r,x1:x+r,y1:y+r};
      else{box.x0=Math.min(box.x0,x-r);box.y0=Math.min(box.y0,y-r);box.x1=Math.max(box.x1,x+r);box.y1=Math.max(box.y1,y+r);}
    }
  }
  return box;
}
// The part of the board the tile and the widget show, at their shape
// (aspect = width / height): the drawing with some air, never closer than
// half the board, so a dot stays a dot. Empty: the top of the board.
function frame(strokes,aspect){
  const box=contentBox(strokes);
  if(!box)return {x:0,y:0,w:BOARD.w,h:BOARD.w/aspect};
  const PAD=48,MIN=500;
  let w=Math.max(box.x1-box.x0+PAD*2,MIN),h=Math.max(box.y1-box.y0+PAD*2,MIN);
  if(w/h>aspect)h=w/aspect;else w=h*aspect;
  const cx=(box.x0+box.x1)/2,cy=(box.y0+box.y1)/2;
  return {x:cx-w/2,y:cy-h/2,w,h};
}
// The words of the rest of US (i18n-en has them): "proprio ora", "5 min fa".
function ago(at,now=Date.now()){
  const t=Date.parse(at||'');
  if(!Number.isFinite(t))return '';
  const min=Math.floor(Math.max(0,now-t)/60000);
  if(min<1)return 'proprio ora';
  if(min<60)return `${min} min fa`;
  const h=Math.floor(min/60);
  if(h<24)return h===1?'1 ora fa':`${h} ore fa`;
  const d=Math.floor(h/24);
  return d===1?'1 giorno fa':`${d} giorni fa`;
}
const newest=strokes=>{let last=null;for(const s of strokes||[])if(s.created_at&&(!last||s.created_at>=last.created_at))last=s;return last;};
// The board row (written by the server on every deletion): the partner's
// undo names the stroke, «Pulisci» says when; nothing readable → reload.
function applyBoard(strokes,row,state){
  const revision=Number(row?.revision)||0;
  if(revision<=(Number(state?.revision)||0))return {strokes,reload:false,revision:Number(state?.revision)||0,clearedAt:state?.clearedAt||''};
  const removed=Array.isArray(row.removed)?new Set(row.removed):null;
  const cleared=row.cleared_at&&row.cleared_at!==state?.clearedAt?String(row.cleared_at):'';
  const clearedMs=cleared?Date.parse(cleared):NaN;
  const next=strokes.filter(s=>!(removed&&removed.has(s.id))&&!(cleared&&!s.pending&&Date.parse(s.created_at)<=clearedMs));
  return {strokes:next,reload:!removed&&!cleared,revision,clearedAt:cleared||state?.clearedAt||''};
}
const pushDue=(lastAt,now=Date.now())=>!lastAt||now-lastAt>=PUSH_GAP_MS;

// A stroke on a 2D canvas: curves through the midpoints, a dot for a tap.
function trace(ctx,pts,view){
  const n=Math.floor(pts.length/2),X=i=>(pts[i*2]-view.x)*view.scale,Y=i=>(pts[i*2+1]-view.y)*view.scale;
  if(!n)return;
  ctx.beginPath();
  if(n===1){ctx.arc(X(0),Y(0),ctx.lineWidth/2,0,Math.PI*2);ctx.fill();return;}
  ctx.moveTo(X(0),Y(0));
  for(let i=1;i<n-1;i++)ctx.quadraticCurveTo(X(i),Y(i),(X(i)+X(i+1))/2,(Y(i)+Y(i+1))/2);
  ctx.lineTo(X(n-1),Y(n-1));
  ctx.stroke();
}
// Strokes in their order on a transparent layer: the eraser cuts through the
// ink only, the board's colour stays under it. view.k: thicker for the widget.
function paint(ctx,strokes,view){
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const s of strokes){
    ctx.globalCompositeOperation=s.tool==='eraser'?'destination-out':'source-over';
    const color=s.tool==='eraser'?'#000':(view.palette[s.color]||view.palette.latte);
    ctx.strokeStyle=color;ctx.fillStyle=color;
    ctx.lineWidth=((s.tool==='eraser'?ERASER:PEN)[s.width]||PEN[1])*view.scale*(view.k||1);
    trace(ctx,s.points,view);
  }
  ctx.globalCompositeOperation='source-over';
}

function install(w){
  const d=w.document;
  if(!d?.body)return;
  const api=w.UsLavagna,$=id=>d.getElementById(id);
  const db=()=>typeof sb!=='undefined'?sb:null;
  const me=()=>w.usProfile?.id||'';
  const key=()=>w.usProfile?`${w.usProfile.id}:${w.usProfile.couple_id}`:'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // gone: ids taken back here (undo, «Pulisci»), so their late Realtime echo never brings them back.
  let strokes=[],loaded=false,loading=null,owner='',board={revision:0,clearedAt:''},gone=new Set();
  let tool='pen',color='rosa',width=2,active=null,current=null,frameAsked=false;
  let saveChain=Promise.resolve(),failed=0,pushTimer=0,pushStroke='',pushedAt=0;
  let widgetTimer=0,widgetSignature='',dpr=1,scale=1;
  const PUSH_KEY=()=>`us:lavagna:v1:push:${me()}`;
  // This person's last push, read when needed (the profile arrives after this script).
  const lastPushAt=()=>{let stored=0;try{stored=Number(w.localStorage?.getItem(PUSH_KEY()))||0;}catch(_){}return Math.max(stored,pushedAt);};

  const nameOf=id=>{
    if(!id)return '';
    if(id===me())return 'Tu';
    try{
      const p=w.UsCoupleContext?.snapshot?.()?.profiles?.find(x=>x.id===id);
      return p?(w.usIdentity?.()?.nameForRole?.(p.role)||'La tua persona'):'La tua persona';
    }catch(_){return 'La tua persona';}
  };
  const lastLine=()=>{const s=newest(strokes);return s?{who:nameOf(s.author_id),when:ago(s.created_at)}:null;};

  // ---------------------------------------------------------------- data
  async function load({force=false}={}){
    const client=db(),k=key();
    if(!client||!k)return false;
    if(owner&&owner!==k)reset();
    if(loaded&&!force)return true;
    if(loading)return loading;
    loading=(async()=>{
      const cid=w.usProfile.couple_id,rows=[];
      for(let from=0;from<LIMITS.strokes;from+=PAGE){
        const {data,error}=await client.from('lavagna_strokes').select(COLS).eq('couple_id',cid).order('created_at',{ascending:true}).order('id',{ascending:true}).range(from,from+PAGE-1);
        if(error){console.warn('[US Lavagna]',error);return false;}
        rows.push(...(data||[]));
        if((data||[]).length<PAGE)break;
      }
      const {data:row}=await client.from('lavagna_boards').select('revision,cleared_at').eq('couple_id',cid).maybeSingle();
      if(key()!==k)return false;
      const pending=strokes.filter(s=>s.pending&&!rows.some(r=>r.id===s.id));
      strokes=[...rows,...pending];
      board={revision:Number(row?.revision)||0,clearedAt:row?.cleared_at||''};
      loaded=true;owner=k;
      changed({widget:true});
      return true;
    })();
    try{return await loading;}finally{loading=null;}
  }
  // The partner's stroke (and the echo of mine, already here by its id).
  function onStroke(payload){
    const row=payload?.new;
    if(!row?.id||!loaded||row.couple_id!==w.usProfile?.couple_id||gone.has(row.id))return;
    const at=strokes.findIndex(s=>s.id===row.id);
    if(at>=0){if(!strokes[at].pending)strokes[at]=row;return;}
    const last=newest(strokes);
    strokes.push(row);
    if(last&&row.created_at<last.created_at)strokes.sort((a,b)=>((a.pending?1:0)-(b.pending?1:0))||String(a.created_at).localeCompare(String(b.created_at)));
    changed({widget:true,added:row});
  }
  function onBoard(payload){
    const row=payload?.new;
    if(!row||!loaded||row.couple_id!==w.usProfile?.couple_id)return;
    const out=applyBoard(strokes,row,board);
    board={revision:out.revision,clearedAt:out.clearedAt};
    if(out.reload){load({force:true});return;}
    if(out.strokes.length!==strokes.length){strokes=out.strokes;changed({widget:true});}
  }
  function reset(){
    strokes=[];loaded=false;owner='';board={revision:0,clearedAt:''};gone=new Set();current=null;active=null;failed=0;
    clearTimeout(pushTimer);pushStroke='';pushedAt=0;clearTimeout(widgetTimer);widgetSignature='';placed=null;
    if(opened()){root.classList.remove('open');root.setAttribute('aria-hidden','true');}
    paintTile();
  }

  // Saved one after another, in the order they were drawn.
  function commit(points){
    const flat=pack(points);
    if(!flat)return;
    if(strokes.length>=LIMITS.strokes){say('La lavagna è piena: puliscila per continuare');return;}
    const s={id:w.crypto?.randomUUID?.()||fallbackId(),tool,color:tool==='eraser'?null:color,width,points:flat,author_id:me(),created_at:null,pending:true};
    strokes.push(s);
    changed({added:s});
    saveChain=saveChain.then(()=>save(s));
  }
  async function save(s){
    const client=db();
    // Undone before it left: it never reaches the server.
    if(!client||!strokes.includes(s))return;
    const {data,error}=await client.from('lavagna_strokes').insert({id:s.id,couple_id:w.usProfile.couple_id,tool:s.tool,color:s.color,width:s.width,points:s.points}).select(COLS).single();
    if(error||!data){
      console.warn('[US Lavagna] save',error);
      const was=strokes.includes(s);
      strokes=strokes.filter(x=>x!==s);failed++;
      say(/lavagna_full/.test(error?.message||'')?'La lavagna è piena: puliscila per continuare':'Tratto non salvato. Riprova tra poco.');
      if(was)changed({});
      return;
    }
    s.saved=true;
    const at=strokes.indexOf(s);
    if(at<0)return;
    strokes[at]=data;
    changed({widget:true,quiet:true});
    pushLater(data.id);
  }
  function fallbackId(){
    const b=new Uint8Array(16);(w.crypto||globalThis.crypto).getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
    const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  // Undo: my last stroke goes at once; the server takes back the same one.
  function undo(){
    const mine=[...strokes].reverse().find(s=>s.author_id===me());
    if(!mine)return;
    strokes=strokes.filter(s=>s!==mine);gone.add(mine.id);
    changed({widget:true});
    // After the saves in flight: a stroke still waiting is simply never sent.
    saveChain=saveChain.then(async()=>{
      const client=db();
      if(!client||(mine.pending&&!mine.saved))return;
      const {data,error}=await client.rpc('lavagna_undo');
      if(error)console.warn('[US Lavagna] undo',error);
      if(error||data!==mine.id)load({force:true});
    });
  }
  async function clearAll(){
    const ok=await (w.UsUiFoundation?.confirm?.({kicker:'Lavagna',title:'Pulire la lavagna?',body:'Il disegno sparisce per tutti e due.',confirmLabel:'Pulisci',tone:'danger'})??Promise.resolve(w.confirm?.('Pulire la lavagna?')));
    if(!ok)return;
    await saveChain;
    const client=db();
    if(!client)return;
    const before=strokes;
    strokes=strokes.filter(s=>s.pending);before.forEach(s=>{if(!s.pending)gone.add(s.id);});
    changed({widget:true});
    const {error}=await client.rpc('lavagna_clear');
    if(error){console.warn('[US Lavagna] clear',error);strokes=before;before.forEach(s=>gone.delete(s.id));changed({widget:true});say('Non riesco a pulire la lavagna adesso.');}
  }

  // «X ha disegnato sulla lavagna»: once the drawing pauses (or US closes),
  // never twice in 2 hours from this phone. The server keeps the real limit.
  function pushLater(id){
    pushStroke=id;clearTimeout(pushTimer);
    if(!pushDue(lastPushAt()))return;
    pushTimer=setTimeout(sendPush,PUSH_IDLE_MS);
  }
  function sendPush(){
    clearTimeout(pushTimer);
    const id=pushStroke;pushStroke='';
    if(!id||!pushDue(lastPushAt())||typeof w.sendWebPushEvent!=='function')return;
    pushedAt=Date.now();
    try{w.localStorage?.setItem(PUSH_KEY(),String(pushedAt));}catch(_){}
    w.sendWebPushEvent?.('lavagna',id);
  }

  // ---------------------------------------------------------------- full screen
  const root=d.createElement('div');
  root.id='usLavagna';root.className='us-lav-overlay';
  root.setAttribute('aria-hidden','true');root.setAttribute('data-us-modal','');root.setAttribute('data-us-motion-surface','');
  const swatch=c=>`<button type="button" class="us-lav-swatch" data-lav-color="${c}" aria-label="${COLOR_NAMES[c]}" aria-pressed="false"><span style="--c:${COLORS[c]}"></span></button>`;
  root.innerHTML=`<section class="us-lav-sheet" role="dialog" aria-modal="true" aria-labelledby="usLavagnaTitle" data-us-modal-panel>
    <header class="us-lav-head">
      <button type="button" class="us-lav-back" data-lav-close aria-label="Torna a Noi"><span class="us-icon" data-us-icon="caret-left" aria-hidden="true"></span></button>
      <div class="us-lav-titles"><h2 id="usLavagnaTitle">Lavagna</h2><small class="us-lav-last" id="usLavagnaLast" aria-live="polite"></small></div>
      <button type="button" class="us-lav-clear" data-lav-clear>Pulisci</button>
    </header>
    <div class="us-lav-stage" id="usLavagnaStage">
      <div class="us-lav-board" id="usLavagnaBoard">
        <canvas class="us-lav-canvas" id="usLavagnaCanvas" role="img" aria-label="La vostra lavagna"></canvas>
        <p class="us-lav-hint" id="usLavagnaHint" hidden><b>La lavagna è vuota</b><span>Disegnate qualcosa: lo vedete tutti e due</span></p>
        <span class="us-lav-who" id="usLavagnaWho" aria-hidden="true"></span>
      </div>
    </div>
    <div class="us-lav-tools" role="toolbar" aria-label="Strumenti della lavagna">
      ${Object.keys(COLORS).map(swatch).join('')}
      <span class="us-lav-sep" aria-hidden="true"></span>
      <button type="button" class="us-lav-size" data-lav-width="1" aria-label="Tratto sottile" aria-pressed="false"><span></span></button>
      <button type="button" class="us-lav-size is-thick" data-lav-width="2" aria-label="Tratto spesso" aria-pressed="false"><span></span></button>
      <button type="button" class="us-lav-tool us-lav-eraser" data-lav-eraser aria-label="Gomma" aria-pressed="false"><span class="us-icon" data-us-icon="eraser" aria-hidden="true"></span></button>
      <button type="button" class="us-lav-tool" data-lav-undo aria-label="Annulla l’ultimo tratto"><span class="us-icon" data-us-icon="arrow-counter-clockwise" aria-hidden="true"></span></button>
    </div>
    <p class="us-lav-status" id="usLavagnaStatus" role="status" aria-live="polite"></p>
  </section>`;
  d.body.appendChild(root);
  const canvas=$('usLavagnaCanvas'),stage=$('usLavagnaStage'),boardEl=$('usLavagnaBoard');
  const ctx=canvas.getContext?.('2d');
  const layer=d.createElement('canvas'),layerCtx=layer.getContext?.('2d');
  const opened=()=>root.classList.contains('open');

  function say(text){const el=$('usLavagnaStatus');if(el)el.textContent=text||'';if(text)setTimeout(()=>{if(el?.textContent===text)el.textContent='';},4000);}
  function paintTools(){
    root.querySelectorAll('[data-lav-color]').forEach(b=>b.setAttribute('aria-pressed',String(tool==='pen'&&b.dataset.lavColor===color)));
    root.querySelectorAll('[data-lav-width]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.lavWidth)===width)));
    root.querySelector('[data-lav-eraser]')?.setAttribute('aria-pressed',String(tool==='eraser'));
    root.querySelector('[data-lav-undo]').disabled=!strokes.some(s=>s.author_id===me());
  }
  function paintHead(){
    const last=lastLine(),el=$('usLavagnaLast');
    if(el)el.innerHTML=last?`<span>Ultimo tratto</span> <span translate="no">${esc(last.who)}</span><span>${esc(last.when)}</span>`:'';
    const hint=$('usLavagnaHint');if(hint)hint.hidden=!loaded||strokes.length>0;
    const ids=[...new Set(strokes.map(s=>s.author_id).filter(Boolean))];
    const who=$('usLavagnaWho');
    if(who)who.innerHTML=ids.map(id=>`<span data-who="${id===me()?'tu':'partner'}"><i></i><b translate="no">${esc(nameOf(id))}</b></span>`).join('');
    root.querySelector('[data-lav-clear]').disabled=!strokes.length;
  }
  // The board takes the largest 1000×1600 rectangle the screen allows.
  function layout(){
    if(!opened()||!ctx)return;
    const r=stage.getBoundingClientRect();
    scale=Math.max(0.05,Math.min(r.width/BOARD.w,r.height/BOARD.h));
    const cw=Math.floor(BOARD.w*scale),ch=Math.floor(BOARD.h*scale);
    boardEl.style.width=`${cw}px`;boardEl.style.height=`${ch}px`;
    dpr=Math.min(3,w.devicePixelRatio||1);
    for(const c of [canvas,layer]){c.width=Math.round(cw*dpr);c.height=Math.round(ch*dpr);}
    repaintLayer();
  }
  function repaintLayer(){
    if(!layerCtx)return;
    layerCtx.setTransform(1,0,0,1,0,0);layerCtx.clearRect(0,0,layer.width,layer.height);
    paint(layerCtx,strokes,{x:0,y:0,scale:scale*dpr,palette:COLORS});
    draw();
  }
  function draw(){
    frameAsked=false;
    if(!ctx)return;
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(layer,0,0);
    if(current&&current.raw.length)paint(ctx,[{tool:current.tool,color:current.color,width:current.width,points:current.raw}],{x:0,y:0,scale:scale*dpr,palette:COLORS});
  }
  const askFrame=()=>{if(!frameAsked){frameAsked=true;(w.requestAnimationFrame||setTimeout)(draw);}};
  function changed({widget=false,added=null,quiet=false}={}){
    if(opened()){
      // A new stroke on top is painted on the layer; anything else repaints it.
      if(added&&added===strokes[strokes.length-1]&&layerCtx){paint(layerCtx,[added],{x:0,y:0,scale:scale*dpr,palette:COLORS});draw();}
      else if(!quiet)repaintLayer();
      paintHead();paintTools();
    }
    paintTile();
    if(widget)syncWidgetLater();
  }

  // ---------------------------------------------------------------- finger
  const toBoard=e=>{const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)/r.width*BOARD.w,(e.clientY-r.top)/r.height*BOARD.h];};
  canvas.addEventListener('pointerdown',e=>{
    if(active!==null)return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    e.preventDefault();
    active=e.pointerId;
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
    const [x,y]=toBoard(e);
    current={tool,color,width,raw:[x,y]};
    askFrame();
  });
  canvas.addEventListener('pointermove',e=>{
    if(e.pointerId!==active||!current)return;
    // The points between two frames; an empty list (some browsers) is the event itself.
    const coalesced=e.getCoalescedEvents?.();
    for(const p of coalesced&&coalesced.length?coalesced:[e]){
      const [x,y]=toBoard(p),n=current.raw.length;
      if(Math.hypot(x-current.raw[n-2],y-current.raw[n-1])>=1)current.raw.push(x,y);
    }
    askFrame();
  });
  const lift=e=>{
    if(e.pointerId!==active)return;
    active=null;
    const done=current;current=null;
    if(done)commit(unpack(done.raw));
    draw();
  };
  canvas.addEventListener('pointerup',lift);
  canvas.addEventListener('pointercancel',lift);

  root.addEventListener('click',e=>{
    const t=e.target;
    if(t.closest('[data-lav-close]'))return close();
    if(t.closest('[data-lav-clear]'))return clearAll();
    if(t.closest('[data-lav-undo]'))return undo();
    const c=t.closest('[data-lav-color]');
    if(c){tool='pen';color=c.dataset.lavColor;paintTools();return;}
    const s=t.closest('[data-lav-width]');
    if(s){width=Number(s.dataset.lavWidth)===1?1:2;paintTools();return;}
    if(t.closest('[data-lav-eraser]')){tool=tool==='eraser'?'pen':'eraser';paintTools();}
  });
  if(typeof w.ResizeObserver==='function')new w.ResizeObserver(()=>layout()).observe(stage);
  else w.addEventListener('resize',layout);
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&opened()){e.preventDefault();close();}});

  function open(){
    if(!key())return;
    if(owner&&owner!==key())reset();
    w.UsUiFoundation?.cancelSurfaceExit?.(root);
    root.classList.add('open');root.setAttribute('aria-hidden','false');
    layout();paintHead();paintTools();
    load().then(()=>{if(opened())repaintLayer();});
  }
  function close(){
    if(!opened())return;
    if(pushStroke)sendPush();
    const finish=()=>{root.classList.remove('open');root.setAttribute('aria-hidden','true');};
    root.classList.remove('open');
    if(!w.UsUiFoundation?.exitSurface?.(root,finish))finish();
  }

  // ---------------------------------------------------------------- tile in Noi
  let tileCanvas=null,tileSeen=false;
  function mountTile(){
    const slot=$('usNoiLavagnaSlot');
    if(!slot||slot.dataset.lavMounted)return;
    slot.dataset.lavMounted='1';
    slot.innerHTML=`<button type="button" class="us-lav-tile" data-lav-open aria-label="Apri la lavagna">
      <canvas class="us-lav-tile-canvas" aria-hidden="true"></canvas>
      <span class="us-lav-tile-label"><b>Lavagna</b><span class="us-lav-tile-by"></span></span>
      <span class="us-lav-tile-empty" hidden>Disegnate qualcosa: lo vedete tutti e due</span>
      <span class="us-lav-tile-go"><span class="us-icon" data-us-icon="pencil" aria-hidden="true"></span><span>Disegna</span></span>
    </button>`;
    tileCanvas=slot.querySelector('canvas');
    slot.addEventListener('click',e=>{if(e.target.closest('[data-lav-open]'))open();});
    // Loaded when Noi shows it, not at launch.
    if(typeof w.IntersectionObserver==='function'){
      new w.IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting)){tileSeen=true;load().then(paintTile);}}).observe(slot);
    }else{tileSeen=true;load();}
    if(typeof w.ResizeObserver==='function')new w.ResizeObserver(()=>paintTile()).observe(slot);
  }
  function paintTile(){
    const slot=$('usNoiLavagnaSlot');
    if(!slot)return;
    if(!slot.dataset.lavMounted)mountTile();
    if(!tileCanvas)return;
    const last=lastLine(),by=slot.querySelector('.us-lav-tile-by');
    if(by)by.innerHTML=last?`<span translate="no">${esc(last.who)}</span><span>${esc(last.when)}</span>`:'';
    slot.querySelector('.us-lav-tile-empty').hidden=!loaded||strokes.length>0;
    const r=tileCanvas.getBoundingClientRect();
    if(!r.width||!r.height||!tileSeen)return;
    const ratio=Math.min(3,w.devicePixelRatio||1);
    tileCanvas.width=Math.round(r.width*ratio);tileCanvas.height=Math.round(r.height*ratio);
    const c=tileCanvas.getContext?.('2d');
    if(!c)return;
    renderInto(c,tileCanvas.width,tileCanvas.height,strokes,COLORS,1);
  }
  // The drawing framed for a small surface (the tile, the widget).
  function renderInto(c,cw,ch,list,palette,k){
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,cw,ch);
    const view=frame(list,cw/ch);
    paint(c,list,{x:view.x,y:view.y,scale:cw/view.w,palette,k});
  }

  // ---------------------------------------------------------------- widget
  // Pastello (light Home) and Midnight (dark): the same frame, its own ink,
  // on a transparent picture; the widget's paper comes from its resources.
  // The drawing area of the 2x2 (above the line "Bea · 5 min fa"): 5 wide for 4 high.
  const WIDGET_W=480,WIDGET_H=384;
  function syncWidgetLater(){clearTimeout(widgetTimer);widgetTimer=setTimeout(()=>syncWidget(),1500);}
  // Drawn only for a widget on the Home (asked again after a pin or a return to US).
  let placed=null;
  async function hasWidget(){
    if(placed===null){try{placed=(Number((await w.UsWidgets?.installed?.())?.installed?.lavagna)||0)>0;}catch(_){placed=false;}}
    return placed;
  }
  w.addEventListener('us:widget-pinned',()=>{placed=null;});
  async function syncWidget({force=false}={}){
    const widgets=w.UsWidgets;
    if(typeof widgets?.syncLavagna!=='function'||!widgets.isAvailable?.())return false;
    if(!force&&!await hasWidget())return false;
    if(!loaded&&!await load())return false;
    const saved=strokes.filter(s=>!s.pending);
    const last=newest(saved);
    const signature=JSON.stringify([saved.length,saved.map(s=>s.id).join(','),board.clearedAt]);
    if(!force&&signature===widgetSignature)return false;
    const state=saved.length?'ready':'empty';
    let light='',dark='';
    if(saved.length){
      try{[light,dark]=await Promise.all([picture(saved,PASTEL),picture(saved,COLORS)]);}
      catch(error){console.warn('[US Lavagna] widget',error);return false;}
    }
    const ok=await widgets.syncLavagna({state,by:!last?.author_id?'':last.author_id===me()?'me':'partner',at:last?.created_at||'',light,dark});
    if(ok!==false)widgetSignature=signature;
    return ok;
  }
  async function picture(list,palette){
    const c=d.createElement('canvas');c.width=WIDGET_W;c.height=WIDGET_H;
    const g=c.getContext('2d');
    if(!g)throw new Error('lavagna_canvas');
    renderInto(g,WIDGET_W,WIDGET_H,list,palette,1.6);
    let blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',0.92));
    if(!blob||blob.type!=='image/webp')blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('lavagna_encode');
    const url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
    return url.slice(url.indexOf(',')+1);
  }

  // Impostazioni › Widget: the drawing as the dark widget shows it, '' when there is none.
  function preview(){
    const saved=strokes.filter(s=>!s.pending);
    if(!saved.length)return '';
    try{
      const c=d.createElement('canvas');c.width=240;c.height=192;
      const g=c.getContext('2d');
      if(!g)return '';
      renderInto(g,c.width,c.height,saved,COLORS,1.6);
      return c.toDataURL('image/png');
    }catch(_){return '';}
  }

  // Leaving the app: the push that was waiting goes now.
  d.addEventListener('visibilitychange',()=>{
    if(d.hidden){if(pushStroke)sendPush();return;}
    placed=null;
    if(loaded&&key()===owner)load({force:true});
  });
  // A widget placed on the Home: bring it the drawing, once the app is ready.
  w.addEventListener('us-auth-resolved',e=>{
    if(!e?.detail?.paired)return;
    setTimeout(()=>{placed=null;syncWidget();},2500);
  });
  if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',mountTile);else mountTile();
  paintTools();

  // mount: for a Noi that draws #usNoiLavagnaSlot after this script ran.
  api.open=open;api.close=close;api.reset=reset;api.onStroke=onStroke;api.onBoard=onBoard;api.syncWidget=syncWidget;api.load=load;api.mount=paintTile;api.preview=preview;
}
return {BOARD,COLORS,PASTEL,LIMITS,pack,unpack,simplify,contentBox,frame,ago,newest,applyBoard,pushDue,paint,install};
});
