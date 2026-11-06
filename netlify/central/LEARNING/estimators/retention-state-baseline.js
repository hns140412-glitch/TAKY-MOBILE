(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.TakyRetentionStateBaseline=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

const VERSION='TAKY_RETENTION_STATE_BASELINE_V1';
const clean=v=>String(v??'').trim();
const clamp=(x,min=0,max=1)=>Math.max(min,Math.min(max,x));

function validVerifiedRetrieval(row={}){
  return clean(row.evidence_type)==='MEMORY_RETRIEVAL_EVIDENCE' &&
    (row.verified_outcome===0||row.verified_outcome===1) &&
    clean(row?.verification?.authority)==='LEARNING_VERIFICATION_RECEIPT';
}

function derive(rows=[],options={}){
  const seq=(Array.isArray(rows)?rows:[])
    .filter(validVerifiedRetrieval)
    .slice()
    .sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at)||clean(a.event_id).localeCompare(clean(b.event_id)));

  if(!seq.length){
    return {
      ok:true,
      estimator_id:'RETENTION_STATE_BASELINE',
      estimator_version:VERSION,
      evidence_count:0,
      retention_state:'UNKNOWN',
      forgetting_risk:'UNKNOWN',
      confidence:'VERY_LOW',
      stability_days:null,
      retrievability_estimate:null,
      scheduling_authority:false,
      promoted:false,
      explanation:'No verified retrieval evidence is available.'
    };
  }

  const now=Number.isFinite(options.now_ms)?options.now_ms:Date.parse(seq.at(-1).observed_at);
  const latest=seq.at(-1);
  const successes=seq.filter(x=>x.verified_outcome===1);
  const consecutiveSuccesses=(()=>{
    let n=0;
    for(let i=seq.length-1;i>=0;i--){
      if(seq[i].verified_outcome===1)n++;
      else break;
    }
    return n;
  })();

  const observedIntervals=[];
  for(let i=1;i<seq.length;i++){
    const d=(Date.parse(seq[i].observed_at)-Date.parse(seq[i-1].observed_at))/(1000*60*60*24);
    if(Number.isFinite(d)&&d>=0)observedIntervals.push(d);
  }

  const meanInterval=observedIntervals.length?observedIntervals.reduce((a,b)=>a+b,0)/observedIntervals.length:1;
  const strengthValues=seq
    .map(x=>Number(x?.memory?.average_strength))
    .filter(Number.isFinite)
    .map(x=>clamp(x/100));
  const lastStrength=strengthValues.length?strengthValues.at(-1):(latest.verified_outcome===1?0.70:0.35);

  const stabilityDays=Math.max(
    1,
    1.5 +
    consecutiveSuccesses*1.75 +
    Math.min(10,successes.length)*0.35 +
    lastStrength*4 +
    Math.min(7,meanInterval)*0.25
  );

  const daysSinceLast=Math.max(0,(now-Date.parse(latest.observed_at))/(1000*60*60*24));
  const retrievability=clamp(Math.exp(-daysSinceLast/stabilityDays));
  const confidence=seq.length>=8?'MEDIUM':seq.length>=4?'LOW':'VERY_LOW';

  let forgettingRisk='LOW';
  if(retrievability<0.45)forgettingRisk='HIGH';
  else if(retrievability<0.70)forgettingRisk='MEDIUM';

  let retentionState='STABLE';
  if(latest.verified_outcome===0)retentionState='UNSTABLE';
  else if(forgettingRisk==='HIGH')retentionState='RETENTION_AT_RISK';
  else if(seq.length<3)retentionState='EMERGING';

  return {
    ok:true,
    estimator_id:'RETENTION_STATE_BASELINE',
    estimator_version:VERSION,
    evidence_count:seq.length,
    verified_success_count:successes.length,
    consecutive_successes:consecutiveSuccesses,
    last_verified_outcome:latest.verified_outcome,
    last_observed_at:latest.observed_at,
    mean_observed_interval_days:Math.round(meanInterval*100)/100,
    stability_days:Math.round(stabilityDays*100)/100,
    days_since_last:Math.round(daysSinceLast*100)/100,
    retrievability_estimate:Math.round(retrievability*1000)/1000,
    retention_state:retentionState,
    forgetting_risk:forgettingRisk,
    confidence,
    scheduling_authority:false,
    promoted:false,
    explanation:'Explainable baseline only. It estimates retention risk from verified retrieval history and elapsed time, and never chooses a review date.',
    cannot_influence:['SCHEDULE_DATE','PLANNER_DATE','DUE_AT','DEADLINE']
  };
}

function selfValidate(result={}){
  const issues=[];
  if(!result?.ok)issues.push('RESULT_NOT_OK');
  if(result.scheduling_authority!==false)issues.push('SCHEDULING_AUTHORITY_MUST_BE_FALSE');
  if(result.promoted!==false)issues.push('BASELINE_CANNOT_SELF_PROMOTE');
  if(result.retrievability_estimate!==null&&
    (!Number.isFinite(result.retrievability_estimate)||result.retrievability_estimate<0||result.retrievability_estimate>1)){
    issues.push('RETRIEVABILITY_INVALID');
  }
  for(const k of ['schedule_date','planner_date','due_at','due_date']){
    if(Object.prototype.hasOwnProperty.call(result,k))issues.push('SCHEDULE_AUTHORITY_LEAK');
  }
  return {ok:issues.length===0,issues};
}

  return Object.freeze({VERSION,validVerifiedRetrieval,derive,selfValidate});
});