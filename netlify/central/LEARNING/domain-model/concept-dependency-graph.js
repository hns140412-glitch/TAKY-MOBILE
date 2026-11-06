'use strict';

const VERSION='TAKY_CONCEPT_DEPENDENCY_GRAPH_V1';
const clean=v=>String(v??'').trim();

function validateRelation(r={}){
  const issues=[];
  for(const k of ['relation_id','subject','from_concept','to_concept','relation_type','source_ref']){
    if(!clean(r[k]))issues.push('MISSING_'+k.toUpperCase());
  }
  if(!['PREREQUISITE','SUPPORTS','CONFUSABLE_WITH'].includes(clean(r.relation_type)))issues.push('RELATION_TYPE_INVALID');
  if(clean(r.from_concept)===clean(r.to_concept))issues.push('SELF_RELATION_FORBIDDEN');
  const authority=clean(r.authority)||'DECLARED_DOMAIN_RELATION';
  if(r.inferred_from_learner_data===true&&authority!=='DATA_CANDIDATE')issues.push('LEARNER_DATA_AUTO_INFERENCE_FORBIDDEN');
  if(authority==='DATA_CANDIDATE'&&!Number.isFinite(Number(r.confidence)))issues.push('DATA_CANDIDATE_CONFIDENCE_REQUIRED');
  return {ok:issues.length===0,issues};
}

function build(relations=[]){
  const accepted=[],rejected=[],ids=new Set();
  for(const r of Array.isArray(relations)?relations:[]){
    const v=validateRelation(r);
    if(!v.ok){rejected.push({relation_id:r?.relation_id||null,issues:v.issues});continue;}
    if(ids.has(r.relation_id)){rejected.push({relation_id:r.relation_id,issues:['DUPLICATE_RELATION_ID']});continue;}
    ids.add(r.relation_id);
    const authority=clean(r.authority)||'DECLARED_DOMAIN_RELATION';
    const candidate=authority==='DATA_CANDIDATE';
    accepted.push({
      relation_id:clean(r.relation_id),
      subject:clean(r.subject).toLowerCase(),
      from_concept:clean(r.from_concept).toLowerCase(),
      to_concept:clean(r.to_concept).toLowerCase(),
      relation_type:clean(r.relation_type),
      source_ref:clean(r.source_ref),
      source_version:clean(r.source_version)||null,
      authority,
      inferred_from_learner_data:candidate,
      confidence:candidate?Math.max(0,Math.min(1,Number(r.confidence))):null,
      state:candidate?'CANDIDATE':'ACTIVE',
      can_influence_learning_sequence:!candidate,
      can_influence_calendar:false
    });
  }
  const active=accepted.filter(r=>r.state==='ACTIVE');
  const candidate=accepted.filter(r=>r.state==='CANDIDATE');
  const cycles=findPrerequisiteCycles(active);
  return {
    ok:cycles.length===0,
    graph_version:VERSION,
    relations:accepted,
    active_relations:active,
    candidate_relations:candidate,
    rejected,
    cycles,
    authority:'DECLARED_RELATIONS_ACTIVE_DATA_CANDIDATES_RETAINED',
    scheduling_authority:false
  };
}

function findPrerequisiteCycles(relations=[]){
  const edges=(relations||[]).filter(r=>r.relation_type==='PREREQUISITE'&&r.state!=='CANDIDATE');
  const adj=new Map();
  for(const r of edges){
    const from=r.subject+'::'+r.from_concept,to=r.subject+'::'+r.to_concept;
    if(!adj.has(from))adj.set(from,[]);
    adj.get(from).push(to);
  }
  const visiting=new Set(),visited=new Set(),stack=[],cycles=[];
  function dfs(n){
    if(visiting.has(n)){
      const i=stack.indexOf(n);
      cycles.push([...stack.slice(i),n]);
      return;
    }
    if(visited.has(n))return;
    visiting.add(n);stack.push(n);
    for(const next of adj.get(n)||[])dfs(next);
    stack.pop();visiting.delete(n);visited.add(n);
  }
  for(const n of adj.keys())dfs(n);
  return cycles;
}

function prerequisitesFor(graph={},subject='',concept=''){
  const s=clean(subject).toLowerCase(),c=clean(concept).toLowerCase();
  const source=graph.active_relations||graph.relations||[];
  return source.filter(r=>r.subject===s&&r.to_concept===c&&r.relation_type==='PREREQUISITE'&&r.state!=='CANDIDATE');
}

function deriveReadiness(graph={},skillStates=[],subject='',concept=''){
  const prereqs=prerequisitesFor(graph,subject,concept);
  const byConcept=new Map((Array.isArray(skillStates)?skillStates:[]).map(s=>[clean(s?.scope?.concept_skill_target).toLowerCase(),s]));
  const missing=[],atRisk=[],ready=[];
  for(const r of prereqs){
    const state=byConcept.get(r.from_concept);
    if(!state){missing.push(r.from_concept);continue;}
    const suff=state?.inferred?.evidence_sufficiency||'NONE';
    const retention=state?.inferred?.retention_signal||'MODEL_NOT_BOUND';
    const trend=state?.inferred?.trend||'INSUFFICIENT_EVIDENCE';
    if(['NONE','SPARSE'].includes(suff)||retention==='RETENTION_AT_RISK'||trend==='DECLINING'){
      atRisk.push({concept:r.from_concept,evidence_sufficiency:suff,retention_signal:retention,trend});
    }else ready.push(r.from_concept);
  }
  return {
    ok:true,
    graph_version:graph.graph_version||VERSION,
    subject:clean(subject).toLowerCase(),
    concept_skill_target:clean(concept).toLowerCase(),
    prerequisite_count:prereqs.length,
    readiness:prereqs.length===0?'NO_DECLARED_PREREQUISITE'
      :(missing.length||atRisk.length)?'PREREQUISITE_RISK':'READY_SIGNAL',
    missing_prerequisites:missing,
    at_risk_prerequisites:atRisk,
    ready_prerequisites:ready,
    authority:'PEDAGOGICAL_READINESS_SIGNAL_ONLY',
    scheduling_authority:false,
    cannot_influence:['SCHEDULE_DATE','PLANNER_DATE','DUE_AT','DEADLINE']
  };
}

function candidateRelationsFor(graph={},subject='',concept=''){
  const s=clean(subject).toLowerCase(),c=clean(concept).toLowerCase();
  return (graph.candidate_relations||[]).filter(r=>r.subject===s&&(r.from_concept===c||r.to_concept===c));
}

function validateReadiness(r={}){
  const issues=[];
  if(r.scheduling_authority!==false)issues.push('SCHEDULING_AUTHORITY_FORBIDDEN');
  if(r.authority!=='PEDAGOGICAL_READINESS_SIGNAL_ONLY')issues.push('AUTHORITY_INVALID');
  return {ok:issues.length===0,issues};
}

function selfValidate(graph={}){
  const issues=[];
  if(graph.scheduling_authority!==false)issues.push('SCHEDULING_AUTHORITY_FORBIDDEN');
  if((graph.cycles||[]).length)issues.push('ACTIVE_PREREQUISITE_CYCLE');
  for(const r of graph.candidate_relations||[]){
    if(r.can_influence_learning_sequence!==false)issues.push('CANDIDATE_RELATION_LEAK');
    if(r.can_influence_calendar!==false)issues.push('CALENDAR_AUTHORITY_LEAK');
  }
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,validateRelation,build,findPrerequisiteCycles,prerequisitesFor,candidateRelationsFor,deriveReadiness,validateReadiness,selfValidate});
