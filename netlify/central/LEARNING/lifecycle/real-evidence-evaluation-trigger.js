'use strict';

const Receipt=require('../receipts/real-evidence-receipt.js');
const Replay=require('../replay/replay-dataset.js');
const ReplayBenchmark=require('../replay/replay-benchmark.js');
const Orchestrator=require('./evaluation-orchestrator.js');
const DataReadiness=require('./estimator-data-readiness.js');

function placeholderBenchmark(receipt={},dataset={},reason='INSUFFICIENT_VERIFIED_TARGETS'){
  const verified=(dataset?.records||[]).filter(r=>r.label_status==='VERIFIED_TARGET').length;
  return {
    ok:true,
    authority:'REPLAY_BENCHMARK_ONLY',
    dataset_version:dataset?.dataset_version||'TAKY_LEARNING_REPLAY_V1',
    source_kind:'REAL_EVIDENCE',
    evidence_receipt_id:receipt.receipt_id||null,
    scope:receipt.scope||dataset?.scope||null,
    verified_target_count:verified,
    observation_only_count:(dataset?.records||[]).filter(r=>r.label_status==='OBSERVATION_ONLY').length,
    instrument_drift_into_holdout:false,
    benchmark:{
      ok:true,
      benchmark_authority:'BENCHMARK_ONLY_NOT_RUNTIME',
      promotion_status:'NOT_ELIGIBLE_FROM_FIXTURE_ONLY',
      total_points:0,
      stable_instrument_points:0,
      instrument_change_points:0,
      brier:{observational:null,bkt:null,dsr:null},
      points:[]
    },
    promotion_eligible:false,
    promotion_blockers:[
      reason,
      'MIN_REAL_TARGET_COUNT_NOT_MET',
      'HUMAN_PROMOTION_REVIEW_REQUIRED'
    ]
  };
}

function evaluateReceipt({ledger,receipt,canonical_evidence,created_at,promotion_policy}={}){
  const evidence=Array.isArray(canonical_evidence)?canonical_evidence:[];
  const checked=Receipt.validateBatchReceipt(receipt,evidence);
  if(!checked.ok){
    return {ok:false,reason:'REAL_EVIDENCE_RECEIPT_INVALID',issues:checked.issues};
  }

  const built=Replay.buildDataset(evidence,receipt.scope,{
    source_kind:'REAL_EVIDENCE',
    evidence_receipt:receipt,
    created_at:created_at||receipt.created_at
  });
  if(!built.ok)return {ok:false,reason:'REPLAY_BUILD_FAILED',detail:built};

  let benchmark=ReplayBenchmark.benchmarkReplay(built.dataset);
  let benchmark_status='BENCHMARKED';
  if(!benchmark.ok&&benchmark.reason==='INSUFFICIENT_VERIFIED_TARGETS'){
    benchmark=placeholderBenchmark(receipt,built.dataset,benchmark.reason);
    benchmark_status='HOLD_BELOW_REPLAY_MINIMUM';
  }else if(!benchmark.ok){
    return {ok:false,reason:'REPLAY_BENCHMARK_FAILED',detail:benchmark};
  }

  const recorded=Orchestrator.evaluateAndRecord(ledger,benchmark,{
    created_at:created_at||receipt.created_at,
    promotion_policy:promotion_policy||{}
  });
  if(!recorded.ok)return recorded;

  const readiness=DataReadiness.readiness([{
    receipt,
    canonical_evidence:evidence
  }],{
    min_verified_targets:promotion_policy?.min_verified_targets
  });

  return {
    ok:true,
    receipt_id:receipt.receipt_id,
    scope:receipt.scope,
    benchmark_status,
    report:recorded.report,
    data_readiness:readiness,
    ledger:recorded.ledger,
    ledger_entry:recorded.ledger_entry,
    deduplicated:recorded.deduplicated===true,
    invariant:'EVERY_VALID_REAL_EVIDENCE_RECEIPT_GETS_A_RETAINED_EVALUATION'
  };
}

function selfValidate(result={}){
  const issues=[];
  if(!result.ok)issues.push('RESULT_NOT_OK');
  if(result.invariant!=='EVERY_VALID_REAL_EVIDENCE_RECEIPT_GETS_A_RETAINED_EVALUATION')issues.push('RETENTION_INVARIANT_MISSING');
  if(result.ok&&!result.ledger_entry)issues.push('LEDGER_ENTRY_REQUIRED');
  if(result.report?.auto_promotion!==false)issues.push('AUTO_PROMOTION_FORBIDDEN');
  if(!result.data_readiness?.ok)issues.push('DATA_READINESS_REQUIRED');
  if(result.data_readiness?.promotion_authority!==false)issues.push('DATA_READINESS_PROMOTION_AUTHORITY_FORBIDDEN');
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({placeholderBenchmark,evaluateReceipt,selfValidate});
