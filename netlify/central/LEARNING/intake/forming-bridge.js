'use strict';
const crypto=require('node:crypto');
const VERSION='TAKY_FORMING_BRIDGE_V2';
const kinds=new Set(['KNOWLEDGE_FORMING','CONTENT_FORMING','APPLICATION_FORMING']);
const clean=v=>String(v??'').trim();
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

// Source meaning is INDEX-owner reviewed context, never a curriculum approval.
const semanticRef=c=>({
  source_id:c.source_id,source_ref:c.source_ref,
  source_family:c.source_family??null,source_type:c.source_type??null,
  authority_class:c.authority_class??null,detail_anchor:c.detail_anchor??null,
  relations:Array.isArray(c.relations)?JSON.parse(JSON.stringify(c.relations)):[],
  index_version:c.index_version??null,
  review_evidence_refs:Array.isArray(c.review_evidence_refs)?[...c.review_evidence_refs]:[],
  provenance:[...c.provenance]
});
const PLAN_SCHEMA='TAKY_FORMING_GROUNDED_APPLICATION_PLAN_V1';
const PLAN_FIELDS=['observed_method','design_pattern','taky_gap','proposed_change','verification_test'];
// This is semantic content, not an owner attestation. Approval remains separate.
function verifySemanticPlan(plan,indexRefs,target){
 if(!plan||plan.schema!==PLAN_SCHEMA||plan.status!=='UNAPPROVED_PROPOSAL'
   ||plan.consumer!==target||!Array.isArray(plan.items)||!plan.items.length
   ||plan.items.length>indexRefs.length)return false;
 const indexed=new Map(indexRefs.map(x=>[x.source_id,x]));
 const seen=new Set();
 for(const item of plan.items){
  if(!item||typeof item.source_id!=='string'||seen.has(item.source_id))return false;
  seen.add(item.source_id);
  const indexedSource=indexed.get(item.source_id);
  if(!indexedSource||item.source_ref!==indexedSource.source_ref)return false;
  if(PLAN_FIELDS.some(k=>typeof item[k]!=='string'
       ||item[k].trim()!==item[k]||item[k].length<8||item[k].length>1200))return false;
  if(!Array.isArray(item.source_grounding)||item.source_grounding.length<2
     ||item.source_grounding.length>8)return false;
  const grounded=new Set();
  for(const proof of item.source_grounding){
   if(!proof||!['observed_method','design_pattern'].includes(proof.field)
      ||grounded.has(proof.field)||typeof proof.anchor_id!=='string'
      ||!proof.anchor_id.trim()||typeof proof.content_sha256!=='string'
      ||!/^[a-f0-9]{64}$/.test(proof.content_sha256)
      ||typeof proof.exact_quote!=='string'
      ||proof.exact_quote.length<24||proof.exact_quote.length>210
      ||!(indexedSource.provenance||[]).includes('DETAIL_SHA256:'+proof.content_sha256))
      return false;
   grounded.add(proof.field);
  }
  if(grounded.size!==2)return false;
 }
 return true;
}
const artifactBasis=f=>({
  owner:f.owner_namespace,kind:f.forming_kind,target:f.target_consumer,
  rules:f.ruleset_revision,index_refs:f.index_refs,
  ...(f.semantic_plan===undefined?{}:{semantic_plan:f.semantic_plan})
});
function verifyArtifact(f){
  if(!f||f.status!=='DRAFT'||f.approval_status!=='UNAPPROVED'
    ||!Array.isArray(f.index_refs)||!f.index_refs.length
    ||!f.owner_namespace||!f.forming_kind||!f.target_consumer||!f.ruleset_revision)
    return {ok:false,reason:'ARTIFACT_SHAPE_INVALID'};
  if(f.forming_kind==='APPLICATION_FORMING'&&f.semantic_plan===undefined)
    return {ok:false,reason:'APPLICATION_FORMING_REQUIRES_GROUNDED_MEANING'};
  if(!f.consumer_contract||f.consumer_contract.consumer!==f.target_consumer
    ||f.consumer_contract.readiness!=='NOT_APPROVED'
    ||f.consumer_contract.applied===true)
    return {ok:false,reason:'ARTIFACT_CONSUMER_CONTRACT_INVALID'};
  for(const c of f.index_refs){
    if(!c||!clean(c.source_id)||!clean(c.source_ref)
      ||!clean(c.source_family)||!clean(c.source_type)
      ||!clean(c.authority_class)||!clean(c.detail_anchor)
      ||!clean(c.index_version)
      ||!Array.isArray(c.review_evidence_refs)||!c.review_evidence_refs.length
      ||!Array.isArray(c.provenance)||!c.provenance.length
      ||!Array.isArray(c.relations))
      return {ok:false,reason:'ARTIFACT_SEMANTIC_EVIDENCE_INVALID'};
  }
  if(f.semantic_plan!==undefined&&!verifySemanticPlan(f.semantic_plan,f.index_refs,f.target_consumer))
    return {ok:false,reason:'ARTIFACT_SEMANTIC_PLAN_INVALID'};
  const expected=hash(artifactBasis(f));
  const refs=[...new Set(f.index_refs.map(c=>c.source_ref))].sort();
  if(f.artifact_revision!==expected||f.artifact_id!=='forming:'+expected.slice(0,20)
    ||f.output_fingerprint!==expected||f.input_fingerprint!==hash(f.index_refs)
    ||JSON.stringify(f.source_refs)!==JSON.stringify(refs))
    return {ok:false,reason:'ARTIFACT_REVISION_MISMATCH'};
  return {ok:true,reason:'VERIFIED_DRAFT_INTEGRITY_NOT_APPROVAL'};
}

