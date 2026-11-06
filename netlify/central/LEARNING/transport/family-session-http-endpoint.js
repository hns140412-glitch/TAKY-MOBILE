'use strict';
const VERSION='TAKY_FAMILY_SESSION_HTTP_V1';
const ENDPOINT='/api/family/session';
const clean=v=>typeof v==='string'?v.trim():'';
const response=(status,body)=>({status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff'},body:JSON.stringify({...body,session_response_version:VERSION})});
const fail=(s,r)=>response(s,{ok:false,reason:r});
function create({verifyBearerToken}={}){
 if(typeof verifyBearerToken!=='function')throw Error('TRUSTED_BEARER_IDENTITY_VERIFIER_REQUIRED');
 async function handle(req={}){
  if(req.method!=='POST')return fail(405,'POST_REQUIRED');
  if(clean(req.path)&&clean(req.path)!==ENDPOINT)return fail(404,'SESSION_ENDPOINT_NOT_FOUND');
  const ct=clean(req.headers?.['content-type']||req.headers?.['Content-Type']).toLowerCase();if(!ct.startsWith('application/json'))return fail(415,'JSON_CONTENT_TYPE_REQUIRED');
  const auth=clean(req.headers?.authorization||req.headers?.Authorization),m=auth.match(/^Bearer ([A-Za-z0-9._~+/-]{16,4096}=*)$/);if(!m)return fail(401,'VERIFIED_BEARER_REQUIRED');
  let principal;try{principal=await verifyBearerToken(m[1])}catch{return fail(401,'BEARER_IDENTITY_VERIFICATION_FAILED')}
  if(!principal?.authenticated||!Array.isArray(principal.families)||!principal.families.length)return fail(403,'ACTIVE_FAMILY_SESSION_REQUIRED');
  const families=principal.families.map(f=>({family_id:clean(f.family_id),self_member_id:clean(f.self_member_id),authorized_member_ids:Array.isArray(f.authorized_member_ids)?f.authorized_member_ids.map(clean).filter(Boolean):[]}));
  if(families.some(f=>!f.family_id||!f.self_member_id))return fail(503,'SERVER_FAMILY_SESSION_INVALID');
  return response(200,{ok:true,session:{principal_id:clean(principal.principal_id),identity_provider:clean(principal.identity_provider),families}});
 }
 return Object.freeze({version:VERSION,endpoint:ENDPOINT,handle});
}
module.exports=Object.freeze({VERSION,ENDPOINT,create});
