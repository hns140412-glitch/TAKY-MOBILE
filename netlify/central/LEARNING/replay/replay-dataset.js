'use strict';

const RealReceipt=require('../receipts/real-evidence-receipt.js');
const clean=v=>String(v??'').trim();
const finite=v=>Number.isFinite(Number(v))?Number(v):null;

function normalizeScope(scope={}){
  return {
    member_id:clean(scope.member_id),
    subject:clean(scope.subject).toLowerCase(),
    concept_skill_target:clean(scope.concept_skill_target).toLowerCase()
  };
}

function classifyLabel(e={}){
  const type=clean(e.evidence_type);
  const outcome=e.verified_outcome;
  if(type==='CHILD_SELF_REPORT') return {label_status:'OBSERVATION_ONLY',exclusion_reason:'SELF_REPORT_NOT_VERIFIED_TARGET'};
  if((outcome===0||outcome===1)&&clean(e?.verification?.receipt_id)&&clean(e?.verification?.authority)==='LEARNING_VERIFICATION_RECEIPT') return {label_status:'VERIFIED_TARGET',exclusion_reason:null};
  if(outcome===0||outcome===1) return {label_status:'OBSERVATION_ONLY',exclusion_reason:'VERIFICATION_RECEIPT_REQUIRED'};
  return {label_status:'OBSERVATION_ONLY',exclusion_reason:'NO_VERIFIED_BINARY_OUTCOME'};
}

function toReplayRecord(e={}){
  const label=classifyLabel(e);
  return {
    event_id:clean(e.event_id||e.evidence_id),
    observed_at:clean(e.observed_at||e.at),
    member_id:clean(e.member_id),
    subject:clean(e.subject).toLowerCase(),
    concept_skill_target:clean(e.concept_skill_target).toLowerCase(),
    learning_target_id:clean(e.learning_target_id)||null,
    evidence_type:clean(e.evidence_type),
    source_app:clean(e.source_app),
    instrument_version:clean(e.instrument_version),
    interaction_mode:clean(e.interaction_mode)||null,
    assistance:clean(e.assistance)||null,
    attempt_count:Number.isInteger(e.attempt_count)?e.attempt_count:null,
    response_latency_ms:finite(e.response_latency_ms),
    verified_outcome:(e.verified_outcome===0||e.verified_outcome===1)?e.verified_outcome:null,
    memory_strength:finite(e?.memory?.average_strength??e.memory_strength),
    verification_receipt_id:clean(e?.verification?.receipt_id)||null,
    verification_authority:clean(e?.verification?.authority)||null,
    verifier_type:clean(e?.verification?.verifier_type)||null,
    verifier_version:clean(e?.verification?.verifier_version)||null,
    label_status:label.label_status,
    exclusion_reason:label.exclusion_reason
  };
}

function buildDataset(evidence=[],scopeInput={},options={}){
  const scope=normalizeScope(scopeInput);
  if(!scope.member_id||!scope.subject||!scope.concept_skill_target){
    return {ok:false,reason:'SCOPE_REQUIRED'};
  }
  const seen=new Set();
  const records=[];
  const rejected=[];
  for(const raw of (Array.isArray(evidence)?evidence:[])){
    const rec=toReplayRecord(raw||{});
    if(rec.member_id!==scope.member_id||rec.subject!==scope.subject||rec.concept_skill_target!==scope.concept_skill_target) continue;
    const missing=['event_id','observed_at','member_id','subject','concept_skill_target','evidence_type','source_app','instrument_version'].filter(k=>!clean(rec[k]));
    if(missing.length){rejected.push({event_id:rec.event_id||null,reason:'MISSING_REQUIRED',missing});continue;}
    if(!Number.isFinite(Date.parse(rec.observed_at))){rejected.push({event_id:rec.event_id,reason:'INVALID_TIME'});continue;}
    if(seen.has(rec.event_id)) continue;
    seen.add(rec.event_id);
    records.push(rec);
  }
  records.sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at)||a.event_id.localeCompare(b.event_id));
  const fraction=Number.isFinite(options.holdout_fraction)?Math.min(0.5,Math.max(0.05,Number(options.holdout_fraction))):0.25;
  const sourceKind=options.source_kind||'SYNTHETIC_FIXTURE';
  let evidenceReceiptId=clean(options.evidence_receipt_id)||null;
  if(sourceKind==='REAL_EVIDENCE'){
    const receipt=options.evidence_receipt;
    if(!receipt)return {ok:false,reason:'REAL_EVIDENCE_RECEIPT_REQUIRED'};
    const verifiedRaw=(Array.isArray(evidence)?evidence:[]).filter(raw=>{
      const s=normalizeScope(raw||{});
      return s.member_id===scope.member_id&&s.subject===scope.subject&&s.concept_skill_target===scope.concept_skill_target&&
        (raw?.verified_outcome===0||raw?.verified_outcome===1)&&clean(raw?.verification?.receipt_id);
    });
    const receiptCheck=RealReceipt.validateBatchReceipt(receipt,verifiedRaw);
    if(!receiptCheck.ok)return {ok:false,reason:'REAL_EVIDENCE_RECEIPT_MISMATCH',issues:receiptCheck.issues};
    evidenceReceiptId=receipt.receipt_id;
  }
  return {
    ok:true,
    dataset:{
      dataset_version:'TAKY_LEARNING_REPLAY_V1',
      scope,
      records,
      split_policy:{
        kind:'TIME_HELD_OUT',
        holdout_fraction:fraction,
        respect_time_order:true,
        respect_instrument_boundaries:true
      },
      provenance:{
        created_at:options.created_at||new Date(0).toISOString(),
        source_kind:sourceKind,
        raw_evidence_immutable:true,
        evidence_receipt_id:evidenceReceiptId,
        notes:options.notes||null
      }
    },
    rejected
  };
}

