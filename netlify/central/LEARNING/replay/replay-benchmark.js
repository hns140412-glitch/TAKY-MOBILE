'use strict';

const Replay=require('../replay/replay-dataset.js');
const Benchmark=require('../benchmark/estimator-benchmark.js');

function benchmarkReplay(dataset={}){
  const validated=Replay.selfValidate(dataset);
  if(!validated.ok)return {ok:false,reason:'REPLAY_DATASET_INVALID',issues:validated.issues};

  const split=Replay.splitDataset(dataset);
  if(!split.ok)return {ok:false,reason:split.reason,verified_count:split.verified_count};

  const verified=[...split.train,...split.holdout].map(r=>({
    event_id:r.event_id,
    learning_target_id:r.learning_target_id||null,
    observed_at:r.observed_at,
    verified_outcome:r.verified_outcome,
    instrument_version:r.instrument_version,
    memory_strength:r.memory_strength
  }));

  const result=Benchmark.timeHeldOut(verified,{min_history:1});
  if(!result.ok)return result;

  return {
    ok:true,
    authority:'REPLAY_BENCHMARK_ONLY',
    dataset_version:dataset.dataset_version,
    source_kind:dataset.provenance?.source_kind||null,
    evidence_receipt_id:dataset.provenance?.evidence_receipt_id||null,
    scope:dataset.scope,
    verified_target_count:verified.length,
    observation_only_count:split.diagnostics.observation_only_count,
    instrument_drift_into_holdout:split.diagnostics.instrument_drift_into_holdout,
    benchmark:result,
    promotion_eligible:false,
    promotion_blockers:[
      dataset.provenance?.source_kind!=='REAL_EVIDENCE'?'REAL_EVIDENCE_REQUIRED':null,
      dataset.provenance?.source_kind==='REAL_EVIDENCE'&&!dataset.provenance?.evidence_receipt_id?'REAL_EVIDENCE_RECEIPT_REQUIRED':null,
      split.diagnostics.instrument_drift_into_holdout?'INSTRUMENT_DRIFT_REVIEW_REQUIRED':null,
      verified.length<20?'MIN_REAL_TARGET_COUNT_NOT_MET':null,
      'HUMAN_PROMOTION_REVIEW_REQUIRED'
    ].filter(Boolean)
  };
}

function selfValidate(result={}){
  const issues=[];
  if(!result.ok)issues.push('RESULT_NOT_OK');
  if(result.promotion_eligible!==false)issues.push('AUTO_PROMOTION_FORBIDDEN');
  if(!result.benchmark?.ok)issues.push('BENCHMARK_NOT_OK');
  if(result.benchmark?.promotion_status!=='NOT_ELIGIBLE_FROM_FIXTURE_ONLY')issues.push('BENCHMARK_PROMOTION_GUARD_MISSING');
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({benchmarkReplay,selfValidate});
