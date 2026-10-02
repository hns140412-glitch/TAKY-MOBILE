import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { canonicalBadgeSourceMessage, createMemoryBadgeSourceKeyRegistry, verifyBadgeSourceSignature } from '../netlify/functions/_badge_source_auth.mjs';

const subtle=crypto.webcrypto.subtle;
const pair=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicJwk=await subtle.exportKey('jwk',pair.publicKey);

const observation={
  contract_version:'TAKY_BADGE_SOURCE_OBSERVATION_V1',
  event_id:'ready_evt_1',
  app_id:'READY_SET',
  event_family:'SELF_CHOICE',
  behavior_code:'SELF_CHOICE',
  occurred_at:'2026-10-02T12:00:00.000Z',
  source_contract_id:'READY_EXPLICIT_TASK_SWITCH_V1',
  evidence_ref:'ready:task:s1',
  explicit_child_action:true
};

const data=new TextEncoder().encode(canonicalBadgeSourceMessage(observation));
const raw=new Uint8Array(await subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,data));
const signature=Buffer.from(raw).toString('base64url');

const registry=createMemoryBadgeSourceKeyRegistry([{
  app_id:'READY_SET',
  key_id:'ready-install-1',
  installation_id:'install-1',
  status:'ACTIVE',
  public_jwk:publicJwk
}]);

const verified=await verifyBadgeSourceSignature(observation,{keyId:'ready-install-1',signature,keyRegistry:registry});
assert.equal(verified.authenticated,true);
assert.equal(verified.app_id,'READY_SET');

await assert.rejects(()=>verifyBadgeSourceSignature({...observation,event_id:'tampered'},{keyId:'ready-install-1',signature,keyRegistry:registry}),/SIGNATURE_INVALID/);
await assert.rejects(()=>verifyBadgeSourceSignature(observation,{keyId:'unknown',signature,keyRegistry:registry}),/KEY_UNKNOWN/);

console.log('badge source auth: PASS');
