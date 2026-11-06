'use strict';

const clamp=(x,min=0,max=1)=>Math.max(min,Math.min(max,x));
const clean=v=>String(v??'').trim();

function validateSequence(rows=[]){
  const issues=[];
  const out=[];
  for(const [index,row] of (Array.isArray(rows)?rows:[]).entries()){
    const at=Date.parse(row?.observed_at||'');
    const y=row?.verified_outcome;
    if(!Number.isFinite(at))issues.push({index,reason:'INVALID_TIME'});
    if(y!==0&&y!==1)issues.push({index,reason:'VERIFIED_BINARY_OUTCOME_REQUIRED'});
    if(!clean(row?.instrument_version))issues.push({index,reason:'INSTRUMENT_VERSION_REQUIRED'});
    if(Number.isFinite(at)&&(y===0||y===1)&&clean(row?.instrument_version))out.push({...row,__at:at});
  }
  out.sort((a,b)=>a.__at-b.__at||clean(a.event_id).localeCompare(clean(b.event_id)));
  return {ok:issues.length===0,issues,rows:out};
}

function observationalPrior(history=[]){
  const n=history.length;
  const correct=history.reduce((s,x)=>s+x.verified_outcome,0);
  return {
    estimator_id:'OBSERVATIONAL_BENCHMARK_V1',
    estimator_version:'1.0.0',
    probability:clamp((correct+1)/(n+2)),
    confidence:n>=5?'MEDIUM':n>=2?'LOW':'VERY_LOW',
    promoted:false
  };
}

function bktCandidate(history=[],params={}){
  const pL0=clamp(Number.isFinite(params.pL0)?params.pL0:0.30);
  const pT=clamp(Number.isFinite(params.pT)?params.pT:0.10);
  const pG=clamp(Number.isFinite(params.pG)?params.pG:0.20);
  const pS=clamp(Number.isFinite(params.pS)?params.pS:0.10);
  let pL=pL0;
  for(const row of history){
    const y=row.verified_outcome;
    const pCorrect=pL*(1-pS)+(1-pL)*pG;
    if(y===1){
      pL=clamp((pL*(1-pS))/Math.max(1e-9,pCorrect));
    }else{
      const pIncorrect=pL*pS+(1-pL)*(1-pG);
      pL=clamp((pL*pS)/Math.max(1e-9,pIncorrect));
    }
    pL=clamp(pL+(1-pL)*pT);
  }
  const probability=clamp(pL*(1-pS)+(1-pL)*pG);
  return {
    estimator_id:'BKT_BENCHMARK_CANDIDATE',
    estimator_version:'0.1.0',
    probability,
    latent_mastery:pL,
    confidence:history.length>=5?'MEDIUM':history.length>=2?'LOW':'VERY_LOW',
    parameters:{pL0,pT,pG,pS},
    promoted:false
  };
}

function dsrMemoryCandidate(history=[],options={}){
  if(!history.length){
    return {
      estimator_id:'DSR_MEMORY_BENCHMARK_CANDIDATE',
      estimator_version:'0.1.0',
      probability:0.5,
      confidence:'VERY_LOW',
      promoted:false,
      note:'cold-start default only'
    };
  }
  const latest=history.at(-1);
  const nextAt=Number.isFinite(options.next_at)?options.next_at:latest.__at;
  const days=Math.max(0,(nextAt-latest.__at)/(1000*60*60*24));
  const strengths=history.map(x=>Number(x.memory_strength)).filter(Number.isFinite).map(x=>clamp(x/100));
  const lastStrength=strengths.length?strengths.at(-1):(latest.verified_outcome?0.75:0.35);
  const streak=(()=>{
    let n=0;
    for(let i=history.length-1;i>=0;i--){if(history[i].verified_outcome===1)n++;else break;}
    return n;
  })();
  const stabilityDays=Math.max(1,3+streak*2+lastStrength*7);
  const probability=clamp(lastStrength*Math.exp(-days/stabilityDays));
  return {
    estimator_id:'DSR_MEMORY_BENCHMARK_CANDIDATE',
    estimator_version:'0.1.0',
    probability,
    confidence:history.length>=5?'MEDIUM':history.length>=2?'LOW':'VERY_LOW',
    diagnostics:{days_since_last:Math.round(days*100)/100,stability_days:Math.round(stabilityDays*100)/100,last_strength:lastStrength},
    promoted:false,
    note:'FSRS/DSR-inspired benchmark heuristic only; not scheduler authority'
  };
}

function brier(p,y){return Math.pow(clamp(p)-y,2);}

function timeHeldOut(rows=[],options={}){
  const checked=validateSequence(rows);
  if(!checked.ok)return {ok:false,reason:'INVALID_SEQUENCE',issues:checked.issues};
  const seq=checked.rows;
  const minHistory=Number.isFinite(options.min_history)?Math.max(0,Math.floor(options.min_history)):1;
  const points=[];
  for(let i=minHistory;i<seq.length;i++){
    const history=seq.slice(0,i);
    const target=seq[i];
    const previousInstrument=history.at(-1)?.instrument_version||null;
    const instrumentChanged=previousInstrument&&target.instrument_version!==previousInstrument;
    const obs=observationalPrior(history);
    const bkt=bktCandidate(history,options.bkt_params||{});
    const dsr=dsrMemoryCandidate(history,{next_at:target.__at});
    points.push({
      history_count:history.length,
      target_event_id:target.event_id||null,
      target_learning_target_id:target.learning_target_id||null,
      target_outcome:target.verified_outcome,
      instrument_changed:!!instrumentChanged,
      predictions:{observational:obs,bkt,dsr},
      losses:{
        observational:brier(obs.probability,target.verified_outcome),
        bkt:brier(bkt.probability,target.verified_outcome),
        dsr:brier(dsr.probability,target.verified_outcome)
      }
    });
  }
  const stablePoints=points.filter(x=>!x.instrument_changed);
  const mean=(xs,key)=>xs.length?xs.reduce((s,x)=>s+x.losses[key],0)/xs.length:null;
  return {
    ok:true,
    benchmark_authority:'BENCHMARK_ONLY_NOT_RUNTIME',
    promotion_status:'NOT_ELIGIBLE_FROM_FIXTURE_ONLY',
    total_points:points.length,
    stable_instrument_points:stablePoints.length,
    instrument_change_points:points.length-stablePoints.length,
    brier:{
      observational:mean(stablePoints,'observational'),
      bkt:mean(stablePoints,'bkt'),
      dsr:mean(stablePoints,'dsr')
    },
    points
  };
}

function selfValidate(result){
  const issues=[];
  if(!result?.ok)issues.push('BENCHMARK_NOT_OK');
  if(result?.promotion_status!=='NOT_ELIGIBLE_FROM_FIXTURE_ONLY')issues.push('PROMOTION_GUARD_MISSING');
  for(const p of result?.points||[]){
    for(const pred of Object.values(p.predictions||{})){
      if(pred.promoted!==false)issues.push('CANDIDATE_PROMOTED');
      if(!Number.isFinite(pred.probability)||pred.probability<0||pred.probability>1)issues.push('PROBABILITY_INVALID');
      for(const forbidden of ['schedule_date','planner_date','due_at','due_date']){
        if(Object.prototype.hasOwnProperty.call(pred,forbidden))issues.push('SCHEDULE_AUTHORITY_LEAK');
      }
    }
  }
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({
  validateSequence,
  observationalPrior,
  bktCandidate,
  dsrMemoryCandidate,
  timeHeldOut,
  selfValidate
});
