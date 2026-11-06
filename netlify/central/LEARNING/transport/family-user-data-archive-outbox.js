'use strict';
// Durable, per-record versioned work item in the existing strong store.
// No Drive access or credentials here; the private archive worker consumes it.
const crypto=require('node:crypto');
const UserData=require('./family-user-data-store.js');
const VERSION='TAKY_FAMILY_USER_DATA_ARCHIVE_OUTBOX_V1';
const sha=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
function keyFor(record){
 const source=UserData.keyFor(record,record.record_type,record.record_id);
 return source?source+'/archive-outbox-v1':null;
}
async function queue(store,record,sourceEtag,{maxAttempts=4}={}){
 const key=keyFor(record);
 if(!key||!sourceEtag)return{ok:false,reason:'ARCHIVE_SOURCE_REQUIRED'};
 for(let i=0;i<maxAttempts;i++){
  const current=await store.getWithMetadata(key,{type:'json',consistency:'strong'});
  if(current?.data?.source_etag===sourceEtag)return{ok:true,queued:true,unchanged:true,key};
  const doc={
   contract:VERSION,family_id:record.family_id,member_id:record.member_id,
   record_type:record.record_type,record_id:record.record_id,
   source_etag:sourceEtag,
   source_checkpoint_sha256:sha('committed-etag:'+sourceEtag),
   state:'PENDING_VERIFIED_ARCHIVE',updated_at:new Date().toISOString(),
   last_receipt:null
  };
  const write=await store.setJSON(key,doc,current?{onlyIfMatch:current.etag}:{onlyIfNew:true});
  if(write?.modified===true)return{ok:true,queued:true,key,etag:write.etag};
  if(write?.modified!==false)return{ok:false,reason:'ARCHIVE_OUTBOX_WRITE_UNCONFIRMED'};
 }
 return{ok:false,reason:'ARCHIVE_OUTBOX_CONCURRENCY_RETRY_EXHAUSTED'};
}
async function read(store,record){const k=keyFor(record);return k?store.getWithMetadata(k,{type:'json',consistency:'strong'}):null;}
async function markPublished(store,record,sourceEtag,receipt){
 const current=await read(store,record);
 if(!current||current.data.source_etag!==sourceEtag)
   return{ok:false,reason:'ARCHIVE_VERSION_SUPERSEDED'};
 const updated={...current.data,state:'ARCHIVED_VERIFIED',last_receipt:receipt,updated_at:new Date().toISOString()};
 const write=await store.setJSON(keyFor(record),updated,{onlyIfMatch:current.etag});
 return write?.modified===true?{ok:true,receipt}:{ok:false,reason:'ARCHIVE_OUTBOX_CONCURRENT_MODIFICATION'};
}
module.exports=Object.freeze({VERSION,keyFor,queue,read,markPublished});
