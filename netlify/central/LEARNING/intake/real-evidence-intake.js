'use strict';

const Receipt=require('../receipts/real-evidence-receipt.js');
const clean=v=>String(v??'').trim();

function scopeKey(e={}){
  return [
    clean(e.member_id),
    clean(e.subject).toLowerCase(),
    clean(e.concept_skill_target).toLowerCase()
  ].join('::');
}

function partitionVerifiedEvidence(evidence=[]){
  const groups=new Map();
  const rejected=[];
  for(const row of (Array.isArray(evidence)?evidence:[])){
    const checked=Receipt.validateCanonicalVerified(row||{});
    if(!checked.ok){
      rejected.push({event_id:row?.event_id||null,issues:checked.issues});
      continue;
    }
    const key=scopeKey(row);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }
  return {
    groups:[...groups.entries()].map(([key,rows])=>({key,rows})),
    rejected
  };
}

function issueScopeReceipts(evidence=[],options={}){
  const partitioned=partitionVerifiedEvidence(evidence);
  const receipts=[];
  const failures=[];
  for(const group of partitioned.groups){
    const issued=Receipt.issueBatchReceipt(group.rows,{
      created_at:options.created_at,
      receipt_id:options.receipt_id_prefix?clean(options.receipt_id_prefix)+':'+group.key:undefined
    });
    if(!issued.ok)failures.push({scope_key:group.key,reason:issued.reason});
    else receipts.push({
      scope_key:group.key,
      receipt:issued.receipt,
      canonical_evidence:issued.canonical_evidence
    });
  }
  return {
    ok:failures.length===0,
    receipt_groups:receipts,
    rejected:partitioned.rejected,
    failures
  };
}

module.exports=Object.freeze({scopeKey,partitionVerifiedEvidence,issueScopeReceipts});
