const CONTRACT = 'TAKY_BADGE_SOURCE_OBSERVATION_V1';
const ALLOWED_APPS = new Set(['READY_SET','HIDE_SEEK','SNAP_POP']);
const REQUIRED_KEYS = [
  'contract_version','event_id','app_id','event_family','behavior_code',
  'occurred_at','source_contract_id','evidence_ref','explicit_child_action',
  'disposition','badge_award_authorized','economy_mutation_authorized',
  'catalog_activation_allowed'
];

function clean(value,max=220){
  return typeof value === 'string' ? value.trim().slice(0,max) : '';
}

export function validateBadgeObservation(input){
  if(!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('BADGE_TRANSPORT_INPUT_OBJECT_REQUIRED');

  for(const key of REQUIRED_KEYS){
    if(!(key in input)) throw new Error(`BADGE_TRANSPORT_MISSING_${key.toUpperCase()}`);
  }

  if(input.contract_version !== CONTRACT)
    throw new Error('BADGE_TRANSPORT_CONTRACT_INVALID');

  const appId=clean(input.app_id,80).toUpperCase();
  if(!ALLOWED_APPS.has(appId))
    throw new Error('BADGE_TRANSPORT_APP_INVALID');

  const eventId=clean(input.event_id,160);
  const eventFamily=clean(input.event_family,80).toUpperCase();
  const behaviorCode=clean(input.behavior_code,120).toUpperCase();
  const sourceContractId=clean(input.source_contract_id,140);
  const evidenceRef=clean(input.evidence_ref,220);
  const occurredAt=clean(input.occurred_at,80);

  if(!eventId) throw new Error('BADGE_TRANSPORT_EVENT_ID_REQUIRED');
  if(!eventFamily) throw new Error('BADGE_TRANSPORT_FAMILY_REQUIRED');
  if(!behaviorCode) throw new Error('BADGE_TRANSPORT_BEHAVIOR_REQUIRED');
  if(!sourceContractId) throw new Error('BADGE_TRANSPORT_SOURCE_CONTRACT_REQUIRED');
  if(!evidenceRef) throw new Error('BADGE_TRANSPORT_EVIDENCE_REF_REQUIRED');
  if(!occurredAt || Number.isNaN(Date.parse(occurredAt)))
    throw new Error('BADGE_TRANSPORT_OCCURRED_AT_INVALID');

  if(input.explicit_child_action !== true)
    throw new Error('BADGE_TRANSPORT_EXPLICIT_CHILD_ACTION_REQUIRED');
  if(input.disposition !== 'OBSERVATION_ONLY')
    throw new Error('BADGE_TRANSPORT_DISPOSITION_INVALID');
  if(input.badge_award_authorized !== false)
    throw new Error('BADGE_TRANSPORT_AWARD_AUTHORITY_FORBIDDEN');
  if(input.economy_mutation_authorized !== false)
    throw new Error('BADGE_TRANSPORT_ECONOMY_AUTHORITY_FORBIDDEN');
  if(input.catalog_activation_allowed !== false)
    throw new Error('BADGE_TRANSPORT_ACTIVATION_AUTHORITY_FORBIDDEN');

  return Object.freeze({
    ...input,
    app_id:appId,
    event_id:eventId,
    event_family:eventFamily,
    behavior_code:behaviorCode,
    source_contract_id:sourceContractId,
    evidence_ref:evidenceRef,
    occurred_at:occurredAt
  });
}

function stableFingerprint(observation){
  return JSON.stringify({
    contract_version:observation.contract_version,
    event_id:observation.event_id,
    app_id:observation.app_id,
    event_family:observation.event_family,
    behavior_code:observation.behavior_code,
    occurred_at:observation.occurred_at,
    source_contract_id:observation.source_contract_id,
    evidence_ref:observation.evidence_ref,
    explicit_child_action:observation.explicit_child_action,
    payload:observation.payload ?? null
  });
}

export function createMemoryBadgeObservationLedger(){
  const byKey=new Map();
  return {
    get(key){ return byKey.get(key) ?? null; },
    put(key,entry){ if(byKey.has(key)) throw new Error('BADGE_TRANSPORT_LEDGER_APPEND_ONLY'); byKey.set(key,entry); return entry; },
    entries(){ return [...byKey.values()]; }
  };
}

export function ingestBadgeObservation(input,{ledger,now=()=>new Date().toISOString()}={}){
  if(!ledger || typeof ledger.get !== 'function' || typeof ledger.put !== 'function')
    throw new Error('BADGE_TRANSPORT_LEDGER_REQUIRED');

  const observation=validateBadgeObservation(input);
  const key=`${observation.app_id}:${observation.event_id}`;
  const fingerprint=stableFingerprint(observation);
  const existing=ledger.get(key);

  if(existing){
    if(existing.fingerprint !== fingerprint)
      throw new Error('BADGE_TRANSPORT_DUPLICATE_CONFLICT');
    return Object.freeze({
      status:'DUPLICATE_ACCEPTED',
      receipt_id:existing.receipt_id,
      dedupe_key:key,
      matcher_input:existing.matcher_input
    });
  }

  const matcherInput=Object.freeze({
    appId:observation.app_id,
    eventFamily:observation.event_family,
    behaviorCode:observation.behavior_code,
    sourceContractId:observation.source_contract_id,
    explicit_child_action:true,
    source_event_id:observation.event_id,
    evidence_ref:observation.evidence_ref
  });

  const entry=Object.freeze({
    receipt_id:`badge_receipt_${observation.app_id.toLowerCase()}_${observation.event_id}`,
    received_at:now(),
    dedupe_key:key,
    fingerprint,
    observation,
    matcher_input:matcherInput,
    disposition:'TRANSPORTED_OBSERVATION_ONLY',
    badge_award_authorized:false,
    economy_mutation_authorized:false,
    catalog_activation_allowed:false
  });
  ledger.put(key,entry);

  return Object.freeze({
    status:'ACCEPTED',
    receipt_id:entry.receipt_id,
    dedupe_key:key,
    matcher_input:matcherInput
  });
}
