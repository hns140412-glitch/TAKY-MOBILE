import assert from 'node:assert/strict';
import { createNetlifyBlobsBadgeLedger } from '../netlify/functions/_badge_blobs_ledger.mjs';

function memoryStore(){
  const m=new Map();
  return {
    async get(key,{type}={}){
      if(!m.has(key)) return null;
      const v=m.get(key);
      return type==='json'?structuredClone(v):v;
    },
    async setJSON(key,value){m.set(key,structuredClone(value));},
    async list({prefix}={}){
      return {blobs:[...m.keys()].filter(k=>!prefix||k.startsWith(prefix)).map(key=>({key,etag:'test'})),directories:[]};
    }
  };
}

const store=memoryStore();
const ledger=createNetlifyBlobsBadgeLedger({store});
const entry={
  observation:{
    contract_version:'TAKY_BADGE_SOURCE_OBSERVATION_V1',
    app_id:'READY_SET',
    event_id:'evt:1',
    event_family:'SELF_CHOICE',
    behavior_code:'SELF_CHOICE',
    source_contract_id:'READY_EXPLICIT_TASK_SWITCH_V1',
    evidence_ref:'ready:evt:1',
    explicit_child_action:true
  }
};

await ledger.append('READY_SET:evt:1',entry);
assert.deepEqual(await ledger.get('READY_SET:evt:1'),entry);
await ledger.append('READY_SET:evt:1',entry);

const conflictEntry={
  observation:{...entry.observation,behavior_code:'DIFFERENT'}
};
await assert.rejects(()=>ledger.append('READY_SET:evt:1',conflictEntry),/EVENT_CONFLICT/);

console.log('badge blobs ledger: PASS');
