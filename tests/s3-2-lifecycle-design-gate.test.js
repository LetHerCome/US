const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname,'..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const spec = JSON.parse(read('docs/missions/us-store-s3-2-lifecycle-contract-20261012.json'));
const design = read('docs/missions/us-store-s3-2-lifecycle-risk-gates-20261012.md');

test('S3.2 begins blocked and never treats unlink as deletion',()=>{
  assert.equal(spec.status,'BLOCKED_POLICY_AND_SECURITY_REVIEW');
  assert.equal(spec.destructiveActionsEnabled,false);
  assert.equal(spec.automatedDeletionAllowed,false);
  assert.equal(spec.ownerChoice,null);
  for(const k of ['sharedContentAfterOneMemberLeaves','retention','physicalMediaDisposition']){
    assert.equal(spec.decisions[k],'REQUIRES_OWNER_APPROVAL');
  }
  assert.match(design,/Account deletion != unpair != device logout != couple deletion/);
  assert.match(design,/fail closed/i);
});

test('a naive delete cascades partner-shared content or fails on a blocking FK',()=>{
  assert.deepEqual(spec.foreignKeys['auth.users'],{cascade:7,setNull:2,noAction:0});
  assert.deepEqual(spec.foreignKeys['public.profiles'],{cascade:24,setNull:3,noAction:1});
  assert.deepEqual(spec.foreignKeys['public.couples'],{cascade:41,setNull:0,noAction:0});
  for(const term of ['profiles','shared_messages.sender_id','shared_messages.recipient_id']){
    assert.ok(spec.evidence.dangerousAccountCascade.includes(term));
  }
  for(const term of ['moments.created_by','calendar_entries.created_by','stories.author_id']){
    assert.ok(spec.evidence.dangerousProfileCascade.includes(term));
  }
  assert.match(spec.evidence.unhandledConstraint,/NO ACTION/);
  assert.match(design,/server-only/);
});

test('data inventory includes all personal, private-shared and transport domains',()=>{
  assert.equal(spec.domains.length,10);
  const domains = spec.domains.map(x=>x.name);
  for (const key of ['identity','membership-invites','private-media','messages','calendar',
    'daily-keepsakes','games-progression','devices-push-widgets','location','operational-logs']) {
    assert.ok(domains.includes(key),key);
  }
  assert.ok(spec.domains.every(x=>x.requiresReview));
  assert.equal(spec.evidence.storagePrivate,true);
  assert.equal(spec.evidence.storagePolicyCoupleScoped,true);
  assert.equal(spec.evidence.storageApiCleanupRequired,true);
  assert.equal(spec.evidence.localCacheCleanupRequired,true);
  assert.equal(spec.evidence.nativeTokenCleanupRequired,true);
});

test('no authorization bypass, service key or live account deletion is introduced',()=>{
  assert.equal(spec.auth.clientServiceRoleAllowed,false);
  assert.equal(spec.auth.serverOwnerCheckRequired,true);
  assert.equal(spec.auth.freshReauthenticationRequired,true);
  for(const key of ['P0-S3-FCM-isolation','shared-content-policy','privacy-data-retention-policy',
    'storage-byte-cleanup','real-cross-tenant-auth-and-media-test','account-deletion-test']){
    assert.ok(spec.releaseGates.includes(key),key);
  }
  // This draft is deliberately only design + tests; UI and Edge endpoints
  // cannot be enabled by merely changing a JSON field.
  const settings=read('settings.js');
  assert.match(settings,/Scollega questo telefono/);
  assert.doesNotMatch(settings,/deleteUser\(|deleteAccount\(/);
  assert.match(design,/No UI exposed, migrations, Edge deploy, account deletion/);
});

test('rollback/private safety: shared media cleanup is distinct from database row cascade',()=>{
  assert.match(design,/Storage API/);
  assert.match(design,/supabase Storage/i);
  assert.match(design,/SQL|PostgreSQL/);
  assert.match(design,/pending_cleanup/);
  assert.match(design,/revoke sessions/i);
  assert.match(design,/short-lived authenticated signed URLs/i);
});
