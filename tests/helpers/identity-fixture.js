// Supply the actual D5 resolver to tests executing isolated runtime blocks.
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../../app.js'),'utf8');
const start=app.indexOf('function resolveUsIdentity(');
const resolve=vm.runInNewContext(`(${app.slice(start,app.indexOf('\nfunction usIdentity()',start))})`);
function install(context, supplied){
  const w=context.window;
  w.addEventListener ||= ()=>{};
  const role=w.usProfile?.role||'francesco';
  const profiles=supplied||[{id:'f',role:'francesco',display_name:'Francesco'},{id:'b',role:'beatrice',display_name:'Beatrice'}];
  if(!supplied&&w.usProfile?.id)profiles.find(p=>p.role===role).id=w.usProfile.id;
  const coupleId=w.usProfile?.couple_id||'fixture';
  const viewerId=w.usProfile?.id||profiles.find(p=>p.role===role)?.id;
  const current=()=>resolve({viewerId:w.usProfile?.id||viewerId,coupleId:w.usProfile?.couple_id||coupleId,profiles:profiles.map(p=>({...p,id:!supplied?(p.role===(w.usProfile?.role||role)?(w.usProfile?.id||p.id):`partner-${p.role}`):p.id,couple_id:w.usProfile?.couple_id||coupleId}))});
  w.UsIdentity={current};context.usIdentity=current;
  return context;
}
module.exports={install};
