'use strict';
/**
 * Central read-only review signals from server-durable, independently scoped
 * observation rows. Observation-only evidence may request a safe pedagogical
 * follow-up, but it must never become correctness, verified performance,
 * mastery, retention calibration, award, or a dated task.
 */
const crypto=require('node:crypto');
const VERSION='TAKY_OBSERVATION_REVIEW_INTENT_V2';
const clean=x=>typeof x==='string'?x.trim():'';
const PLAY_COMPLETION_STATES=new Set([
 'BLEND_SEQUENCE_COMPLETED','TEN_BOND_COMPLETED','FINAL_GUIDE_STEP_REACHED',
 'CREATION_SAVED','FOLDED_VIEW_REACHED'
]);

function sameScope(row,scope){
 return row?.member_id===scope.member_id&&
  clean(row.subject).toLowerCase()===clean(scope.subject).toLowerCase()&&
  clean(row.concept_skill_target).toLowerCase()===clean(scope.concept_skill_target).toLowerCase();
}

function hideObservation(row,scope){
 if(!sameScope(row,scope)||
    row?.source_app!=='ready-set'||row?.raw_app_signals?.forwarded_hide_observation!==true||
    row?.verified_outcome!==null||row?.evidence_type!=='MEMORY_RETRIEVAL_EVIDENCE'||
    row?.memory?.next_review_semantics!=='ADVISORY_SIGNAL_NOT_DATE')return null;
 if(!clean(row.event_id)||!Number.isFinite(Date.parse(row.observed_at||''))||
    !clean(row.instrument_version))return null;
 const advisories=(Array.isArray(row.memory.review_advisories)?row.memory.review_advisories:[])
  .filter(x=>x?.advisoryOnly===true&&x.evidenceBasis==='HIDE_MEMORY_EVIDENCE'&&
    clean(x.lexicalId)&&
    (x.needsUnassistedRecall===true||
     (Number.isFinite(x.nextReviewPriority)&&x.nextReviewPriority>0)))
  .slice(0,24)
  .map(x=>({lexicalId:clean(x.lexicalId),
   nextReviewPriority:Number.isFinite(x.nextReviewPriority)
    ?Math.max(0,Math.min(100,x.nextReviewPriority)):0,
   needsUnassistedRecall:x.needsUnassistedRecall===true,
   advisoryOnly:true,evidenceBasis:'HIDE_MEMORY_EVIDENCE'}));
 if(!advisories.length)return null;
 const strength=typeof row.memory.average_strength==='number'?row.memory.average_strength:null;
 return {
  event_id:row.event_id,observed_at:row.observed_at,
  member_id:scope.member_id,subject:scope.subject,
  concept_skill_target:scope.concept_skill_target,
  evidence_type:'MEMORY_RETRIEVAL_EVIDENCE',source_app:'ready-set',
  instrument_version:row.instrument_version,
  verified_performance:false,verified_outcome:null,observation_only:true,
  observation_lane:'HIDE_MEMORY_ADVISORY',
  memory:{average_strength:Number.isFinite(strength)&&strength>=0&&strength<=100?strength:null,
   review_advisories:advisories}
 };
}

function playObservation(row,scope){
 if(!sameScope(row,scope)||row?.source_app!=='play-camp'||
    row?.verified_outcome!==null||row?.evidence_type!=='PLAY_ACTIVITY_OBSERVATION')return null;
 if(!clean(row.event_id)||!Number.isFinite(Date.parse(row.observed_at||''))||
    !clean(row.instrument_version)||!clean(row?.raw_app_signals?.activity_id))return null;
 const raw=row.raw_app_signals||{};
 const target=clean(row.learning_target_id)||clean(raw.activity_id);
 if(!target)return null;
 return {
  event_id:row.event_id,observed_at:row.observed_at,
  member_id:scope.member_id,subject:scope.subject,
  concept_skill_target:scope.concept_skill_target,
  learning_target_id:target,
  evidence_type:'PLAY_ACTIVITY_OBSERVATION',source_app:'play-camp',
  instrument_version:row.instrument_version,
  verified_performance:false,verified_outcome:null,observation_only:true,
  observation_lane:'PLAY_ACTIVITY_ADVISORY',
  assistance:clean(row.assistance)||'UNKNOWN',
  assisted:row.assisted===true?true:row.assisted===false?false:null,
  attempt_count:Number.isInteger(row.attempt_count)?row.attempt_count:null,
  play:{
   activity_id:clean(raw.activity_id),
   loop_step:clean(raw.loop_step)||null,
   completion_state:clean(raw.completion_state)||null,
   creation_saved:raw.creation_saved===true,
   interaction_count:Number.isFinite(raw.interaction_count)?raw.interaction_count:null,
   response_correct:typeof raw.response_correct==='boolean'?raw.response_correct:null,
   response_class:clean(raw.response_class)||null,
   hint_level_observed:['GENERAL','TARGETED','STEP_BY_STEP'].includes(raw.hint_level_observed)?raw.hint_level_observed:null,
   explanation_observed:raw.explanation_observed===true?true:raw.explanation_observed===false?false:null,
   transfer_observed:raw.transfer_observed===true?true:raw.transfer_observed===false?false:null,
   same_concept_confirmed:raw.same_concept_confirmed===true?true:raw.same_concept_confirmed===false?false:null
  }
 };
}

