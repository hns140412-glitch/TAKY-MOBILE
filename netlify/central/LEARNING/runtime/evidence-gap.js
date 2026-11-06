'use strict';

const VERSION='TAKY_LEARNING_EVIDENCE_GAP_V2';
const clean=v=>String(v??'').trim();

function makeScope(scope={}){
  return {
    member_id:clean(scope.member_id)||null,
    subject:clean(scope.subject)||null,
    concept_skill_target:clean(scope.concept_skill_target)||null
  };
}

function derive({scope={},decision={},indexed_evidence=null,reference_requirement=null}={}){
  const normalizedScope=makeScope(scope);
  const sourceRefs=Array.isArray(indexed_evidence?.source_refs)?indexed_evidence.source_refs:[];

  if(reference_requirement&&typeof reference_requirement==='object'){
    const functionId=clean(reference_requirement.function_id);
    const requestedBehavior=clean(reference_requirement.requested_behavior);
    const queryTerms=Array.isArray(reference_requirement.query_terms)
      ? reference_requirement.query_terms.map(clean).filter(Boolean)
      : [clean(scope.subject),clean(scope.concept_skill_target),functionId,requestedBehavior].filter(Boolean);
    if(!functionId||!requestedBehavior){
      return {ok:false,version:VERSION,reason:'REFERENCE_REQUIREMENT_INCOMPLETE'};
    }
    if(!sourceRefs.length){
      return {
        ok:true,
        version:VERSION,
        gap:{
          gap_id:[clean(scope.member_id)||'member',clean(scope.subject)||'subject',clean(scope.concept_skill_target)||'target','REFERENCE_EVIDENCE_REQUIRED',functionId].join(':'),
          owner:'LEARNING_ENGINE_CORE',
          gap_type:'REFERENCE_EVIDENCE_REQUIRED',
          priority:clean(reference_requirement.priority)||'MEDIUM',
          scope:normalizedScope,
          function_id:functionId,
          consumer_app:clean(reference_requirement.consumer_app)||null,
          requested_behavior:requestedBehavior,
          requested_capability:'EXTERNAL_REFERENCE_EVIDENCE',
          acceptable_source_families:Array.isArray(reference_requirement.acceptable_source_families)?reference_requirement.acceptable_source_families.filter(Boolean):[],
          acceptable_authority_classes:Array.isArray(reference_requirement.acceptable_authority_classes)?reference_requirement.acceptable_authority_classes.filter(Boolean):[],
          required_provenance:Array.isArray(reference_requirement.required_provenance)?reference_requirement.required_provenance.filter(Boolean):[],
          existing_source_refs:[],
          index_check_required:true,
          resolution_path:'INDEX_THEN_MINING_IF_INSUFFICIENT',
          mining_request_authorized:false,
          query_terms:queryTerms,
          invariant:'LEARNING_EMITS_REFERENCE_GAP__INDEX_CHECKS_EXISTENCE__MINING_ONLY_IF_REFERENCE_EVIDENCE_INSUFFICIENT'
        }
      };
    }
  }

  const blockers=Array.isArray(decision.blockers)?decision.blockers:[];
  const advisories=Array.isArray(decision.advisories)?decision.advisories:[];
  const suff=clean(decision?.state_summary?.evidence_sufficiency)||'NONE';
  const codes=[...blockers,...advisories].map(x=>clean(x?.code)).filter(Boolean);

  let gapType=null;
  let priority='LOW';
  if(codes.includes('NO_EVIDENCE')||suff==='NONE'){
    gapType='LEARNER_EVIDENCE_ABSENT';
    priority='HIGH';
  }else if(codes.includes('SPARSE_EVIDENCE')||suff==='SPARSE'){
    gapType='LEARNER_EVIDENCE_SPARSE';
    priority='MEDIUM';
  }else if(codes.includes('INSTRUMENT_CHANGE_HOLD')){
    gapType='COMPARABLE_EVIDENCE_REQUIRED';
    priority='HIGH';
  }else if(codes.includes('PREREQUISITE_RISK')){
    gapType='PREREQUISITE_EVIDENCE_REQUIRED';
    priority='HIGH';
  }

  if(!gapType)return {ok:true,version:VERSION,gap:null};

  return {
    ok:true,
    version:VERSION,
    gap:{
      gap_id:[clean(scope.member_id)||'member',clean(scope.subject)||'subject',clean(scope.concept_skill_target)||'target',gapType].join(':'),
      owner:'LEARNING_ENGINE_CORE',
      gap_type:gapType,
      priority,
      scope:normalizedScope,
      evidence_sufficiency:suff,
      existing_source_refs:[...sourceRefs],
      index_check_required:false,
      resolution_path:'SPECIALIST_EVIDENCE_ACQUISITION',
      mining_request_authorized:false,
      requested_capability:'LEARNER_PERFORMANCE_EVIDENCE',
      query_terms:[clean(scope.subject),clean(scope.concept_skill_target),gapType].filter(Boolean),
      invariant:'LEARNER_PERFORMANCE_GAP_NEVER_TRIGGERS_EXTERNAL_MINING'
    }
  };
}

module.exports=Object.freeze({VERSION,derive});