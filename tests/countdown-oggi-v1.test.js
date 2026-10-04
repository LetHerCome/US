const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = path.join(__dirname, '..', 'countdown.js');
const api = fs.existsSync(source) ? require(source) : {};

test('calendar countdown uses Rome civil days across DST, not rounded 24h intervals', () => {
  assert.equal(typeof api.display, 'function', 'countdown domain must exist');
  assert.deepEqual(api.display({mode:'days',target:'2026-03-30'},new Date('2026-03-28T23:30:00Z')), {value:'1',unit:'giorno',label:''});
  assert.equal(api.display({mode:'days',target:'2026-10-05'},new Date('2026-10-03T22:15:00Z')).value,'1');
});
test('live countdown respects absolute instant, clamps expiry, exposes days separately', () => {
  assert.equal(typeof api.display, 'function');
  const now=new Date('2026-10-04T10:00:00Z');
  assert.deepEqual(api.display({mode:'clock',target:'2026-10-04T18:42:17Z'},now),{value:'08:42:17',unit:'',label:''});
  assert.deepEqual(api.display({mode:'clock',target:'2026-10-06T18:42:17Z'},now),{value:'2',unit:'giorni',label:'08:42:17'});
  assert.deepEqual(api.display({mode:'clock',target:'2026-10-03T18:42:17Z'},now),{value:'00:00:00',unit:'',label:'Ci siamo'});
});
test('relationship days derive only from started_on and never invent a missing/future date', () => {
  assert.equal(typeof api.relationship, 'function');
  assert.equal(api.relationship(null,new Date('2026-10-04T10:00:00Z')),null);
  assert.equal(api.relationship('2026-10-05',new Date('2026-10-04T10:00:00Z')),null);
  assert.equal(api.relationship('2026-10-01',new Date('2026-10-04T10:00:00Z')).value,'3');
});
test('premium styles depend on actual existing unlocked rewards, not claimed XP/level', () => {
  assert.equal(typeof api.available, 'function');
  assert.equal(api.available('aurora',{level:99,rewards:[]}),false);
  assert.equal(api.available('aurora',{rewards:[{id:'frame_aurora',unlocked:true}]}),true);
  assert.equal(api.available('orbit',{rewards:[{id:'ring_orbit',unlocked:false}]}),false);
  assert.equal(api.available('glass',null),true);
  assert.equal(api.available('invented',null),false);
});
test('missing or invalid targets never masquerade as an expired live countdown',()=>{
  for(const target of [null,undefined,'','not-a-date'])assert.equal(api.display({mode:'clock',target}),null);
  assert.equal(api.display({mode:'days',target:'2026-02-30'}),null);
});
