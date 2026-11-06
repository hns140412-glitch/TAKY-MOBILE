'use strict';

const PatternRouter=require('../projection/mining-learning-pattern-router.js');
const VERSION='TAKY_GRADE_AWARE_TERM_SELECTOR_V2';
const clean=v=>String(v??'').trim();
const upper=v=>clean(v).toUpperCase();

function parseSchoolStage(value){
  const raw=upper(value);
  let m=raw.match(/^E([1-6])$/);
  if(m)return {ok:true,school_stage:raw,school_level:'ELEMENTARY',grade:Number(m[1])};
  m=raw.match(/^M([1-3])$/);
  if(m)return {ok:true,school_stage:raw,school_level:'MIDDLE',grade:Number(m[1])};
  if(raw==='PRESCHOOL')return {ok:true,school_stage:raw,school_level:'PRESCHOOL',grade:null};
  return {ok:false,reason:'SUPPORTED_SCHOOL_STAGE_REQUIRED',school_stage:raw||null};
}

function normalizeGradeBand(term={}){
  if(Array.isArray(term.school_stages)&&term.school_stages.length){
    return {school_stages:[...new Set(term.school_stages.map(upper).filter(Boolean))],min:null,max:null};
  }
  const band=clean(term.grade_band||term.gradeBand||term.grade);
  const m=band.match(/^(\d)\s*[-~]\s*(\d)$/);
  if(m)return {school_stages:[],min:Number(m[1]),max:Number(m[2])};
  if(/^\d$/.test(band))return {school_stages:[],min:Number(band),max:Number(band)};
  const min=Number(term.grade_min),max=Number(term.grade_max);
  if(Number.isFinite(min)&&Number.isFinite(max))return {school_stages:[],min,max};
  return {school_stages:[],min:null,max:null};
}

function gradeMatch(term={},profile={}){
  const stage=parseSchoolStage(profile.school_stage||profile.schoolStage);
  if(!stage.ok)return {ok:false,reason:stage.reason};
  const band=normalizeGradeBand(term);
  if(band.school_stages.length){
    return {ok:band.school_stages.includes(stage.school_stage),stage,band,kind:'SCHOOL_STAGE'};
  }
  if(stage.school_level==='ELEMENTARY'&&Number.isFinite(stage.grade)&&Number.isFinite(band.min)&&Number.isFinite(band.max)){
    return {ok:stage.grade>=band.min&&stage.grade<=band.max,stage,band,kind:'ELEMENTARY_GRADE_BAND'};
  }
  return {ok:false,reason:'TERM_GRADE_ALIGNMENT_REQUIRED',stage,band};
}

