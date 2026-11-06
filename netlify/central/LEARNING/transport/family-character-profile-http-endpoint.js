'use strict';

const Identity=require('./family-member-identity-resolver.js');
const CharacterAsset=require('./private-character-object-store-adapter.js');

const VERSION='TAKY_FAMILY_CHARACTER_PROFILE_HTTP_V1';
const ENDPOINT='/api/family/character-profile';
const MAX_BODY_BYTES=96*1024;
const clean=v=>typeof v==='string'?v.trim():'';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const SHA=/^[a-f0-9]{64}$/;
const headers=Object.freeze({
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store, max-age=0',
  Pragma:'no-cache','X-Content-Type-Options':'nosniff'
});
const response=(status,body)=>({status,headers:{...headers},body:JSON.stringify({...body,profile_response_version:VERSION})});
const fail=(status,reason,extra={})=>response(status,{ok:false,reason,...extra});
const key=(familyId,memberId)=>'families/'+encodeURIComponent(familyId)+'/members/'+encodeURIComponent(memberId)+'/profile/character-v1';

function normalizeProjection(input={}){
  const allowed=new Set(['member_id','character_id','identity_version','master_asset_ref','master_sha256','asset_version','derivative_refs','status','updated_at']);
  if(!object(input)||Object.keys(input).some(k=>!allowed.has(k)))return {ok:false,reason:'PROFILE_FIELDS_INVALID'};
  if(['sourcePhoto','source_photo','raw_photo','original_photo','photo','access_token','refresh_token'].some(k=>Object.hasOwn(input,k)))
    return {ok:false,reason:'RAW_OR_SECRET_FIELD_FORBIDDEN'};
  const p={
    member_id:clean(input.member_id),
    character_id:clean(input.character_id),
    identity_version:Number(input.identity_version),
    master_asset_ref:clean(input.master_asset_ref),
    master_sha256:input.master_sha256==null?null:clean(input.master_sha256).toLowerCase(),
    asset_version:input.asset_version==null?null:clean(input.asset_version),
    derivative_refs:object(input.derivative_refs)?input.derivative_refs:{},
    status:clean(input.status)||'CONFIRMED',
    updated_at:clean(input.updated_at)
  };
  if(!p.member_id||!p.character_id||!Number.isInteger(p.identity_version)||p.identity_version<1||!p.master_asset_ref)
    return {ok:false,reason:'PROFILE_REQUIRED_FIELDS_MISSING'};
  if(!CharacterAsset.validAssetRef(p.master_asset_ref))return {ok:false,reason:'PRIVATE_MASTER_ASSET_REF_REQUIRED'};
  if(p.master_sha256&&!SHA.test(p.master_sha256))return {ok:false,reason:'PROFILE_SHA256_INVALID'};
  if(p.status!=='CONFIRMED')return {ok:false,reason:'PROFILE_STATUS_NOT_CONFIRMED'};
  if(!Number.isFinite(Date.parse(p.updated_at)))return {ok:false,reason:'PROFILE_UPDATED_AT_INVALID'};
  const json=JSON.stringify(p);
  if(/sourcePhoto|source_photo|raw_photo|original_photo|access_token|refresh_token/i.test(json))
    return {ok:false,reason:'PROFILE_PRIVATE_SOURCE_LEAK'};
  return {ok:true,projection:p};
}

