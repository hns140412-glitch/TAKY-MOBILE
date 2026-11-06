'use strict';

const VERSION='TAKY_PEDAGOGICAL_FEEDBACK_INTENT_V1';

function derive(state={}){
  if(!state?.ok)return {ok:false,reason:'LEARNER_STATE_REQUIRED'};

  const intents=[];
  const inferred=state.inferred||{};
  const observed=state.observed||{};
  const addIntent=(intent,priority,basis,extra={})=>{
    const existing=intents.find(x=>x.intent===intent);
    if(existing){
      existing.bases=[...(existing.bases||[existing.basis]),basis].filter(Boolean);
      delete existing.basis;
      if(priority==='HIGH'||(priority==='MEDIUM'&&existing.priority==='LOW'))existing.priority=priority;
      Object.assign(existing,extra);
      return;
    }
    intents.push({intent,priority,basis,...extra});
  };

  if(inferred.repeated_confusion_signal==='REPEATED_SELF_REPORTED_CONFUSION'){
    addIntent('DISAMBIGUATE_CONFUSION','HIGH','REPEATED_SELF_REPORTED_CONFUSION',{
      targets:(observed.self_reflection?.repeated_confusions||[]).map(x=>x.target)
    });
  }

  if(inferred.metacognitive_recall_signal==='KNEW_BUT_RECALL_FAILED_REPORTED'){
    addIntent('SHORT_DELAY_RETRIEVAL','MEDIUM','KNEW_BUT_RECALL_FAILED_REPORTED');
  }

  if(inferred.assistance_dependency_signal==='ASSISTANCE_DOMINANT'){
    addIntent('REDUCE_ASSISTANCE_GRADUALLY','MEDIUM','ASSISTANCE_DOMINANT');
  }

  if(inferred.retention_signal==='RETENTION_AT_RISK'){
    addIntent('RETRIEVAL_CHECKPOINT','HIGH','RETENTION_AT_RISK');
  }

  if(inferred.recovery_signal==='UNRESOLVED_RECOVERY'){
    addIntent('TARGETED_RECOVERY_PRACTICE','HIGH','UNRESOLVED_RECOVERY');
  }

  if(inferred.trend==='DECLINING'){
    addIntent('RETRIEVAL_CHECKPOINT','HIGH','DECLINING_MEMORY_TREND');
  }else if(inferred.trend==='IMPROVING'){
    addIntent('MAINTAIN_CHALLENGE','LOW','IMPROVING_MEMORY_TREND');
  }

  if(!intents.length){
    addIntent('CONTINUE_OBSERVATION','LOW','NO_STRONG_PEDAGOGICAL_SIGNAL');
  }

  return {
    ok:true,
    intent_contract:VERSION,
    scope:state.scope,
    intents,
    authority:'PEDAGOGICAL_INTENT_ONLY',
    can_influence:['ACTIVITY_SEQUENCE','CHECKPOINT_SELECTION','FEEDBACK_FOCUS','RECOVERY_INTENSITY'],
    cannot_influence:['SCHEDULE_DATE','PLANNER_DATE','DUE_AT','DEADLINE','ASSIGNMENT_FACT'],
    ui_copy_owned_by:'CONSUMER_APP'
  };
}

function validate(result={}){
  const issues=[];
  if(!result?.ok)issues.push('RESULT_NOT_OK');
  if(result.authority!=='PEDAGOGICAL_INTENT_ONLY')issues.push('AUTHORITY_INVALID');
  if(result.ui_copy_owned_by!=='CONSUMER_APP')issues.push('UI_COPY_OWNERSHIP_INVALID');
  const forbidden=['schedule_date','planner_date','due_at','due_date','deadline'];
  const hasForbidden=(v)=>{
    if(!v||typeof v!=='object')return false;
    for(const [k,n] of Object.entries(v)){
      if(forbidden.includes(k))return true;
      if(hasForbidden(n))return true;
    }
    return false;
  };
  if(hasForbidden(result))issues.push('SCHEDULE_AUTHORITY_LEAK');
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,derive,validate});
