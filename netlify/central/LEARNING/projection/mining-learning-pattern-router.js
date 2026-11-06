'use strict';
const fs=require('node:fs');
const path=require('node:path');

const VERSION='TAKY_MINING_LEARNING_PATTERN_ROUTER_V2';
const DEFAULT_REGISTRY=path.resolve(__dirname,'..','data','mining-learning-pattern-registry-v1.json');
const clean=v=>String(v??'').trim();
const uniq=a=>[...new Set((a||[]).filter(Boolean))];

function load(registryPath=DEFAULT_REGISTRY){
  const x=JSON.parse(fs.readFileSync(path.resolve(registryPath),'utf8').replace(/^\uFEFF/,''));
  if(!['TAKY_LEARNING_REFERENCE_PATTERN_REGISTRY_V1','TAKY_LEARNING_REFERENCE_PATTERN_REGISTRY_V2'].includes(x?.schema))
    throw new Error('LEARNING_PATTERN_REGISTRY_INVALID');
  return x;
}

function evidenceSignals(context={}){
  const e=context.evidence_summary||context.evidence||{};
  const wrong=Number(e.wrong||0);
  const assisted=Number(e.assisted||0);
  const correct=Number(e.correct||0);
  return {
    evidence_wrong_repeat:wrong>=2,
    evidence_recovery:wrong>0||assisted>0,
    evidence_assisted:assisted>0,
    evidence_correct:correct>0
  };
}

function signals(term={},context={}){
  const concept=term.concept||{};
  return {
    components:Array.isArray(term.components)&&term.components.length>0,
    hanja:!!clean(term.hanja),
    meaning:!!clean(term.meaning),
    concept_relations:Array.isArray(concept.relations)&&concept.relations.length>0,
    concept_hierarchy:Array.isArray(concept.hierarchy)&&concept.hierarchy.length>1,
    concept_links:Array.isArray(term.conceptLinks||term.concept_links)&&(term.conceptLinks||term.concept_links).length>0,
    compare_contrast:(Array.isArray(concept.compare)&&concept.compare.length>0)||(Array.isArray(concept.contrast)&&concept.contrast.length>0),
    example:!!clean(term.example),
    concept_summary:!!clean(concept.summary),
    unit_context:Array.isArray(term.units||term.unit_tags)&&(term.units||term.unit_tags).length>0,
    decoder_reference:!!(term.decoder_reference||term.decoderReference),
    ...evidenceSignals(context)
  };
}

function matches(pattern={},sig={}){
  const any=Array.isArray(pattern.requires_any)?pattern.requires_any:[];
  const all=Array.isArray(pattern.requires_all)?pattern.requires_all:[];
  const anyOk=!any.length||any.some(k=>sig[k]===true);
  const allOk=!all.length||all.every(k=>sig[k]===true);
  return anyOk&&allOk;
}

function resolveArgs(contextOrRegistry={},maybeRegistry=null){
  if(contextOrRegistry?.schema&&String(contextOrRegistry.schema).startsWith('TAKY_LEARNING_REFERENCE_PATTERN_REGISTRY_')){
    return {context:{},registry:contextOrRegistry};
  }
  return {context:contextOrRegistry||{},registry:maybeRegistry||load()};
}

function derive(term={},contextOrRegistry={},maybeRegistry=null){
  const {context,registry}=resolveArgs(contextOrRegistry,maybeRegistry);
  const sig=signals(term,context);
  // Only an explicit, non-operational FORMING preview scopes pattern decisions
  // to the source(s) approved in that preview. Production registry semantics
  // and default Learning Engine behavior remain unchanged.
  const preview=registry.projection_scope?.mode==='BOUND_FORMING_PREVIEW_ONLY'
    && registry.projection_scope?.operational===false;
  const allowed=preview?new Set((registry.sources||[])
    .flatMap(s=>Array.isArray(s.patterns)?s.patterns:[])):null;
  const patternIds=Object.entries(registry.patterns||{})
    .filter(([id,p])=>(!preview||allowed.has(id))&&matches(p,sig))
    .map(([id])=>id);
  const sourceRefs=uniq((registry.sources||[])
    .filter(s=>(s.patterns||[]).some(id=>patternIds.includes(id)))
    .map(s=>s.source_ref));
  const modePlan={TRACE:false,LINK:false,CORE:false,RECALL:false};
  for(const id of patternIds){
    for(const mode of registry.patterns[id]?.mode_affinity||[])if(mode in modePlan)modePlan[mode]=true;
  }
  if(!sig.components&&!sig.hanja)modePlan.TRACE=false;
  if(!(sig.components||sig.concept_relations||sig.concept_hierarchy||sig.concept_links||sig.compare_contrast))modePlan.LINK=false;
  if(!sig.meaning)modePlan.CORE=false;
  if(!(sig.example||sig.concept_summary||sig.unit_context))modePlan.RECALL=false;

  const recovery={
    concept_gap:patternIds.includes('P_ERROR_TO_CONCEPT_GAP'),
    reason:patternIds.includes('P_ERROR_TO_CONCEPT_GAP')?'REPEATED_WRONG_ATTEMPTS':'NONE',
    route:patternIds.includes('P_ERROR_TO_CONCEPT_GAP')?'TARGETED_CONCEPT_REVIEW':'NORMAL_FLOW'
  };
  return {
    router_version:VERSION,
    authority_class:registry.authority_class,
    pattern_ids:patternIds,
    source_refs:sourceRefs,
    eligible_modes:Object.entries(modePlan).filter(([,v])=>v).map(([k])=>k),
    preferred_sequence:registry.canonical_sequence,
    recovery,
    presentation:{
      visual_concept_card:patternIds.includes('P_VISUAL_CONCEPT_CARD'),
      concept_graph:patternIds.includes('P_CONCEPT_GRAPH'),
      blank_recall:patternIds.includes('P_BLANK_RECALL'),
      literal_to_subject_meaning:patternIds.includes('P_LITERAL_TO_SUBJECT_MEANING')
    },
    guards:[
      'PATTERN_DOES_NOT_SET_GRADE',
      'PATTERN_DOES_NOT_OVERRIDE_OFFICIAL_MEANING',
      'MISSING_COMPONENTS_ARE_NOT_INVENTED',
      'ONE_MISTAKE_IS_NOT_AUTO_CONCEPT_GAP',
      'SOURCE_LAYOUT_AND_WORDING_ARE_NOT_COPIED'
    ]
  };
}

module.exports=Object.freeze({VERSION,DEFAULT_REGISTRY,load,evidenceSignals,signals,derive});
