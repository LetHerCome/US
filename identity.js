(() => {
'use strict';
if(window.__usIdentityOneInstalled)return;
window.__usIdentityOneInstalled=true;

function loader(){
  const mark=document.createElement('span');
  mark.className='us-id-loader';
  mark.setAttribute('aria-hidden','true');
  mark.innerHTML='<i></i><i></i><b></b>';
  return mark;
}

function decorateBusy(root=document){
  root.querySelectorAll?.('.empty-state[aria-busy="true"],.quiz-week-loading[aria-busy="true"]').forEach(el=>{
    if(el.querySelector(':scope > .us-id-loader'))return;
    el.prepend(loader());
  });
}

function boot(){
  document.documentElement.classList.add('us-identity-one');
  decorateBusy();

  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node.nodeType!==1)continue;
        if(node.matches?.('.empty-state[aria-busy="true"],.quiz-week-loading[aria-busy="true"]')){
          decorateBusy(node.parentElement||document);
        }else{
          decorateBusy(node);
        }
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});

  console.info('[US Identity] Identity 1 attiva');
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();