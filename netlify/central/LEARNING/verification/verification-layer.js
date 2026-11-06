'use strict';

const VerifierPolicy=require('./verifier-policy.js');
const VERSION='TAKY_LEARNING_VERIFICATION_V1';
const clean=v=>String(v??'').trim();

const ALLOWED_VERIFIERS=Object.freeze({
  ANSWER_KEY_EXACT:{
    requires_reference:true,
    allowed_evidence:['MEMORY_RETRIEVAL_EVIDENCE','STRUCTURED_PRACTICE_EVIDENCE']
  },
  RETRIEVAL_EXACT_MATCH:{
    requires_reference:true,
    allowed_evidence:['MEMORY_RETRIEVAL_EVIDENCE']
  },
  HUMAN_RUBRIC_BINARY:{
    requires_reference:true,
    allowed_evidence:['LEARNER_PRODUCTION_EVIDENCE','STRUCTURED_PRACTICE_EVIDENCE']
  }
});

function validateReceipt(r={}){
  const issues=[];
  if(clean(r.authority)!=='LEARNING_VERIFICATION_RECEIPT')issues.push('AUTHORITY_INVALID');
  for(const k of ['receipt_id','target_event_id','verified_at','verifier_type','verifier_version','member_id','subject','concept_skill_target']){
    if(!clean(r[k]))issues.push('MISSING_'+k.toUpperCase());
  }
  if(!Number.isFinite(Date.parse(r.verified_at||'')))issues.push('VERIFIED_AT_INVALID');
  if(r.outcome!==0&&r.outcome!==1)issues.push('OUTCOME_INVALID');
  const spec=ALLOWED_VERIFIERS[clean(r.verifier_type)];
  if(!spec)issues.push('VERIFIER_NOT_ALLOWED');
  if(spec?.requires_reference&&!clean(r.reference_id))issues.push('REFERENCE_REQUIRED');
  if(clean(r.verifier_type)==='HUMAN_RUBRIC_BINARY'&&!['PARENT','TEACHER','QUALIFIED_REVIEWER'].includes(clean(r.reviewer_role)))issues.push('REVIEWER_ROLE_INVALID');
  return {ok:issues.length===0,issues};
}

function issueReceipt(input={}){
  const receipt={
    authority:'LEARNING_VERIFICATION_RECEIPT',
    receipt_version:VERSION,
    receipt_id:clean(input.receipt_id),
    target_event_id:clean(input.target_event_id),
    verified_at:clean(input.verified_at),
    verifier_type:clean(input.verifier_type),
    verifier_version:clean(input.verifier_version),
    outcome:input.outcome,
    member_id:clean(input.member_id),
    subject:clean(input.subject).toLowerCase(),
    concept_skill_target:clean(input.concept_skill_target).toLowerCase(),
    reference_id:clean(input.reference_id)||null,
    reviewer_role:clean(input.reviewer_role)||null,
    notes:clean(input.notes)||null
  };
  const checked=validateReceipt(receipt);
  return checked.ok?{ok:true,receipt}:{ok:false,reason:'INVALID_VERIFICATION_RECEIPT',issues:checked.issues,receipt};
}

function applyReceipt(evidence={},receipt={}){
  const checked=validateReceipt(receipt);
  if(!checked.ok)return {ok:false,reason:'INVALID_VERIFICATION_RECEIPT',issues:checked.issues};
  const issues=[];
  if(clean(evidence.event_id)!==clean(receipt.target_event_id))issues.push('EVENT_MISMATCH');
  if(clean(evidence.member_id)!==clean(receipt.member_id))issues.push('MEMBER_MISMATCH');
  if(clean(evidence.subject).toLowerCase()!==clean(receipt.subject).toLowerCase())issues.push('SUBJECT_MISMATCH');
  if(clean(evidence.concept_skill_target).toLowerCase()!==clean(receipt.concept_skill_target).toLowerCase())issues.push('SKILL_MISMATCH');
  if(clean(evidence.evidence_type)==='CHILD_SELF_REPORT')issues.push('SELF_REPORT_NOT_VERIFIABLE_TARGET');
  const spec=ALLOWED_VERIFIERS[clean(receipt.verifier_type)];
  if(spec&&!spec.allowed_evidence.includes(clean(evidence.evidence_type)))issues.push('VERIFIER_EVIDENCE_TYPE_MISMATCH');
  const policy=VerifierPolicy.canVerify({
    source_app:clean(evidence.source_app),
    evidence_type:clean(evidence.evidence_type),
    verifier_type:clean(receipt.verifier_type),
    auto:clean(receipt.verifier_type)!=='HUMAN_RUBRIC_BINARY'
  });
  if(!policy.ok)issues.push(policy.reason);
  if(issues.length)return {ok:false,reason:'VERIFICATION_SCOPE_MISMATCH',issues};
  return {
    ok:true,
    evidence:{
      ...evidence,
      verified_outcome:receipt.outcome,
      verification:{
        authority:receipt.authority,
        receipt_id:receipt.receipt_id,
        receipt_version:receipt.receipt_version,
        verifier_type:receipt.verifier_type,
        verifier_version:receipt.verifier_version,
        verified_at:receipt.verified_at,
        reference_id:receipt.reference_id,
        reviewer_role:receipt.reviewer_role
      }
    }
  };
}

function issueFromCandidate(evidence={},candidate={}){
  const verifierType=clean(candidate.verifier_type);
  if(!['RETRIEVAL_EXACT_MATCH','ANSWER_KEY_EXACT'].includes(verifierType))return {ok:false,reason:'CANDIDATE_VERIFIER_NOT_ALLOWED'};
  if(clean(candidate.basis)!=='DETERMINISTIC_LOCAL_MATCH')return {ok:false,reason:'CANDIDATE_BASIS_INVALID'};
  if(candidate.outcome!==0&&candidate.outcome!==1)return {ok:false,reason:'CANDIDATE_OUTCOME_INVALID'};
  const policy=VerifierPolicy.canVerify({
    source_app:clean(evidence.source_app),
    evidence_type:clean(evidence.evidence_type),
    verifier_type:verifierType,
    auto:true
  });
  if(!policy.ok)return {ok:false,reason:policy.reason};
  const issued=issueReceipt({
    receipt_id:'vr:'+clean(evidence.event_id)+':'+clean(candidate.verifier_version||'v1'),
    target_event_id:clean(evidence.event_id),
    verified_at:clean(evidence.observed_at),
    verifier_type:verifierType,
    verifier_version:clean(candidate.verifier_version),
    outcome:candidate.outcome,
    member_id:clean(evidence.member_id),
    subject:clean(evidence.subject),
    concept_skill_target:clean(evidence.concept_skill_target),
    reference_id:clean(candidate.reference_id)
  });
  if(!issued.ok)return issued;
  return applyReceipt(evidence,issued.receipt);
}

module.exports=Object.freeze({VERSION,ALLOWED_VERIFIERS,validateReceipt,issueReceipt,applyReceipt,issueFromCandidate});
