'use strict';

const VERSION='TAKY_INDEX_TO_LEARNING_EVIDENCE_HANDOFF_V1';

function clean(v){return String(v??'').trim();}

function prepare(input={}, independentIndexOwnerVerifier=null){
  const query=input.query_context||{};
  const consumerApp=clean(query.consumer_app);
  const functionId=clean(query.function_id);
  const requestedBehavior=clean(query.requested_behavior);
  const requestedClaims=Array.isArray(query.requested_claims)?query.requested_claims:[];
  const candidates=Array.isArray(input.candidates)?input.candidates:[];

  const issues=[];
  if(!consumerApp)issues.push('CONSUMER_APP_MISSING');
  if(!functionId)issues.push('FUNCTION_ID_MISSING');
  if(!requestedBehavior)issues.push('REQUESTED_BEHAVIOR_MISSING');
  if(!candidates.length)issues.push('RETRIEVAL_CANDIDATES_EMPTY');
  if(typeof independentIndexOwnerVerifier!=='function')issues.push('INDEX_OWNER_VERIFIER_NOT_CONFIGURED');

  const normalized=[];
  const sourceIds=new Set();
  const sourceRefs=new Set();
  for(const [index,row] of candidates.entries()){
    if(!row||typeof row!=='object'){
      issues.push(`CANDIDATE_INVALID:${index}`);
      continue;
    }
    const sourceId=clean(row.source_id);
    const sourceRef=clean(row.source_ref);
    if(sourceId && sourceIds.has(sourceId))issues.push('SOURCE_ID_DUPLICATE:'+index);
    if(sourceRef && sourceRefs.has(sourceRef))issues.push('SOURCE_REF_DUPLICATE:'+index);
    if(sourceId)sourceIds.add(sourceId);
    if(sourceRef)sourceRefs.add(sourceRef);
    // Input source and provenance are proposals, never independent approval.
    // The caller cannot supply or select the owner verifier through input.
    let owner=null;
    if(typeof independentIndexOwnerVerifier==='function' && sourceId && sourceRef){
      try { owner=independentIndexOwnerVerifier(sourceId,sourceRef); }
      catch (_) { issues.push('INDEX_OWNER_REVIEW_UNAVAILABLE:'+index); }
    }
    const sourceFields=['source_family','source_type','authority_class','detail_anchor'];
    // Relations and their source authority belong to INDEXING_OWNER. An
    // unreviewed retrieval-row relation must not become a forming fact.
    const rowRelations=Array.isArray(row.relations)?row.relations:[];
    const ownerRelations=Array.isArray(owner?.relations)?owner.relations:[];
    const relationsBound=JSON.stringify(rowRelations)===JSON.stringify(ownerRelations);
    const proposedProvenance=Array.isArray(row.provenance)?row.provenance.filter(Boolean):[];
    const ownerProvenance=Array.isArray(owner?.provenance)?owner.provenance.filter(Boolean):[];
    const ownerEvidence=owner?.review_evidence_refs;
    const ownerValid=owner?.issuer==='INDEXING_OWNER'
      && owner?.reviewed===true && owner?.decision==='INDEXED'
      && owner?.domain_use_authorized===true
      && owner?.source_id===sourceId && owner?.source_ref===sourceRef
      && typeof owner?.index_version==='string' && !!owner.index_version.trim()
      && Array.isArray(ownerEvidence) && !!ownerEvidence.length
      && ownerEvidence.every(v=>typeof v==='string' && !!v.trim())
      && sourceFields.every(field=>(row[field]??null)===(owner[field]??null))
      && relationsBound
      && proposedProvenance.length===ownerProvenance.length
      && proposedProvenance.every((v,i)=>v===ownerProvenance[i]);
    if(!ownerValid)issues.push('INDEPENDENT_INDEX_OWNER_BINDING_INVALID:'+index);
    const provenance=ownerValid?ownerProvenance:[];
    if(!sourceId)issues.push(`SOURCE_ID_MISSING:${index}`);
    if(!sourceRef)issues.push(`SOURCE_REF_MISSING:${index}`);
    if(!provenance.length)issues.push(`PROVENANCE_MISSING:${index}`);
    normalized.push({
      source_id:sourceId||null,
      source_ref:sourceRef||null,
      source_family:row.source_family||null,
      source_type:row.source_type||null,
      authority_class:row.authority_class||null,
      detail_anchor:row.detail_anchor||null,
      relations:ownerValid?JSON.parse(JSON.stringify(ownerRelations)):[],
      index_version:ownerValid?owner.index_version:null,
      review_evidence_refs:ownerValid?[...ownerEvidence]:[],
      provenance,
      retrieval_rank:Number.isFinite(row.retrieval_rank)?row.retrieval_rank:null,
      retrieval_score:Number.isFinite(row.retrieval_score)?row.retrieval_score:null
    });
  }

  if(issues.length){
    return {ok:false,version:VERSION,issues,candidates:normalized,policy_requests:[]};
  }

  const policyRequests=normalized.map(row=>({
    function_id:functionId,
    consumer_app:consumerApp,
    requested_behavior:requestedBehavior,
    requested_claims:[...requestedClaims],
    provenance:[...row.provenance],
    source_id:row.source_id,
    source_ref:row.source_ref
  }));

  return {
    ok:true,
    version:VERSION,
    query_context:{
      function_id:functionId,
      consumer_app:consumerApp,
      requested_behavior:requestedBehavior,
      requested_claims:[...requestedClaims]
    },
    candidates:normalized,
    policy_requests:policyRequests,
    source_refs:normalized.map(x=>x.source_ref),
    invariant:'INDEX_RETRIEVAL_METADATA_IS_CONTEXT_NOT_LEARNER_PERFORMANCE'
  };
}

module.exports=Object.freeze({VERSION,prepare});
