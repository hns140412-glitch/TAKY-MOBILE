'use strict';

const crypto=require('node:crypto');

const VERSION='TAKY_REAL_EVIDENCE_RECEIPT_V1';
const clean=v=>String(v??'').trim();

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object'){
    const out={};
    for(const k of Object.keys(value).sort())out[k]=stable(value[k]);
    return out;
  }
  return value;
}

function digest(value){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function validateCanonicalVerified(e={}){
  const issues=[];
  for(const k of ['event_id','observed_at','member_id','subject','concept_skill_target','evidence_type','source_app','instrument_version']){
    if(!clean(e[k]))issues.push('MISSING_'+k.toUpperCase());
  }
  if(!Number.isFinite(Date.parse(e.observed_at||'')))issues.push('INVALID_TIME');
  if(e.verified_outcome!==0&&e.verified_outcome!==1)issues.push('VERIFIED_OUTCOME_REQUIRED');
  if(clean(e?.verification?.authority)!=='LEARNING_VERIFICATION_RECEIPT')issues.push('VERIFICATION_AUTHORITY_REQUIRED');
  if(!clean(e?.verification?.receipt_id))issues.push('VERIFICATION_RECEIPT_ID_REQUIRED');
  return {ok:issues.length===0,issues};
}

function issueBatchReceipt(evidence=[],options={}){
  const rows=Array.isArray(evidence)?evidence.slice():[];
  if(!rows.length)return {ok:false,reason:'NO_EVIDENCE'};
  const invalid=[];
  for(const row of rows){
    const v=validateCanonicalVerified(row);
    if(!v.ok)invalid.push({event_id:row?.event_id||null,issues:v.issues});
  }
  if(invalid.length)return {ok:false,reason:'INVALID_VERIFIED_EVIDENCE',invalid};

  const first=rows[0];
  const scope={
    member_id:clean(first.member_id),
    subject:clean(first.subject).toLowerCase(),
    concept_skill_target:clean(first.concept_skill_target).toLowerCase()
  };
  const mixed=rows.filter(r=>
    clean(r.member_id)!==scope.member_id||
    clean(r.subject).toLowerCase()!==scope.subject||
    clean(r.concept_skill_target).toLowerCase()!==scope.concept_skill_target
  );
  if(mixed.length)return {ok:false,reason:'SCOPE_MIXED',event_ids:mixed.map(x=>x.event_id)};

  const ids=rows.map(r=>clean(r.event_id));
  if(new Set(ids).size!==ids.length)return {ok:false,reason:'DUPLICATE_EVENT_ID'};

  rows.sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at)||clean(a.event_id).localeCompare(clean(b.event_id)));
  const eventDigest=digest(rows.map(r=>({
    event_id:r.event_id,
    observed_at:r.observed_at,
    member_id:r.member_id,
    subject:r.subject,
    concept_skill_target:r.concept_skill_target,
    learning_target_id:r.learning_target_id||null,
    evidence_type:r.evidence_type,
    source_app:r.source_app,
    instrument_version:r.instrument_version,
    verified_outcome:r.verified_outcome,
    verification_receipt_id:r.verification.receipt_id,
    verifier_type:r.verification.verifier_type,
    verifier_version:r.verification.verifier_version
  })));

  const receiptId=clean(options.receipt_id)||('real-evidence:'+eventDigest.slice(0,24));
  return {
    ok:true,
    receipt:{
      authority:'REAL_LEARNING_EVIDENCE_RECEIPT',
      receipt_version:VERSION,
      receipt_id:receiptId,
      created_at:clean(options.created_at)||new Date(0).toISOString(),
      scope,
      event_count:rows.length,
      first_observed_at:rows[0].observed_at,
      last_observed_at:rows.at(-1).observed_at,
      instrument_versions:[...new Set(rows.map(r=>clean(r.instrument_version)))].sort(),
      source_apps:[...new Set(rows.map(r=>clean(r.source_app)))].sort(),
      event_ids:rows.map(r=>r.event_id),
      verification_receipt_ids:rows.map(r=>r.verification.receipt_id),
      evidence_digest_sha256:eventDigest,
      raw_evidence_immutable:true
    },
    canonical_evidence:rows
  };
}