function splitDataset(dataset={}){
  const rows=Array.isArray(dataset.records)?dataset.records.filter(r=>r.label_status==='VERIFIED_TARGET'):[];
  if(rows.length<2)return {ok:false,reason:'INSUFFICIENT_VERIFIED_TARGETS',verified_count:rows.length};
  const fraction=Number(dataset?.split_policy?.holdout_fraction)||0.25;
  const holdoutCount=Math.max(1,Math.floor(rows.length*fraction));
  const cut=Math.max(1,rows.length-holdoutCount);
  const train=rows.slice(0,cut);
  const holdout=rows.slice(cut);
  const trainInstruments=new Set(train.map(r=>r.instrument_version));
  const drift=holdout.some(r=>!trainInstruments.has(r.instrument_version));
  return {
    ok:true,
    train,
    holdout,
    diagnostics:{
      verified_count:rows.length,
      observation_only_count:(dataset.records||[]).filter(r=>r.label_status==='OBSERVATION_ONLY').length,
      instrument_drift_into_holdout:drift
    }
  };
}

function selfValidate(dataset={}){
  const issues=[];
  if(dataset.dataset_version!=='TAKY_LEARNING_REPLAY_V1')issues.push('VERSION_INVALID');
  if(dataset?.split_policy?.kind!=='TIME_HELD_OUT')issues.push('SPLIT_KIND_INVALID');
  if(dataset?.split_policy?.respect_time_order!==true)issues.push('TIME_ORDER_REQUIRED');
  if(dataset?.split_policy?.respect_instrument_boundaries!==true)issues.push('INSTRUMENT_BOUNDARY_REQUIRED');
  if(dataset?.provenance?.raw_evidence_immutable!==true)issues.push('RAW_IMMUTABILITY_REQUIRED');
  const ids=(dataset.records||[]).map(r=>r.event_id);
  if(new Set(ids).size!==ids.length)issues.push('DUPLICATE_EVENT_ID');
  let prev=-Infinity;
  for(const r of dataset.records||[]){
    const t=Date.parse(r.observed_at);
    if(!Number.isFinite(t))issues.push('INVALID_TIME');
    if(t<prev)issues.push('NOT_CHRONOLOGICAL');
    prev=t;
    if(r.evidence_type==='CHILD_SELF_REPORT'&&r.label_status==='VERIFIED_TARGET')issues.push('SELF_REPORT_PROMOTED');
    if(r.label_status==='VERIFIED_TARGET'&&!clean(r.verification_receipt_id))issues.push('VERIFIED_TARGET_WITHOUT_RECEIPT');
    if(r.label_status==='VERIFIED_TARGET'&&clean(r.verification_authority)!=='LEARNING_VERIFICATION_RECEIPT')issues.push('VERIFIED_TARGET_AUTHORITY_INVALID');
  }
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({normalizeScope,classifyLabel,toReplayRecord,buildDataset,splitDataset,selfValidate});
