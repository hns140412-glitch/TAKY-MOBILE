'use strict';

const Selector=require('../pedagogy/grade-aware-term-selector.js');

const VERSION='TAKY_TERM_RECOMMENDATION_RUNTIME_V1';

function derive(input={}){
  const selected=Selector.select({
    learner_profile:input.learner_profile||{},
    subject:input.subject,
    semester:input.semester,
    unit_context:input.unit_context||[],
    candidate_terms:input.curriculum_terms||[],
    term_evidence:input.term_evidence||[],
    consumer_app:input.consumer_app||'HIDE_SEEK',
    limit:input.limit,
    allow_provisional:input.allow_provisional===true
  });
  if(!selected.ok)return {ok:false,reason:selected.reason,term_runtime:VERSION,detail:selected};
  const valid=Selector.validate(selected);
  if(!valid.ok)return {ok:false,reason:'TERM_SELECTION_INVALID',issues:valid.issues,term_runtime:VERSION};
  return {
    ok:true,
    term_runtime:VERSION,
    authority:'TAKY_LEARNING_ENGINE_CORE',
    projection_type:'GRADE_AWARE_TERM_RECOMMENDATION',
    consumer_app:selected.consumer_app,
    learner_context:selected.learner_context,
    scope:selected.scope,
    recommendation_state:selected.recommendation_state,
    term_recommendations:selected.recommendations,
    cards:selected.recommendations.map(x=>x.term_card),
    trace:{
      selector_version:selected.selector_version,
      selected_term_ids:selected.recommendations.map(x=>x.term_id),
      source_refs:[...new Set(selected.recommendations.map(x=>x.source_ref).filter(Boolean))],
      rejected:selected.rejected
    },
    can_influence:selected.can_influence,
    cannot_influence:selected.cannot_influence
  };
}

function validate(result={}){
  const issues=[];
  if(result?.ok!==true)issues.push('TERM_RUNTIME_NOT_OK');
  if(result.authority!=='TAKY_LEARNING_ENGINE_CORE')issues.push('AUTHORITY_INVALID');
  if(result.projection_type!=='GRADE_AWARE_TERM_RECOMMENDATION')issues.push('PROJECTION_TYPE_INVALID');
  if(!Array.isArray(result.cards))issues.push('CARDS_REQUIRED');
  if((result.cards||[]).length!==(result.term_recommendations||[]).length)issues.push('CARD_RECOMMENDATION_COUNT_MISMATCH');
  if((result.term_recommendations||[]).some(x=>!x.source_ref))issues.push('SOURCE_REF_REQUIRED');
  if(!result.learner_context?.school_stage)issues.push('SCHOOL_STAGE_REQUIRED');
  if(!result.scope?.subject)issues.push('SUBJECT_REQUIRED');
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,derive,validate});
