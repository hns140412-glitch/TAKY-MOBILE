'use strict';

const Promotion=require('./promotion-policy.js');

function buildPromotionReport(benchmarkReplayResult={},options={}){
  if(!benchmarkReplayResult?.ok){
    return {ok:false,reason:'BENCHMARK_RESULT_INVALID'};
  }
  const evaluated=Promotion.evaluatePromotion(benchmarkReplayResult,options);
  const candidates={};
  for(const [name,r] of Object.entries(evaluated.candidate_reports||{})){
    candidates[name]={
      review_eligible:r.review_eligible,
      brier:r.brier,
      baseline_brier:r.baseline_brier,
      brier_improvement:r.brier_improvement,
      calibration_mae:r.calibration?.calibration_mae??null,
      sparse_brier:r.sparse?.brier??null,
      sparse_baseline_brier:r.sparse_baseline?.brier??null,
      blockers:r.blockers||[]
    };
  }
  return {
    ok:true,
    authority:'ESTIMATOR_PROMOTION_REVIEW_REPORT',
    policy_version:evaluated.policy_version,
    scope:benchmarkReplayResult.scope,
    source_kind:benchmarkReplayResult.source_kind,
    evidence_receipt_id:benchmarkReplayResult.evidence_receipt_id||null,
    verified_target_count:benchmarkReplayResult.verified_target_count,
    dataset_blockers:evaluated.dataset_blockers,
    drift_fraction:evaluated.drift_fraction,
    candidates,
    promotion_review_available:evaluated.promotion_review_available,
    auto_promotion:false,
    decision:evaluated.promotion_review_available?'HUMAN_REVIEW_AVAILABLE':'HOLD',
    explanation:evaluated.promotion_review_available
      ?'At least one candidate passed the V1 promotion-review gates. Human review is still required.'
      :'One or more dataset/candidate gates remain unsatisfied. Runtime estimator authority must not change.'
  };
}

function selfValidate(report={}){
  const issues=[];
  if(!report.ok)issues.push('REPORT_NOT_OK');
  if(report.auto_promotion!==false)issues.push('AUTO_PROMOTION_FORBIDDEN');
  if(report.promotion_review_available&&report.decision!=='HUMAN_REVIEW_AVAILABLE')issues.push('DECISION_MISMATCH');
  if(!report.promotion_review_available&&report.decision!=='HOLD')issues.push('HOLD_REQUIRED');
  if(report.source_kind==='REAL_EVIDENCE'&&!report.evidence_receipt_id)issues.push('REAL_EVIDENCE_RECEIPT_REQUIRED');
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({buildPromotionReport,selfValidate});
