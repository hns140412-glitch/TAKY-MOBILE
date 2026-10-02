import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { handleBadgeObservation } from '../netlify/functions/badge-observation.mjs';
import { createMemoryBadgeObservationLedger } from '../netlify/functions/_badge_transport_core.mjs';
import {
  canonicalBadgeSourceMessage,
  createMemoryBadgeSourceKeyRegistry
} from '../netlify/functions/_badge_source_auth.mjs';

const subtle=crypto.webcrypto.subtle;
const pair=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicJwk=await subtle.exportKey('jwk',pair.publicKey);

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

const sign=async observation=>{
  const data=new TextEncoder().encode(canonicalBadgeSourceMessage(observation));
  const raw=new Uint8Array(await subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,data));
  return Buffer.from(raw).toString('base64url');
};

const keyRegistry=createMemoryBadgeSourceKeyRegistry([{
  app_id:'READY_SET',
  key_id:'ready-install-1',
  installation_id:'install-1',
  status:'ACTIVE',
  public_jwk:publicJwk
}]);

function requestFor(observation,{signature,keyId='ready-install-1'}={}){
  return new Request('http://local',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      ...(keyId?{'x-taky-badge-key-id':keyId}:{}),
      ...(signature?{'x-taky-badge-signature':signature}:{})
    },
    body:JSON.stringify(observation)
  });
}

{
  const ledger=createMemoryBadgeObservationLedger();
  const signature=await sign(sample);
  const response=await handleBadgeObservation(requestFor(sample,{signature}),{
    ledgerFactory:async()=>ledger,
    keyRegistryFactory:async()=>keyRegistry
  });
  assert.equal(response.status,202);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.receipt.status,'ACCEPTED');
}

{
  const ledger=createMemoryBadgeObservationLedger();
  const response=await handleBadgeObservation(requestFor(sample),{
    ledgerFactory:async()=>ledger,
    keyRegistryFactory:async()=>keyRegistry
  });
  assert.equal(response.status,401);
  assert.equal(ledger.entries().length,0);
}

{
  const ledger=createMemoryBadgeObservationLedger();
  const signature=await sign(sample);
  const tampered={...sample,event_id:'tampered'};
  const response=await handleBadgeObservation(requestFor(tampered,{signature}),{
    ledgerFactory:async()=>ledger,
    keyRegistryFactory:async()=>keyRegistry
  });
  assert.equal(response.status,401);
  assert.equal(ledger.entries().length,0);
}

{
  const signature=await sign(sample);
  const response=await handleBadgeObservation(requestFor(sample,{signature}),{
    ledgerFactory:async()=>{throw new Error('TEST_LEDGER_UNAVAILABLE')},
    keyRegistryFactory:async()=>keyRegistry
  });
  assert.equal(response.status,503);
  const body=await response.json();
  assert.equal(body.ok,false);
  assert.equal(body.disposition,'FAIL_CLOSED');
}

console.log('badge observation endpoint: PASS');
