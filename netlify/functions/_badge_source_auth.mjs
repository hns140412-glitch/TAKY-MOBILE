import crypto from 'node:crypto';

const subtle=crypto.webcrypto.subtle;

function b64urlToBytes(value=''){
  const normalized=String(value).replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  return Uint8Array.from(Buffer.from(padded,'base64'));
}

export function canonicalBadgeSourceMessage(observation){
  if(!observation||typeof observation!=='object') throw new Error('BADGE_SOURCE_AUTH_OBSERVATION_REQUIRED');
  const fields=[
    observation.contract_version,
    observation.event_id,
    observation.app_id,
    observation.event_family,
    observation.behavior_code,
    observation.occurred_at,
    observation.source_contract_id,
    observation.evidence_ref,
    observation.explicit_child_action===true?'true':'false'
  ];
  if(fields.some(v=>v===undefined||v===null||String(v).trim()===''))
    throw new Error('BADGE_SOURCE_AUTH_CANONICAL_FIELDS_REQUIRED');
  return fields.map(v=>String(v).trim()).join('\n');
}

export function createMemoryBadgeSourceKeyRegistry(records=[]){
  const map=new Map(records.map(record=>[record.app_id+':'+record.key_id,Object.freeze({...record})]));
  return Object.freeze({
    async get(appId,keyId){return map.get(appId+':'+keyId)||null;}
  });
}

export async function verifyBadgeSourceSignature(observation,{keyId,signature,keyRegistry}={}){
  if(!keyRegistry||typeof keyRegistry.get!=='function')
    throw new Error('BADGE_SOURCE_AUTH_KEY_REGISTRY_REQUIRED');
  if(!keyId) throw new Error('BADGE_SOURCE_AUTH_KEY_ID_REQUIRED');
  if(!signature) throw new Error('BADGE_SOURCE_AUTH_SIGNATURE_REQUIRED');

  const record=await keyRegistry.get(observation.app_id,keyId);
  if(!record) throw new Error('BADGE_SOURCE_AUTH_KEY_UNKNOWN');
  if(record.status!=='ACTIVE') throw new Error('BADGE_SOURCE_AUTH_KEY_INACTIVE');
  if(record.app_id!==observation.app_id) throw new Error('BADGE_SOURCE_AUTH_APP_MISMATCH');
  if(!record.public_jwk) throw new Error('BADGE_SOURCE_AUTH_PUBLIC_KEY_REQUIRED');

  const key=await subtle.importKey('jwk',record.public_jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const data=new TextEncoder().encode(canonicalBadgeSourceMessage(observation));
  const ok=await subtle.verify({name:'ECDSA',hash:'SHA-256'},key,b64urlToBytes(signature),data);
  if(!ok) throw new Error('BADGE_SOURCE_AUTH_SIGNATURE_INVALID');

  return Object.freeze({
    authenticated:true,
    app_id:record.app_id,
    key_id:record.key_id,
    installation_id:record.installation_id||null
  });
}
