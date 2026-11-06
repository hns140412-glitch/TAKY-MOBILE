'use strict';

const crypto=require('node:crypto');
const clean=v=>String(v??'').trim();

const VERSION='TAKY_LEARNING_EVALUATION_LEDGER_V1';
const RETENTION='IMMUTABLE_HISTORY';

function stable(v){
  if(Array.isArray(v))return v.map(stable);
  if(v&&typeof v==='object'){
    const out={};
    for(const k of Object.keys(v).sort())out[k]=stable(v[k]);
    return out;
  }
  return v;
}
function digest(v){
  return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
}
function scopeKey(scope={}){
  return [clean(scope.member_id),clean(scope.subject).toLowerCase(),clean(scope.concept_skill_target).toLowerCase()].join('::');
}
function emptyLedger(){
  return {ledger_version:VERSION,retention:RETENTION,entries:[]};
}
function validateReport(report={}){
  const issues=[];
  if(clean(report.authority)!=='ESTIMATOR_PROMOTION_REVIEW_REPORT')issues.push('REPORT_AUTHORITY_INVALID');
  if(!clean(report.policy_version))issues.push('POLICY_VERSION_REQUIRED');
  if(!clean(report.evidence_receipt_id))issues.push('EVIDENCE_RECEIPT_REQUIRED');
  if(!clean(report?.scope?.member_id)||!clean(report?.scope?.subject)||!clean(report?.scope?.concept_skill_target))issues.push('SCOPE_REQUIRED');
  if(!['HOLD','HUMAN_REVIEW_AVAILABLE'].includes(clean(report.decision)))issues.push('REPORT_DECISION_INVALID');
  return {ok:issues.length===0,issues};
}
function appendEvaluation(ledgerInput={},report={},options={}){
  const checked=validateReport(report);
  if(!checked.ok)return {ok:false,reason:'INVALID_PROMOTION_REPORT',issues:checked.issues};
  const ledger=JSON.parse(JSON.stringify(ledgerInput?.ledger_version?ledgerInput:emptyLedger()));
  const reportDigest=digest(report);
  const existing=ledger.entries.find(e=>
    e.entry_type==='ESTIMATOR_EVALUATION' &&
    e.scope_key===scopeKey(report.scope) &&
    e.policy_version===report.policy_version &&
    e.evidence_receipt_id===report.evidence_receipt_id &&
    e.report_digest_sha256===reportDigest
  );
  if(existing)return {ok:true,ledger,entry:existing,deduplicated:true};
  const parent=ledger.entries.at(-1)||null;
  const payload={
    entry_type:'ESTIMATOR_EVALUATION',
    created_at:clean(options.created_at)||new Date(0).toISOString(),
    scope:report.scope,
    scope_key:scopeKey(report.scope),
    policy_version:report.policy_version,
    evidence_receipt_id:report.evidence_receipt_id,
    verified_target_count:report.verified_target_count??null,
    decision:report.decision,
    promotion_review_available:report.promotion_review_available===true,
    dataset_blockers:report.dataset_blockers||[],
    candidates:report.candidates||{},
    report_digest_sha256:reportDigest,
    parent_entry_id:parent?.entry_id||null,
    retention:RETENTION,
    disposition:report.decision==='HUMAN_REVIEW_AVAILABLE'?'REVIEW_AVAILABLE_RETAINED':'HOLD_RETAINED',
    reconsider_on:['NEW_EVIDENCE_RECEIPT','POLICY_VERSION_CHANGE','MANUAL_REVIEW']
  };
  payload.entry_id='eval:'+digest(payload).slice(0,24);
  if(ledger.entries.some(e=>e.entry_id===payload.entry_id))return {ok:true,ledger,entry:ledger.entries.find(e=>e.entry_id===payload.entry_id),deduplicated:true};
  ledger.entries.push(payload);
  return {ok:true,ledger,entry:payload,deduplicated:false};
}
function appendDecision(ledgerInput={},input={}){
  const ledger=JSON.parse(JSON.stringify(ledgerInput?.ledger_version?ledgerInput:emptyLedger()));
  const target=ledger.entries.find(e=>e.entry_id===clean(input.evaluation_entry_id)&&e.entry_type==='ESTIMATOR_EVALUATION');
  if(!target)return {ok:false,reason:'EVALUATION_ENTRY_NOT_FOUND'};
  const decision=clean(input.decision);
  if(!['PROMOTED','REJECTED','DEFERRED'].includes(decision))return {ok:false,reason:'DECISION_INVALID'};
  if(decision==='PROMOTED'&&target.decision!=='HUMAN_REVIEW_AVAILABLE')return {ok:false,reason:'PROMOTION_REVIEW_NOT_AVAILABLE'};
  const parent=ledger.entries.at(-1)||null;
  const payload={
    entry_type:'HUMAN_PROMOTION_DECISION',
    created_at:clean(input.created_at)||new Date(0).toISOString(),
    evaluation_entry_id:target.entry_id,
    scope:target.scope,
    scope_key:target.scope_key,
    policy_version:target.policy_version,
    evidence_receipt_id:target.evidence_receipt_id,
    decision,
    reviewer:clean(input.reviewer)||'HUMAN',
    rationale:clean(input.rationale)||null,
    parent_entry_id:parent?.entry_id||null,
    retention:RETENTION,
    disposition:decision+'_RETAINED'
  };
  payload.entry_id='decision:'+digest(payload).slice(0,24);
  ledger.entries.push(payload);
  return {ok:true,ledger,entry:payload};
}
function currentProjection(ledger={}){
  const latestEval=new Map();
  const decisions=new Map();
  for(const e of ledger.entries||[]){
    if(e.entry_type==='ESTIMATOR_EVALUATION')latestEval.set(e.scope_key,e);
    if(e.entry_type==='HUMAN_PROMOTION_DECISION')decisions.set(e.evaluation_entry_id,e);
  }
  return [...latestEval.values()].map(e=>({
    scope_key:e.scope_key,
    latest_evaluation_entry_id:e.entry_id,
    evidence_receipt_id:e.evidence_receipt_id,
    policy_version:e.policy_version,
    decision:e.decision,
    human_decision:decisions.get(e.entry_id)?.decision||null,
    retained_history_count:(ledger.entries||[]).filter(x=>x.scope_key===e.scope_key).length,
    needs_reconsideration:e.decision==='HOLD'
  }));
}
function reconsiderationQueue(ledger={},triggers={}){
  const projection=currentProjection(ledger);
  const receiptByScope=triggers.evidence_receipt_by_scope||{};
  const policyVersion=clean(triggers.policy_version);
  const queue=[];
  for(const p of projection){
    const newReceipt=clean(receiptByScope[p.scope_key]);
    const receiptChanged=!!newReceipt&&newReceipt!==p.evidence_receipt_id;
    const policyChanged=!!policyVersion&&policyVersion!==p.policy_version;
    if((p.needs_reconsideration||p.decision==='HUMAN_REVIEW_AVAILABLE')&&(receiptChanged||policyChanged)){
      queue.push({
        scope_key:p.scope_key,
        previous_evaluation_entry_id:p.latest_evaluation_entry_id,
        reasons:[receiptChanged?'NEW_EVIDENCE_RECEIPT':null,policyChanged?'POLICY_VERSION_CHANGE':null].filter(Boolean),
        next_evidence_receipt_id:newReceipt||p.evidence_receipt_id,
        next_policy_version:policyVersion||p.policy_version
      });
    }
  }
  return queue;
}
function validateLedger(ledger={}){
  const issues=[];
  if(ledger.ledger_version!==VERSION)issues.push('LEDGER_VERSION_INVALID');
  if(ledger.retention!==RETENTION)issues.push('RETENTION_INVALID');
  const ids=new Set();
  let prev=null;
  for(const e of ledger.entries||[]){
    if(ids.has(e.entry_id))issues.push('DUPLICATE_ENTRY_ID');
    ids.add(e.entry_id);
    if(e.parent_entry_id!==(prev?.entry_id||null))issues.push('PARENT_CHAIN_MISMATCH:'+e.entry_id);
    if(e.retention!==RETENTION)issues.push('ENTRY_RETENTION_INVALID:'+e.entry_id);
    prev=e;
  }
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({
  VERSION,RETENTION,emptyLedger,appendEvaluation,appendDecision,currentProjection,reconsiderationQueue,validateLedger,digest,scopeKey
});
