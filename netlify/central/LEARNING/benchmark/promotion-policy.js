'use strict';

const DEFAULTS=Object.freeze({
  min_verified_targets:30,
  min_holdout_points:8,
  min_stable_instrument_points:8,
  max_instrument_drift_fraction:0.20,
  max_brier_degradation_vs_baseline:0.00,
  min_brier_improvement:0.01,
  max_calibration_mae:0.15,
  max_sparse_brier_degradation:0.03
});

function mean(xs=[]){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null}

function calibration(points=[],candidate='observational'){
  const rows=(points||[]).filter(p=>!p.instrument_changed&&Number.isFinite(p?.predictions?.[candidate]?.probability));
  if(!rows.length)return {ok:false,reason:'NO_STABLE_POINTS'};
  const bins=[
    {lo:0,hi:0.2},{lo:0.2,hi:0.4},{lo:0.4,hi:0.6},{lo:0.6,hi:0.8},{lo:0.8,hi:1.0000001}
  ];
  const detail=[];
  for(const b of bins){
    const g=rows.filter(r=>r.predictions[candidate].probability>=b.lo&&r.predictions[candidate].probability<b.hi);
    if(!g.length)continue;
    const p=mean(g.map(r=>r.predictions[candidate].probability));
    const y=mean(g.map(r=>r.target_outcome));
    detail.push({count:g.length,mean_probability:p,observed_rate:y,absolute_error:Math.abs(p-y)});
  }
  return {
    ok:true,
    calibration_mae:detail.length?mean(detail.map(x=>x.absolute_error)):null,
    bins:detail
  };
}

function sparsePerformance(points=[],candidate='observational',maxHistory=2){
  const rows=(points||[]).filter(p=>!p.instrument_changed&&(p.history_count??0)<=maxHistory);
  if(!rows.length)return {ok:false,reason:'NO_SPARSE_POINTS'};
  return {
    ok:true,
    count:rows.length,
    brier:mean(rows.map(r=>r.losses[candidate]))
  };
}

function evaluatePromotion(benchmarkResult={},options={}){
  const cfg={...DEFAULTS,...options};
  const blockers=[];
  const warnings=[];
  const total=Number(benchmarkResult?.verified_target_count||0);
  const b=benchmarkResult?.benchmark||{};
  const stable=Number(b.stable_instrument_points||0);
  const all=Number(b.total_points||0);
  const drift=Number(b.instrument_change_points||0);
  const driftFraction=all?drift/all:0;

  if(benchmarkResult?.source_kind!=='REAL_EVIDENCE')blockers.push('REAL_EVIDENCE_REQUIRED');
  if(!benchmarkResult?.evidence_receipt_id)blockers.push('REAL_EVIDENCE_RECEIPT_REQUIRED');
  if(total<cfg.min_verified_targets)blockers.push('MIN_VERIFIED_TARGETS_NOT_MET');
  if(all<cfg.min_holdout_points)blockers.push('MIN_HOLDOUT_POINTS_NOT_MET');
  if(stable<cfg.min_stable_instrument_points)blockers.push('MIN_STABLE_INSTRUMENT_POINTS_NOT_MET');
  if(driftFraction>cfg.max_instrument_drift_fraction)blockers.push('INSTRUMENT_DRIFT_TOO_HIGH');

  const baseline=b?.brier?.observational;
  const candidates=['bkt','dsr'];
  const reports={};

  for(const c of candidates){
    const score=b?.brier?.[c];
    const cal=calibration(b.points||[],c);
    const sparse=sparsePerformance(b.points||[],c,2);
    const sparseBase=sparsePerformance(b.points||[],'observational',2);
    const candidateBlockers=[];

    if(!Number.isFinite(score)||!Number.isFinite(baseline))candidateBlockers.push('BRIER_UNAVAILABLE');
    else{
      const improvement=baseline-score;
      if(improvement<cfg.min_brier_improvement)candidateBlockers.push('BRIER_IMPROVEMENT_TOO_SMALL');
      if(score-baseline>cfg.max_brier_degradation_vs_baseline)candidateBlockers.push('BRIER_WORSE_THAN_BASELINE');
    }

    if(!cal.ok||!Number.isFinite(cal.calibration_mae))candidateBlockers.push('CALIBRATION_UNAVAILABLE');
    else if(cal.calibration_mae>cfg.max_calibration_mae)candidateBlockers.push('CALIBRATION_ERROR_TOO_HIGH');

    if(sparse.ok&&sparseBase.ok&&sparse.brier-sparseBase.brier>cfg.max_sparse_brier_degradation){
      candidateBlockers.push('SPARSE_DATA_DEGRADATION');
    }

    reports[c]={
      brier:score,
      baseline_brier:baseline,
      brier_improvement:Number.isFinite(score)&&Number.isFinite(baseline)?baseline-score:null,
      calibration:cal,
      sparse,
      sparse_baseline:sparseBase,
      blockers:candidateBlockers,
      review_eligible:blockers.length===0&&candidateBlockers.length===0
    };
  }

  const anyEligible=Object.values(reports).some(r=>r.review_eligible);
  if(!anyEligible)warnings.push('NO_CANDIDATE_READY_FOR_PROMOTION_REVIEW');

  return {
    ok:true,
    policy_version:'TAKY_ESTIMATOR_PROMOTION_POLICY_V1',
    thresholds:cfg,
    dataset_blockers:blockers,
    drift_fraction:driftFraction,
    candidate_reports:reports,
    promotion_review_available:blockers.length===0&&anyEligible,
    auto_promotion:false,
    warnings
  };
}

module.exports=Object.freeze({DEFAULTS,calibration,sparsePerformance,evaluatePromotion});
