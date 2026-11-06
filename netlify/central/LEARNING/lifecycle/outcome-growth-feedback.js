'use strict';

const VERSION='TAKY_OUTCOME_GROWTH_FEEDBACK_V1';
const clean=v=>String(v??'').trim();

function derive(input={}){
  const outcome=input.outcome||{};
  const priorDecision=input.prior_decision||{};
  const priorGap=input.prior_evidence_gap||null;
  const indexRoute=input.index_gap_route||null;

  const verified=outcome.verified_outcome===0||outcome.verified_outcome===1;
  const verifiedReceipt=clean(outcome?.verification?.receipt_id);
  const verifiedAuthority=clean(outcome?.verification?.authority);
  const verifiedEligible=verified && !!verifiedReceipt && verifiedAuthority==='LEARNING_VERIFICATION_RECEIPT';

  const learningSignal={
    authority:'LEARNING_OUTCOME_FEEDBACK_ONLY',
    verified_target:verifiedEligible,
    outcome:verifiedEligible?outcome.verified_outcome:null,
    observation_only:!verifiedEligible,
    assistance:outcome.assistance||null,
    attempt_count:Number.isFinite(outcome.attempt_count)?outcome.attempt_count:null,
    source_app:outcome.source_app||null,
    learning_target_id:outcome.learning_target_id||null,
    prior_execution_status:priorDecision.execution_status||null,
    suggested_adjustments:[]
  };

  if(verifiedEligible){
    if(outcome.verified_outcome===0){
      learningSignal.suggested_adjustments.push('INCREASE_TARGETED_RECOVERY');
      if(outcome.assistance==='ASSISTED'||outcome.assisted===true){
        learningSignal.suggested_adjustments.push('PRESERVE_ASSISTANCE_THEN_FADE');
      }
    }else{
      learningSignal.suggested_adjustments.push('PRESERVE_SUCCESSFUL_STRATEGY');
      if(outcome.assistance==='UNASSISTED'||outcome.assisted===false){
        learningSignal.suggested_adjustments.push('ALLOW_NEXT_RETRIEVAL_CHALLENGE');
      }
    }
  }else{
    learningSignal.suggested_adjustments.push('RETAIN_AS_OBSERVATION_ONLY');
  }

  let miningCandidate=null;
  const persistentGap=priorGap&&typeof priorGap==='object';
  const indexInsufficient=indexRoute?.decision==='MINING_REQUEST'&&indexRoute?.index_sufficient===false;
  if(persistentGap&&indexInsufficient){
    miningCandidate={
      authority:'MINING_STRATEGY_FEEDBACK_CANDIDATE_ONLY',
      gap_id:priorGap.gap_id||null,
      gap_type:priorGap.gap_type||null,
      scope:priorGap.scope||null,
      outcome_signal:verifiedEligible?(outcome.verified_outcome===1?'SUCCESS':'FAILURE'):'OBSERVATION_ONLY',
      acquisition_strategy_change_authorized:false,
      canonical_classification_change_authorized:false,
      promotion_authorized:false,
      requires_mining_evaluation:true,
      reasons:[
        'LEARNING_GAP_PERSISTED',
        'INDEX_EXISTENCE_CHECK_INSUFFICIENT',
        verifiedEligible?'VERIFIED_OUTCOME_AVAILABLE':'ONLY_OBSERVATION_AVAILABLE'
      ]
    };
  }

  return {
    ok:true,
    version:VERSION,
    learning_strategy_feedback:learningSignal,
    mining_strategy_feedback_candidate:miningCandidate,
    invariant:'OUTCOME_FEEDBACK_MAY_INFORM_STRATEGY__NEVER_AUTO_PROMOTES_MINING_OR_LEARNING_POLICY'
  };
}

function validate(result={}){
  const issues=[];
  if(result?.ok!==true)issues.push('OUTCOME_FEEDBACK_NOT_OK');
  if(result.learning_strategy_feedback?.authority!=='LEARNING_OUTCOME_FEEDBACK_ONLY')issues.push('LEARNING_FEEDBACK_AUTHORITY_INVALID');
  const mining=result.mining_strategy_feedback_candidate;
  if(mining){
    if(mining.authority!=='MINING_STRATEGY_FEEDBACK_CANDIDATE_ONLY')issues.push('MINING_FEEDBACK_AUTHORITY_INVALID');
    if(mining.acquisition_strategy_change_authorized!==false)issues.push('MINING_AUTO_CHANGE_FORBIDDEN');
    if(mining.canonical_classification_change_authorized!==false)issues.push('INDEXING_AUTHORITY_LEAK');
    if(mining.promotion_authorized!==false)issues.push('MINING_AUTO_PROMOTION_FORBIDDEN');
  }
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,derive,validate});
