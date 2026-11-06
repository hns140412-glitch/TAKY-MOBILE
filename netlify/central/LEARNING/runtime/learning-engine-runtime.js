'use strict';

const Core=require('./learner-state-core.js');
const Feedback=require('../pedagogy/feedback-intent.js');
const Graph=require('../domain-model/concept-dependency-graph.js');
const Decision=require('./decision-contract.js');
const EvidencePolicy=require('../policy/evidence-policy-bridge.js');
const IndexedEvidence=require('../intake/indexed-evidence-handoff.js');
const EvidenceGap=require('./evidence-gap.js');
const OutcomeFeedback=require('../lifecycle/outcome-growth-feedback.js');
const ObservationReview=require('./observation-review-intent.js');
const TermRecommendation=require('./term-recommendation-runtime.js');
const AcademicVocabUnit=require('../pedagogy/academic-vocab-unit-selector.js');

const VERSION='TAKY_LEARNING_ENGINE_RUNTIME_V1';

function derive(input={}, independentIndexOwnerVerifier=null){
  const evidence=Array.isArray(input.evidence)?input.evidence:[];
  const scope=input.scope||{};
  const observationReview=Array.isArray(input.observation_only)
    ?ObservationReview.prepare(input.observation_only,scope):null;
  if(observationReview&&!observationReview.ok)
    return {ok:false,reason:'OBSERVATION_REVIEW_INVALID',detail:observationReview};

  let indexedEvidence=null;
  let policyRequests=Array.isArray(input.evidence_policy_requests)?[...input.evidence_policy_requests]:[];

  if(input.indexed_evidence_handoff){
    indexedEvidence=IndexedEvidence.prepare(input.indexed_evidence_handoff, independentIndexOwnerVerifier);
    if(!indexedEvidence.ok){
      return {
        ok:false,
        reason:'INDEXED_EVIDENCE_HANDOFF_INVALID',
        indexed_evidence:indexedEvidence
      };
    }
    policyRequests=[...policyRequests,...indexedEvidence.policy_requests];
  }

  const evidencePolicy=EvidencePolicy.evaluateBatch(policyRequests);
  if(policyRequests.length && !evidencePolicy.ok){
    return {
      ok:false,
      reason:'EVIDENCE_POLICY_DENIED',
      evidence_policy:evidencePolicy,
      indexed_evidence:indexedEvidence
    };
  }

  const learnerState=Core.deriveSkillState(evidence,scope,input.state_options||{});
  if(!learnerState.ok)return {ok:false,reason:'LEARNER_STATE_FAILED',detail:learnerState};

  const baselineFeedback=Feedback.derive(learnerState);
  if(!baselineFeedback.ok)return {ok:false,reason:'FEEDBACK_INTENT_FAILED',detail:baselineFeedback};
  const feedback=observationReview
    ?ObservationReview.augmentFeedback(baselineFeedback,observationReview)
    :baselineFeedback;
  if(!feedback.ok)return {ok:false,reason:'OBSERVATION_FEEDBACK_INVALID',detail:feedback};

  let readiness=null;
  if(input.prerequisite_graph){
    readiness=Graph.deriveReadiness(
      input.prerequisite_graph,
      Array.isArray(input.prerequisite_skill_states)?input.prerequisite_skill_states:[],
      scope.subject,
      scope.concept_skill_target
    );
    const readinessCheck=Graph.validateReadiness(readiness);
    if(!readinessCheck.ok)return {ok:false,reason:'PREREQUISITE_READINESS_INVALID',issues:readinessCheck.issues};
  }

  const decision=Decision.derive({
    learner_state:learnerState,
    feedback_intent:feedback,
    prerequisite_readiness:readiness,
    observation_review_actionable:observationReview?.actionable===true
  });
  if(!decision.ok)return {ok:false,reason:'RUNTIME_DECISION_FAILED',detail:decision};

  const evidenceGap=EvidenceGap.derive({
    scope:learnerState.scope,
    decision,
    indexed_evidence:indexedEvidence,
    reference_requirement:input.reference_evidence_requirement||null
  });
  if(!evidenceGap.ok)return {ok:false,reason:'EVIDENCE_GAP_DERIVATION_FAILED',detail:evidenceGap};

  return {
    ok:true,
    engine_runtime:VERSION,
    authority:'TAKY_LEARNING_ENGINE_CORE',
    scope:learnerState.scope,
    learner_state:learnerState,
    feedback_intent:feedback,
    prerequisite_readiness:readiness,
    indexed_evidence:indexedEvidence,
    evidence_policy:evidencePolicy,
    decision,
    evidence_gap:evidenceGap.gap,
    trace:{
      evidence_ids:learnerState.observed?.evidence_ids||[],
      observation_review_policy:observationReview?.policy_version||null,
      observation_review_evidence_ids:observationReview?.evidence_ids||[],
      observation_review_digest_sha256:observationReview?.basis_digest_sha256||null,
      source_refs:indexedEvidence?.source_refs||[],
      learner_state_version:learnerState.core_version||null,
      feedback_contract:feedback.intent_contract||null,
      graph_version:readiness?.graph_version||null,
      decision_contract:decision.decision_contract||null,
      indexed_evidence_handoff:indexedEvidence?.version||null,
      evidence_policy_bridge:evidencePolicy.bridge_version||null,
      evidence_policy_version:evidencePolicy.policy_version||null,
      evidence_policy_ids:evidencePolicy.results.map(x=>x.policy_id).filter(Boolean),
      evidence_gap_version:evidenceGap.version||null,
      evidence_gap_id:evidenceGap.gap?.gap_id||null
    },
    cannot_influence:[
      'SCHEDULE_DATE',
      'PLANNER_DATE',
      'DUE_AT',
      'DEADLINE',
      'ASSIGNMENT_FACT',
      'FINAL_UI_COPY'
    ]
  };
}

