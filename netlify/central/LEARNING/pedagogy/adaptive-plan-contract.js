'use strict';

const VERSION='TAKY_ADAPTIVE_PLAN_INTENT_V1';
const clean=v=>String(v??'').trim();

function derive(feedback_intent={}){
  if(feedback_intent?.ok!==true)return {ok:false,reason:'FEEDBACK_INTENT_REQUIRED'};
  const intents=Array.isArray(feedback_intent.intents)?feedback_intent.intents:[];
  const names=new Set(intents.map(x=>clean(x.intent)).filter(Boolean));
  const targetIds=[...new Set(intents.flatMap(x=>Array.isArray(x.targets)?x.targets:[]).map(clean).filter(Boolean))];

  const targetedRecovery=names.has('TARGETED_RECOVERY_PRACTICE');
  const retrieval=names.has('RETRIEVAL_CHECKPOINT')||names.has('SHORT_DELAY_RETRIEVAL');
  const confusion=names.has('DISAMBIGUATE_CONFUSION');
  const fadeAssistance=names.has('REDUCE_ASSISTANCE_GRADUALLY');
  const adjacentVariation=names.has('OFFER_ADJACENT_VARIATION');

  return {
    ok:true,
    adaptive_plan_contract:VERSION,
    authority:'LEARNING_ADAPTIVE_PLAN_INTENT_ONLY',
    scope:feedback_intent.scope||null,
    unit_span_policy:targetedRecovery?'REDUCE':'KEEP',
    add_checkpoint:targetedRecovery||retrieval||confusion,
    add_retrieval_checkpoint:retrieval||targetedRecovery,
    recovery_floor:targetedRecovery?'HIGH':retrieval?'MEDIUM':null,
    assistance_policy:fadeAssistance?'FADE_GRADUALLY':'UNCHANGED',
    activity_sequence_policy:adjacentVariation?'ADJACENT_VARIATION':'UNCHANGED',
    target_learning_ids:targetIds,
    rationale:intents.map(x=>({
      intent:clean(x.intent),
      priority:clean(x.priority)||'LOW',
      bases:Array.isArray(x.bases)?x.bases:[x.basis].filter(Boolean)
    })),
    can_influence:[
      'LEARNING_UNIT_SPAN_POLICY',
      'ACTIVITY_SEQUENCE',
      'RECOVERY_INTENSITY',
      'CHECKPOINT_SELECTION',
      'ASSISTANCE_FADING'
    ],
    cannot_influence:[
      'SCHEDULE_DATE',
      'PLANNER_DATE',
      'DUE_AT',
      'DEADLINE',
      'ASSIGNMENT_FACT',
      'SUBJECT_SOURCE_FACT'
    ]
  };
}

function validate(plan={}){
  const issues=[];
  if(plan?.ok!==true)issues.push('PLAN_NOT_OK');
  if(plan.authority!=='LEARNING_ADAPTIVE_PLAN_INTENT_ONLY')issues.push('AUTHORITY_INVALID');
  if(!['REDUCE','KEEP'].includes(plan.unit_span_policy))issues.push('UNIT_SPAN_POLICY_INVALID');
  if(!['ADJACENT_VARIATION','UNCHANGED'].includes(plan.activity_sequence_policy))issues.push('ACTIVITY_SEQUENCE_POLICY_INVALID');
  const forbidden=['schedule_date','planner_date','due_at','due_date','deadline'];
  const walk=v=>{
    if(!v||typeof v!=='object')return false;
    for(const [k,n] of Object.entries(v)){
      if(forbidden.includes(k))return true;
      if(walk(n))return true;
    }
    return false;
  };
  if(walk(plan))issues.push('SCHEDULE_AUTHORITY_LEAK');
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,derive,validate});
