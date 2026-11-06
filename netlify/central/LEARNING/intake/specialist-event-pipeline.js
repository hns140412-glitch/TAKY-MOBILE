'use strict';

const Canonical=require('../adapters/canonical-evidence.js');
const Verification=require('../verification/verification-layer.js');
const Receipt=require('../receipts/real-evidence-receipt.js');
const EvaluationLedger=require('../lifecycle/evaluation-ledger.js');
const EvaluationTrigger=require('../lifecycle/real-evidence-evaluation-trigger.js');
const Intake=require('./real-evidence-intake.js');

const VERSION='TAKY_SPECIALIST_EVENT_PIPELINE_V1';
const clean=v=>String(v??'').trim();

function emptyState(){
  return {
    pipeline_version:VERSION,
    scope_receipts:{},
    observation_only:[],
    evaluation_ledger:EvaluationLedger.emptyLedger()
  };
}

function eventEnvelopeFromReadyEvidence(evidence={}){
  return {
    source:'ready-set',
    event_id:clean(evidence.event_id),
    occurred_at:clean(evidence.observed_at||evidence.at),
    event_type:'READY_EVIDENCE_RECORD',
    payload:evidence
  };
}

function snapReceiptFromInput(input={}){
  if(!input?.verification_input)return null;
  const issued=Verification.issueReceipt(input.verification_input);
  return issued.ok?issued.receipt:{error:issued};
}

function canonicalize(input={}){
  const source=clean(input.source_app||input.event?.source||input.event?.app||input.evidence?.source_app);
  let event=input.event||null;
  let context={...(input.context||{})};

  if(!event&&input.evidence&&source==='ready-set'){
    event=eventEnvelopeFromReadyEvidence(input.evidence);
    context={...context,source_app:'ready-set',evidence_type:input.evidence.evidence_type};
  }
  if(!event)return {ok:false,reason:'EVENT_REQUIRED'};

  if(source==='snap-pop'&&input.verification_input){
    const receipt=snapReceiptFromInput(input);
    if(receipt?.error)return {ok:false,reason:'SNAP_VERIFICATION_RECEIPT_INVALID',detail:receipt.error};
    context={...context,verification_receipt:receipt};
  }

  const evidence=Canonical.normalize(event,{...context,source_app:source||context.source_app});
  const checked=Canonical.validateCanonical(evidence);
  return checked.ok?{ok:true,evidence}:{ok:false,reason:'CANONICAL_INVALID',issues:checked.issues,evidence};
}

function appendObservationOnly(existing=[],rows=[]){
  const byId=new Map((Array.isArray(existing)?existing:[]).map(x=>[clean(x.event_id),x]).filter(([id])=>id));
  for(const row of rows||[]){
    const id=clean(row.event_id);
    if(id&&!byId.has(id))byId.set(id,row);
  }
  return [...byId.values()].sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at)||clean(a.event_id).localeCompare(clean(b.event_id)));
}

