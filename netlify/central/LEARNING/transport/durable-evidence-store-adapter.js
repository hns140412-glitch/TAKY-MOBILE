'use strict';

const Handler=require('../intake/transport-handler.js');
const Pipeline=require('../intake/specialist-event-pipeline.js');

const VERSION='TAKY_DURABLE_EVIDENCE_STORE_ADAPTER_V1';
const SHA256=/^[a-f0-9]{64}$/;
const clean=v=>String(v??'').trim();

function stateKey(packet={}){
  const family=clean(packet?.context?.family_id||packet?.family_id);
  const member=clean(packet?.context?.member_id||packet?.member_id);
  if(!family||!member)return null;
  return 'families/'+encodeURIComponent(family)+'/members/'+encodeURIComponent(member)+'/learning-engine/state-v1';
}

async function readState(store,key){
  const entry=await store.getWithMetadata(key,{type:'json',consistency:'strong'});
  if(!entry||entry.data==null)return {exists:false,state:Pipeline.emptyState(),etag:null};
  if(!entry.etag||typeof entry.etag!=='string')throw new Error('EXISTING_STRONG_STATE_ETAG_REQUIRED');
  return {exists:true,state:entry.data,etag:entry.etag};
}

async function writeState(store,key,state,{etag,exists}={}){
  const opts=exists?{onlyIfMatch:etag}:{onlyIfNew:true};
  return store.setJSON(key,state,opts);
}

async function ingestPacket(store,packet={},options={}){
  const key=stateKey(packet);
  if(!key)return {ok:false,reason:'FAMILY_MEMBER_SCOPE_REQUIRED'};
  const maxAttempts=Math.max(1,Number(options.max_attempts)||4);

  for(let attempt=1;attempt<=maxAttempts;attempt++){
    const current=await readState(store,key);
    const fingerprint=options.replay_fingerprint;
    let replayKey=null,packetKey=null;
    if(fingerprint!==undefined){
      if(typeof fingerprint!=='string'||!SHA256.test(fingerprint))
        return {ok:false,reason:'TRUSTED_REPLAY_FINGERPRINT_REQUIRED'};
      replayKey=String(packet.source_app||'')+':'+String(packet?.event?.event_id||'');
      packetKey=String(packet.source_app||'')+':'+String(packet.packet_id||'');
      const eventDigests=current.state.transport_event_digests||{};
      const packetDigests=current.state.transport_packet_digests||{};
      // An older pre-fingerprint event cannot be silently re-ACKed as if its
      // payload were proven equal: require a deliberate migration/review.
      const oldEvent=[
        ...(current.state.observation_only||[]),
        ...Object.values(current.state.scope_receipts||{}).flatMap(x=>x?.canonical_evidence||[])
      ].some(e=>e.event_id===packet?.event?.event_id&&e.source_app===packet.source_app);
      if(oldEvent&&!Object.hasOwn(eventDigests,replayKey))
        return {ok:false,reason:'LEGACY_EVENT_REPLAY_REQUIRES_RECONCILIATION'};
      if((Object.hasOwn(eventDigests,replayKey)&&eventDigests[replayKey]!==fingerprint)||
         (Object.hasOwn(packetDigests,packetKey)&&packetDigests[packetKey]!==fingerprint))
        return {ok:false,reason:'EVENT_OR_PACKET_ID_REPLAY_PAYLOAD_MISMATCH'};
    }
    const result=Handler.ingest(current.state,packet,{
      created_at:options.created_at,
      promotion_policy:options.promotion_policy||{}
    });
    if(!result.ok)return result;
    if(fingerprint!==undefined){
      result.state.transport_event_digests={
        ...(current.state.transport_event_digests||{}),[replayKey]:fingerprint};
      result.state.transport_packet_digests={
        ...(current.state.transport_packet_digests||{}),[packetKey]:fingerprint};
    }

    const write=await writeState(store,key,result.state,{etag:current.etag,exists:current.exists});
    // A missing/unconfirmed store response must never be reported as a saved
    // verified learning receipt. A false conditional result is a real conflict.
    if(write?.modified===true&&typeof write.etag==='string'&&write.etag){
      return {
        ...result,
        durable_store:{
          adapter_version:VERSION,
          key,
          consistency:'strong',
          conditional_write:current.exists?'onlyIfMatch':'onlyIfNew',
          attempt,
          etag:write?.etag||null
        }
      };
    }
    if(write?.modified!==false)return {ok:false,reason:'DURABLE_STORE_WRITE_UNCONFIRMED',retryable:true};
  }

  return {
    ok:false,
    reason:'DURABLE_STORE_CONFLICT_RETRY_EXHAUSTED',
    key,
    retryable:true
  };
}

function selfValidate(result={}){
  const issues=[];
  if(!result.ok)issues.push('RESULT_NOT_OK');
  if(result.ok&&result.durable_store?.adapter_version!==VERSION)issues.push('ADAPTER_VERSION_INVALID');
  if(result.ok&&result.durable_store?.consistency!=='strong')issues.push('STRONG_CONSISTENCY_REQUIRED');
  if(result.ok&&!['onlyIfMatch','onlyIfNew'].includes(result.durable_store?.conditional_write))issues.push('CONDITIONAL_WRITE_REQUIRED');
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,stateKey,readState,writeState,ingestPacket,selfValidate});
