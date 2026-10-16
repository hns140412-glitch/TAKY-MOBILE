'use strict';
const assert=require('node:assert/strict');
const T=require('../../TAKY/LEARNING/transport/authenticated-evidence-transport.js');
const records=new Map(); let writes=0;
const store={async getWithMetadata(k){return records.has(k)?{data:records.get(k),etag:'e1'}:null},async setJSON(k,v){records.set(k,v);writes++;return {modified:true,etag:'e1'}}};
const families={heewon:{id:'FAMILY_HEEWON',members:[['DAD','아빠','parent'],['MOM','엄마','parent'],['HEEWON','희원','girl_grade5'],['JIWON','지원','boy_age6']]},irae:{id:'FAMILY_IRAE',members:[['IRAE','이래','girl_grade4']]}};
const make=(family,member,app,event)=>({packet_id:`${app}:${family}:${event}`,source_app:app,context:{family_id:family,member_id:member,subject:'영어',concept_skill_target:'vocabulary'},event:{source:app,event_id:event,occurred_at:'2026-10-12T09:00:00.000Z',event_type:'RETRIEVAL_RESULT',payload:{member_id:member,subject:'영어',concept_skill_target:'vocabulary',instrument_version:'HIDE_CODE_RED_V1',verification_candidate:{verifier_type:'RETRIEVAL_EXACT_MATCH',verifier_version:'HIDE_CODE_RED_V1',basis:'DETERMINISTIC_LOCAL_MATCH',outcome:1,reference_id:'word:sample'}}}});
const auth=(f,ids)=>({authenticated:true,family_id:f,authorized_member_ids:ids});
(async()=>{
 const h=families.heewon.id,i=families.irae.id;
 const scenarios=[
  [make(h,'HEEWON','hide-seek','heewon-vocab'),auth(h,['HEEWON']),true,'희원 정상'],
  [make(h,'JIWON','hide-seek','jiwon-vocab'),auth(h,['JIWON']),true,'지원 정상'],
  [make(i,'IRAE','hide-seek','irae-vocab'),auth(i,['IRAE']),true,'이래 정상'],
  [make(i,'IRAE','hide-seek','irae-cross'),auth(h,['HEEWON','JIWON']),false,'희원네가 이래 기록 쓰기 거부'],
  [make(h,'HEEWON','hide-seek','heewon-cross'),auth(i,['IRAE']),false,'이래네가 희원 기록 쓰기 거부'],
  [make(h,'JIWON','hide-seek','jiwon-sibling'),auth(h,['HEEWON']),false,'같은 가족의 형제 기록 무단 쓰기 거부'],
 ];
 for(const [packet,scope,expected,label] of scenarios){const r=await T.ingestAuthenticated(store,packet,scope);assert.equal(r.ok,expected,`${label}: ${JSON.stringify(r)}`);console.log(`${r.ok?'ACCEPT':'DENY'} ${label}`)}
 assert.equal(writes,3);assert.equal(families.heewon.members.length,4);assert.equal(families.irae.members.length,1);
 console.log(JSON.stringify({pass:true,scenarios:scenarios.length,accepted:3,denied:3,storedWrites:writes,families},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
