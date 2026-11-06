'use strict';

/**
 * Provider-neutral HTTP boundary for independent TAKY Learning Engine evidence.
 *
 * Trusted server injects verifyBearerToken, a durable conditional store and
 * optionally verifySpecialistEvidence. A PWA can send a packet, NEVER supply a
 * trusted principal or verification receipt. No deployment or SDK binding here.
 */
const Identity=require('./family-member-identity-resolver.js');
const Authenticated=require('./authenticated-evidence-transport.js');
const crypto=require('node:crypto');

const VERSION='TAKY_CENTRAL_LEARNING_EVIDENCE_HTTP_V1';
const ENDPOINT='/api/learning/evidence';
const MAX_BODY_BYTES=65536;
const jsonHeaders=Object.freeze({
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store, max-age=0',
  Pragma:'no-cache',
  'X-Content-Type-Options':'nosniff'
});
const response=(status,body)=>({status,headers:{...jsonHeaders},body:JSON.stringify({...body,endpoint_version:VERSION})});
const bad=(status,reason)=>response(status,{ok:false,reason});
const clean=v=>typeof v==='string'?v.trim():'';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const header=(headers,name)=>{
  if(!object(headers))return '';
  const key=Object.keys(headers).find(k=>k.toLowerCase()===name.toLowerCase());
  return key?String(headers[key]??''):'';
};
const scrub=(packet)=>{
  const p=JSON.parse(JSON.stringify(packet));
  delete p.verification_input;
  delete p.verification_receipt;
  delete p.verification_candidate;
  delete p.verified_outcome;
  // Context is client-owned, too. The canonical evidence adapter accepts a
  // context.verification_receipt, so failing to scrub it lets an attacker
  // fabricate a structurally valid receipt and promote their own answer.
  if(object(p.context)){
    delete p.context.verification_receipt;
    delete p.context.verification_input;
    delete p.context.verification_candidate;
    delete p.context.verified_outcome;
  }
  if(object(p.event)){
    delete p.event.verification_receipt;
    delete p.event.verification_input;
    delete p.event.verification_candidate;
    delete p.event.verified_outcome;
  }
  if(object(p.evidence)){
    delete p.evidence.verification_candidate;
    delete p.evidence.verification_receipt;
    delete p.evidence.verification_input;
    delete p.evidence.verification;
    delete p.evidence.verified_outcome;
  }
  if(object(p.event?.payload)){
    delete p.event.payload.verification_candidate;
    delete p.event.payload.verification_receipt;
    delete p.event.payload.verification_input;
    delete p.event.payload.verification;
    delete p.event.payload.verified_outcome;
  }
  return p;
};
const shapeValid=p=>object(p)&&clean(p.packet_id)&&clean(p.source_app)&&
 object(p.context)&&clean(p.context.family_id)&&clean(p.context.member_id)&&
 object(p.event)&&clean(p.event.event_id)&&clean(p.event.occurred_at)&&
 p.event.source===p.source_app&&object(p.event.payload);
// Replays are identified from the proof-stripped, client-owned event rather
// than from a verifier's receipt, timestamp or generated assessment fields.
const stable=v=>Array.isArray(v)?v.map(stable):
  object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const replayFingerprint=p=>crypto.createHash('sha256')
  .update(JSON.stringify(stable(p))).digest('hex');
const sameScope=(a,b)=>a.packet_id===b.packet_id&&
 a.source_app===b.source_app&&a.context.family_id===b.context.family_id&&
 a.context.member_id===b.context.member_id&&
 a.event.event_id===b.event.event_id&&a.event.source===b.event.source;

