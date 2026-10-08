// Ricordi V2: the carousel must live in the timeline, not only in Album.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

class FakeNode{
  constructor(tag='div'){
    this.tagName=tag.toUpperCase();this.dataset={};this.children=[];
    this.parent=null;this.isConnected=true;this.hidden=false;this.textContent='';
    this.attrs=new Map();this.listeners=new Map();this.offsetWidth=100;
    const values=new Set();
    this.classList={add:(...a)=>a.forEach(v=>values.add(v)),
      remove:(...a)=>a.forEach(v=>values.delete(v)),
      contains:v=>values.has(v)};
    // Real DOM synchronizes className and classList. This fake must too.
    Object.defineProperty(this,'className',{
      get:()=>[...values].join(' '),
      set:v=>{values.clear();String(v).split(/\s+/).filter(Boolean).forEach(t=>values.add(t));}
    });
  }
  setAttribute(n,v){this.attrs.set(n,String(v));}
  getAttribute(n){return this.attrs.get(n)||null;}
  removeAttribute(n){this.attrs.delete(n);}
  set src(v){this.setAttribute('src',v);}
  get src(){return this.getAttribute('src')||'';}
  get currentSrc(){return this.src;}
  get parentNode(){return this.parent;}
  appendChild(child){if(child.parent)child.remove();this.children.push(child);child.parent=this;return child;}
  append(...nodes){nodes.forEach(n=>this.appendChild(n));}
  prepend(child){if(child.parent)child.remove();this.children.unshift(child);child.parent=this;}
  before(node){const p=this.parent;if(!p)return;if(node.parent)node.remove();p.children.splice(p.children.indexOf(this),0,node);node.parent=p;}
  remove(){if(!this.parent)return;const i=this.parent.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1);this.parent=null;}
  querySelector(q){
    if(q===':scope > img')return this.children.find(x=>x.tagName==='IMG')||null;
    if(q===':scope > .moment-meta')return this.children.find(x=>x.classList.contains('moment-meta'))||null;
    if(q===':scope > p')return this.children.find(x=>x.tagName==='P')||null;
    if(q==='.moment-by')return this.children.find(x=>x.classList.contains('moment-by'))||null;
    return null;
  }
  closest(q){
    if(q.includes('data-ricordi-inline-step'))return this.dataset.ricordiInlineStep?this:null;
    if(q.includes('ricordi-inline-stage')){let cur=this;while(cur){if(cur.classList.contains('ricordi-inline-stage'))return cur;cur=cur.parent;}return null;}
    if(q.includes('.moment-card')){let cur=this;while(cur){if(cur.classList.contains('moment-card'))return cur;cur=cur.parent;}return null;}
    return null;
  }
  addEventListener(name,cb){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(cb);}
  dispatch(name,event){this.listeners.get(name)?.forEach(fn=>fn(event));}
}
function scene(){
 const card=new FakeNode('article');card.classList.add('moment-card');card.dataset={
  momentId:'m1',url:'https://cdn.test/original',storagePath:'a/cover.webp',author:'Beatrice',caption:'Il nostro viaggio'
 };
 const img=new FakeNode('img');img.src='https://cdn.test/thumbnail';img.dataset.usMediaPath='a/thumb.webp';
 card.appendChild(img);
 const meta=new FakeNode();meta.classList.add('moment-meta');card.appendChild(meta);
 const author=new FakeNode();author.classList.add('moment-by');author.textContent='Beatrice';meta.appendChild(author);
 const date=new FakeNode('b');date.textContent='08 ott 2026';meta.appendChild(date);
 const caption=new FakeNode('p');caption.textContent='Il nostro viaggio';meta.appendChild(caption);
 return {card,img,meta,author,date,caption};
}
function boot(){
 const waits=[],requests=[];
 class IO {
  constructor(callback){this.callback=callback;waits.push(this);}
  observe(){}
  unobserve(){}
  trigger(target){this.callback([{isIntersecting:true,target}]);}
 }
 const context={window:{
  usProfile:{id:'me'},
  UsUiFoundation:{isReducedMotion:()=>true},
  usGetSignedUrls:async(paths)=>{
   requests.push([...paths]);
   return new Map(paths.map(p=>[p,'https://signed.test/'+p]));
  }
 },document:{createElement:t=>new FakeNode(t)},
 IntersectionObserver:IO,
 console};
 vm.createContext(context);
 vm.runInContext(read('ricordi-inline-carousel.js'),context,{timeout:1000});
 return {api:context.window.UsRicordiInline,requests,waits};
}
const extras=[
 {id:'f1',moment_id:'m1',created_by:'me',storage_path:'a/1.webp',position:1,caption:'Sulla spiaggia'},
 {id:'f2',moment_id:'m1',created_by:'partner',storage_path:'a/2.webp',position:2,caption:''},
];
test('main timeline card builds an in-place photo stack without opening Album',()=>{
 const {api,requests,waits}=boot(),{card,img,author,caption}=scene();
 api.decorate(card,[...extras].reverse());
 assert.equal(card.children[0].classList.contains('ricordi-inline-stage'),true);
 const stage=card.children[0];
 assert.equal(stage.children[1],img);
 assert.equal(stage.children[2].textContent,'1 / 3');
 assert.equal(stage.children[0].src,'https://cdn.test/thumbnail');
 assert.equal(author.textContent,'Beatrice');
 assert.equal(caption.textContent,'Il nostro viaggio');
 assert.equal(requests.length,0,'do not sign originals for offscreen cards');
 assert.equal(waits.length,1);
 assert.equal(card.children[1].classList.contains('moment-meta'),true);
});
test('each selected photo updates caption below the photo, without replacing date',async()=>{
 const {api,requests}=boot(),{card,author,date,caption}=scene();
 api.decorate(card,extras);
 const stage=card.children[0];
 assert.equal(await api.select(card,1,1),true);
 assert.equal(stage.children[1].src,'https://signed.test/a/1.webp');
 assert.equal(stage.children[2].textContent,'2 / 3');
 assert.equal(caption.textContent,'Sulla spiaggia');
 assert.equal(caption.hidden,false);
 assert.equal(author.textContent,'Da te');
 assert.equal(date.textContent,'08 ott 2026');
 assert.equal(await api.select(card,2,1),true);
 assert.equal(caption.hidden,true,'empty caption does not render dummy text');
 assert.equal(author.textContent,'Dalla tua persona');
 assert.equal(await api.select(card,3,1),true);
 assert.equal(stage.children[1].src,'https://cdn.test/thumbnail');
 assert.equal(caption.textContent,'Il nostro viaggio');
 assert.equal(requests.length,2,'signed on-demand, not all images');
});
test('vertical touch preserves page scroll; horizontal touch switches slide and prevents opening modal',async()=>{
 const {api}=boot(),{card}=scene();api.decorate(card,extras);
 const stage=card.children[0];
 let stopped=false,cancelled=false;
 stage.dispatch('touchstart',{touches:[{clientX:190,clientY:150}]});
 stage.dispatch('touchend',{changedTouches:[{clientX:183,clientY:215}],cancelable:true,preventDefault(){cancelled=true;},stopPropagation(){stopped=true;}});
 assert.equal(cancelled,false);assert.equal(stopped,false);
 stage.dispatch('touchstart',{touches:[{clientX:190,clientY:150}]});
 stage.dispatch('touchend',{changedTouches:[{clientX:110,clientY:154}],cancelable:true,preventDefault(){cancelled=true;},stopPropagation(){stopped=true;}});
 await new Promise(r=>setImmediate(r));
 assert.equal(cancelled,true);assert.equal(stopped,true);
 assert.equal(api.shouldSuppressOpen(stage.children[1]),true);
 assert.equal(stage.children[2].textContent,'2 / 3');
});
test('deleting last additional photo restores original image and caption, without album-only controls',()=>{
 const {api}=boot(),{card,caption,img}=scene();
 api.decorate(card,extras);api.decorate(card,[]);
 assert.equal(card.children[0],img);
 assert.equal(img.src,'https://cdn.test/thumbnail');
 assert.equal(caption.textContent,'Il nostro viaggio');
 assert.equal(card.children.some(n=>n.classList.contains('ricordi-inline-stage')),false);
});
test('release packages main feed files, not only the fullscreen Album file',()=>{
 const js=read('moments-albums.js'),css=read('ricordi-inline-carousel.css'),html=read('index.html');
 assert.match(js,/window\.UsRicordiInline\?\.decorate\?\.\(card,secondaryRows\)/);
 assert.match(js,/select\('id,moment_id,created_by,storage_path,caption,position,created_at'\)/);
 assert.match(js,/data-ricordi-inline-step/);
 assert.match(js,/La vostra storia, foto dopo foto/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(css,/\.ricordi-inline-stage/);
 const version=JSON.parse(read('version.json')).version;
 assert.ok(html.includes('ricordi-inline-carousel.css?v='+version));
 assert.ok(html.includes('ricordi-inline-carousel.js?v='+version));
 assert.ok(html.includes('name="us-build" content="'+version+'"'));
 assert.ok(read('service-worker.js').includes('const BUILD_ID = "'+version+'";'));
 for(const p of ['scripts/build-cloudflare-pages.mjs','scripts/build-capacitor-web.mjs'])
   for(const asset of ['ricordi-inline-carousel.js','ricordi-inline-carousel.css'])
     assert.ok(read(p).includes("'"+asset+"'"));
});
