// Disposable native PostgreSQL, full current migrations, no remote connection.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync,spawn}=require('node:child_process');
const h=require('./mc2-db');
const bin=[18,17,16,15].map(v=>`/usr/lib/postgresql/${v}/bin`).find(d=>fs.existsSync(path.join(d,'postgres')));
const CAN_RUN=Boolean(bin && process.getuid?.()===0 && fs.existsSync('/usr/sbin/runuser'));
const SKIP=CAN_RUN?false:'MC2 real PostgreSQL requires Linux root, postgres OS user and server binaries; run in WSL/Linux with MC2_RACE_REQUIRED=1';
function startServer(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'us-mc2-pg-'));fs.chmodSync(dir,0o755);
  const data=path.join(dir,'data'),sock=path.join(dir,'sock');
  const asPg=(cmd,args)=>execFileSync('runuser',['-u','postgres','--',path.join(bin,cmd),...args],{stdio:'pipe'});
  execFileSync('install',['-d','-o','postgres','-g','postgres',data,sock]);
  const env={...process.env,PGHOST:sock,PGPORT:'55439',PGUSER:'postgres',PGDATABASE:'postgres'};
  const args=['-X','-q','-At','-v','ON_ERROR_STOP=1'];
  const sql=text=>{
    // Large baseline files can close psql's stdin on the first SQL error,
    // masking stderr with EPIPE. A local file preserves the actual diagnostic.
    const file=path.join(dir,'statement.sql');fs.writeFileSync(file,text);
    try{return execFileSync(path.join(bin,'psql'),[...args,'-f',file],{env,stdio:'pipe',maxBuffer:4*1024*1024}).toString().trim();}
    catch(error){error.message+=`\n${error.stderr?.toString()||''}`;throw error;}
  };
  const stop=()=>{try{asPg('pg_ctl',['-D',data,'-m','immediate','stop']);}finally{if(!dir.startsWith(path.join(os.tmpdir(),'us-mc2-pg-')))throw Error('unexpected cleanup path');fs.rmSync(dir,{recursive:true,force:true});}};
  try{
    asPg('initdb',['-D',data,'-A','trust','-U','postgres']);
    asPg('pg_ctl',['-D',data,'-o',`-c listen_addresses= -c unix_socket_directories=${sock} -p 55439`,'-w','-l',path.join(data,'log'),'start']);
    sql(fs.readFileSync(path.join(h.ROOT,'supabase/baseline/platform/pglite-platform.sql'),'utf8'));
    sql(h.PLATFORM);
    for(const f of fs.readdirSync(h.DIR).filter(f=>f.endsWith('.sql')).sort()){
      try{sql(fs.readFileSync(path.join(h.DIR,f),'utf8'));}catch(error){error.message=`${f}: ${error.message}`;throw error;}
    }
  }catch(e){stop();throw e;}
  const session=()=>{
    const p=spawn(path.join(bin,'psql'),['-X','-q','-At','-v','ON_ERROR_STOP=0'],{env});let out='',err='';
    p.stdout.on('data',d=>{out+=d;});p.stderr.on('data',d=>{err+=d;});const closed=new Promise(r=>p.on('close',r));
    p.stdin.write("\\set VERBOSITY verbose\nset statement_timeout='10s'; set lock_timeout='8s';\n");
    let ended=false;
    return{send:text=>{if(!ended)p.stdin.write(text+'\n');},peek:()=>({out,err}),end:async()=>{if(!ended){ended=true;p.stdin.end();}const timer=setTimeout(()=>p.kill('SIGKILL'),15000);await closed;clearTimeout(timer);return{out,err};}};
  };
  const lockWaiters=()=>Number(sql("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'"));
  const reset=()=>{sql('delete from auth.users; delete from public.couples;');
    sql(h.SEED.replace('code_hash,used_by,used_at)','code_hash,used_by,used_at,expires_at)')
      .replace(`'${h.F}',now())`,`'${h.F}',now(),now())`).replace(`'${h.B}',now())`,`'${h.B}',now(),now())`));};
  return{sql,session,stop,lockWaiters,reset};
}
const asUser=u=>`set local role authenticated; select set_config('request.jwt.claim.sub','${u}',true);`;
async function waitFor(fn,label){const until=Date.now()+7000;while(Date.now()<until){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error(`timeout: ${label}`);}
module.exports={CAN_RUN,SKIP,startServer,asUser,waitFor};
