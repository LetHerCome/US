import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest=JSON.parse(fs.readFileSync(
 new URL('../docs/missions/us-store-s3-2-fk-coverage-20261012.json',import.meta.url),'utf8'));
const rows=manifest.allConstraints;
const byName=new Map(rows.map(r=>[r.constraint_name,r]));
const critical=[
 'profiles_id_fkey',
 'shared_messages_recipient_id_fkey','shared_messages_sender_id_fkey',
 'moments_created_by_fkey','moment_photos_created_by_fkey',
 'calendar_entries_created_by_fkey','calendar_entries_owner_id_fkey',
 'shared_event_completions_completed_by_fkey'
];

test('captured full live staging identity/couple foreign-key graph',()=>{
 assert.equal(manifest.version,1);
 assert.equal(manifest.readOnlyInspection,true);
 assert.equal(manifest.destructiveChangesAuthorized,false);
 assert.equal(rows.length,78);
 assert.equal(byName.size,78,'constraints must remain uniquely named');
 const counts={};
 for(const c of rows)counts[c.parent_table]=(counts[c.parent_table]??0)+1;
 assert.deepEqual(counts,manifest.expectedCounts);
 assert.deepEqual(counts,{'auth.users':9,profiles:28,couples:41});
});

test('all 78 constraints are fail-closed, not silently migrated',()=>{
 for(const fk of rows){
  assert.equal(fk.approvedResolution,null,fk.constraint_name);
  assert.equal(fk.implemented,false,fk.constraint_name);
  assert.equal(fk.testEvidence,null,fk.constraint_name);
  assert.match(fk.constraint_name,/^[a-z_][a-z0-9_]+$/);
  assert.match(fk.dependent_table,/^[a-z_][a-z0-9_]*$/);
  assert.ok(['CASCADE','SET NULL','NO ACTION','RESTRICT','SET DEFAULT'].includes(fk.delete_action));
  if(fk.parent_table==='couples')
   assert.equal(fk.securityGate,'BLOCK_UNILATERAL_COUPLE_DELETE',fk.constraint_name);
  else if(fk.delete_action==='CASCADE')
   assert.equal(fk.securityGate,'BLOCK_UNREVIEWED_USER_CASCADE',fk.constraint_name);
  else if(fk.delete_action==='NO ACTION')
   assert.equal(fk.securityGate,'BLOCK_FK_NO_ACTION',fk.constraint_name);
  else assert.equal(fk.securityGate,'REVIEW_PERSONAL_RETENTION',fk.constraint_name);
 }
});

test('most dangerous content-preservation FKs cannot pass without explicit migration',()=>{
 for(const name of critical){
  const fk=byName.get(name);
  assert.ok(fk,'missing FK '+name);
  assert.notEqual(fk.approvedResolution,'approved');
 }
 for(const key of ['shared_messages_sender_id_fkey','shared_messages_recipient_id_fkey',
   'moments_created_by_fkey','moment_photos_created_by_fkey','calendar_entries_created_by_fkey']){
  const fk=byName.get(key);
  assert.equal(fk.delete_action,'CASCADE');
  assert.equal(fk.required_column,true,'blind SET NULL illegal on '+key);
 }
 const blocked=byName.get('shared_event_completions_completed_by_fkey');
 assert.equal(blocked.delete_action,'NO ACTION');
 assert.equal(blocked.required_column,true);
});

test('individual deletion and whole-couple deletion cannot be conflated',()=>{
 const coupleFKs=rows.filter(x=>x.parent_table==='couples');
 assert.equal(coupleFKs.length,41);
 assert.ok(coupleFKs.every(x=>x.securityGate==='BLOCK_UNILATERAL_COUPLE_DELETE'));
 const actorFKs=rows.filter(x=>x.parent_table!=='couples');
 assert.equal(actorFKs.length,37);
 assert.ok(actorFKs.some(x=>x.delete_action==='SET NULL'));
 assert.ok(actorFKs.some(x=>x.delete_action==='NO ACTION'));
});

test('schema snapshot contains no individual user records or private content',()=>{
 const content=JSON.stringify(manifest);
 assert.doesNotMatch(content,/@|Bearer |sb_secret_|service_role|password_hash|refresh_token|access_token|\\/?home\\//i);
 assert.ok(rows.every(x=>!Object.keys(x).some(k=>/email|user_id|body|content|storage_path/i.test(k))));
});