function create({verifyBearerToken,store}={}){
  if(typeof verifyBearerToken!=='function')throw Error('TRUSTED_BEARER_IDENTITY_VERIFIER_REQUIRED');
  if(typeof store?.getWithMetadata!=='function'||typeof store?.setJSON!=='function')
    throw Error('STRONG_DURABLE_PROFILE_STORE_REQUIRED');

  async function handle(req={}){
    if(req.method!=='POST')return fail(405,'POST_REQUIRED');
    if(clean(req.path)&&clean(req.path)!==ENDPOINT)return fail(404,'PROFILE_ENDPOINT_NOT_FOUND');
    const contentType=clean(req.headers?.['content-type']||req.headers?.['Content-Type']).toLowerCase();
    if(!contentType.startsWith('application/json'))return fail(415,'JSON_CONTENT_TYPE_REQUIRED');
    const auth=clean(req.headers?.authorization||req.headers?.Authorization);
    const match=auth.match(/^Bearer ([A-Za-z0-9._~+/-]{16,4096}=*)$/);
    if(!match)return fail(401,'VERIFIED_BEARER_REQUIRED');
    if(typeof req.body!=='string'||Buffer.byteLength(req.body,'utf8')>MAX_BODY_BYTES)
      return fail(413,'BOUNDED_JSON_BODY_REQUIRED');
    let input;try{input=JSON.parse(req.body)}catch{return fail(400,'VALID_JSON_REQUIRED')}
    if(!object(input)||!['GET','PUBLISH'].includes(input.action))return fail(400,'PROFILE_ACTION_REQUIRED');
    const familyId=clean(input.family_id),memberId=clean(input.member_id);
    if(!familyId||!memberId)return fail(400,'EXPLICIT_FAMILY_MEMBER_SCOPE_REQUIRED');

    let principal;try{principal=await verifyBearerToken(match[1])}catch{return fail(401,'BEARER_IDENTITY_VERIFICATION_FAILED')}
    const resolved=Identity.resolve(principal,{requested_family_id:familyId});
    if(!resolved.ok)return fail(403,'VERIFIED_FAMILY_MEMBERSHIP_REQUIRED');
    if(!resolved.identity.authorized_member_ids.includes(memberId))return fail(403,'AUTHORIZED_MEMBER_REQUIRED');

    const storeKey=key(familyId,memberId);
    if(input.action==='GET'){
      let stored;try{stored=await store.getWithMetadata(storeKey,{type:'json',consistency:'strong'})}
      catch{return fail(503,'CHARACTER_PROFILE_READ_UNAVAILABLE')}
      if(!stored)return response(200,{ok:true,found:false,projection:null});
      if(!clean(stored.etag)||stored.consistency!=='strong'||!object(stored.data))
        return fail(503,'CHARACTER_PROFILE_STORE_INVALID');
      const normalized=normalizeProjection(stored.data);
      if(!normalized.ok||normalized.projection.member_id!==memberId)
        return fail(503,'CHARACTER_PROFILE_DATA_INVALID');
      return response(200,{ok:true,found:true,projection:normalized.projection,etag:stored.etag});
    }

    const normalized=normalizeProjection(input.projection);
    if(!normalized.ok)return fail(400,normalized.reason);
    const p=normalized.projection;
    if(p.member_id!==memberId)return fail(400,'PROFILE_MEMBER_SCOPE_MISMATCH');

    let existing;try{existing=await store.getWithMetadata(storeKey,{type:'json',consistency:'strong'})}
    catch{return fail(503,'CHARACTER_PROFILE_READ_UNAVAILABLE')}
    if(existing){
      if(!clean(existing.etag)||existing.consistency!=='strong'||!object(existing.data))
        return fail(503,'CHARACTER_PROFILE_STORE_INVALID');
      const old=normalizeProjection(existing.data);
      if(!old.ok)return fail(503,'CHARACTER_PROFILE_DATA_INVALID');
      if(p.identity_version<old.projection.identity_version)
        return fail(409,'CHARACTER_PROFILE_VERSION_REGRESSION',{current_identity_version:old.projection.identity_version});
      if(p.identity_version===old.projection.identity_version&&p.character_id!==old.projection.character_id)
        return fail(409,'CHARACTER_PROFILE_VERSION_COLLISION');
    }
    let write;try{
      write=await store.setJSON(storeKey,p,existing?{onlyIfMatch:existing.etag}:{onlyIfNew:true});
    }catch{return fail(503,'CHARACTER_PROFILE_WRITE_UNAVAILABLE')}
    if(!write?.modified||!clean(write.etag))
      return fail(409,'CHARACTER_PROFILE_WRITE_CONFLICT');
    return response(200,{ok:true,published:true,projection:p,etag:write.etag});
  }

  return Object.freeze({version:VERSION,endpoint:ENDPOINT,handle});
}

module.exports=Object.freeze({VERSION,ENDPOINT,MAX_BODY_BYTES,key,normalizeProjection,create});
