'use strict';
const VERSION='TAKY_CHARACTER_OBJECT_STORE_V1';
const clean=v=>typeof v==='string'?v.trim():'';
function assertStore(store){if(!store||typeof store.createUploadTicket!=='function'||typeof store.commitUpload!=='function'||typeof store.createReadTicket!=='function')throw Error('CHARACTER_OBJECT_STORE_REQUIRED');return store}
function assetRef({scope_id,member_id,character_id,version}={}){const a=[scope_id,member_id,character_id,version].map(clean);if(a.some(x=>!x))throw Error('CHARACTER_ASSET_SCOPE_REQUIRED');return 'taky-character:'+a.map(encodeURIComponent).join(':')}
function validAssetRef(ref){return /^taky-character:[^:]+:[^:]+:[^:]+:[^:]+$/.test(clean(ref))}
module.exports=Object.freeze({VERSION,assertStore,assetRef,validAssetRef});