function create({
 verifyBearerToken,store,verifySpecialistEvidence=null,maxBodyBytes=MAX_BODY_BYTES
}={}){
 if(typeof verifyBearerToken!=='function')throw Error('TRUSTED_BEARER_IDENTITY_VERIFIER_REQUIRED');
 if(!store||typeof store.getWithMetadata!=='function'||typeof store.setJSON!=='function')
   throw Error('DURABLE_CONDITIONAL_STORE_REQUIRED');
 if(verifySpecialistEvidence!==null&&typeof verifySpecialistEvidence!=='function')
   throw Error('SERVER_EVIDENCE_VERIFIER_INVALID');
 if(!Number.isInteger(maxBodyBytes)||maxBodyBytes<1024||maxBodyBytes>MAX_BODY_BYTES)
   throw Error('BOUNDED_JSON_BODY_LIMIT_REQUIRED');

 return Object.freeze({
  version:VERSION,
  async handle(request={}){
   if(request.method!=='POST')return bad(405,'POST_REQUIRED');
   if(request.path!==ENDPOINT)return bad(404,'CENTRAL_LEARNING_ENDPOINT_NOT_FOUND');
   if(!/^application\/json(?:\s*;|\s*$)/i.test(header(request.headers,'content-type')))
     return bad(415,'JSON_CONTENT_TYPE_REQUIRED');
   const authorization=header(request.headers,'authorization');
   const token=authorization.match(/^Bearer ([A-Za-z0-9._~+/-]{16,4096}=*)$/);
   if(!token)return bad(401,'VERIFIED_BEARER_REQUIRED');
   if(typeof request.body!=='string'||Buffer.byteLength(request.body,'utf8')>maxBodyBytes)
     return bad(413,'BOUNDED_JSON_BODY_REQUIRED');
   let packet;
   try{packet=JSON.parse(request.body)}catch{return bad(400,'VALID_JSON_PACKET_REQUIRED')}
   if(!shapeValid(packet))return bad(400,'SPECIALIST_PACKET_SHAPE_REQUIRED');

   // Only this callback may validate OAuth/JWT signature, issuer, audience,
   // expiry, revocation and authoritative family membership. The request's
   // principal/member fields are NEVER passed as authentication authority.
   let principal;
   try{principal=await verifyBearerToken(token[1])}catch{return bad(401,'BEARER_IDENTITY_VERIFICATION_FAILED')}
   const resolved=Identity.resolve(principal,{requested_family_id:packet.context.family_id});
   if(!resolved.ok)return bad(403,'VERIFIED_FAMILY_MEMBERSHIP_REQUIRED');
   const identity=resolved.identity;
   if(!identity.authorized_member_ids.includes(packet.context.member_id))
     return bad(403,'AUTHORIZED_MEMBER_REQUIRED');

   // Browser-supplied exact-match candidates, human rubric claims and proof
   // flags are stripped. If no trusted server verifier is configured, the
   // original interaction may be saved ONLY as OBSERVATION_ONLY.
   let safe=scrub(packet);
   if(verifySpecialistEvidence){
     let verified;
     try{verified=await verifySpecialistEvidence({
       // Never pass the original raw client verification claims into the
       // verifier callback: a verifier accidentally echoing its input would
       // otherwise launder untrusted proof into server-approved evidence.
       packet:JSON.parse(JSON.stringify(safe)),
       identity:Object.freeze({...identity,
         authorized_member_ids:Object.freeze([...identity.authorized_member_ids])})
     })}catch{return bad(503,'TRUSTED_SPECIALIST_VERIFICATION_UNAVAILABLE')}
     if(verified?.ok===true){
       if(!shapeValid(verified.packet)||!sameScope(packet,verified.packet))
         return bad(422,'TRUSTED_VERIFIED_PACKET_SCOPE_MISMATCH');
       safe=JSON.parse(JSON.stringify(verified.packet));
     }
   }
   let result;
   try{result=await Authenticated.ingestAuthenticated(store,safe,identity,{
     replay_fingerprint:replayFingerprint(scrub(packet))
   })}
   catch{return bad(503,'CENTRAL_DURABLE_INGEST_UNAVAILABLE')}
   if(!result?.ok){
     const denied=result?.reason==='TRANSPORT_NOT_AUTHORIZED';
     // CAS exhaustion is retryable; never classify it as a permanent evidence failure.
     const retryable=result?.retryable===true;
     return bad(denied?403:retryable?503:422,denied?'TRANSPORT_NOT_AUTHORIZED':
       clean(result?.reason)||'EVIDENCE_NOT_ACCEPTED');
   }
   if(!['REAL_EVIDENCE_RECEIPT','OBSERVATION_INGEST_RECEIPT'].includes(result.acknowledgement_kind)||
      !clean(result.receipt_id)||!result.durable_store?.etag)
     return bad(503,'COMMITTED_EVIDENCE_RECEIPT_NOT_CONFIRMED');
   return response(200,{
     ok:true,
     acknowledgement_kind:result.acknowledgement_kind,
     receipt_id:result.receipt_id,
     duplicate:result.duplicate===true,
     receipt_scope:{family_id:identity.family_id,member_id:packet.context.member_id},
     source_app:packet.source_app,
     packet_id:packet.packet_id,
     event_id:packet.event.event_id,
     storage_confirmed:true,
     // Do not send complete state, other members' data, storage keys, tokens,
     // policy internal traces, or privileged family member lists to PWA.
     learning_engine_location:'CENTRAL_NOT_PWA',
     drive_export:'SEPARATE_VERIFIED_ARCHIVE_NOT_RUNTIME'
   });
  }
 });
}
module.exports=Object.freeze({VERSION,ENDPOINT,MAX_BODY_BYTES,create});
