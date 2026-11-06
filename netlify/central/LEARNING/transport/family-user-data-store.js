'use strict';

const VERSION='TAKY_FAMILY_USER_DATA_STORE_V1';
const TYPES=new Set([
  'ASSIGNMENT','LEARNING_ARTIFACT','SELF_REPORT','HELP_EVENT','CHECK_EVENT',
  'CURIOSITY_RECORD','SUBJECT_OBSERVATION','PLANNER_SNAPSHOT','SCHEDULE_SNAPSHOT','EXECUTION_EVENT','MATERIAL_REFERENCE'
]);
const STATUSES=new Set(['DRAFT','CONFIRMED','COMPLETED','ARCHIVED']);
const ID=/^[A-Za-z0-9._:-]{1,128}$/;
const clean=v=>String(v??'').trim();
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const iso=v=>{
  const s=clean(v); if(!s)return null;
  const t=Date.parse(s); return Number.isFinite(t)?new Date(t).toISOString():null;
};

function scopeFrom(record={}){
  return {family_id:clean(record.family_id),member_id:clean(record.member_id)};
}
function authorizeScope(identity={},scope={}){
  const issues=[];
  if(identity.authenticated!==true)issues.push('AUTHENTICATION_REQUIRED');
  if(!clean(scope.family_id))issues.push('FAMILY_ID_REQUIRED');
  if(!clean(scope.member_id))issues.push('MEMBER_ID_REQUIRED');
  if(clean(identity.family_id)!==clean(scope.family_id))issues.push('FAMILY_SCOPE_MISMATCH');
  const members=new Set(Array.isArray(identity.authorized_member_ids)
    ? identity.authorized_member_ids.map(clean).filter(Boolean):[]);
  if(scope.member_id&&!members.has(scope.member_id))issues.push('MEMBER_SCOPE_NOT_AUTHORIZED');
  return {ok:issues.length===0,issues};
}
function keyFor(scope={},type,recordId){
  if(!clean(scope.family_id)||!clean(scope.member_id)||!TYPES.has(type)||!ID.test(clean(recordId)))return null;
  return 'families/'+encodeURIComponent(scope.family_id)+'/members/'+encodeURIComponent(scope.member_id)+
    '/user-data/'+type.toLowerCase()+'/'+encodeURIComponent(recordId);
}
function normalize(record={},previous=null,now=new Date().toISOString()){
  const scope=scopeFrom(record);
  const type=clean(record.record_type).toUpperCase();
  const recordId=clean(record.record_id);
  const status=clean(record.status||'DRAFT').toUpperCase();
  const issues=[];
  if(!scope.family_id)issues.push('FAMILY_ID_REQUIRED');
  if(!scope.member_id)issues.push('MEMBER_ID_REQUIRED');
  if(!TYPES.has(type))issues.push('RECORD_TYPE_NOT_ALLOWED');
  if(!ID.test(recordId))issues.push('RECORD_ID_INVALID');
  if(!STATUSES.has(status))issues.push('RECORD_STATUS_INVALID');
  if(!object(record.payload))issues.push('RECORD_PAYLOAD_REQUIRED');
  const occurredAt=iso(record.occurred_at||record.recorded_at||now);
  if(!occurredAt)issues.push('RECORDED_AT_INVALID');
  const dueAt=record.due_at==null?null:iso(record.due_at);
  if(record.due_at!=null&&!dueAt)issues.push('DUE_AT_INVALID');
  if(type==='ASSIGNMENT'&&status!=='DRAFT'&&!clean(record.payload?.title))
    issues.push('CONFIRMED_ASSIGNMENT_TITLE_REQUIRED');
  if(type==='PLANNER_SNAPSHOT'&&(!object(record.payload?.planner)||!object(record.payload?.foundation)))
    issues.push('PLANNER_SNAPSHOT_SHAPE_INVALID');
  if(previous){
    if(previous.family_id!==scope.family_id||previous.member_id!==scope.member_id||
       previous.record_type!==type||previous.record_id!==recordId)
      issues.push('IMMUTABLE_RECORD_IDENTITY_MISMATCH');
    if(previous.status==='ARCHIVED'&&status!=='ARCHIVED')issues.push('ARCHIVED_RECORD_IMMUTABLE');
  }
  if(issues.length)return {ok:false,issues};
  const sourceApp=clean(record.source_app||previous?.source_app||'family-main');
  const out={
    schema:'TAKY_FAMILY_USER_DATA_RECORD_V1',
    family_id:scope.family_id,
    member_id:scope.member_id,
    record_type:type,
    record_id:recordId,
    source_app:sourceApp,
    status,
    payload:JSON.parse(JSON.stringify(record.payload)),
    recorded_at:occurredAt,
    due_at:dueAt,
    created_at:previous?.created_at||iso(record.created_at)||now,
    updated_at:now,
    learning_review_status:['PLANNER_SNAPSHOT','SCHEDULE_SNAPSHOT','MATERIAL_REFERENCE'].includes(type)
      ? 'NOT_APPLICABLE':(['CONFIRMED','COMPLETED'].includes(status)?'PENDING_LEARNING_REVIEW':'NOT_READY'),
    backup_status:'PENDING_VERIFIED_ARCHIVE'
  };
  return {ok:true,record:out};
}
async function read(store,{family_id,member_id,record_type,record_id}={},identity={}){
  const scope={family_id:clean(family_id),member_id:clean(member_id)};
  const auth=authorizeScope(identity,scope); if(!auth.ok)return {ok:false,reason:'USER_DATA_NOT_AUTHORIZED',issues:auth.issues};
  const type=clean(record_type).toUpperCase(),id=clean(record_id);
  const key=keyFor(scope,type,id); if(!key)return {ok:false,reason:'USER_DATA_KEY_INVALID'};
  const entry=await store.getWithMetadata(key,{type:'json',consistency:'strong'});
  if(!entry)return {ok:false,reason:'USER_DATA_RECORD_NOT_FOUND'};
  return {ok:true,record:entry.data,etag:entry.etag};
}
async function commit(store,input={},identity={},options={}){
  if(!store||typeof store.getWithMetadata!=='function'||typeof store.setJSON!=='function')
    return {ok:false,reason:'DURABLE_CONDITIONAL_STORE_REQUIRED'};
  const scope=scopeFrom(input);
  const auth=authorizeScope(identity,scope); if(!auth.ok)return {ok:false,reason:'USER_DATA_NOT_AUTHORIZED',issues:auth.issues};
  const type=clean(input.record_type).toUpperCase(),id=clean(input.record_id);
  const key=keyFor(scope,type,id); if(!key)return {ok:false,reason:'USER_DATA_KEY_INVALID'};
  const current=await store.getWithMetadata(key,{type:'json',consistency:'strong'});
  const expected=clean(options.expected_etag);
  if(current&&(!expected||expected!==current.etag))
    return {ok:false,reason:expected?'USER_DATA_ETAG_MISMATCH':'USER_DATA_EXPECTED_ETAG_REQUIRED',conflict:true};
  const normalized=normalize(input,current?.data||null,options.now||new Date().toISOString());
  if(!normalized.ok)return {ok:false,reason:'USER_DATA_RECORD_INVALID',issues:normalized.issues};
  const write=await store.setJSON(key,normalized.record,current?{onlyIfMatch:current.etag}:{onlyIfNew:true});
  // Conditional-write rejection with an observed ETag is a version conflict,
  // not a provider outage. Return 409 so clients do not retry stale edits blindly.
  if(write?.modified===false&&clean(write.etag))
    return {ok:false,reason:'USER_DATA_ETAG_MISMATCH',conflict:true};
  if(write?.modified!==true||!clean(write.etag))
    return {ok:false,reason:'USER_DATA_DURABLE_WRITE_UNCONFIRMED',retryable:true};
  return {ok:true,record:normalized.record,etag:write.etag,created:!current,key};
}

module.exports=Object.freeze({VERSION,TYPES,STATUSES,scopeFrom,authorizeScope,keyFor,normalize,read,commit});
