'use strict';

const Identity=require('./family-member-identity-resolver.js');

const VERSION='TAKY_FAMILY_MEMBER_PROFILE_HTTP_V1';
const ENDPOINT='/api/family/member-profile';
const MAX_BODY_BYTES=96*1024;
const clean=v=>typeof v==='string'?v.trim():'';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const ROLES=new Set(['OWNER','SPOUSE','CHILD','SELF','GUARDIAN','OTHER']);
const STAGES=new Set(['PRESCHOOL','E1','E2','E3','E4','E5','E6','M1','M2','M3','OTHER']);
const SHARE_MODES=new Set(['NAME_NICKNAME','NICKNAME_ONLY','NAME_ONLY']);
const headers=Object.freeze({
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store, max-age=0',
  Pragma:'no-cache','X-Content-Type-Options':'nosniff'
});
const response=(status,body)=>({status,headers:{...headers},body:JSON.stringify({...body,profile_response_version:VERSION})});
const fail=(status,reason,extra={})=>response(status,{ok:false,reason,...extra});
const key=(familyId,memberId)=>'families/'+encodeURIComponent(familyId)+'/members/'+encodeURIComponent(memberId)+'/profile/member-v1';

function validBirthDate(value){
  if(!ISO_DATE.test(value))return false;
  const parsed=Date.parse(value+'T00:00:00Z');
  if(!Number.isFinite(parsed))return false;
  const normalized=new Date(parsed).toISOString().slice(0,10);
  return normalized===value && parsed>=Date.UTC(1900,0,1) && parsed<=Date.now();
}

function normalizeProjection(input={}){
  const allowed=new Set([
    'member_id','profile_version','display_name','legal_name','nickname','family_role',
    'birth_date','school_stage','share_name_mode','status','updated_at'
  ]);
  if(!object(input)||Object.keys(input).some(k=>!allowed.has(k)))
    return {ok:false,reason:'MEMBER_PROFILE_FIELDS_INVALID'};
  if(['sourcePhoto','source_photo','raw_photo','original_photo','photo','access_token','refresh_token','parentAccess','includeInFamily','pin','biometric']
    .some(k=>Object.hasOwn(input,k))) return {ok:false,reason:'MEMBER_PROFILE_PRIVATE_OR_DOMAIN_FIELD_FORBIDDEN'};
  const p={
    member_id:clean(input.member_id),
    profile_version:Number(input.profile_version),
    display_name:clean(input.display_name),
    legal_name:clean(input.legal_name),
    nickname:clean(input.nickname),
    family_role:clean(input.family_role).toUpperCase(),
    birth_date:clean(input.birth_date),
    school_stage:clean(input.school_stage).toUpperCase(),
    share_name_mode:clean(input.share_name_mode).toUpperCase()||'NAME_NICKNAME',
    status:clean(input.status).toUpperCase()||'CONFIRMED',
    updated_at:clean(input.updated_at)
  };
  if(!p.member_id||!Number.isInteger(p.profile_version)||p.profile_version<1)
    return {ok:false,reason:'MEMBER_PROFILE_IDENTITY_REQUIRED'};
  if(!p.display_name||p.display_name.length>80||p.legal_name.length>80||p.nickname.length>80)
    return {ok:false,reason:'MEMBER_PROFILE_NAME_INVALID'};
  if(!ROLES.has(p.family_role))return {ok:false,reason:'MEMBER_PROFILE_ROLE_INVALID'};
  if(p.birth_date&&!validBirthDate(p.birth_date))return {ok:false,reason:'MEMBER_PROFILE_BIRTH_DATE_INVALID'};
  if(p.school_stage&&!STAGES.has(p.school_stage))return {ok:false,reason:'MEMBER_PROFILE_SCHOOL_STAGE_INVALID'};
  if(!SHARE_MODES.has(p.share_name_mode))return {ok:false,reason:'MEMBER_PROFILE_SHARE_NAME_MODE_INVALID'};
  if(p.status!=='CONFIRMED')return {ok:false,reason:'MEMBER_PROFILE_STATUS_NOT_CONFIRMED'};
  if(!Number.isFinite(Date.parse(p.updated_at)))return {ok:false,reason:'MEMBER_PROFILE_UPDATED_AT_INVALID'};
  return {ok:true,projection:p};
}

function comparable(p){
  const copy={...p}; delete copy.updated_at; return JSON.stringify(copy);
}