function validateBatchReceipt(receipt={},evidence=[]){
  const issues=[];
  if(clean(receipt.authority)!=='REAL_LEARNING_EVIDENCE_RECEIPT')issues.push('AUTHORITY_INVALID');
  if(!clean(receipt.receipt_id))issues.push('RECEIPT_ID_REQUIRED');
  if(receipt.raw_evidence_immutable!==true)issues.push('RAW_IMMUTABILITY_REQUIRED');
  const issued=issueBatchReceipt(evidence,{receipt_id:receipt.receipt_id,created_at:receipt.created_at});
  if(!issued.ok)return {ok:false,issues:[...issues,'EVIDENCE_REISSUE_FAILED'],detail:issued};
  if(issued.receipt.evidence_digest_sha256!==receipt.evidence_digest_sha256)issues.push('EVIDENCE_DIGEST_MISMATCH');
  if(JSON.stringify(issued.receipt.scope)!==JSON.stringify(receipt.scope))issues.push('SCOPE_MISMATCH');
  if(issued.receipt.event_count!==receipt.event_count)issues.push('EVENT_COUNT_MISMATCH');
  return {ok:issues.length===0,issues};
}

function extendBatchReceipt(previousReceipt={},previousEvidence=[],newEvidence=[],options={}){
  const previousCheck=validateBatchReceipt(previousReceipt,previousEvidence);
  if(!previousCheck.ok)return {ok:false,reason:'PREVIOUS_RECEIPT_INVALID',issues:previousCheck.issues};
  const previousIds=new Set((Array.isArray(previousEvidence)?previousEvidence:[]).map(x=>clean(x.event_id)));
  const overlap=(Array.isArray(newEvidence)?newEvidence:[]).filter(x=>previousIds.has(clean(x.event_id)));
  if(overlap.length)return {ok:false,reason:'EVENT_ALREADY_RECEIPTED',event_ids:overlap.map(x=>x.event_id)};
  const combined=[...(Array.isArray(previousEvidence)?previousEvidence:[]),...(Array.isArray(newEvidence)?newEvidence:[])];
  const issued=issueBatchReceipt(combined,{
    receipt_id:options.receipt_id,
    created_at:options.created_at
  });
  if(!issued.ok)return issued;
  issued.receipt.parent_receipt_id=previousReceipt.receipt_id;
  issued.receipt.parent_evidence_digest_sha256=previousReceipt.evidence_digest_sha256;
  issued.receipt.incremental_event_count=(Array.isArray(newEvidence)?newEvidence:[]).length;
  return issued;
}

function validateReceiptChain(receipts=[]){
  const rows=Array.isArray(receipts)?receipts:[];
  const issues=[];
  for(let i=1;i<rows.length;i++){
    const prev=rows[i-1],cur=rows[i];
    if(clean(cur.parent_receipt_id)!==clean(prev.receipt_id))issues.push('PARENT_RECEIPT_MISMATCH:'+i);
    if(clean(cur.parent_evidence_digest_sha256)!==clean(prev.evidence_digest_sha256))issues.push('PARENT_DIGEST_MISMATCH:'+i);
    if(Number(cur.event_count)<Number(prev.event_count))issues.push('EVENT_COUNT_REGRESSION:'+i);
  }
  return {ok:issues.length===0,issues};
}

function replayOptions(receipt={}){
  if(clean(receipt.authority)!=='REAL_LEARNING_EVIDENCE_RECEIPT'||!clean(receipt.receipt_id)){
    return {ok:false,reason:'REAL_EVIDENCE_RECEIPT_INVALID'};
  }
  return {
    ok:true,
    options:{
      source_kind:'REAL_EVIDENCE',
      evidence_receipt_id:receipt.receipt_id,
      notes:'derived from '+receipt.authority
    }
  };
}

module.exports=Object.freeze({VERSION,digest,validateCanonicalVerified,issueBatchReceipt,validateBatchReceipt,extendBatchReceipt,validateReceiptChain,replayOptions});
