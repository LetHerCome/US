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
// Oggi's photo fills the screen. When filling it would cut more than a fifth
// of the picture (a landscape photo on a tall phone), the photo shows whole
// and the same picture, blurred, fills the space behind it (founder decision
// 16/10). Layer A/B keep the sharp image as their background (Countdown,
// Stile di Oggi and Settings read it there); the blurred copy is a sibling
// backdrop that follows the layer's crossfade. Shared with app.js.
const HOME_PHOTO_CROP_LIMIT=0.2;
function homePhotoWhole(layer){
  const hero=document.getElementById('homeHero');
  const ratio=Number(layer?.dataset.usPhotoRatio||0);
  const w=hero?.clientWidth||0,h=hero?.clientHeight||0;
  if(!ratio||!w||!h)return false;
  const screen=w/h;
  return 1-Math.min(ratio/screen,screen/ratio)>HOME_PHOTO_CROP_LIMIT;
}
function fitHomeLayer(key){
  const layer=document.getElementById(`homePhotoLayer${key}`);
  const backdrop=document.getElementById(`homePhotoBackdrop${key}`);
  if(!layer)return;
  const whole=Boolean(layer.style.backgroundImage)&&homePhotoWhole(layer);
  layer.toggleAttribute('data-us-photo-whole',whole);
  if(backdrop){
    backdrop.style.backgroundImage=whole?layer.style.backgroundImage:'';
    backdrop.classList.toggle('active',whole&&layer.classList.contains('active'));
  }
}
window.UsHomePhotoFit={
  // url: the signed or cached URL; img: a loaded Image (for its proportions).
  set(key,url,img){
    const layer=document.getElementById(`homePhotoLayer${key}`);
    if(!layer)return;
    layer.style.backgroundImage=url?`url("${url}")`:'';
    const w=img?.naturalWidth||0,h=img?.naturalHeight||0;
    if(url&&w&&h)layer.dataset.usPhotoRatio=String(w/h);else delete layer.dataset.usPhotoRatio;
    fitHomeLayer(key);
  },
  // After the crossfade toggled .active on the layers.
  sync(){fitHomeLayer('A');fitHomeLayer('B');}
};
let homeFitFrame=0;
window.addEventListener?.('resize',()=>{
  if(homeFitFrame)return;
  homeFitFrame=requestAnimationFrame(()=>{homeFitFrame=0;window.UsHomePhotoFit.sync();});
},{passive:true});

function applyHome(url,profile,img){
  // MC3: a cached image may warm, but can only paint for the verified viewer.
  if(window.usProfile?.id!==profile?.id||window.usProfile?.couple_id!==profile?.couple_id)return;
  const layer=document.getElementById('homePhotoLayerA');
  if(!layer||!url)return;
  layer.classList.add('active');
  window.UsHomePhotoFit.set('A',url,img);
  document.body.classList.add('us-fastboot-photo');
}
function tryImage(url){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
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
  if(window.UsPlatform?.canUsePrivateWebMediaCache!==false){
    const localUrl=`/__us_media_cache__?path=${encodeURIComponent(cached.path)}`;
    try{
      const img=await tryImage(localUrl);
      applyHome(localUrl,profile,img);
      return;
    }catch(_){}
  }

  // First run after installing Fast Boot 2 may not have the media cache yet.
  // Reuse the previous signed URL if it is still valid.
  if(cached.url && Number(cached.expiresAt||0)>Date.now()+15000){
    try{
      const img=await tryImage(cached.url);
      applyHome(cached.url,profile,img);
    }catch(_){}
  }
}

restoreHome().catch(()=>{});
console.info('[US Boot] Fast Boot 2 ready');
})();