function applyOutcome({runtime_result={},outcome={},index_gap_route=null}={}){
  if(runtime_result?.ok!==true){
    return {ok:false,reason:'VALID_RUNTIME_RESULT_REQUIRED'};
  }
  const feedback=OutcomeFeedback.derive({
    outcome,
    prior_decision:runtime_result.decision||{},
    prior_evidence_gap:runtime_result.evidence_gap||null,
    index_gap_route
  });
  const checked=OutcomeFeedback.validate(feedback);
  if(!checked.ok){
    return {ok:false,reason:'OUTCOME_FEEDBACK_INVALID',issues:checked.issues,feedback};
  }
  return {
    ok:true,
    engine_runtime:VERSION,
    authority:'TAKY_LEARNING_ENGINE_CORE',
    scope:runtime_result.scope||null,
    outcome_feedback:feedback,
    trace:{
      prior_evidence_gap_id:runtime_result.evidence_gap?.gap_id||null,
      index_gap_decision:index_gap_route?.decision||null,
      mining_strategy_feedback_candidate:!!feedback.mining_strategy_feedback_candidate
    }
  };
}

function deriveTermRecommendations(input={}){
  const result=TermRecommendation.derive(input);
  if(!result.ok)return result;
  const checked=TermRecommendation.validate(result);
  return checked.ok?result:{ok:false,reason:'TERM_RECOMMENDATION_INVALID',issues:checked.issues,detail:result};
}

// The existing Learning Engine exposes an explicit, non-operational route to
// observe how a verified FORMING source *would* alter term activity selection.
function previewBoundFormingTermRecommendations(input={}) {
  const {previewBoundSelector}=require('../projection/forming-approved-input');
  const result=previewBoundSelector(
    input.prepared,input.approval_record_path,input.authority_options||{},
    input.term_input||{}
  );
  if(!result.ok)return {ok:false,engine_runtime:VERSION,stage:result.stage,
    issues:result.issues||[],learning_consumed:false,write_performed:false};
  return {
    ok:true,engine_runtime:VERSION,stage:'LEARNING_ENGINE_SCOPED_PREVIEW',
    authority:'TAKY_LEARNING_PREVIEW_NOT_OPERATIONAL',
    artifact_id:result.artifact_id,artifact_revision:result.artifact_revision,
    source_ids:result.source_ids,
    selector_decision:result.decision,
    app_consumer_notified:false,learning_consumed:false,
    feedback_persisted:false,write_performed:false,
    release_approved:false,
  };
}

function deriveAcademicVocabularyTargets(input={}){
  const result=AcademicVocabUnit.select(input);
  if(!result.ok)return result;
  const checked=AcademicVocabUnit.validate(result);
  return checked.ok?result:{ok:false,reason:'ACADEMIC_VOCAB_TARGETS_INVALID',issues:checked.issues,detail:result};
}

function validate(result={}){
  const issues=[];
  if(result?.ok!==true)issues.push('RUNTIME_NOT_OK');
  if(result.authority!=='TAKY_LEARNING_ENGINE_CORE')issues.push('AUTHORITY_INVALID');
  if(result.learner_state&&!Core.selfValidate(result.learner_state).ok)issues.push('LEARNER_STATE_INVALID');
  if(result.feedback_intent&&!Feedback.validate(result.feedback_intent).ok)issues.push('FEEDBACK_INVALID');
  if(result.prerequisite_readiness&&!Graph.validateReadiness(result.prerequisite_readiness).ok)issues.push('READINESS_INVALID');
  if(result.indexed_evidence&&result.indexed_evidence.ok!==true)issues.push('INDEXED_EVIDENCE_INVALID');
  if(result.evidence_policy&&result.evidence_policy.ok!==true)issues.push('EVIDENCE_POLICY_INVALID');
  if(result.decision&&!Decision.validate(result.decision).ok)issues.push('DECISION_INVALID');
  if(result.evidence_gap?.mining_request_authorized===true)issues.push('LEARNING_CANNOT_AUTHORIZE_MINING');

  const forbidden=['schedule_date','planner_date','due_at','due_date','deadline'];
  const walk=v=>{
    if(!v||typeof v!=='object')return false;
    for(const [k,n] of Object.entries(v)){
      if(forbidden.includes(k))return true;
      if(walk(n))return true;
    }
    return false;
  };
  if(walk(result))issues.push('SCHEDULE_AUTHORITY_LEAK');

  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,derive,deriveTermRecommendations,previewBoundFormingTermRecommendations,deriveAcademicVocabularyTargets,applyOutcome,validate});
