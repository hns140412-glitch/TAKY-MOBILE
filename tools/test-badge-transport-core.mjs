import assert from 'node:assert/strict';
import {
  validateBadgeObservation,
  createMemoryBadgeObservationLedger,
  ingestBadgeObservation
} from '../netlify/functions/_badge_transport_core.mjs';

function sample(app='READY_SET'){
  return {
    contract_version:'TAKY_BADGE_SOURCE_OBSERVATION_V1',
    event_id:`evt_${app.toLowerCase()}_1`,
    app_id:app,
    event_family:'SELF_CHOICE',
    behavior_code:'SELF_CHOICE',
    occurred_at:'2026-10-02T12:00:00.000Z',
    source_contract_id:'TEST_SOURCE_V1',
    evidence_ref:'test:evidence:1',
    explicit_child_action:true,
    payload:{ taskId:'task_1' },
    disposition:'OBSERVATION_ONLY',
    badge_award_authorized:false,
    economy_mutation_authorized:false,
    catalog_activation_allowed:false
  };
}

for (const app of ['READY_SET','HIDE_SEEK','SNAP_POP']){
  const out=validateBadgeObservation(sample(app));
  assert.equal(out.app_id,app);
}

{
  const ledger=createMemoryBadgeObservationLedger();
  const first=ingestBadgeObservation(sample(),{ledger,now:()=> '2026-10-02T12:01:00.000Z'});
  const second=ingestBadgeObservation(sample(),{ledger,now:()=> '2026-10-02T12:02:00.000Z'});
  assert.equal(first.status,'ACCEPTED');
  assert.equal(second.status,'DUPLICATE_ACCEPTED');
  assert.equal(first.receipt_id,second.receipt_id);
  assert.equal(ledger.entries().length,1);
}

{
  const ledger=createMemoryBadgeObservationLedger();
  ingestBadgeObservation(sample(),{ledger});
  const conflict={...sample(),behavior_code:'DIFFERENT_BEHAVIOR'};
  assert.throws(()=>ingestBadgeObservation(conflict,{ledger}),/DUPLICATE_CONFLICT/);
}

{
  const bad={...sample(),explicit_child_action:false};
  assert.throws(()=>validateBadgeObservation(bad),/EXPLICIT_CHILD_ACTION_REQUIRED/);
}

{
  const bad={...sample(),badge_award_authorized:true};
  assert.throws(()=>validateBadgeObservation(bad),/AWARD_AUTHORITY_FORBIDDEN/);
}

{
  const ledger=createMemoryBadgeObservationLedger();
  const out=ingestBadgeObservation(sample(),{ledger});
  assert.deepEqual(out.matcher_input,{
    appId:'READY_SET',
    eventFamily:'SELF_CHOICE',
    behaviorCode:'SELF_CHOICE',
    sourceContractId:'TEST_SOURCE_V1',
    explicit_child_action:true,
    source_event_id:'evt_ready_set_1',
    evidence_ref:'test:evidence:1'
  });
}

console.log('badge transport core: PASS');
