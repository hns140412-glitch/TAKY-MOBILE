'use strict';

const VERSION='TAKY_SELF_REFLECTION_EVIDENCE_V1';
const clean=v=>String(v??'').trim();

const DIFFICULTY=new Set(['EASY','OK','HARD','VERY_HARD','UNKNOWN']);
const RECALL=new Set(['KNEW_AND_RECALLED','KNEW_BUT_COULD_NOT_RECALL','RECALLED_WITH_HINT','DID_NOT_KNOW','UNKNOWN']);
const CONFIDENCE=new Set(['LOW','MEDIUM','HIGH','UNKNOWN']);

function create(input={}){
  const issues=[];
  const member_id=clean(input.member_id);
  const subject=clean(input.subject).toLowerCase();
  const concept_skill_target=clean(input.concept_skill_target).toLowerCase();
  const event_id=clean(input.event_id);
  const observed_at=clean(input.observed_at);
  const source_app=clean(input.source_app);
  const instrument_version=clean(input.instrument_version)||'SELF_REFLECTION_V1';
  const difficulty=clean(input.difficulty||'UNKNOWN').toUpperCase();
  const recall_state=clean(input.recall_state||'UNKNOWN').toUpperCase();
  const confidence=clean(input.confidence||'UNKNOWN').toUpperCase();
  const confusion_with=Array.isArray(input.confusion_with)?input.confusion_with.map(clean).filter(Boolean):[];

  for(const [k,v] of Object.entries({event_id,observed_at,member_id,subject,concept_skill_target,source_app})){
    if(!v)issues.push('MISSING_'+k.toUpperCase());
  }
  if(!Number.isFinite(Date.parse(observed_at)))issues.push('INVALID_TIME');
  if(!DIFFICULTY.has(difficulty))issues.push('DIFFICULTY_INVALID');
  if(!RECALL.has(recall_state))issues.push('RECALL_STATE_INVALID');
  if(!CONFIDENCE.has(confidence))issues.push('CONFIDENCE_INVALID');

  if(issues.length)return {ok:false,reason:'SELF_REFLECTION_INVALID',issues};

  return {
    ok:true,
    evidence:{
      evidence_contract:VERSION,
      event_id,
      observed_at,
      member_id,
      subject,
      concept_skill_target,
      evidence_type:'SELF_REFLECTION_EVIDENCE',
      source_app,
      instrument_version,
      interaction_mode:clean(input.interaction_mode)||'SELF_REFLECTION',
      verified_outcome:null,
      reflection:{
        difficulty,
        recall_state,
        confidence,
        confusion_with,
        used_hint:input.used_hint===true,
        notes:clean(input.notes)||null
      },
      provenance:{
        authority:'SELF_REFLECTION_OBSERVATION_ONLY',
        can_verify_performance:false,
        can_directly_set_mastery:false
      }
    }
  };
}

function validate(e={}){
  const issues=[];
  if(clean(e.evidence_type)!=='SELF_REFLECTION_EVIDENCE')issues.push('EVIDENCE_TYPE_INVALID');
  if(e.verified_outcome!==null)issues.push('SELF_REFLECTION_CANNOT_BE_VERIFIED_TARGET');
  if(clean(e?.provenance?.authority)!=='SELF_REFLECTION_OBSERVATION_ONLY')issues.push('AUTHORITY_INVALID');
  if(e?.provenance?.can_directly_set_mastery!==false)issues.push('MASTERY_AUTHORITY_FORBIDDEN');
  return {ok:issues.length===0,issues};
}

function summarize(rows=[]){
  const reflections=(Array.isArray(rows)?rows:[]).filter(e=>clean(e.evidence_type)==='SELF_REFLECTION_EVIDENCE'&&validate(e).ok);
  const counts={difficulty:{},recall_state:{},confidence:{}};
  const confusion=new Map();
  let hints=0;
  for(const e of reflections){
    const r=e.reflection||{};
    counts.difficulty[r.difficulty]=(counts.difficulty[r.difficulty]||0)+1;
    counts.recall_state[r.recall_state]=(counts.recall_state[r.recall_state]||0)+1;
    counts.confidence[r.confidence]=(counts.confidence[r.confidence]||0)+1;
    if(r.used_hint===true)hints++;
    for(const x of r.confusion_with||[])confusion.set(x,(confusion.get(x)||0)+1);
  }
  const repeatedConfusions=[...confusion.entries()].filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]).map(([target,count])=>({target,count}));
  return {
    reflection_count:reflections.length,
    difficulty_counts:counts.difficulty,
    recall_state_counts:counts.recall_state,
    confidence_counts:counts.confidence,
    hint_report_count:hints,
    repeated_confusions:repeatedConfusions,
    knew_but_could_not_recall_count:counts.recall_state.KNEW_BUT_COULD_NOT_RECALL||0
  };
}

module.exports=Object.freeze({VERSION,create,validate,summarize});