function form(handoff, options={}){
  const issues=[];
  if(handoff?.ok!==true || handoff?.version!=='TAKY_INDEX_TO_LEARNING_EVIDENCE_HANDOFF_V1')issues.push('VERIFIED_INDEX_HANDOFF_REQUIRED');
  const owner=clean(options.owner_namespace), kind=clean(options.forming_kind);
  const target=clean(options.target_consumer), rules=clean(options.ruleset_revision);
  if(!owner)issues.push('OWNER_MISSING');
  if(!kinds.has(kind))issues.push('FORMING_KIND_INVALID');
  if(!target)issues.push('CONSUMER_MISSING');
  if(!rules)issues.push('RULESET_REVISION_MISSING');
  const candidates=Array.isArray(handoff?.candidates)?handoff.candidates:[];
  if(!candidates.length)issues.push('CANDIDATES_EMPTY');
  for(const [i,c] of candidates.entries()){
    if(!clean(c.source_id)||!clean(c.source_ref)||!Array.isArray(c.provenance)||!c.provenance.length)
      issues.push('PROVENANCE_INVALID:'+i);
    if(!clean(c.source_family)||!clean(c.source_type)
      ||!clean(c.authority_class)||!clean(c.detail_anchor)
      ||!clean(c.index_version)
      ||!Array.isArray(c.review_evidence_refs)||!c.review_evidence_refs.length
      ||(c.relations!==undefined&&!Array.isArray(c.relations)))
      issues.push('INDEX_OWNER_SEMANTIC_BINDING_REQUIRED:'+i);
  }
  if(issues.length)return {ok:false,version:VERSION,issues,status:'INCOMPLETE'};
  const source_refs=[...new Set(candidates.map(c=>c.source_ref))].sort();
  const index_refs=candidates.map(semanticRef);
  const proposed=options.semantic_plan;
  if(kind==='APPLICATION_FORMING'&&proposed===undefined)
    return {ok:false,version:VERSION,issues:['APPLICATION_FORMING_SEMANTIC_PLAN_REQUIRED'],status:'INCOMPLETE'};
  if(proposed!==undefined&&!verifySemanticPlan(proposed,index_refs,target))
    return {ok:false,version:VERSION,issues:['SEMANTIC_PLAN_GROUNDING_OR_SCOPE_INVALID'],status:'INCOMPLETE'};
  const semantic_plan=proposed===undefined?undefined:JSON.parse(JSON.stringify(proposed));
  const basis={owner,kind,target,rules,index_refs,
    ...(semantic_plan===undefined?{}:{semantic_plan})};
  const digest=hash(basis);
  return {ok:true,version:VERSION,status:'DRAFT',approval_status:'UNAPPROVED',
    artifact_id:'forming:'+digest.slice(0,20),artifact_revision:digest,
    owner_namespace:owner,forming_kind:kind,target_consumer:target,
    ruleset_revision:rules,source_refs,index_refs,
    ...(semantic_plan===undefined?{}:{semantic_plan}),
    input_fingerprint:hash(index_refs),output_fingerprint:digest,
    consumer_contract:{consumer:target,readiness:'NOT_APPROVED'},
    provenance_trace:{index_handoff_version:handoff.version,source_refs},
    known_gaps:['SEMANTIC_REVIEW_REQUIRED','CONSUMER_CONTRACT_VERIFICATION_REQUIRED'],
    invariant:'FORMING_DRAFT_NEVER_AUTOMATICALLY_APPROVES_OR_SCHEDULES_LEARNING'};
}
module.exports=Object.freeze({VERSION,PLAN_SCHEMA,form,verifyArtifact,verifySemanticPlan});
