import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createBadgeSourceKeyAdmin, deriveBadgeSourceKeyId } from '../netlify/functions/_badge_source_key_admin.mjs';

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

const pair=await crypto.webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicJwk=await crypto.webcrypto.subtle.exportKey('jwk',pair.publicKey);
const input={app_id:'HIDE_SEEK',installation_id:'hide-install-1',public_jwk:publicJwk};

const id1=deriveBadgeSourceKeyId(input);
const id2=deriveBadgeSourceKeyId(input);
assert.equal(id1,id2);

const store=memoryStore();
const admin=createBadgeSourceKeyAdmin({store,now:()=> '2026-10-02T13:00:00.000Z'});
const first=await admin.register(input);
const second=await admin.register(input);
assert.equal(first.key_id,id1);
assert.deepEqual(second,first);
assert.equal(first.activation_authority,false);
assert.equal(first.economy_authority,false);

console.log('badge source key admin: PASS');