function nextPlayObservationFocus(row){
 if(row?.observation_lane!=='PLAY_ACTIVITY_ADVISORY')return null;
 const p=row.play||{};
 // A recorded wrong answer or multiple attempts asks for a reason check, not a mastery inference.
 if(p.response_correct===false||(Number.isInteger(row.attempt_count)&&row.attempt_count>1))return 'OBSERVE_ERROR_REASON';
 if(p.explanation_observed!==true)return 'OBSERVE_EXPLANATION';
 if(p.transfer_observed!==true||p.same_concept_confirmed!==true)return 'OBSERVE_SAME_CONCEPT_IN_ANOTHER_CONTEXT';
 return 'CONTINUE_OBSERVATION';
}

function prepare(rows=[],scope={}){
 if(!clean(scope.member_id)||!clean(scope.subject)||!clean(scope.concept_skill_target))
  return {ok:false,reason:'EXPLICIT_LEARNER_SCOPE_REQUIRED'};
 const evidence=[];
 const seenEventIds=new Set();
 for(const row of(Array.isArray(rows)?rows:[])){
  const normalized=hideObservation(row,scope)||playObservation(row,scope);
  if(!normalized||seenEventIds.has(normalized.event_id))continue;
  seenEventIds.add(normalized.event_id);
  evidence.push(normalized);
 }
 evidence.sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at)||
  a.event_id.localeCompare(b.event_id));
 const latest=evidence.slice(-120);
 const digest=latest.length?crypto.createHash('sha256')
  .update(JSON.stringify(latest)).digest('hex'):null;
 const hide=latest.filter(x=>x.observation_lane==='HIDE_MEMORY_ADVISORY');
 const play=latest.filter(x=>x.observation_lane==='PLAY_ACTIVITY_ADVISORY');
 return {ok:true,policy_version:VERSION,advisory_only:true,
  actionable:latest.length>0,evidence:latest,
  evidence_ids:latest.map(x=>x.event_id),basis_digest_sha256:digest,
  lane_counts:{hide_memory:hide.length,play_activity:play.length},
  play_observation_focus:play.length?nextPlayObservationFocus(play[play.length-1]):null};
}

function upsertIntent(intents,intent,priority,basis,targets=[]){
 const existing=intents.find(x=>x.intent===intent);
 if(existing){
  const bases=Array.isArray(existing.bases)?existing.bases:[existing.basis].filter(Boolean);
  existing.bases=[...new Set([...bases,basis])];
  delete existing.basis;
  if(priority==='HIGH'||(priority==='MEDIUM'&&existing.priority==='LOW'))existing.priority=priority;
  existing.targets=[...new Set([...(existing.targets||[]),...targets])].slice(0,24);
  return;
 }
 intents.push({intent,priority,basis,targets:[...new Set(targets)].slice(0,24)});
}

function augmentFeedback(feedback,prepared){
 if(feedback?.ok!==true||prepared?.ok!==true)
  return {ok:false,reason:'VALID_FEEDBACK_AND_DURABLE_ADVISORY_REQUIRED'};
 if(!prepared.actionable)return feedback;
 const intents=[...feedback.intents.map(x=>({...x}))];
 const hide=prepared.evidence.filter(x=>x.observation_lane==='HIDE_MEMORY_ADVISORY');
 const play=prepared.evidence.filter(x=>x.observation_lane==='PLAY_ACTIVITY_ADVISORY');

 if(hide.length){
  const targets=[...new Set(hide.slice().reverse().flatMap(x=>
    (x.memory?.review_advisories||[]).map(a=>clean(a.lexicalId)).filter(Boolean)))].slice(0,24);
  upsertIntent(intents,'RETRIEVAL_CHECKPOINT','HIGH','HIDE_MEMORY_ADVISORY_ONLY',targets);
 }

 if(play.length){
  // Play Camp observations are deliberately weak evidence. Completion, taps,
  // guide navigation and creation capture can inform what to observe next, but
  // they cannot by themselves justify challenge escalation, recovery, mastery
  // or assistance fading. Stronger intents must come from independently
  // verified evidence or another governed specialist lane.
  const targets=[...new Set(play.slice().reverse()
   .map(x=>clean(x.learning_target_id)).filter(Boolean))].slice(0,24);
  upsertIntent(intents,'CONTINUE_OBSERVATION','LOW','PLAY_CAMP_OBSERVATION_ONLY',targets);
 }

 return {...feedback,intents,observation_review_authority:VERSION,
  play_observation_focus:prepared.play_observation_focus||null};
}

module.exports=Object.freeze({VERSION,PLAY_COMPLETION_STATES,prepare,augmentFeedback});
