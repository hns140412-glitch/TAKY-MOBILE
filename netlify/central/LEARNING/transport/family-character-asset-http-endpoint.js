'use strict';
const Identity=require('./family-member-identity-resolver.js');
const Store=require('./private-character-object-store-adapter.js');
const VERSION='TAKY_FAMILY_CHARACTER_ASSET_HTTP_V1';
const ENDPOINT='/api/family/character-asset';
const MAX_BODY_BYTES=64*1024;
const clean=v=>typeof v==='string'?v.trim():'';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const SHA=/^[a-f0-9]{64}$/;
const response=(status,body)=>({status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'},body:JSON.stringify({...body,asset_response_version:VERSION})});
const fail=(s,r,x={})=>response(s,{ok:false,reason:r,...x});
function create({verifyBearerToken,objectStore}={}){
 if(typeof verifyBearerToken!=='function')throw Error('TRUSTED_BEARER_IDENTITY_VERIFIER_REQUIRED');
 Store.assertStore(objectStore);
 async function handle(req={}){
  if(req.method!=='POST')return fail(405,'POST_REQUIRED');
  if(clean(req.path)&&clean(req.path)!==ENDPOINT)return fail(404,'ASSET_ENDPOINT_NOT_FOUND');
  const ct=clean(req.headers?.['content-type']||req.headers?.['Content-Type']).toLowerCase();if(!ct.startsWith('application/json'))return fail(415,'JSON_CONTENT_TYPE_REQUIRED');
  const auth=clean(req.headers?.authorization||req.headers?.Authorization),m=auth.match(/^Bearer ([A-Za-z0-9._~+/-]{16,4096}=*)$/);if(!m)return fail(401,'VERIFIED_BEARER_REQUIRED');
  if(typeof req.body!=='string'||Buffer.byteLength(req.body,'utf8')>MAX_BODY_BYTES)return fail(413,'BOUNDED_JSON_BODY_REQUIRED');
  let input;try{input=JSON.parse(req.body)}catch{return fail(400,'VALID_JSON_REQUIRED')}
  if(!object(input)||!['CREATE_UPLOAD','COMMIT_UPLOAD','RESOLVE_READ'].includes(input.action))return fail(400,'ASSET_ACTION_REQUIRED');
  const family_id=clean(input.family_id),member_id=clean(input.member_id),character_id=clean(input.character_id);if(!family_id||!member_id||!character_id)return fail(400,'EXPLICIT_ASSET_SCOPE_REQUIRED');
  let principal;try{principal=await verifyBearerToken(m[1])}catch{return fail(401,'BEARER_IDENTITY_VERIFICATION_FAILED')}
  const resolved=Identity.resolve(principal,{requested_family_id:family_id});if(!resolved.ok)return fail(403,'VERIFIED_FAMILY_MEMBERSHIP_REQUIRED');if(!resolved.identity.authorized_member_ids.includes(member_id))return fail(403,'AUTHORIZED_MEMBER_REQUIRED');
  if(input.action==='CREATE_UPLOAD'){
   const content_type=clean(input.content_type).toLowerCase(),byte_size=Number(input.byte_size),sha256=clean(input.sha256).toLowerCase(),asset_version=clean(input.asset_version);
   if(!['image/png','image/webp','image/jpeg'].includes(content_type)||!Number.isInteger(byte_size)||byte_size<1||byte_size>8*1024*1024||!SHA.test(sha256)||!asset_version)return fail(400,'ASSET_UPLOAD_METADATA_INVALID');
   const asset_ref=Store.assetRef({scope_id:family_id,member_id,character_id,version:asset_version});
   let ticket;try{ticket=await objectStore.createUploadTicket({asset_ref,content_type,byte_size,sha256,expires_in_seconds:300})}catch{return fail(503,'ASSET_UPLOAD_TICKET_UNAVAILABLE')}
   if(!ticket?.upload_id||!ticket?.upload_url)return fail(503,'ASSET_UPLOAD_TICKET_INVALID');
   return response(200,{ok:true,asset_ref,upload_id:String(ticket.upload_id),upload_url:String(ticket.upload_url),expires_at:ticket.expires_at||null});
  }
  const asset_ref=clean(input.asset_ref);if(!Store.validAssetRef(asset_ref))return fail(400,'PRIVATE_ASSET_REF_REQUIRED');
  if(input.action==='COMMIT_UPLOAD'){
   const upload_id=clean(input.upload_id),sha256=clean(input.sha256).toLowerCase();if(!upload_id||!SHA.test(sha256))return fail(400,'ASSET_COMMIT_METADATA_INVALID');
   let committed;try{committed=await objectStore.commitUpload({asset_ref,upload_id,sha256})}catch{return fail(503,'ASSET_COMMIT_UNAVAILABLE')}
   if(!committed?.ok||!clean(committed.sha256)||committed.sha256!==sha256)return fail(409,'ASSET_COMMIT_VERIFICATION_FAILED');
   return response(200,{ok:true,committed:true,asset_ref,sha256,etag:committed.etag||null});
  }
  let read;try{read=await objectStore.createReadTicket({asset_ref,expires_in_seconds:300})}catch{return fail(503,'ASSET_READ_TICKET_UNAVAILABLE')}
  if(!read?.read_url)return fail(404,'ASSET_NOT_AVAILABLE');
  return response(200,{ok:true,asset_ref,read_url:String(read.read_url),expires_at:read.expires_at||null});
 }
 return Object.freeze({version:VERSION,endpoint:ENDPOINT,handle});
}
module.exports=Object.freeze({VERSION,ENDPOINT,MAX_BODY_BYTES,create});
