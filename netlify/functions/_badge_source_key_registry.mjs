import { getStore, getDeployStore } from '@netlify/blobs';

const STORE_NAME='taky-badge-source-keys';

function cleanSegment(value){
  return encodeURIComponent(String(value||'').trim());
}

function resolveStore(){
  const deployContext=globalThis.Netlify?.context?.deploy?.context;
  if(deployContext==='production'){
    return getStore(STORE_NAME,{consistency:'strong'});
  }
  return getDeployStore(STORE_NAME);
}

export function createNetlifyBlobsBadgeSourceKeyRegistry({store=resolveStore()}={}){
  return Object.freeze({
    async get(appId,keyId){
      const key='keys/'+cleanSegment(appId)+'/'+cleanSegment(keyId)+'.json';
      return await store.get(key,{type:'json'});
    }
  });
}
