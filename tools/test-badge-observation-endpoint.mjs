import assert from 'node:assert/strict';
import { handleBadgeObservation } from '../netlify/functions/badge-observation.mjs';

const sample={
  contract_version:'TAKY_BADGE_SOURCE_OBSERVATION_V1',
  event_id:'evt_ready_1',
  app_id:'READY_SET',
  event_family:'SELF_CHOICE',
  behavior_code:'SELF_CHOICE',
  occurred_at:'2026-10-02T12:00:00.000Z',
  source_contract_id:'READY_EXPLICIT_TASK_SWITCH_V1',
  evidence_ref:'ready-task-choice:s1',
  explicit_child_action:true,
  payload:{sessionId:'s1'},
  disposition:'OBSERVATION_ONLY',
  badge_award_authorized:false,
  economy_mutation_authorized:false,
  catalog_activation_allowed:false
};

const response=await handleBadgeObservation(new Request('http://local',{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify(sample)
}));
assert.equal(response.status,503);
const body=await response.json();
assert.equal(body.error,'BADGE_TRANSPORT_PERSISTENCE_NOT_CONFIGURED');
assert.equal(body.badge_award_authorized,false);
assert.equal(body.economy_mutation_authorized,false);
assert.equal(body.catalog_activation_allowed,false);

console.log('badge observation endpoint scaffold: PASS');
