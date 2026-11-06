'use strict';

const MAP=require('../projection/academic-vocab-1387-level-map-v1.json');
const Overlay=require('./academic-vocab-overlay.js');

const VERSION='TAKY_ACADEMIC_VOCAB_UNIT_SELECTOR_V1';
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const lower=v=>clean(v).toLowerCase();

function occurrences(text,term){
  const src=lower(text),t=lower(term);
  if(!src||!t)return 0;
  // One-character Korean families are too collision-prone for free-text mining.
  if(/^[가-힣]$/.test(t))return 0;
  let count=0,from=0;
  while(true){
    const i=src.indexOf(t,from);
    if(i<0)break;
    count++; from=i+Math.max(1,t.length);
  }
  return count;
}

function evidenceSummary(rows=[],term=''){
  const key=clean(term);
  let wrong=0,correct=0,assisted=0,lastAt=null;
  for(const e of Array.isArray(rows)?rows:[]){
    const target=clean(e.academic_vocab_term||e.term||e.term_text);
    if(target!==key)continue;
    const result=String(e.result_type||e.result||'').toUpperCase();
    if(['WRONG','TIMEOUT','PASS'].includes(result))wrong++;
    if(result==='CORRECT')correct++;
    if(e.assisted===true||result==='HINT_USED')assisted++;
    const at=clean(e.observed_at||e.at);
    if(at&&(!lastAt||at>lastAt))lastAt=at;
  }
  return {wrong,correct,assisted,lastAt};
}

function roleWeight(role){
  return role==='PRIMARY'?40:role==='FOUNDATION'?24:role==='CONTEXTUAL_ONLY'?8:0;
}

function select(input={}){
  const stage=String(input.school_stage||input.schoolStage||'').toUpperCase();
  const policy=Overlay.stagePolicy(stage);
  if(!policy)return {ok:false,reason:'SUPPORTED_SCHOOL_STAGE_REQUIRED',selector_version:VERSION};
  const unitText=clean(input.unit_text||input.unitText);
  const explicit=new Set((Array.isArray(input.explicit_terms)?input.explicit_terms:[])
    .map(clean).filter(Boolean));
  if(!unitText&&!explicit.size)return {ok:false,reason:'UNIT_TEXT_OR_EXPLICIT_TERMS_REQUIRED',selector_version:VERSION};

  const limit=Math.max(1,Math.min(24,Number(input.limit)||12));
  const evidence=Array.isArray(input.evidence)?input.evidence:[];
  const hits=[];
  for(const [term,levels] of Object.entries(MAP.levels||{})){
    const occ=occurrences(unitText,term);
    const explicitHit=explicit.has(term);
    if(!occ&&!explicitHit)continue;
    const meta=Overlay.classify(term,stage);
    const ev=evidenceSummary(evidence,term);
    // Higher-stage vocabulary is allowed only when it is genuinely present in the
    // source unit or explicitly supplied by the curriculum layer.
    if(meta.role==='CONTEXTUAL_ONLY'&&!occ&&!explicitHit)continue;
    let score=100+roleWeight(meta.role)+Math.min(30,occ*6);
    const reasons=['UNIT_SOURCE_MATCH'];
    if(explicitHit){score+=18;reasons.push('EXPLICIT_CURRICULUM_TERM');}
    if(meta.role==='PRIMARY')reasons.push('GRADE_PRIMARY_LEVEL');
    else if(meta.role==='FOUNDATION')reasons.push('FOUNDATION_LEVEL');
    else if(meta.role==='CONTEXTUAL_ONLY')reasons.push('HIGHER_LEVEL_SOURCE_PRESENT');
    if(ev.wrong){score+=Math.min(45,ev.wrong*15);reasons.push('RECOVERY_EVIDENCE');}
    if(ev.assisted){score+=Math.min(20,ev.assisted*8);reasons.push('ASSISTANCE_EVIDENCE');}
    if(ev.correct>=2&&!ev.wrong){score-=12;reasons.push('STABLE_DEPRIORITIZE');}
    hits.push({
      term,
      levels:[...levels],
      academic_role:meta.role,
      primary_level:policy.primary,
      occurrences:occ,
      explicit_curriculum_term:explicitHit,
      evidence_summary:ev,
      score,
      reasons,
      source_ref:clean(input.source_ref)||null
    });
  }
  hits.sort((a,b)=>b.score-a.score||b.occurrences-a.occurrences||
    a.term.localeCompare(b.term,'ko'));

  return {
    ok:true,
    selector_version:VERSION,
    authority:'TAKY_LEARNING_ENGINE_CORE',
    school_stage:stage,
    stage_policy:policy,
    source_ref:clean(input.source_ref)||null,
    unit_text_digest_required:true,
    selected:hits.slice(0,limit).map((x,i)=>({...x,rank:i+1})),
    matched_total:hits.length,
    can_influence:['ACADEMIC_VOCAB_TARGET_SELECTION','RECOVERY_PRIORITY','SPECIALIST_ROUTING_INTENT'],
    cannot_influence:['SCHEDULE_DATE','PLANNER_DATE','DUE_AT','MASTERY_CLAIM','DEFINITION_WITHOUT_SOURCE','HANJA_WITHOUT_SOURCE']
  };
}

function validate(result={}){
  const issues=[];
  if(result?.ok!==true)issues.push('SELECTOR_NOT_OK');
  if(result.authority!=='TAKY_LEARNING_ENGINE_CORE')issues.push('AUTHORITY_INVALID');
  if(!result.stage_policy)issues.push('STAGE_POLICY_MISSING');
  if(!Array.isArray(result.selected))issues.push('SELECTED_REQUIRED');
  if((result.selected||[]).some(x=>!x.term||!x.source_ref))issues.push('TERM_PROVENANCE_REQUIRED');
  const forbidden=['schedule_date','planner_date','due_at','due_date','deadline'];
  const walk=v=>{
    if(!v||typeof v!=='object')return false;
    for(const [k,n] of Object.entries(v)){if(forbidden.includes(k))return true;if(walk(n))return true;}
    return false;
  };
  if(walk(result))issues.push('SCHEDULE_AUTHORITY_LEAK');
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,occurrences,evidenceSummary,select,validate});
