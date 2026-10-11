'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {previewPreservationA, ACTION}=require('../s3-2-preservation-a-preview.cjs');

const actor='e8c90d50-81e9-4a0d-beeb-5886c63c4963';
const partner='01d5fe3d-1e8e-4872-b453-01918de88893';
const couple='46155127-5742-42d0-8195-5f6d0992ae7b';
const otherCouple='7e4ff7be-f3f3-44aa-ac8d-b587375e81a4';
const id=i=>'fa4af5'+String(i).padStart(2,'0')+'-d090-49a7-b5cc-3ef1016e1971';
const base={actorId:actor,partnerId:partner,coupleId:couple,memberIds:[actor,partner]};
const item=(i,kind,subjectId,rest={})=>({id:id(i),coupleId:couple,kind,subjectId,...rest});

test('policy A previews personal deletion but never deletes partner data or space',()=>{
 const r=previewPreservationA({...base,items:[
   item(1,'actor-personal',actor),
   item(2,'partner-personal',partner),
   item(3,'actor-device',actor)
 ]});
 assert.equal(r.productDecision,'A');
 assert.equal(r.status,'NON_EXECUTABLE_REVIEW_REQUIRED');
 assert.equal(r.executable,false);
 assert.deepEqual(r.items.map(x=>x.proposedAction),[
   ACTION.ERASE_ACTOR_PERSONAL,ACTION.PRESERVE_PARTNER_PERSONAL,ACTION.RETIRE_DEVICE
 ]);
 assert.equal(JSON.stringify(r).includes('CASCADE'),false);
});

test('eligible shared content requires rights review; sensitive/disputed items stay blocked',()=>{
 const r=previewPreservationA({...base,items:[
   item(4,'shared',null,{rightsReviewed:true,sensitive:false}),
   item(5,'shared',null,{rightsReviewed:false,sensitive:false}),
   item(6,'shared',null,{rightsReviewed:true,sensitive:true})
 ]});
 assert.deepEqual(r.items.map(x=>x.proposedAction),[
   ACTION.SHARED_ELIGIBLE,ACTION.SHARED_SENSITIVE,ACTION.SHARED_SENSITIVE
 ]);
 assert.equal(r.executable,false);
});

test('no foreign tenant, forged owner, missing consent flags, invalid or duplicate IDs',()=>{
 const examples=[
  {...base,items:[{...item(1,'shared',null,{rightsReviewed:true,sensitive:false}),coupleId:otherCouple}]},
  {...base,items:[item(1,'partner-personal',actor)]},
  {...base,items:[item(1,'actor-personal',partner)]},
  {...base,items:[item(1,'shared',null,{rightsReviewed:true})]},
  {...base,items:[item(1,'shared',null,{rightsReviewed:true,sensitive:'false'})]},
  {...base,items:[item(1,'shared',actor,{rightsReviewed:true,sensitive:false})]},
  {...base,items:[item(1,'actor-personal',actor),item(1,'actor-personal',actor)]},
  {...base,items:[item(1,'other',actor)]},
  {...base,memberIds:[actor,actor],items:[]},
  {...base,partnerId:actor,items:[]},
  {...base,memberIds:[actor],items:[]},
  {...base,coupleId:otherCouple,items:[item(1,'actor-device',actor)]},
 ];
 for(let i=0;i<examples.length;i++){
   const result=previewPreservationA(examples[i]);
   assert.equal(result.status,'INVALID_OR_UNAUTHORIZED_PREVIEW','case '+i);
   assert.equal(result.items.length,0,'case '+i);
   assert.equal(result.executable,false);
 }
});

test('planner has no IO/runtime authority and reports only IDs and review decisions',()=>{
 const r=previewPreservationA({...base,items:[
   {...item(11,'actor-personal',actor),data:'PRIVATE BODY',token:'DO NOT LOG',email:'not-for-export@example.invalid'}
 ]});
 assert.equal(r.items.length,1);
 assert.deepEqual(Object.keys(r.items[0]),['id','proposedAction']);
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE BODY|DO NOT LOG|not-for-export/);
 assert.throws(()=>{r.items[0].proposedAction='EXECUTE';},TypeError);
});

test('large input and hostile shapes are rejected, not partially accepted',()=>{
 const inputs=[null,{}, {actorId:'invalid'}, {...base,items:null},
 {...base,items:Array.from({length:501},(_,i)=>item(i%50+1,'actor-personal',actor))}];
 for(const x of inputs){
   const r=previewPreservationA(x);
   assert.equal(r.executable,false);
   assert.equal(r.items.length,0);
 }
});
