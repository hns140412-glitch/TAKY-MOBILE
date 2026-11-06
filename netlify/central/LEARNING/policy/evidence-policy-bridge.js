'use strict';

const DEFAULT_POLICY=require('../../MASTER/LEARNING_DATA_RUNTIME_POLICY_V1.json');
const VERSION='TAKY_LEARNING_EVIDENCE_POLICY_BRIDGE_V1';
const ALLOWED_CLASSES=new Set(['READY_WITH_GUARDS','CONDITIONAL','HOLD']);

function clean(v){ return String(v??'').trim(); }

function findPolicy(registry,functionId,consumerApp){
  return (registry.records||[]).find(row=>
    clean(row.function_id)===clean(functionId) &&
    clean(row.consumer_app)===clean(consumerApp)
  )||null;
}

function evaluate(request={},registry=DEFAULT_POLICY){
  if(registry?.schema!=='TAKY_LEARNING_DATA_RUNTIME_POLICY_V1'){
    return {ok:false,decision:'DENY',reason:'INVALID_POLICY_REGISTRY'};
  }
  const functionId=clean(request.function_id);
  const consumerApp=clean(request.consumer_app);
  const behavior=clean(request.requested_behavior);
  if(!functionId||!consumerApp||!behavior){
    return {ok:false,decision:'DENY',reason:'POLICY_REQUEST_INCOMPLETE',function_id:functionId||null,consumer_app:consumerApp||null};
  }

  const row=findPolicy(registry,functionId,consumerApp);
  if(!row){
    return {ok:false,decision:'DENY',reason:'DENY_UNKNOWN_POLICY',function_id:functionId,consumer_app:consumerApp};
  }
  if(!ALLOWED_CLASSES.has(row.authorization_class)){
    return {ok:false,decision:'DENY',reason:'INVALID_AUTHORIZATION_CLASS',policy_id:row.policy_id};
  }

  const base={
    ok:true,
    bridge_version:VERSION,
    policy_version:registry.policy_version,
    policy_id:row.policy_id,
    function_id:functionId,
    consumer_app:consumerApp,
    authorization_class:row.authorization_class,
    requested_behavior:behavior,
    cannot_claim:Array.isArray(row.cannot_claim)?[...row.cannot_claim]:[]
  };

  if(row.authorization_class==='HOLD'){
    return {...base,ok:false,decision:'DENY',reason:'DENY_HOLD'};
  }

  const allowed=new Set(row.allowed_behaviors||[]);
  const forbidden=new Set(row.forbidden_behaviors||[]);
  if(!allowed.has(behavior)){
    return {...base,ok:false,decision:'DENY',reason:forbidden.has(behavior)?'DENY_FORBIDDEN_BEHAVIOR':'DENY_BEHAVIOR_NOT_ALLOWED'};
  }

  const requestedClaims=new Set(Array.isArray(request.requested_claims)?request.requested_claims:[]);
  const blockedClaims=(row.cannot_claim||[]).filter(x=>requestedClaims.has(x));
  if(blockedClaims.length){
    return {...base,ok:false,decision:'DENY',reason:'DENY_CLAIM_BOUNDARY',blocked_claims:blockedClaims};
  }

  const provided=new Set(Array.isArray(request.provenance)?request.provenance:[]);
  const required=(row.required_provenance||[]).filter(x=>!provided.has(x));
  if(required.length){
    return {...base,ok:false,decision:'DENY',reason:'DENY_PROVENANCE_REQUIRED',missing_provenance:required};
  }

  if(row.requires_human_review===true && request.human_review_evidence!==true){
    return {...base,ok:false,decision:'DENY',reason:'DENY_HUMAN_REVIEW_REQUIRED'};
  }

  return {
    ...base,
    decision:row.authorization_class==='CONDITIONAL'?'ALLOW_CONDITIONAL':'ALLOW',
    reason:'POLICY_ALLOW'
  };
}

function evaluateBatch(requests=[],registry=DEFAULT_POLICY){
  if(!Array.isArray(requests)) return {ok:false,reason:'POLICY_REQUESTS_MUST_BE_ARRAY',results:[]};
  const results=requests.map(req=>evaluate(req,registry));
  const denied=results.filter(x=>!x.ok||x.decision==='DENY');
  return {
    ok:denied.length===0,
    bridge_version:VERSION,
    policy_version:registry.policy_version||null,
    results,
    denied
  };
}

module.exports=Object.freeze({VERSION,findPolicy,evaluate,evaluateBatch});
