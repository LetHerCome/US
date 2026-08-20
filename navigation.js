(() => {
'use strict';
if(window.__usInternalHistoryInstalled)return;
window.__usInternalHistoryInstalled=true;

let applyingHistory=false;
let historyReady=false;
let layerScanQueued=false;
const layerStates=new Map();

const originalGo=typeof window.go==='function'?window.go:null;

function activePage(){
  return document.querySelector('.page.active')?.id||'home';
}
function currentState(){
  return history.state&&history.state.__usNav?history.state:null;
}
function sameLayerState(name){
  const state=currentState();
  return Boolean(state&&state.kind==='layer'&&state.layer===name);
}
function pushPage(page){
  history.pushState({__usNav:1,kind:'page',page},'',location.href);
}
function pushLayer(name){
  history.pushState({__usNav:1,kind:'layer',layer:name,page:activePage()},'',location.href);
}

if(originalGo){
  window.go=function(id,options={}){
    const current=activePage();
    if(!applyingHistory&&historyReady&&id&&id!==current){
      pushPage(id);
    }
    return originalGo(id,options);
  };
}

const layers=[
  {
    name:'today',
    find:()=>document.getElementById('today'),
    open:el=>el?.classList.contains('open'),
    close:()=>window.closeToday?.()
  },
  {
    name:'events',
    find:()=>document.getElementById('usEventsOverlay'),
    open:el=>el?.classList.contains('open'),
    close:()=>window.closeEvents?.()
  },
  {
    name:'moment-compose',
    find:()=>document.getElementById('usMomentComposeOverlay'),
    open:el=>el?.classList.contains('show'),
    close:()=>document.getElementById('usMomentComposeClose')?.click()
  },
  {
    name:'moment-album',
    find:()=>document.getElementById('usAlbumOverlay'),
    open:el=>el?.classList.contains('show'),
    close:()=>document.getElementById('usAlbumClose')?.click()
  },
  {
    name:'moment-lightbox',
    find:()=>document.getElementById('usAlbumLightbox'),
    open:el=>el?.classList.contains('show'),
    close:()=>document.getElementById('usAlbumLightboxClose')?.click()
  },
  {
    name:'moment-viewer',
    find:()=>document.getElementById('momentViewer'),
    open:el=>el?.classList.contains('show'),
    close:()=>window.closeMomentViewer?.()
  },
  {
    name:'story',
    find:()=>document.querySelector('.us-story-viewer'),
    open:el=>el?.classList.contains('open'),
    close:()=>document.querySelector('.us-story-viewer.open .us-story-close')?.click()
  },
  {
    name:'profile-preview',
    find:()=>document.querySelector('.us-profile-preview'),
    open:el=>el?.classList.contains('open'),
    close:()=>document.querySelector('.us-profile-preview.open .us-profile-preview-close')?.click()
  },
  {
    name:'camera',
    find:()=>document.querySelector('.us-camera-viewer'),
    open:el=>el?.classList.contains('open'),
    close:()=>{
      const root=document.querySelector('.us-camera-viewer.open');
      const close=root?.querySelector('[aria-label*="Chiudi"],[aria-label*="Annulla"],.us-camera-top .us-camera-icon-btn');
      close?.click();
    }
  }
];

function scanLayers({initialize=false}={}){
  for(const layer of layers){
    const el=layer.find();
    const open=Boolean(el&&layer.open(el));
    const previous=layerStates.get(layer.name);

    if(initialize||previous===undefined){
      layerStates.set(layer.name,open);
      if(open&&!applyingHistory&&historyReady&&!sameLayerState(layer.name)){
        pushLayer(layer.name);
      }
      continue;
    }

    if(open===previous)continue;
    layerStates.set(layer.name,open);

    if(applyingHistory||!historyReady)continue;

    if(open){
      if(!sameLayerState(layer.name))pushLayer(layer.name);
      continue;
    }

    // A close button / swipe consumed a layer. Consume its matching browser
    // history entry too, so the next system Back continues naturally.
    if(sameLayerState(layer.name)){
      history.back();
    }
  }
}

function queueLayerScan(){
  if(layerScanQueued)return;
  layerScanQueued=true;
  queueMicrotask(()=>{
    layerScanQueued=false;
    scanLayers();
  });
}

function closeLayersExcept(targetName=null){
  // Close top-most visual layers first. During popstate, observers are muted.
  [...layers].reverse().forEach(layer=>{
    const el=layer.find();
    if(!el||!layer.open(el)||layer.name===targetName)return;
    try{layer.close();}catch(_e){}
  });
}

function applyHistoryState(state){
  applyingHistory=true;

  const targetPage=state?.page||'home';
  const targetLayer=state?.kind==='layer'?state.layer:null;

  closeLayersExcept(targetLayer);

  if(originalGo&&targetPage&&activePage()!==targetPage){
    originalGo(targetPage,{history:false});
  }

  // If a state refers to an already-open underlying layer, leave it untouched.
  // We intentionally don't reopen layers that the user explicitly closed.
  setTimeout(()=>{
    for(const layer of layers){
      const el=layer.find();
      layerStates.set(layer.name,Boolean(el&&layer.open(el)));
    }
    applyingHistory=false;
  },0);
}

window.addEventListener('popstate',event=>{
  const state=event.state;
  if(!state?.__usNav)return;
  applyHistoryState(state);
});

function installHistory(){
  const page=activePage();
  const existing=currentState();
  if(!existing){
    history.replaceState({...(history.state||{}),__usNav:1,kind:'page',page},'',location.href);
  }else if(!existing.page){
    history.replaceState({...existing,page},'',location.href);
  }

  historyReady=true;
  scanLayers({initialize:true});

  const observer=new MutationObserver(queueLayerScan);
  observer.observe(document.body,{
    subtree:true,
    childList:true,
    attributes:true,
    attributeFilter:['class','hidden','aria-hidden']
  });

  console.info('[US Navigation] Android/browser Back collegato alla history interna');
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',installHistory,{once:true});
}else{
  installHistory();
}
})();