'use strict';

const Pipeline=require('./specialist-event-pipeline.js');
const Receipt=require('../receipts/real-evidence-receipt.js');
const clean=v=>String(v??'').trim();

const VERSION='TAKY_LEARNING_EVIDENCE_TRANSPORT_HANDLER_V1';

function observationReceipt(packet={},canonical={}){
  const payload={
    packet_id:clean(packet.packet_id),
    event_id:clean(canonical.event_id),
    observed_at:clean(canonical.observed_at),
    member_id:clean(canonical.member_id),
    subject:clean(canonical.subject).toLowerCase(),
    concept_skill_target:clean(canonical.concept_skill_target).toLowerCase(),
    learning_target_id:canonical.learning_target_id||null,
    evidence_type:clean(canonical.evidence_type),
    source_app:clean(canonical.source_app),
    instrument_version:clean(canonical.instrument_version)
  };
  const digest=Receipt.digest(payload);
  return {
    authority:'OBSERVATION_INGEST_RECEIPT',
    receipt_version:VERSION,
    receipt_id:'observation:'+digest.slice(0,24),
    packet_id:payload.packet_id,
    event_id:payload.event_id,
    evidence_digest_sha256:digest,
    scope:{
      member_id:payload.member_id,
      subject:payload.subject,
      concept_skill_target:payload.concept_skill_target
    },
    immutable:true
  };
}

function packetInput(packet={}){
  return {
    source_app:packet.source_app,
    event:packet.event||null,
    evidence:packet.evidence||null,
    context:packet.context||{},
    verification_input:packet.verification_input||null
  };
}

function ingest(stateInput={},packet={},options={}){
  if(!clean(packet.packet_id))return {ok:false,reason:'PACKET_ID_REQUIRED'};
  const beforeObservationIds=new Set((stateInput?.observation_only||[]).map(x=>clean(x.event_id)));
  const result=Pipeline.ingest(stateInput,[packetInput(packet)],options);
  if(!result.ok)return {ok:false,reason:'PIPELINE_INGEST_FAILED',detail:result};

  if(result.verified_count>0){
    const evaluation=result.evaluations.find(x=>!x.deduplicated)||result.evaluations[0];
    if(!evaluation?.receipt_id)return {ok:false,reason:'REAL_EVIDENCE_RECEIPT_REQUIRED'};
    return {
      ok:true,
      handler_version:VERSION,
      acknowledgement_kind:'REAL_EVIDENCE_RECEIPT',
      receipt_id:evaluation.receipt_id,
      state:result.state,
      readiness:Pipeline.currentReadiness(result.state),
      duplicate:evaluation.deduplicated===true
    };
  }

  if(result.observation_only_count>0){
    const eventId=clean(packet?.event?.event_id||packet?.evidence?.event_id);
    const canonical=(result.state.observation_only||[]).find(x=>clean(x.event_id)===eventId);
    if(!canonical)return {ok:false,reason:'OBSERVATION_CANONICAL_NOT_FOUND'};
    const receipt=observationReceipt(packet,canonical);
    return {
      ok:true,
      handler_version:VERSION,
      acknowledgement_kind:'OBSERVATION_INGEST_RECEIPT',
      receipt_id:receipt.receipt_id,
      observation_receipt:receipt,
      state:result.state,
      readiness:Pipeline.currentReadiness(result.state),
      duplicate:beforeObservationIds.has(eventId)
    };
  }

  return {ok:false,reason:'NO_ACCEPTED_EVIDENCE'};
}

function selfValidate(response={}){
  const issues=[];
  if(!response.ok)issues.push('RESPONSE_NOT_OK');
  if(!['REAL_EVIDENCE_RECEIPT','OBSERVATION_INGEST_RECEIPT'].includes(response.acknowledgement_kind))issues.push('ACK_KIND_INVALID');
  if(!clean(response.receipt_id))issues.push('RECEIPT_ID_REQUIRED');
  if(response.acknowledgement_kind==='OBSERVATION_INGEST_RECEIPT'&&response.observation_receipt?.authority!=='OBSERVATION_INGEST_RECEIPT')issues.push('OBSERVATION_RECEIPT_INVALID');
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,observationReceipt,packetInput,ingest,selfValidate});