function create({verifyBearerToken,store}={}){
  if(typeof verifyBearerToken!=='function')throw Error('TRUSTED_BEARER_IDENTITY_VERIFIER_REQUIRED');
  if(typeof store?.getWithMetadata!=='function'||typeof store?.setJSON!=='function')
    throw Error('STRONG_DURABLE_MEMBER_PROFILE_STORE_REQUIRED');

  async function handle(req={}){
    if(req.method!=='POST')return fail(405,'POST_REQUIRED');
    if(clean(req.path)&&clean(req.path)!==ENDPOINT)return fail(404,'MEMBER_PROFILE_ENDPOINT_NOT_FOUND');
    const ct=clean(req.headers?.['content-type']||req.headers?.['Content-Type']).toLowerCase();
    if(!ct.startsWith('application/json'))return fail(415,'JSON_CONTENT_TYPE_REQUIRED');
    const auth=clean(req.headers?.authorization||req.headers?.Authorization);
    const match=auth.match(/^Bearer ([A-Za-z0-9._~+/-]{16,4096}=*)$/);
    if(!match)return fail(401,'VERIFIED_BEARER_REQUIRED');
    if(typeof req.body!=='string'||Buffer.byteLength(req.body,'utf8')>MAX_BODY_BYTES)
      return fail(413,'BOUNDED_JSON_BODY_REQUIRED');
    let input; try{input=JSON.parse(req.body)}catch{return fail(400,'VALID_JSON_REQUIRED')}
    if(!object(input)||!['GET','PUBLISH'].includes(input.action))return fail(400,'MEMBER_PROFILE_ACTION_REQUIRED');
    const familyId=clean(input.family_id),memberId=clean(input.member_id);
    if(!familyId||!memberId)return fail(400,'EXPLICIT_FAMILY_MEMBER_SCOPE_REQUIRED');

    let principal; try{principal=await verifyBearerToken(match[1])}catch{return fail(401,'BEARER_IDENTITY_VERIFICATION_FAILED')}
    const resolved=Identity.resolve(principal,{requested_family_id:familyId});
    if(!resolved.ok)return fail(403,'VERIFIED_FAMILY_MEMBERSHIP_REQUIRED');
    if(!resolved.identity.authorized_member_ids.includes(memberId))return fail(403,'AUTHORIZED_MEMBER_REQUIRED');

    const storeKey=key(familyId,memberId);
    let existing; try{existing=await store.getWithMetadata(storeKey,{type:'json',consistency:'strong'})}
    catch{return fail(503,'MEMBER_PROFILE_READ_UNAVAILABLE')}

    if(input.action==='GET'){
      if(!existing)return response(200,{ok:true,found:false,projection:null});
      if(!clean(existing.etag)||existing.consistency!=='strong'||!object(existing.data))
        return fail(503,'MEMBER_PROFILE_STORE_INVALID');
      const normalized=normalizeProjection(existing.data);
      if(!normalized.ok||normalized.projection.member_id!==memberId)
        return fail(503,'MEMBER_PROFILE_DATA_INVALID');
      return response(200,{ok:true,found:true,projection:normalized.projection,etag:existing.etag});
    }

    const normalized=normalizeProjection(input.projection);
    if(!normalized.ok)return fail(400,normalized.reason);
    const p=normalized.projection;
    if(p.member_id!==memberId)return fail(400,'MEMBER_PROFILE_SCOPE_MISMATCH');

    if(existing){
      if(!clean(existing.etag)||existing.consistency!=='strong'||!object(existing.data))
        return fail(503,'MEMBER_PROFILE_STORE_INVALID');
      const old=normalizeProjection(existing.data);
      if(!old.ok)return fail(503,'MEMBER_PROFILE_DATA_INVALID');
      if(p.profile_version<old.projection.profile_version)
        return fail(409,'MEMBER_PROFILE_VERSION_REGRESSION',{current_profile_version:old.projection.profile_version});
      if(p.profile_version===old.projection.profile_version){
        if(comparable(p)!==comparable(old.projection))
          return fail(409,'MEMBER_PROFILE_VERSION_COLLISION',{current_profile_version:old.projection.profile_version});
        return response(200,{ok:true,published:false,idempotent:true,projection:old.projection,etag:existing.etag});
      }
    }

    let write; try{
      write=await store.setJSON(storeKey,p,existing?{onlyIfMatch:existing.etag}:{onlyIfNew:true});
    }catch{return fail(503,'MEMBER_PROFILE_WRITE_UNAVAILABLE')}
    if(!write?.modified||!clean(write.etag))return fail(409,'MEMBER_PROFILE_WRITE_CONFLICT');
    return response(200,{ok:true,published:true,projection:p,etag:write.etag});
  }

  return Object.freeze({version:VERSION,endpoint:ENDPOINT,handle});
}

module.exports=Object.freeze({VERSION,ENDPOINT,MAX_BODY_BYTES,key,normalizeProjection,create});
