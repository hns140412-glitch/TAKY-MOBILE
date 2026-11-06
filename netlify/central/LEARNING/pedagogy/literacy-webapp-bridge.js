'use strict';

const VERSION='TAKY_LITERACY_WEBAPP_BRIDGE_V1';
const clean=v=>String(v??'').trim();
const upper=v=>clean(v).toUpperCase();

const ONDOK_ELEMENTARY=Object.freeze({
  E1:{min:100,max:130}, E2:{min:135,max:170}, E3:{min:160,max:200},
  E4:{min:175,max:235}, E5:{min:225,max:285}, E6:{min:265,max:325}
});

function stageBand(stage){
  return ONDOK_ELEMENTARY[upper(stage)]||null;
}

function materialDifficulty(stage,ondok){
  const band=stageBand(stage);
  const n=Number(ondok);
  if(!band||!Number.isFinite(n))return {state:'UNKNOWN',band};
  if(n<band.min)return {state:'BELOW_GRADE_REFERENCE_BAND',band,value:n};
  if(n>band.max)return {state:'ABOVE_GRADE_REFERENCE_BAND',band,value:n};
  return {state:'IN_GRADE_REFERENCE_BAND',band,value:n};
}

function modeBias(priority){
  const p=upper(priority);
  if(p==='RECOVERY')return ['CORE','RECALL'];
  if(p==='DISCOVERY')return ['TRACE','LINK','CORE'];
  return ['RECALL'];
}

function derive(input={}){
  const schoolStage=upper(input.learner_profile?.school_stage||input.school_stage);
  const band=stageBand(schoolStage);
  if(!band)return {ok:false,reason:'ELEMENTARY_SCHOOL_STAGE_E1_E6_REQUIRED',bridge_version:VERSION};

  const terms=Array.isArray(input.term_recommendations)?input.term_recommendations:[];
  const academicTargets=Array.isArray(input.academic_vocabulary_targets)?input.academic_vocabulary_targets:[];
  const difficulty=materialDifficulty(schoolStage,input.reading_material?.ondok_index);
  const sourceRefs={
    academic_vocabulary:clean(input.source_refs?.academic_vocabulary),
    ondok:clean(input.source_refs?.ondok),
    writing_transfer:clean(input.source_refs?.writing_transfer)
  };
  const hasRecovery=terms.some(x=>upper(x.priority)==='RECOVERY');

  const hideTargets=terms.map(x=>({
    term_id:clean(x.term_id||x.id),
    term:clean(x.term),
    priority:upper(x.priority||'REINFORCE'),
    mode_bias:modeBias(x.priority),
    source_ref:clean(x.source_ref||sourceRefs.academic_vocabulary)
  })).filter(x=>x.term_id&&x.term);

  // Source-informed but TAKY-derived 4-step sequence.
  // CNE source explicitly supports 따라쓰기/다시쓰기/사고도구어 익히기;
  // APPLY_TO_NEW_CONTEXT is TAKY's transfer step, not claimed as verbatim source content.
  const snapSequence=[
    {stage:'MODEL',intent:'COPY_OR_READ_MODEL'},
    {stage:'RESTATE',intent:'RESTATE_IN_OWN_WORDS'},
    {stage:'ACADEMIC_TERM',intent:'USE_TARGET_ACADEMIC_TERM'},
    {stage:'TRANSFER',intent:'APPLY_TO_NEW_CONTEXT',derivation:'TAKY_DERIVED'}
  ];

  let readyIntent='KEEP_NORMAL_EXECUTION';
  if(difficulty.state==='ABOVE_GRADE_REFERENCE_BAND'||hasRecovery)readyIntent='FOCUSED_REMEDIATION';
  else if(difficulty.state==='BELOW_GRADE_REFERENCE_BAND')readyIntent='ACCESSIBLE_READING_REINFORCEMENT';

  return {
    ok:true,
    bridge_version:VERSION,
    authority:'LEARNING_INTENT_TRANSLATION_ONLY',
    learner_context:{school_stage:schoolStage},
    source_signals:{
      academic_vocabulary:{framework:'CNE_ACADEMIC_VOCABULARY_1387',source_ref:sourceRefs.academic_vocabulary||null},
      reading_material:{ondok_index:difficulty.value??null,difficulty_state:difficulty.state,grade_reference_band:band,source_ref:sourceRefs.ondok||null},
      writing_transfer:{source_ref:sourceRefs.writing_transfer||null,sequence_basis:'SOURCE_INSPIRED_TAKY_DERIVED'}
    },
    consumers:{
      hide_seek:{
        intent:'TERM_DECODING_AND_RETRIEVAL',
        targets:hideTargets,
        academic_vocabulary_targets:academicTargets,
        academic_vocabulary_boundary:'NO_DEFINITION_OR_HANJA_INVENTION',
        can_use:['TRACE','LINK','CORE','RECALL']
      },
      snap_pop:{
        intent:'READ_TO_WRITE_CONCEPT_TRANSFER',
        target_term_ids:hideTargets.map(x=>x.term_id),
        academic_vocabulary_targets:academicTargets,
        activity_sequence:snapSequence
      },
      ready_set:{
        intent:readyIntent,
        planner_boundary:'READY_PLANNER_OWNS_DATED_ALLOCATION',
        target_learning_ids:hideTargets.map(x=>x.term_id),
        material_difficulty_state:difficulty.state
      }
    },
    evidence_contract:{
      common_fields:['learning_target_id','subject','unit_id','interaction_mode','result_type','assisted','observed_at','source_ref'],
      optional_literacy_fields:['academic_vocab_level','reading_material_ondok','writing_transfer_stage','response_latency_ms','confusion_target_id']
    },
    can_influence:[
      'TERM_SELECTION','ACTIVITY_SEQUENCE','HINT_DEPTH','RETRIEVAL_CHECKPOINT',
      'READING_MATERIAL_DIFFICULTY_SIGNAL','WRITING_TRANSFER_ACTIVITY','REMEDIATION_INTENT'
    ],
    cannot_influence:[
      'SCHEDULE_DATE','PLANNER_DATE','DUE_AT','DEADLINE','ASSIGNMENT_FACT',
      'MASTERY_CLAIM','LEARNER_ABILITY_FROM_ONDOK_ALONE'
    ]
  };
}

function validate(result={}){
  const issues=[];
  if(result?.ok!==true)issues.push('BRIDGE_NOT_OK');
  if(result.authority!=='LEARNING_INTENT_TRANSLATION_ONLY')issues.push('AUTHORITY_INVALID');
  if(!result.learner_context?.school_stage)issues.push('SCHOOL_STAGE_MISSING');
  if(!result.consumers?.hide_seek||!result.consumers?.snap_pop||!result.consumers?.ready_set)issues.push('CONSUMER_MAPPING_INCOMPLETE');
  const forbidden=new Set(['schedule_date','planner_date','due_at','due_date','deadline']);
  const walk=v=>{
    if(!v||typeof v!=='object')return false;
    for(const [k,n] of Object.entries(v)){if(forbidden.has(k))return true;if(walk(n))return true;}
    return false;
  };
  if(walk(result))issues.push('SCHEDULE_AUTHORITY_LEAK');
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,ONDOK_ELEMENTARY,stageBand,materialDifficulty,derive,validate});
