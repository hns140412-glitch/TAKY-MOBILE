import assert from 'node:assert/strict';
import { validateBadgeObservation } from '../netlify/functions/_badge_transport_core.mjs';

const common={
  contract_version:'TAKY_BADGE_SOURCE_OBSERVATION_V1',
  occurred_at:'2026-10-02T12:00:00.000Z',
  explicit_child_action:true,
  payload:{},
  disposition:'OBSERVATION_ONLY',
  badge_award_authorized:false,
  economy_mutation_authorized:false,
  catalog_activation_allowed:false
};

const fixtures=[
  {
    ...common,
    event_id:'ready_badge_choice_s1',
    app_id:'READY_SET',
    event_family:'SELF_CHOICE',
    behavior_code:'SELF_CHOICE',
    source_contract_id:'READY_EXPLICIT_TASK_SWITCH_V1',
    evidence_ref:'ready-task-choice:s1'
  },
  {
    ...common,
    event_id:'hide_badge_error_review_sheet1_2026-10-02T12:00:00.000Z',
    app_id:'HIDE_SEEK',
    event_family:'ERROR_DISCOVERY',
    behavior_code:'ERROR_REVIEW',
    source_contract_id:'HIDE_EXPLICIT_RETRACE_REVIEW_V1',
    evidence_ref:'hide-retrace-review:sheet1:2026-10-02T12:00:00.000Z'
  },
  {
    ...common,
    event_id:'snap_hint_1',
    app_id:'SNAP_POP',
    event_family:'HELP_REQUEST',
    behavior_code:'SELF_HELP_REQUEST',
    source_contract_id:'SNAP_POP_HINT_REQUEST_V1',
    evidence_ref:'hint:explore1:0:1'
  },
  {
    ...common,
    event_id:'learning_calc_check_math_fractions_1',
    app_id:'LEARNING_ENGINE_CORE',
    event_family:'ERROR_CORRECTION',
    behavior_code:'CALCULATION_CHECK',
    source_contract_id:'LEARNING_VERIFIED_CALCULATION_CHECK_V1',
    evidence_ref:'learning-calculation-check:before:after'
  }
];

for(const fixture of fixtures){
  const out=validateBadgeObservation(fixture);
  assert.equal(out.app_id,fixture.app_id);
  assert.equal(out.source_contract_id,fixture.source_contract_id);
  assert.equal(out.behavior_code,fixture.behavior_code);
}

console.log('badge producer compatibility: PASS');