function normalizeTerm(raw={},index=0){
  const id=clean(raw.term_id||raw.id||`term-${index}`);
  const subject=upper(raw.subject);
  const alignment=raw.grade_alignment&&typeof raw.grade_alignment==='object'?raw.grade_alignment:{};
  return {
    term_id:id,
    subject,
    term:clean(raw.term),
    hanja:clean(raw.hanja),
    reading:clean(raw.reading||raw.term),
    meaning:clean(raw.meaning),
    grade_band:clean(raw.grade_band||raw.gradeBand),
    grade_min:Number.isFinite(Number(raw.grade_min))?Number(raw.grade_min):null,
    grade_max:Number.isFinite(Number(raw.grade_max))?Number(raw.grade_max):null,
    school_stages:Array.isArray(raw.school_stages)?raw.school_stages.map(upper).filter(Boolean):[],
    semester:clean(raw.semester),
    semesters:Array.isArray(raw.semesters)?raw.semesters.map(clean).filter(Boolean):[],
    unit_tags:Array.isArray(raw.unit_tags)?raw.unit_tags.map(clean).filter(Boolean)
      :Array.isArray(raw.units)?raw.units.map(clean).filter(Boolean):[],
    components:Array.isArray(raw.components)?raw.components:[],
    families:Array.isArray(raw.families)?raw.families:[],
    conceptLinks:Array.isArray(raw.conceptLinks||raw.concept_links)?(raw.conceptLinks||raw.concept_links):[],
    concept:raw.concept&&typeof raw.concept==='object'?raw.concept:{},
    example:clean(raw.example),
    meaning_source:clean(raw.meaning_source),
    morphology_source:clean(raw.morphology_source),
    component_coverage:Number.isFinite(Number(raw.component_coverage))?Number(raw.component_coverage):null,
    lexical:raw.lexical&&typeof raw.lexical==='object'?raw.lexical:null,
    readiness:raw.readiness&&typeof raw.readiness==='object'?raw.readiness:null,
    decoder_reference:raw.decoder_reference&&typeof raw.decoder_reference==='object'?raw.decoder_reference:null,
    reference_candidate:raw.reference_candidate&&typeof raw.reference_candidate==='object'?raw.reference_candidate:null,
    mining_learning_pattern:raw.mining_learning_pattern&&typeof raw.mining_learning_pattern==='object'?raw.mining_learning_pattern:null,
    source_ref:clean(alignment.source_ref||raw.source_ref),
    grade_alignment:{
      state:upper(alignment.state||raw.grade_alignment_state||''),
      authority_class:upper(alignment.authority_class||raw.authority_class||''),
      source_ref:clean(alignment.source_ref||raw.source_ref),
      reviewed:alignment.reviewed===true||raw.reviewed===true
    }
  };
}

function alignmentEligible(term,{allow_provisional=false}={}){
  const a=term.grade_alignment||{};
  const verified=['VERIFIED','REVIEWED','CURRICULUM_ALIGNED'].includes(a.state)&&!!a.source_ref;
  if(verified)return {ok:true,tier:'VERIFIED'};
  const provisional=allow_provisional&&['PROVISIONAL','CURATED'].includes(a.state)&&!!a.source_ref;
  return provisional?{ok:true,tier:'PROVISIONAL'}:{ok:false,tier:a.state||'UNSPECIFIED'};
}

function evidenceSummary(rows=[],termId=''){
  const ids=new Set([termId,`term:${termId}`]);
  const relevant=(Array.isArray(rows)?rows:[]).filter(e=>{
    const id=clean(e.term_id||e.learning_target_id||e.target_id);
    return ids.has(id);
  });
  let correct=0,wrong=0,assisted=0,recallCorrect=0,coreCorrect=0;
  let lastAt=null;
  for(const e of relevant){
    const result=upper(e.result_type||e.result);
    const mode=upper(e.interaction_mode||e.mode);
    if(result==='CORRECT'){correct++;if(mode==='RECALL')recallCorrect++;if(mode==='CORE')coreCorrect++;}
    if(['WRONG','PASS','TIMEOUT'].includes(result))wrong++;
    if(e.assisted===true||result==='HINT_USED')assisted++;
    const at=clean(e.at||e.observed_at);if(at&&(!lastAt||at>lastAt))lastAt=at;
  }
  return {count:relevant.length,correct,wrong,assisted,recallCorrect,coreCorrect,lastAt};
}

function overlapsUnit(term={},unitContext=[]){
  const wanted=new Set((Array.isArray(unitContext)?unitContext:[unitContext]).map(x=>clean(x).toLowerCase()).filter(Boolean));
  if(!wanted.size)return 0;
  return (term.unit_tags||[]).reduce((n,x)=>n+(wanted.has(clean(x).toLowerCase())?1:0),0);
}

