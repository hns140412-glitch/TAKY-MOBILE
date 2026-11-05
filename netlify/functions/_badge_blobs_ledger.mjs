import crypto from 'node:crypto';
import { getStore, getDeployStore } from '@netlify/blobs';
import { assertBadgeLedgerAdapter } from './_badge_ledger_adapter.mjs';

const STORE_NAME='taky-badge-observations';

function cleanSegment(value){
  return encodeURIComponent(String(value||'').trim());
}

function fingerprintObservation(observation){
  return crypto.createHash('sha256')
    .update(JSON.stringify(observation))
    .digest('hex');
}

function parseDedupeKey(dedupeKey){
  const [appId,...rest]=String(dedupeKey||'').split(':');
  const eventId=rest.join(':');
  if(!appId||!eventId) throw new Error('BADGE_BLOB_LEDGER_DEDUPE_KEY_INVALID');
  return {appId,eventId};
}

function eventPrefix(dedupeKey){
  const {appId,eventId}=parseDedupeKey(dedupeKey);
  return `events/${cleanSegment(appId)}/${cleanSegment(eventId)}/`;
}

function resolveStore(){
  const deployContext=globalThis.Netlify?.context?.deploy?.context;
  if(deployContext==='production'){
    return getStore(STORE_NAME,{consistency:'strong'});
  }
  return getDeployStore(STORE_NAME);
}

export function createNetlifyBlobsBadgeLedger({store=resolveStore()}={}){
  const adapter={
    async get(dedupeKey){
      const prefix=eventPrefix(dedupeKey);
      const listed=await store.list({prefix});
      const entries=listed.blobs||[];
      if(entries.length===0) return null;
      if(entries.length>1){
        const err=new Error('BADGE_BLOB_LEDGER_EVENT_CONFLICT');
        err.entries=entries.map(x=>x.key);
        throw err;
      }
      return await store.get(entries[0].key,{type:'json'});
    },

    async append(dedupeKey,entry){
      const prefix=eventPrefix(dedupeKey);
      const fingerprint=fingerprintObservation(entry.observation);
      const key=`${prefix}${fingerprint}.json`;
      const existing=await store.get(key,{type:'json'});
      if(existing) return existing;

      const listed=await store.list({prefix});
      if((listed.blobs||[]).length>0){
        const conflict={
          type:'BADGE_BLOB_LEDGER_EVENT_CONFLICT',
          dedupe_key:dedupeKey,
          existing_keys:listed.blobs.map(x=>x.key),
          incoming_key:key,
          detected_at:new Date().toISOString()
        };
        await adapter.recordConflict(conflict);
        const err=new Error('BADGE_BLOB_LEDGER_EVENT_CONFLICT');
        err.conflict=conflict;
        throw err;
      }

      await store.setJSON(key,entry);
      return entry;
    },

    async recordConflict(conflict){
      const stamp=Date.now();
      const hash=crypto.createHash('sha256').update(JSON.stringify(conflict)).digest('hex').slice(0,16);
      await store.setJSON(`conflicts/${stamp}-${hash}.json`,conflict);
      return conflict;
    }
  };
  return assertBadgeLedgerAdapter(adapter);
}
