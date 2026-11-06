'use strict';
const Forming=require('./forming-bridge');
const clean=v=>String(v??'').trim();
function consume(prepared, independentApprovalVerifier, consumer){
 const issues=[];
 const f=prepared?.formed;
 if(prepared?.ok!==true||prepared?.stage!=='FORMING_DRAFT'||f?.status!=='DRAFT')issues.push('FORMING_DRAFT_REQUIRED');
 const integrity=Forming.verifyArtifact(f);
 if(!integrity.ok)issues.push(integrity.reason);
 if(typeof independentApprovalVerifier!=='function')issues.push('APPROVAL_VERIFIER_REQUIRED');
 let receipt=null;
 if(!issues.length){
  try{receipt=independentApprovalVerifier(f.artifact_id,f.artifact_revision);}
  catch(_){issues.push('APPROVAL_LOOKUP_FAILED');}
 }
 if(!issues.length&&!(receipt?.issuer==='FORMING_APPROVAL_AUTHORITY'&&receipt?.decision==='APPROVED'&&receipt?.artifact_id===f.artifact_id&&receipt?.artifact_revision===f.artifact_revision&&clean(receipt?.evidence_ref)&&receipt?.owner_namespace===f.owner_namespace&&receipt?.target_consumer===f.target_consumer))issues.push('INDEPENDENT_APPROVAL_INVALID');
 if(clean(consumer)!==clean(f?.target_consumer))issues.push('CONSUMER_MISMATCH');
 if(issues.length)return {ok:false,stage:'APPROVAL_GATE',issues};
 return {ok:true,stage:'FORMING_APPROVED_HANDOFF',artifact_id:f.artifact_id,artifact_revision:f.artifact_revision,owner_namespace:f.owner_namespace,forming_kind:f.forming_kind,target_consumer:f.target_consumer,source_refs:[...f.source_refs],index_refs:[...f.index_refs],ruleset_revision:f.ruleset_revision,
  ...(f.semantic_plan===undefined?{}:{semantic_plan:JSON.parse(JSON.stringify(f.semantic_plan))}),
  semantic_consumption:f.semantic_plan===undefined?'LEGACY_METADATA_ONLY_NO_SEMANTIC_PLAN':'APPROVED_GROUNDED_PLAN_AVAILABLE_NOT_APPLIED',
  approval_evidence_ref:receipt.evidence_ref,learning_engine_decision:null,eligible_for_projection:true};
}
module.exports=Object.freeze({consume});