function scoreTerm(term,evidence,context={}){
  let score=100;
  const reasons=['GRADE_MATCH'];
  const overlap=overlapsUnit(term,context.unit_context||[]);
  if(overlap){score+=20+Math.min(10,overlap*3);reasons.push('UNIT_CONTEXT_MATCH');}
  if(evidence.count===0){score+=10;reasons.push('NEW_TERM');}
  if(evidence.wrong>0){score+=Math.min(60,evidence.wrong*20);reasons.push('RECOVERY_NEEDED');}
  if(evidence.assisted>0){score+=Math.min(30,evidence.assisted*10);reasons.push('ASSISTANCE_USED');}
  if(evidence.recallCorrect>=2&&evidence.wrong===0){score-=18;reasons.push('RECALL_STABLE_DEPRIORITIZE');}
  else if(evidence.correct>0){score+=4;reasons.push('REINFORCE');}
  if(term.components.length>0&&term.hanja){score+=6;reasons.push('TERM_DECODER_READY');}
  else if(term.hanja){score+=2;reasons.push('HANJA_FORM_AVAILABLE');}
  const priority=evidence.wrong>0||evidence.assisted>0?'RECOVERY':evidence.count===0?'DISCOVERY':'REINFORCE';
  return {score,priority,reasons};
}

function toCard(term,patternPlan=null){
  return {
    id:term.term_id,
    subject:term.subject,
    term:term.term,
    hanja:term.hanja,
    reading:term.reading,
    meaning:term.meaning,
    gradeBand:term.grade_band||(
      Number.isFinite(term.grade_min)&&Number.isFinite(term.grade_max)?`${term.grade_min}-${term.grade_max}`:''
    ),
    components:term.components,
    families:term.families,
    conceptLinks:term.conceptLinks,
    concept:term.concept,
    example:term.example,
    unitContext:term.unit_tags,
    semesters:term.semesters,
    meaningSource:term.meaning_source||null,
    morphologySource:term.morphology_source||null,
    componentCoverage:term.component_coverage,
    lexicalState:term.lexical?.state||null,
    decoderReady:term.readiness?.decoder_full===true||(term.components.length>0&&!!term.hanja),
    decoderReference:term.decoder_reference?{
      sourceId:clean(term.decoder_reference.source_id),
      authorityClass:clean(term.decoder_reference.authority_class),
      literalMeaning:clean(term.decoder_reference.literal_meaning),
      binding:clean(term.decoder_reference.binding)
    }:null,
    referenceCandidate:term.reference_candidate?{
      sourceId:clean(term.reference_candidate.source_id),
      hanja:clean(term.reference_candidate.hanja),
      bindingState:clean(term.reference_candidate.binding_state)
    }:null,
    miningLearningPattern:patternPlan||term.mining_learning_pattern||null,
    source:term.source_ref||'TAKY_LEARNING_ENGINE'
  };
}

