'use strict';

const POLICY_VERSION='TAKY_VERIFIER_POLICY_V1';

const POLICIES=Object.freeze([
  {
    policy_id:'HIDE_RETRIEVAL_EXACT',
    source_app:'hide-seek',
    evidence_type:'MEMORY_RETRIEVAL_EVIDENCE',
    verifier_type:'RETRIEVAL_EXACT_MATCH',
    auto_verification:true,
    requires_reference:true,
    allowed_when:['PROMPT_TARGET_IMMUTABLE','MATCH_RULE_DETERMINISTIC'],
    forbidden_claims:['GLOBAL_MASTERY','SCHEDULE_DATE']
  },
  {
    policy_id:'READY_ANSWER_KEY_EXACT',
    source_app:'ready-set',
    evidence_type:'STRUCTURED_PRACTICE_EVIDENCE',
    verifier_type:'ANSWER_KEY_EXACT',
    auto_verification:true,
    requires_reference:true,
    allowed_when:['ANSWER_KEY_SOURCE_VERIFIED','MATCH_RULE_DETERMINISTIC'],
    forbidden_claims:['GLOBAL_MASTERY','TEACHER_JUDGMENT']
  },
  {
    policy_id:'SNAP_HUMAN_RUBRIC',
    source_app:'snap-pop',
    evidence_type:'LEARNER_PRODUCTION_EVIDENCE',
    verifier_type:'HUMAN_RUBRIC_BINARY',
    auto_verification:false,
    requires_reference:true,
    allowed_when:['RUBRIC_EXPLICIT','REVIEWER_ROLE_ALLOWED'],
    forbidden_claims:['OBJECTIVE_RECALL_MASTERY','GLOBAL_MASTERY']
  }
]);

function findPolicy({source_app,evidence_type,verifier_type}={}){
  return POLICIES.find(p=>p.source_app===source_app&&p.evidence_type===evidence_type&&p.verifier_type===verifier_type)||null;
}

function canVerify(input={}){
  const policy=findPolicy(input);
  if(!policy)return {ok:false,reason:'NO_VERIFIER_POLICY'};
  if(input.auto===true&&!policy.auto_verification)return {ok:false,reason:'AUTO_VERIFICATION_FORBIDDEN',policy};
  return {ok:true,policy};
}

module.exports=Object.freeze({POLICY_VERSION,POLICIES,findPolicy,canVerify});
