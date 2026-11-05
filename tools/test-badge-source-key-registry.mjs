import assert from 'node:assert/strict';
import { createNetlifyBlobsBadgeSourceKeyRegistry } from '../netlify/functions/_badge_source_key_registry.mjs';

function memoryStore(){
  const m=new Map();
  return {
    async get(key,{type}={}){
      if(!m.has(key)) return null;
      const value=m.get(key);
      return type==='json'?structuredClone(value):value;
    },
    async setJSON(key,value){m.set(key,structuredClone(value));}
  };
}

const store=memoryStore();
await store.setJSON('keys/READY_SET/key-1.json',{
  app_id:'READY_SET',
  key_id:'key-1',
  status:'ACTIVE',
  public_jwk:{kty:'EC',crv:'P-256',x:'x',y:'y'}
});

const registry=createNetlifyBlobsBadgeSourceKeyRegistry({store});
const found=await registry.get('READY_SET','key-1');
assert.equal(found.app_id,'READY_SET');
assert.equal(found.key_id,'key-1');
assert.equal(await registry.get('READY_SET','missing'),null);

console.log('badge source key registry: PASS');