function select(input={},options={}){
  const preview=options?.mode==='BOUND_FORMING_PREVIEW_ONLY'
    && options.registry?.projection_scope?.mode==='BOUND_FORMING_PREVIEW_ONLY'
    && options.registry?.projection_scope?.operational===false;
  if(options?.mode && !preview)return {ok:false,reason:'INVALID_FORMING_PREVIEW_SCOPE',
                                  selector_version:VERSION};
  const profile=input.learner_profile||{};
  const stage=parseSchoolStage(profile.school_stage||profile.schoolStage);
  if(!stage.ok)return {ok:false,reason:stage.reason,selector_version:VERSION};
  const subject=upper(input.subject);
  if(!subject)return {ok:false,reason:'SUBJECT_REQUIRED',selector_version:VERSION};
  const limit=Math.max(1,Math.min(36,Number(input.limit)||12));
  const terms=(Array.isArray(input.candidate_terms)?input.candidate_terms:[]).map(normalizeTerm)
    .filter(t=>t.term_id&&t.term&&t.meaning&&t.subject===subject);
  const rejected={grade:0,alignment:0};
  const candidates=[];
  for(const term of terms){
    const gm=gradeMatch(term,profile);
    if(!gm.ok){rejected.grade++;continue;}
    const ae=alignmentEligible(term,{allow_provisional:input.allow_provisional===true});
    if(!ae.ok){rejected.alignment++;continue;}
    const evidence=evidenceSummary(input.term_evidence||[],term.term_id);
    const ranked=scoreTerm(term,evidence,input);
    const patternPlan=preview
      ?PatternRouter.derive(term,{evidence_summary:evidence},options.registry)
      :PatternRouter.derive(term,{evidence_summary:evidence});
    if(patternPlan.recovery?.concept_gap===true&&!ranked.reasons.includes('MINING_PATTERN_CONCEPT_GAP')){
      ranked.reasons.push('MINING_PATTERN_CONCEPT_GAP');
    }
    candidates.push({term,evidence,patternPlan,alignment_tier:ae.tier,...ranked});
  }
  candidates.sort((a,b)=>b.score-a.score||a.term.term.localeCompare(b.term.term,'ko'));
  const recommendations=candidates.slice(0,limit).map((x,i)=>({
    rank:i+1,
    term_id:x.term.term_id,
    term:x.term.term,
    subject:x.term.subject,
    priority:x.priority,
    score:x.score,
    reasons:x.reasons,
    grade_alignment_tier:x.alignment_tier,
    grade_band:x.term.grade_band||null,
    source_ref:x.term.source_ref||null,
    evidence_summary:x.evidence,
    learning_pattern_plan:x.patternPlan,
    term_card:toCard(x.term,x.patternPlan)
  }));
  return {
    ok:true,
    selector_version:VERSION,
    authority:preview?'TAKY_LEARNING_PREVIEW_NOT_OPERATIONAL':'TAKY_LEARNING_ENGINE_CORE',
    ...(preview?{preview_only:true,release_approved:false,learning_consumed:false}:{}),
    consumer_app:upper(input.consumer_app||'HIDE_SEEK'),
    learner_context:{school_stage:stage.school_stage,school_level:stage.school_level,grade:stage.grade},
    scope:{subject,semester:clean(input.semester)||null,unit_context:Array.isArray(input.unit_context)?input.unit_context:[]},
    recommendation_state:recommendations.length?'READY':'NO_ELIGIBLE_GRADE_TERMS',
    recommendations,
    rejected,
    can_influence:['TERM_SELECTION','GRADE_BAND_FILTER','RECOVERY_PRIORITY','DISCOVERY_PRIORITY','TERM_DECODER_ACTIVITY_INPUT','MINED_LEARNING_PATTERN_ROUTING'],
    cannot_influence:['SCHEDULE_DATE','PLANNER_DATE','DUE_AT','DEADLINE','ASSIGNMENT_FACT','MASTERY_CLAIM','OFFICIAL_STANDARD_CLAIM_WITHOUT_PROVENANCE']
  };
}

function validate(result={}){
  const issues=[];
  if(result?.ok!==true)issues.push('SELECTOR_NOT_OK');
  if(result.authority!=='TAKY_LEARNING_ENGINE_CORE')issues.push('AUTHORITY_INVALID');
  if(!result.learner_context?.school_stage)issues.push('GRADE_CONTEXT_MISSING');
  if(!result.scope?.subject)issues.push('SUBJECT_MISSING');
  for(const r of result.recommendations||[]){
    if(!r.term_id||!r.term)issues.push('TERM_IDENTITY_MISSING');
    if(!r.source_ref)issues.push('TERM_PROVENANCE_MISSING');
  }
  const forbidden=['schedule_date','planner_date','due_at','due_date','deadline'];
  const walk=v=>{
    if(!v||typeof v!=='object')return false;
    for(const [k,n] of Object.entries(v)){if(forbidden.includes(k))return true;if(walk(n))return true;}
    return false;
  };
  if(walk(result))issues.push('SCHEDULE_AUTHORITY_LEAK');
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,parseSchoolStage,normalizeTerm,gradeMatch,evidenceSummary,select,validate});
