'use strict';

/**
 * Server-side Google ID-token -> authoritative family membership principal.
 * NO browser-provided role/family/member is used to construct an identity.
 * Google verifies WHO (sub). TAKY's server membership registry decides WHICH
 * family/member learning evidence this subject is allowed to submit.
 */
const VERSION='TAKY_GOOGLE_CENTRAL_LEARNING_PRINCIPAL_V1';
const ISSUERS=new Set(['accounts.google.com','https://accounts.google.com']);
const ROLES=new Set(['PARENT','CHILD','FAMILY_ADULT']);
const clean=v=>typeof v==='string'?v.trim():'';
const validId=v=>clean(v).length>0&&clean(v)===v&&v.length<=128;
const unique=items=>new Set(items).size===items.length;

function create({clientIds,verifyIdToken,lookupMemberships,now=Date.now}={}){
 if(!Array.isArray(clientIds)||clientIds.length===0||
    clientIds.some(x=>!validId(x))||!unique(clientIds))
   throw Error('EXPLICIT_GOOGLE_CLIENT_ID_ALLOWLIST_REQUIRED');
 if(typeof verifyIdToken!=='function')throw Error('GOOGLE_SIGNATURE_VERIFIER_REQUIRED');
 if(typeof lookupMemberships!=='function')throw Error('SERVER_AUTHORITATIVE_FAMILY_MEMBERSHIP_PROVIDER_REQUIRED');
 if(typeof now!=='function')throw Error('TRUSTED_CLOCK_REQUIRED');
 const audience=[...clientIds];

 async function verifyBearerToken(token){
   if(typeof token!=='string'||token.length<16||token.length>8192)
     throw Error('GOOGLE_ID_TOKEN_REQUIRED');
   // Inject only Google Auth Library OAuth2Client.verifyIdToken (or equivalent
   // security-reviewed signature/certificate verifier), never JSON decode().
   const ticket=await verifyIdToken({idToken:token,audience});
   const payload=ticket?.getPayload?.();
   const seconds=Math.floor(now()/1000);
   if(!payload||!ISSUERS.has(payload.iss)||!audience.includes(payload.aud)||
      (payload.azp&&!audience.includes(payload.azp))||
      !validId(payload.sub)||!Number.isSafeInteger(payload.exp)||
      payload.exp<=seconds||!Number.isSafeInteger(payload.iat)||
      payload.iat>seconds+60||payload.iat>payload.exp)
     throw Error('VERIFIED_GOOGLE_TOKEN_CLAIMS_INVALID');

   // A subject identifier is stable; email/name/picture and the hd/email
   // strings are NOT membership or a role. All permissions are server-owned.
   const result=await lookupMemberships({
     provider:'GOOGLE_OIDC',subject:payload.sub
   });
   if(!Array.isArray(result)||!result.length||result.length>32)
     throw Error('ACTIVE_TAKY_MEMBERSHIP_REQUIRED');
   const familyIds=new Set(),families=[];
   for(const member of result){
     if(!member||member.status!=='ACTIVE'||!validId(member.family_id)||
        !validId(member.self_member_id)||!ROLES.has(member.role)||
        familyIds.has(member.family_id))
       throw Error('INVALID_OR_DUPLICATE_SERVER_FAMILY_MEMBERSHIP');
     familyIds.add(member.family_id);
     const grants=member.learning_evidence_submit_member_ids;
     if(!Array.isArray(grants)||grants.length>100||
        grants.some(x=>!validId(x))||!unique(grants))
       throw Error('SERVER_LEARNING_SUBMIT_GRANTS_REQUIRED');
     let authorized;
     if(member.role==='CHILD'){
       // Sibling/member ownership is NOT permission to submit for one another.
       if(grants.some(id=>id!==member.self_member_id))
         throw Error('CHILD_CROSS_MEMBER_GRANT_FORBIDDEN');
       authorized=[member.self_member_id];
     }else if(member.role==='FAMILY_ADULT'){
       // Being a grandparent, guardian or gift giver alone conveys no learner
       // history privilege. A separate explicit server-owned grant is required.
       if(!Array.isArray(member.permissions)||
          !member.permissions.includes('LEARNING_EVIDENCE_SUBMIT'))
         throw Error('FAMILY_ADULT_EXPLICIT_LEARNING_PERMISSION_REQUIRED');
       authorized=[member.self_member_id,...grants];
     }else{
       authorized=[member.self_member_id,...grants];
     }
     families.push({
       family_id:member.family_id,
       self_member_id:member.self_member_id,
       authorized_member_ids:[...new Set(authorized)].sort()
     });
   }
   return {
     authenticated:true,
     principal_id:'google:'+payload.sub,
     identity_provider:'GOOGLE_OIDC_VERIFIED',
     families,
     // No raw token/email, no user-supplied family permissions in this result.
   };
 }
 return Object.freeze({version:VERSION,verifyBearerToken});
}

/**
 * Real adapter, loaded only in an appropriately provisioned host runtime:
 * npm install google-auth-library
 * Host must supply its actual configured Google OAuth Web client ID allowlist,
 * trusted server-side membership provider and safe secret/config management.
 */
function createFromGoogleAuthLibrary({googleAuthLibrary,oauth2Client,...config}={}){
 let client=oauth2Client;
 if(!client){
   const lib=googleAuthLibrary||require('google-auth-library');
   if(typeof lib?.OAuth2Client!=='function')
     throw Error('GOOGLE_AUTH_LIBRARY_REQUIRED');
   client=new lib.OAuth2Client();
 }
 if(typeof client.verifyIdToken!=='function')
   throw Error('GOOGLE_AUTH_LIBRARY_ID_TOKEN_VERIFICATION_REQUIRED');
 return create({...config,
   verifyIdToken:args=>client.verifyIdToken(args)});
}
module.exports=Object.freeze({VERSION,create,createFromGoogleAuthLibrary});
