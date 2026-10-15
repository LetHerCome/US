// Ricordi carousel V1: functional renderer tests without network/storage.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const script=read('moments-albums.js');

function renderer(rows=[],caption='Il nostro giorno'){
  const elements=new Map();
  const el=(id)=>{
    if(!elements.has(id)){
      const attrs=new Map(),classes=new Set();
      const node={
        id,hidden:false,dataset:{},textContent:'',offsetWidth:200,
        classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:(v)=>classes.has(v)},
        getAttribute:(n)=>attrs.get(n)||null,
        setAttribute:(n,v)=>attrs.set(n,String(v)),
        removeAttribute:(n)=>attrs.delete(n),
        replaceChildren:()=>{},
      };
      Object.defineProperty(node,'src',{get(){return attrs.get('src')||'';},set(v){attrs.set('src',String(v));}});
      elements.set(id,node);
    }
    return elements.get(id);
  };
  const ctx={
    document:{getElementById:el},
    window:{UsUiFoundation:{isReducedMotion:()=>true}},
    currentAlbum:{url:'https://photos.example/cover',author:'Beatrice',caption,date:'8 ottobre',path:'couple/cover.webp'},
    albumRows:rows,albumCarouselIndex:0,selectNewestAlbumPhoto:false,lightboxItems:[],
    renderAlbumStory:()=>{},paintDeleteControl:()=>{},
  };
  vm.createContext(ctx);
  const start=script.indexOf('function renderAlbum(){');
  const end=script.indexOf('// ===== Ricordi · Elimina',start);
  assert.ok(start>0&&end>start,'renderer source exists');
  vm.runInContext(script.slice(start,end),ctx,{timeout:1000});
  return {ctx,el};
}

// US 1.0 R4: the cover's note is the album title and a single photo is signed by
// the byline, so the per-photo note stays hidden there (it used to repeat both).
test('single-photo memory keeps cover and caption with no carousel controls',()=>{
  const {ctx,el}=renderer();
  ctx.renderAlbum();
  assert.equal(el('usAlbumCover').src,'https://photos.example/cover');
  assert.equal(el('usAlbumCount').textContent,'1 foto');
  assert.equal(el('usAlbumCoverCaption').textContent,'');
  assert.equal(el('usAlbumCoverNote').hidden,true);
  assert.equal(el('usAlbumPeek').hidden,true);
  assert.equal(el('usAlbumCarouselPrev').hidden,true);
  assert.equal(el('usAlbumCarouselCounter').hidden,true);
  assert.equal(el('usAlbumCurrentDelete').hidden,true);
});

test('swipe navigation reveals the adjacent image and its OWN caption below',()=>{
  const rows=[
    {id:'added1',url:'https://photos.example/1',storage_path:'a/1.webp',author:'Francesco',caption:'Sulla spiaggia',own:true},
    {id:'added2',url:'https://photos.example/2',storage_path:'a/2.webp',author:'Beatrice',caption:'',own:false},
  ];
  const {ctx,el}=renderer(rows);
  ctx.renderAlbum();
  assert.equal(el('usAlbumCount').textContent,'3 foto');
  // US 1.0 R11: the next full photo is fetched only when it is shown (no peek prefetch).
  assert.equal(el('usAlbumPeek').src,'');
  assert.equal(el('usAlbumPeek').hidden,true);
  assert.equal(el('usAlbumCarouselCounter').textContent,'1 di 3');
  // US 1.0 R4: in an album even the cover says who added it.
  assert.equal(el('usAlbumCoverAuthor').textContent,'Aggiunto da Beatrice');
  assert.equal(el('usAlbumCoverNote').hidden,false);
  ctx.showAlbumPhoto(1,1);
  assert.equal(el('usAlbumCover').src,rows[0].url);
  assert.equal(el('usAlbumCoverCaption').textContent,'Sulla spiaggia');
  assert.equal(el('usAlbumCoverAuthor').textContent,'Aggiunto da Francesco');
  assert.equal(el('usAlbumCoverNote').hidden,false);
  assert.equal(el('usAlbumCurrentDelete').hidden,false);
  assert.equal(el('usAlbumPeek').src,'');
  ctx.showAlbumPhoto(2,1);
  assert.equal(el('usAlbumCover').src,rows[1].url);
  // US 1.0 R4: a photo without a note still says who added it.
  assert.equal(el('usAlbumCoverCaption').hidden,true);
  assert.equal(el('usAlbumCoverAuthor').textContent,'Aggiunto da Beatrice');
  assert.equal(el('usAlbumCoverNote').hidden,false);
  assert.equal(el('usAlbumCurrentDelete').hidden,true);
  ctx.showAlbumPhoto(3,1);
  assert.equal(el('usAlbumCover').src,'https://photos.example/cover');
  assert.equal(el('usAlbumCarouselCounter').textContent,'1 di 3');
});

test('after adding a photo the latest one is selected without duplicate grid images',()=>{
  const {ctx,el}=renderer([{id:'new',url:'https://photos.example/latest',author:'Francesco',caption:'Nuova',own:true,storage_path:'new.webp'}]);
  ctx.selectNewestAlbumPhoto=true;
  ctx.renderAlbum();
  assert.equal(ctx.albumCarouselIndex,1);
  assert.equal(ctx.selectNewestAlbumPhoto,false);
  assert.equal(el('usAlbumCover').src,'https://photos.example/latest');
});

test('layout retains existing photo fullscreen, add, delete and lazy peek',()=>{
  const html=script;
  const css=read('ricordi-carousel.css');
  assert.match(html,/showAlbumPhoto\(albumCarouselIndex\+\(dx<0\?1:-1\)/);
  assert.match(html,/openLightbox\(albumCarouselIndex\)/);
  assert.match(html,/deleteAlbumPhoto\(row\.id,row\.storage_path\)/);
  assert.match(html,/id="usAlbumPeek"[^>]*loading="lazy"/);
  // US 1.0 R4/R11: each photo's own note (never the cover's twice); the peek is never preloaded.
  assert.match(html,/const ownNote=item\.cover\?'':\(item\.caption\|\|''\);/);
  assert.match(html,/if\(peek\)\{peek\.hidden=true;peek\.removeAttribute\('src'\);\}/);
  assert.match(html,/id="usAlbumCarouselCounter"/);
  assert.match(css,/#usAlbumOverlay #usAlbumCarousel/);
  assert.match(css,/#moments \.ricordi-story/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test('PWA/Capacitor both bundle carousel files and a consistent version',()=>{
  const index=read('index.html'),sw=read('service-worker.js');
  const version=JSON.parse(read('version.json')).version;
  assert.ok(index.includes('name="us-build" content="'+version+'"'));
  assert.ok(sw.includes('const BUILD_ID = "'+version+'";'));
  assert.ok(index.includes('ricordi-carousel.css?v='+version));
  assert.match(sw,/versioned\("\/ricordi-carousel\.css"\)/);
  for(const p of ['scripts/build-cloudflare-pages.mjs','scripts/build-capacitor-web.mjs'])
    assert.ok(read(p).includes("'ricordi-carousel.css'"));
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.ok(manifest.icons.length>=2);
});
