import crypto from 'node:crypto';
import { getStore, getDeployStore } from '@netlify/blobs';

const STORE_NAME='taky-badge-source-keys';
const ALLOWED_APPS=new Set(['READY_SET','HIDE_SEEK','SNAP_POP']);

function clean(value,max=220){
  return typeof value==='string'?value.trim().slice(0,max):'';
}

function cleanSegment(value){
  return encodeURIComponent(String(value||'').trim());
}

function canonicalPublicJwk(jwk){
  if(!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||!jwk.x||!jwk.y)
    throw new Error('BADGE_SOURCE_KEY_PUBLIC_JWK_INVALID');
  return JSON.stringify({crv:'P-256',kty:'EC',x:String(jwk.x),y:String(jwk.y)});
}

export function deriveBadgeSourceKeyId({app_id,installation_id,public_jwk}={}){
  const appId=clean(app_id,80).toUpperCase();
  const installationId=clean(installation_id,160);
  if(!ALLOWED_APPS.has(appId)) throw new Error('BADGE_SOURCE_KEY_APP_INVALID');
  if(!installationId) throw new Error('BADGE_SOURCE_KEY_INSTALLATION_REQUIRED');
  const material=appId+'\n'+installationId+'\n'+canonicalPublicJwk(public_jwk);
  return crypto.createHash('sha256').update(material).digest('base64url').slice(0,32);
}

function resolveStore(){
  const deployContext=globalThis.Netlify?.context?.deploy?.context;
  if(deployContext==='production'){
    return getStore(STORE_NAME,{consistency:'strong'});
  }
  return getDeployStore(STORE_NAME);
}

export function createBadgeSourceKeyAdmin({store=resolveStore(),now=()=>new Date().toISOString()}={}){
  return Object.freeze({
    async register(input){
      const appId=clean(input?.app_id,80).toUpperCase();
      const installationId=clean(input?.installation_id,160);
      const publicJwk=input?.public_jwk;
      const keyId=deriveBadgeSourceKeyId({
        app_id:appId,
        installation_id:installationId,
        public_jwk:publicJwk
      });
      const key='keys/'+cleanSegment(appId)+'/'+cleanSegment(keyId)+'.json';
      const existing=await store.get(key,{type:'json'});
      const record={
        app_id:appId,
        key_id:keyId,
        installation_id:installationId,
        status:'ACTIVE',
        public_jwk:{
          kty:'EC',
          crv:'P-256',
          x:String(publicJwk.x),
          y:String(publicJwk.y)
        },
        registered_at:existing?.registered_at||now(),
        activation_authority:false,
        economy_authority:false
      };
      if(existing){
        const same=JSON.stringify({
          app_id:existing.app_id,
          key_id:existing.key_id,
          installation_id:existing.installation_id,
          status:existing.status,
          public_jwk:existing.public_jwk
        })===JSON.stringify({
          app_id:record.app_id,
          key_id:record.key_id,
          installation_id:record.installation_id,
          status:record.status,
          public_jwk:record.public_jwk
        });
        if(!same) throw new Error('BADGE_SOURCE_KEY_REGISTRATION_CONFLICT');
        return existing;
      }
      await store.setJSON(key,record);
      return record;
    }
  });
}
