'use strict';

const VERSION='TAKY_MEMBER_LEARNING_CONTEXT_STORE_V1';
const clean=v=>String(v??'').trim();

function keyFor(familyId,memberId){
  if(!clean(familyId)||!clean(memberId))return null;
  return 'families/'+encodeURIComponent(familyId)+'/members/'+encodeURIComponent(memberId)+'/learning-engine/user-context-v1';
}
async function queue(store,record={},sourceEtag,options={}){
  if(!['CONFIRMED','COMPLETED'].includes(record.status))
    return {ok:true,queued:false,reason:'RECORD_NOT_READY_FOR_LEARNING_REVIEW'};
  const key=keyFor(record.family_id,record.member_id);
  if(!key||!clean(record.record_id)||!clean(sourceEtag))return {ok:false,reason:'LEARNING_CONTEXT_SOURCE_REQUIRED'};
  const max=Math.max(1,Number(options.max_attempts)||4);
  for(let attempt=1;attempt<=max;attempt++){
    const cur=await store.getWithMetadata(key,{type:'json',consistency:'strong'});
    const state=cur?.data&&typeof cur.data==='object'?JSON.parse(JSON.stringify(cur.data)):{
      schema:'TAKY_MEMBER_LEARNING_CONTEXT_V1',
      family_id:record.family_id,member_id:record.member_id,records:{},updated_at:null
    };
    if(state.family_id!==record.family_id||state.member_id!==record.member_id)
      return {ok:false,reason:'LEARNING_CONTEXT_SCOPE_CORRUPT'};
    state.records[record.record_id]={
      record_id:record.record_id,
      record_type:record.record_type,
      status:record.status,
      source_app:record.source_app,
      subject:clean(record.payload?.subject)||null,
      task_id:clean(record.payload?.task_id)||null,
      due_at:record.due_at||null,
      source_etag:sourceEtag,
      review_status:'PENDING',
      updated_at:record.updated_at
    };
    state.updated_at=record.updated_at;
    const write=await store.setJSON(key,state,cur?{onlyIfMatch:cur.etag}:{onlyIfNew:true});
    if(write?.modified===true&&clean(write.etag))
      return {ok:true,queued:true,key,etag:write.etag,attempt,context:state.records[record.record_id]};
    if(write?.modified!==false)return {ok:false,reason:'LEARNING_CONTEXT_WRITE_UNCONFIRMED',retryable:true};
  }
  return {ok:false,reason:'LEARNING_CONTEXT_CONFLICT_RETRY_EXHAUSTED',retryable:true};
}
async function read(store,familyId,memberId){
  const key=keyFor(familyId,memberId); if(!key)return null;
  return store.getWithMetadata(key,{type:'json',consistency:'strong'});
}
module.exports=Object.freeze({VERSION,keyFor,queue,read});
