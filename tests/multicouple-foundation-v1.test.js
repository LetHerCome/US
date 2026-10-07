const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(ROOT,file),'utf8');

test('multi-couple V1: couple_id is the runtime tenant selector',()=>{
  const app=read('app.js');
  assert.match(app,/const usCoupleContextState=/);
  assert.match(app,/const coupleId=profile\?\.couple_id/);
  assert.match(app,/sb\.from\('couples'\)\.select\('id,name,started_on'\)\.eq\('id',coupleId\)\.maybeSingle\(\)/);
  assert.match(app,/sb\.from\('profiles'\)\.select\('id,display_name,role,couple_id'\)\.eq\('couple_id',coupleId\)/);
  assert.match(app,/row\.couple_id===coupleId/);
});

test('multi-couple V1: relationship age is data-driven, never private-couple hardcoded',()=>{
  const app=read('app.js');
  assert.doesNotMatch(app,/new Date\(['"]2026-04-21/);
  assert.doesNotMatch(app,/2026-04-21T00:00:00/);
  assert.match(app,/updateTogetherDays\(usCoupleContextState\.couple\?\.started_on\)/);
  assert.match(app,/Date\.UTC\(year,month-1,day\)/);
});

test('multi-couple V1: auth loss clears tenant context and successful boot hydrates it',()=>{
  const app=read('app.js');
  assert.match(app,/window\.UsCoupleContext\?\.clear\?\.\(\)/);
  assert.match(app,/setCloudBadge\(true, profile\.display_name\);\s*hydrateUsCoupleContext\(\)\.catch/);
  assert.match(app,/window\.UsCoupleContext=Object\.freeze/);
});

test('multi-couple V1: schema keeps one auth user -> one profile -> one active couple for now',()=>{
  const tables=read('supabase/baseline/20_tables.sql');
  const constraints=read('supabase/baseline/40_constraints.sql');
  assert.match(tables,/create table public\.profiles[\s\S]*?id uuid not null,[\s\S]*?couple_id uuid/);
  assert.match(constraints,/profiles_id_fkey FOREIGN KEY \(id\) REFERENCES auth\.users\(id\)/);
  assert.match(constraints,/profiles_couple_id_fkey FOREIGN KEY \(couple_id\) REFERENCES couples\(id\)/);
  assert.doesNotMatch(tables,/create table public\.couple_members\b/);
});