function ingest(stateInput={},inputs=[],options={}){
  const state=JSON.parse(JSON.stringify(stateInput?.pipeline_version?stateInput:emptyState()));
  const accepted=[],rejected=[];

  for(const input of (Array.isArray(inputs)?inputs:[])){
    const normalized=canonicalize(input);
    if(!normalized.ok){rejected.push({reason:normalized.reason,detail:normalized});continue;}
    accepted.push(normalized.evidence);
  }

  const verified=accepted.filter(x=>x.verified_outcome===0||x.verified_outcome===1);
  const observations=accepted.filter(x=>x.verified_outcome===null);
  state.observation_only=appendObservationOnly(state.observation_only,observations);

  const partitioned=Intake.partitionVerifiedEvidence(verified);
  for(const x of partitioned.rejected)rejected.push({reason:'VERIFIED_PARTITION_REJECTED',detail:x});

  const evaluations=[];
  for(const group of partitioned.groups){
    const prior=state.scope_receipts[group.key]||null;
    const priorIds=new Set((prior?.canonical_evidence||[]).map(x=>clean(x.event_id)));
    const fresh=group.rows.filter(x=>!priorIds.has(clean(x.event_id)));

    let issued=null;
    let deduplicated=false;
    if(prior){
      if(!fresh.length){
        issued={ok:true,receipt:prior.receipt,canonical_evidence:prior.canonical_evidence};
        deduplicated=true;
      }else{
        issued=Receipt.extendBatchReceipt(prior.receipt,prior.canonical_evidence,fresh,{
          created_at:options.created_at
        });
      }
    }else{
      issued=Receipt.issueBatchReceipt(fresh,{
        created_at:options.created_at
      });
    }

    if(!issued?.ok){
      rejected.push({reason:'SCOPE_RECEIPT_FAILED',scope_key:group.key,detail:issued});
      continue;
    }

    state.scope_receipts[group.key]={
      receipt:issued.receipt,
      canonical_evidence:issued.canonical_evidence
    };

    if(!deduplicated){
      const evaluation=EvaluationTrigger.evaluateReceipt({
        ledger:state.evaluation_ledger,
        receipt:issued.receipt,
        canonical_evidence:issued.canonical_evidence,
        created_at:options.created_at,
        promotion_policy:options.promotion_policy||{}
      });
      if(!evaluation.ok){
        rejected.push({reason:'EVALUATION_FAILED',scope_key:group.key,detail:evaluation});
        continue;
      }
      state.evaluation_ledger=evaluation.ledger;
      evaluations.push({
        scope_key:group.key,
        receipt_id:issued.receipt.receipt_id,
        event_count:issued.receipt.event_count,
        data_readiness:evaluation.data_readiness,
        benchmark_status:evaluation.benchmark_status,
        decision:evaluation.report?.decision||null
      });
    }else{
      evaluations.push({
        scope_key:group.key,
        receipt_id:issued.receipt.receipt_id,
        event_count:issued.receipt.event_count,
        deduplicated:true
      });
    }
  }

  return {
    ok:rejected.length===0,
    state,
    accepted_count:accepted.length,
    verified_count:verified.length,
    observation_only_count:observations.length,
    rejected,
    evaluations,
    invariant:'APP_EVIDENCE_TO_CANONICAL_RECEIPT_EVALUATION_IS_LOSSLESS'
  };
}

function currentReadiness(state={}){
  return Object.entries(state.scope_receipts||{}).map(([scope_key,group])=>{
    const retrieval=(group.canonical_evidence||[]).filter(x=>x.evidence_type==='MEMORY_RETRIEVAL_EVIDENCE'&&(x.verified_outcome===0||x.verified_outcome===1));
    return {
      scope_key,
      receipt_id:group.receipt?.receipt_id||null,
      verified_retrieval_target_count:retrieval.length,
      remaining_to_30:Math.max(0,30-retrieval.length),
      data_ready:retrieval.length>=30
    };
  });
}

function selfValidate(result={}){
  const issues=[];
  if(result.invariant!=='APP_EVIDENCE_TO_CANONICAL_RECEIPT_EVALUATION_IS_LOSSLESS')issues.push('INVARIANT_MISSING');
  if(result.state?.pipeline_version!==VERSION)issues.push('PIPELINE_VERSION_INVALID');
  if(!EvaluationLedger.validateLedger(result.state?.evaluation_ledger||{}).ok)issues.push('EVALUATION_LEDGER_INVALID');
  for(const group of Object.values(result.state?.scope_receipts||{})){
    const check=Receipt.validateBatchReceipt(group.receipt,group.canonical_evidence);
    if(!check.ok)issues.push('REAL_EVIDENCE_RECEIPT_INVALID');
  }
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,emptyState,eventEnvelopeFromReadyEvidence,canonicalize,ingest,currentReadiness,selfValidate});
