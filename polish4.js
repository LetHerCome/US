(() => {
'use strict';
if(window.__usFinalPolishInstalled)return;
window.__usFinalPolishInstalled=true;

let xpTimer=null;
let levelTimer=null;

function ensureXp(){
  let root=document.getElementById('usXpCelebration');
  if(root)return root;
  root=document.createElement('div');
  root.id='usXpCelebration';
  root.className='us-xp-celebration';
  root.innerHTML='<i>✦</i><span><b></b><small></small></span>';
  document.body.appendChild(root);
  return root;
}

window.usCelebrateXp=function(amount,label='Bond'){
  const value=Math.max(0,Number(amount)||0);
  if(!value)return false;
  const root=ensureXp();
  clearTimeout(xpTimer);
  root.classList.remove('leave','show');
  root.querySelector('b').textContent=`+${value} XP Bond`;
  root.querySelector('small').textContent=label;
  requestAnimationFrame(()=>root.classList.add('show'));
  navigator.vibrate?.([18,20,28]);
  xpTimer=setTimeout(()=>{
    root.classList.add('leave');
    root.classList.remove('show');
  },1550);
  return true;
};

function ensureLevel(){
  let root=document.getElementById('usLevelCelebration');
  if(root)return root;
  root=document.createElement('div');
  root.id='usLevelCelebration';
  root.className='us-level-celebration';
  root.innerHTML='<div><i></i><small>NUOVO BOND LEVEL</small><b></b><span></span></div>';
  document.body.appendChild(root);
  return root;
}

window.usCelebrateLevel=function(level,title=''){
  const root=ensureLevel();
  clearTimeout(levelTimer);
  root.querySelector('i').textContent=`LV ${level}`;
  root.querySelector('b').textContent=`Livello ${level}`;
  root.querySelector('span').textContent=title;
  root.classList.remove('show');
  requestAnimationFrame(()=>root.classList.add('show'));
  levelTimer=setTimeout(()=>root.classList.remove('show'),1900);
  return true;
};

function emptyMark(){
  const mark=document.createElement('span');
  mark.className='us-empty-mark';
  mark.setAttribute('aria-hidden','true');
  mark.innerHTML='<i></i><i></i><b></b>';
  return mark;
}

function decorateEmptyStates(root=document){
  root.querySelectorAll?.('.empty-state:not([aria-busy="true"])').forEach(el=>{
    if(el.querySelector(':scope > .us-empty-mark'))return;
    const emoji=el.querySelector(':scope > .emoji');
    if(emoji)emoji.classList.add('us-polish-hidden');
    el.prepend(emptyMark());
  });
}

function boot(){
  decorateEmptyStates();
  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node.nodeType!==1)continue;
        if(node.matches?.('.empty-state:not([aria-busy="true"])'))decorateEmptyStates(node.parentElement||document);
        else decorateEmptyStates(node);
      }
    }
  });
  observer.observe(document.body,{subtree:true,childList:true});
  console.info('[US Polish] Final Polish + Motion 3.1 attivi');
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();