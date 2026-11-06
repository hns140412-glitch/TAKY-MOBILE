'use strict';

const Identity=require('./family-member-identity-resolver.js');
const UserData=require('./family-user-data-store.js');
const LearningContext=require('./member-learning-context-store.js');
const ArchiveOutbox=require('./family-user-data-archive-outbox.js');

const VERSION='TAKY_FAMILY_USER_DATA_HTTP_V1';
const ENDPOINT='/api/family/user-data';
const MAX_BODY_BYTES=262144;
const clean=v=>String(v??'').trim();
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const header=(headers,name)=>{
  if(!object(headers))return '';
  const key=Object.keys(headers).find(k=>k.toLowerCase()===name.toLowerCase());
  return key?String(headers[key]??''):'';
};
const headers=Object.freeze({
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store, max-age=0',
  Pragma:'no-cache','X-Content-Type-Options':'nosniff'
});
const response=(status,body)=>({status,headers:{...headers},body:JSON.stringify({...body,endpoint_version:VERSION})});
const bad=(status,reason,extra={})=>response(status,{ok:false,reason,...extra});

function create({verifyBearerToken,store,maxBodyBytes=MAX_BODY_BYTES}={}){
  if(typeof verifyBearerToken!=='function')throw Error('TRUSTED_BEARER_IDENTITY_VERIFIER_REQUIRED');
  if(!store||typeof store.getWithMetadata!=='function'||typeof store.setJSON!=='function')
    throw Error('DURABLE_CONDITIONAL_STORE_REQUIRED');
  return Object.freeze({
    version:VERSION,
    async handle(request={}){
      if(request.path!==ENDPOINT)return bad(404,'USER_DATA_ENDPOINT_NOT_FOUND');
      if(!['POST','GET'].includes(request.method))return bad(405,'GET_OR_POST_REQUIRED');
      const auth=header(request.headers,'authorization');
      const token=auth.match(/^Bearer ([A-Za-z0-9._~+/-]{16,4096}=*)$/);
      if(!token)return bad(401,'VERIFIED_BEARER_REQUIRED');
      let principal; try{principal=await verifyBearerToken(token[1])}catch{return bad(401,'BEARER_IDENTITY_VERIFICATION_FAILED')}

      if(request.method==='GET'){
        const q=request.query||{};
        const resolved=Identity.resolve(principal,{requested_family_id:clean(q.family_id)});
        if(!resolved.ok)return bad(403,'VERIFIED_FAMILY_MEMBERSHIP_REQUIRED');
        const out=await UserData.read(store,q,resolved.identity);
        if(!out.ok)return bad(out.reason==='USER_DATA_RECORD_NOT_FOUND'?404:403,out.reason,{issues:out.issues});
        return response(200,{ok:true,record:out.record,etag:out.etag});
      }

      if(!/^application\/json(?:\s*;|\s*$)/i.test(header(request.headers,'content-type')))
        return bad(415,'JSON_CONTENT_TYPE_REQUIRED');
      if(typeof request.body!=='string'||Buffer.byteLength(request.body,'utf8')>maxBodyBytes)
        return bad(413,'BOUNDED_JSON_BODY_REQUIRED');
      let body; try{body=JSON.parse(request.body)}catch{return bad(400,'VALID_JSON_BODY_REQUIRED')}
      if(!object(body.record))return bad(400,'USER_DATA_RECORD_REQUIRED');
      const resolved=Identity.resolve(principal,{requested_family_id:clean(body.record.family_id)});
      if(!resolved.ok)return bad(403,'VERIFIED_FAMILY_MEMBERSHIP_REQUIRED');
      const committed=await UserData.commit(store,body.record,resolved.identity,{expected_etag:body.expected_etag});
      if(!committed.ok){
        const status=committed.conflict?409:committed.reason==='USER_DATA_NOT_AUTHORIZED'?403:
          committed.retryable?503:422;
        return bad(status,committed.reason,{issues:committed.issues});
      }
      // Commit to the existing central store first. The private SIEZEALL Drive
      // archive is an independently retryable durable outbox, never an implicit
      // direct client write or a reason to discard confirmed learner work.
      let archive;
      try{archive=await ArchiveOutbox.queue(store,committed.record,committed.etag)}
      catch{archive={ok:false,reason:'ARCHIVE_OUTBOX_TEMPORARILY_UNAVAILABLE'}}
      if(!archive.ok)return response(202,{
        ok:true,record_id:committed.record.record_id,record_type:committed.record.record_type,
        storage_confirmed:true,etag:committed.etag,backup_status:'PENDING_VERIFIED_ARCHIVE',
        backup_outbox_retry_required:true,archive_issue:archive.reason
      });
      let learning={ok:true,queued:false,reason:'RECORD_NOT_READY_FOR_LEARNING_REVIEW'};
      // Planner snapshots are state projections, not verified learning evidence.
      if(['CONFIRMED','COMPLETED'].includes(committed.record.status)&&
          !['PLANNER_SNAPSHOT','SCHEDULE_SNAPSHOT','MATERIAL_REFERENCE'].includes(committed.record.record_type)){
        try{learning=await LearningContext.queue(store,committed.record,committed.etag)}
        catch{learning={ok:false,reason:'LEARNING_CONTEXT_QUEUE_TEMPORARILY_UNAVAILABLE'}}
        if(!learning.ok)return response(202,{
          ok:true,record_id:committed.record.record_id,record_type:committed.record.record_type,
          record_status:committed.record.status,storage_confirmed:true,etag:committed.etag,
          learning_context_queued:false,learning_context_retry_required:true,
          backup_status:'PENDING_VERIFIED_ARCHIVE'
        });
      }
      return response(200,{
        ok:true,record_id:committed.record.record_id,record_type:committed.record.record_type,
        record_status:committed.record.status,storage_confirmed:true,etag:committed.etag,
        learning_context_queued:learning.queued===true,
        learning_review_status:committed.record.learning_review_status,
        backup_status:committed.record.backup_status,
        backup_outbox_queued:true,
        drive_is_runtime_authority:false
      });
    }
  });
}
module.exports=Object.freeze({VERSION,ENDPOINT,MAX_BODY_BYTES,create});
