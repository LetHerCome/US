(() => {
'use strict';
if(window.__usFastBoot2Installed)return;
window.__usFastBoot2Installed=true;

const HOME_KEY='us:home-photo:boot:v1';

function getBootProfile(){
  try{
    const p=JSON.parse(localStorage.getItem('us:fix4:last-profile')||'null');
    return p?.id&&p?.couple_id?p:null;
  }catch(_){return null;}
}
function getHomeCache(profile){
  try{
    const cached=JSON.parse(localStorage.getItem(HOME_KEY)||'null');
    if(!cached?.path||!cached?.coupleId)return null;
    if(cached.coupleId!==profile?.couple_id)return null;
    return cached;
  }catch(_){return null;}
}
function applyHome(url){
  const layer=document.getElementById('homePhotoLayerA');
  if(!layer||!url)return;
  layer.style.backgroundImage=`url("${url}")`;
  layer.classList.add('active');
  document.body.classList.add('us-fastboot-photo');
}
function tryImage(url){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(url);
    img.onerror=reject;
    img.src=url;
  });
}

async function restoreHome(){
  const profile=getBootProfile();
  if(!profile)return;

  const cached=getHomeCache(profile);
  if(!cached?.path)return;

  // Stable local media endpoint handled by the Service Worker.
  // It works even when yesterday's signed URL has expired.
  const localUrl=`/__us_media_cache__?path=${encodeURIComponent(cached.path)}`;
  try{
    const ok=await tryImage(localUrl);
    applyHome(ok);
    return;
  }catch(_){}

  // First run after installing Fast Boot 2 may not have the media cache yet.
  // Reuse the previous signed URL if it is still valid.
  if(cached.url && Number(cached.expiresAt||0)>Date.now()+15000){
    try{
      const ok=await tryImage(cached.url);
      applyHome(ok);
    }catch(_){}
  }
}

restoreHome().catch(()=>{});
console.info('[US Boot] Fast Boot 2 ready');
})();