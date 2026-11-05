import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createSession } from '../netlify/functions/_auth.mjs';
import { createBadgeSourceKeyAdmin } from '../netlify/functions/_badge_source_key_admin.mjs';
import { handleBadgeSourceKeyRegister } from '../netlify/functions/badge-source-key-register.mjs';

process.env.TAKY_SESSION_SECRET='test-session-secret';

function memoryStore(){
  const m=new Map();
  return {
    async get(key,{type}={}){
      if(!m.has(key))return null;
      const value=m.get(key);
      return type==='json'?structuredClone(value):value;
    },
    async setJSON(key,value){m.set(key,structuredClone(value));}
  };
}

const pair=await crypto.webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicJwk=await crypto.webcrypto.subtle.exportKey('jwk',pair.publicKey);
const body={app_id:'SNAP_POP',installation_id:'snap-install-1',public_jwk:publicJwk};

{
  const response=await handleBadgeSourceKeyRegister(new Request('http://local',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  }),{
    adminFactory:async()=>createBadgeSourceKeyAdmin({store:memoryStore()})
  });
  assert.equal(response.status,401);
}

{
  const session=createSession(process.env.TAKY_SESSION_SECRET,300);
  const store=memoryStore();
  const response=await handleBadgeSourceKeyRegister(new Request('http://local',{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'cookie':'taky_session='+encodeURIComponent(session)
    },
    body:JSON.stringify(body)
  }),{
    adminFactory:async()=>createBadgeSourceKeyAdmin({store})
  });
  assert.equal(response.status,201);
  const result=await response.json();
  assert.equal(result.ok,true);
  assert.equal(result.app_id,'SNAP_POP');
  assert.equal(result.badge_activation_authorized,false);
  assert.equal(result.economy_mutation_authorized,false);
}

console.log('badge source key register endpoint: PASS');
