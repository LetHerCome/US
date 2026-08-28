(() => {
'use strict';
if(window.__usInternalHistoryInstalled)return;
window.__usInternalHistoryInstalled=true;

let applyingHistory=false;
let historyReady=false;
let layerScanQueued=false;
let currentEntryIndex=0;
const layerStates=new Map();

const originalGo=typeof window.go==='function'?window.go:null;

function activePage(){
  return document.querySelector('.page.active')?.id||'home';
}
function currentState(){
  return history.state&&history.state.__usNav?history.state:null;
}
function entryIndex(state=currentState()){
  return Number.isInteger(state?.entryIndex)&&state.entryIndex>=0?state.entryIndex:0;
}
function sameLayerState(name){
  const state=currentState();
  return Boolean(state&&state.kind==='layer'&&state.layer===name);
}
function pushPage(page){
  currentEntryIndex=entryIndex()+1;
  history.pushState({__usNav:1,kind:'page',page,entryIndex:currentEntryIndex},'',location.href);
}
function pushLayer(name){
  currentEntryIndex=entryIndex()+1;
  history.pushState({__usNav:1,kind:'layer',layer:name,page:activePage(),entryIndex:currentEntryIndex},'',location.href);
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
    name:'event-form',
    find:()=>document.getElementById('usEventForm'),
    open:el=>Boolean(el&&!el.hidden),
    close:()=>window.cancelEventEdit?.()
  },
  {
    name:'quiz-subview',
    find:()=>document.getElementById('quiz'),
    open:()=>Boolean(document.getElementById('quizHub')?.classList.contains('hidden')),
    close:()=>{
      const knowledgeOpen=!document.getElementById('usKnowledgePlay')?.classList.contains('hidden')||!document.getElementById('usKnowledgeResult')?.classList.contains('hidden');
      if(knowledgeOpen)window.resetPartnerKnowledge?.();else window.resetQuiz?.();
    }
  },
  {
    name:'settings-modal',
    find:()=>document.getElementById('usSettingsOverlay'),
    open:el=>el?.classList.contains('open'),
    close:()=>window.closeUsSettingsModal?.()
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

function topOpenLayer(){
  return [...layers].reverse().find(layer=>{
    const el=layer.find();
    return Boolean(el&&layer.open(el));
  })||null;
}

function closeTopLayer(){
  const layer=topOpenLayer();
  if(!layer)return false;
  try{layer.close();return true;}catch(_e){return false;}
}

function handleNativeBack(){
  const state=currentState();
  const layer=topOpenLayer();

  if(layer){
    if(state?.kind==='layer'&&state.layer===layer.name&&entryIndex(state)>0){
      history.back();
      return true;
    }
    return closeTopLayer();
  }

  if(state?.kind==='page'&&state.page&&state.page!=='home'){
    if(entryIndex(state)>0){
      history.back();
      return true;
    }
    if(originalGo){
      originalGo('home',{history:false});
      return true;
    }
  }

  return false;
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
  currentEntryIndex=entryIndex(state);
  applyHistoryState(state);
});

function installHistory(){
  const page=activePage();
  const existing=currentState();
  if(!existing){
    history.replaceState({...(history.state||{}),__usNav:1,kind:'page',page,entryIndex:0},'',location.href);
  }else if(!existing.page){
    history.replaceState({...existing,page,entryIndex:entryIndex(existing)},'',location.href);
  }

  currentEntryIndex=entryIndex();

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

function installNativeBackButton(){
  window.UsPlatform?.listenForNativeBackButton?.(()=>{
    if(handleNativeBack())return;
    void window.UsPlatform?.exitNativeApp?.();
  });
}

window.UsNavigation=Object.freeze({handleNativeBack});

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',installHistory,{once:true});
}else{
  installHistory();
}
installNativeBackButton();
})();
