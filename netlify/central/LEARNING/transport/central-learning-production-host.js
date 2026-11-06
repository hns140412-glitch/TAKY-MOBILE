'use strict';

const Evidence=require('./central-learning-http-endpoint.js');
const Decision=require('./central-learning-decision-http-endpoint.js');
const Google=require('./google-learning-principal.js');
const CharacterProfile=require('./family-character-profile-http-endpoint.js');
const CharacterAsset=require('./family-character-asset-http-endpoint.js');
const FamilySession=require('./family-session-http-endpoint.js');
const FamilyMemberProfile=require('./family-member-profile-http-endpoint.js');
const TermRecommendation=require('./term-recommendation-http-endpoint.js');
const FamilyUserData=require('./family-user-data-http-endpoint.js');
const NodeBridge=require('./node-http-learning-bridge.js');

const VERSION='TAKY_CENTRAL_LEARNING_PRODUCTION_HOST_V1';
const clean=x=>typeof x==='string'?x.trim():'';

function create({
  clientIds,
  googleAuthLibrary=null,
  oauth2Client=null,
  lookupMemberships,
  store,
  verifySpecialistEvidence,
  resolveIndexedEvidence,
  independentIndexOwnerVerifier,
  characterAssetObjectStore=null,
  resolveLearnerProfile=null,
  resolveCurriculumTerms=null,
  resolveTermEvidence=null,
  allowedOrigins,
  now=Date.now
}={}){
  if(typeof lookupMemberships!=='function')
    throw Error('PRODUCTION_MEMBERSHIP_PROVIDER_REQUIRED');
  if(!store||typeof store.getWithMetadata!=='function'||typeof store.setJSON!=='function')
    throw Error('PRODUCTION_STRONG_STORE_REQUIRED');
  if(typeof verifySpecialistEvidence!=='function')
    throw Error('PRODUCTION_SPECIALIST_VERIFIER_REQUIRED');
  if(typeof resolveIndexedEvidence!=='function')
    throw Error('PRODUCTION_INDEXED_EVIDENCE_RESOLVER_REQUIRED');
  if(typeof independentIndexOwnerVerifier!=='function')
    throw Error('PRODUCTION_INDEX_OWNER_VERIFIER_REQUIRED');
  if(!Array.isArray(allowedOrigins)||!allowedOrigins.length||
     allowedOrigins.some(x=>!clean(x)||!/^https:\/\/[^/]+$/.test(x)))
    throw Error('PRODUCTION_HTTPS_ORIGIN_ALLOWLIST_REQUIRED');

  const principal=Google.createFromGoogleAuthLibrary({
    googleAuthLibrary,oauth2Client,clientIds,lookupMemberships,now
  });
  const verifyBearerToken=principal.verifyBearerToken;

  const evidenceEndpoint=Evidence.create({
    verifyBearerToken,store,verifySpecialistEvidence
  });
  const decisionEndpoint=Decision.create({
    verifyBearerToken,store,resolveIndexedEvidence,
    independentIndexOwnerVerifier
  });
  const characterProfileEndpoint=CharacterProfile.create({verifyBearerToken,store});
  const characterAssetEndpoint=characterAssetObjectStore?CharacterAsset.create({verifyBearerToken,objectStore:characterAssetObjectStore}):null;
  const familySessionEndpoint=FamilySession.create({verifyBearerToken});
  const familyMemberProfileEndpoint=FamilyMemberProfile.create({verifyBearerToken,store});
  // For a production host with term resolvers, use the SAME authenticated,
  // strong durable evidence store as /api/learning/evidence by default.
  // An explicitly supplied trusted resolver remains a legacy override.
  const termRecommendationEndpoint=(resolveLearnerProfile||resolveCurriculumTerms||resolveTermEvidence)
    ?TermRecommendation.create({verifyBearerToken,resolveLearnerProfile,
        resolveCurriculumTerms,...(resolveTermEvidence
          ?{resolveTermEvidence}:{durableTermStore:store})})
    :null;
  const userDataEndpoint=FamilyUserData.create({verifyBearerToken,store});
  const apiHandler=NodeBridge.createHandler({
    endpoint:evidenceEndpoint,
    decisionEndpoint,
    characterProfileEndpoint,
    characterAssetEndpoint,
    familySessionEndpoint,
    familyMemberProfileEndpoint,
    termRecommendationEndpoint,
    userDataEndpoint,
    allowedOrigins
  });
  const handler=async(req,res)=>{
    if(characterAssetObjectStore&&typeof characterAssetObjectStore.handleHttp==='function'){
      const handled=await characterAssetObjectStore.handleHttp(req,res);
      if(handled)return;
    }
    return apiHandler(req,res);
  };

  return Object.freeze({
    version:VERSION,
    identity_version:principal.version,
    evidence_version:evidenceEndpoint.version,
    decision_version:decisionEndpoint.version,
    character_profile_version:characterProfileEndpoint.version,
    character_asset_version:characterAssetEndpoint?.version||null,
    family_session_version:familySessionEndpoint.version,
    family_member_profile_version:familyMemberProfileEndpoint.version,
    term_recommendation_version:termRecommendationEndpoint?.version||null,
    user_data_version:userDataEndpoint.version,
    bridge_version:NodeBridge.VERSION,
    routes:Object.freeze([Evidence.ENDPOINT,Decision.ENDPOINT,CharacterProfile.ENDPOINT,...(characterAssetEndpoint?[CharacterAsset.ENDPOINT]:[]),FamilySession.ENDPOINT,FamilyMemberProfile.ENDPOINT,...(termRecommendationEndpoint?[TermRecommendation.ENDPOINT]:[]),FamilyUserData.ENDPOINT]),
    allowed_origins:Object.freeze([...allowedOrigins]),
    handler
  });
}

module.exports=Object.freeze({VERSION,create});