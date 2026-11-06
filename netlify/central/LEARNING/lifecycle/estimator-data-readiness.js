'use strict';

const Promotion=require('../benchmark/promotion-policy.js');

function summarizeReceiptGroup(receiptGroup={}){
  const evidence=Array.isArray(receiptGroup.canonical_evidence)?receiptGroup.canonical_evidence:[];
  const verified=evidence.filter(x=>x?.verified_outcome===0||x?.verified_outcome===1);
  const retrieval=verified.filter(x=>x?.evidence_type==='MEMORY_RETRIEVAL_EVIDENCE');
  const scope=receiptGroup.receipt?.scope||null;
  const instruments=[...new Set(retrieval.map(x=>x.instrument_version).filter(Boolean))];
  return {
    scope,
    receipt_id:receiptGroup.receipt?.receipt_id||null,
    total_evidence:evidence.length,
    verified_target_count:verified.length,
    verified_retrieval_target_count:retrieval.length,
    distinct_instruments:instruments,
    latest_observed_at:retrieval.map(x=>x.observed_at).filter(Boolean).sort().at(-1)||null
  };
}

function readiness(groups=[],options={}){
  const minTargets=Number(options.min_verified_targets||Promotion.DEFAULTS.min_verified_targets);
  const rows=(Array.isArray(groups)?groups:[]).map(summarizeReceiptGroup);
  return {
    ok:true,
    authority:'LEARNING_ESTIMATOR_DATA_READINESS_ONLY',
    minimum_verified_targets:minTargets,
    scopes:rows.map(r=>({
      ...r,
      remaining_verified_targets:Math.max(0,minTargets-r.verified_retrieval_target_count),
      retention_promotion_data_ready:r.verified_retrieval_target_count>=minTargets,
      bkt_promotion_data_ready:r.verified_retrieval_target_count>=minTargets
    })),
    promotion_authority:false,
    note:'Readiness counts evidence only. It does not promote estimators or claim model validity.'
  };
}

function selfValidate(r={}){
  const issues=[];
  if(r.authority!=='LEARNING_ESTIMATOR_DATA_READINESS_ONLY')issues.push('AUTHORITY_INVALID');
  if(r.promotion_authority!==false)issues.push('PROMOTION_AUTHORITY_FORBIDDEN');
  for(const s of r.scopes||[]){
    if(s.remaining_verified_targets<0)issues.push('NEGATIVE_REMAINING_TARGETS');
  }
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({summarizeReceiptGroup,readiness,selfValidate});
