'use strict';

const Auth=require('./transport-auth-policy.js');
const Durable=require('./durable-evidence-store-adapter.js');

async function ingestAuthenticated(store,packet={},identity={},options={}){
  const auth=Auth.authorize(packet,identity);
  if(!auth.ok)return {ok:false,reason:'TRANSPORT_NOT_AUTHORIZED',issues:auth.issues};
  const result=await Durable.ingestPacket(store,packet,options);
  if(!result.ok)return result;
  return {
    ...result,
    authenticated_scope:auth.scope,
    authenticated_source_app:auth.source_app
  };
}

module.exports=Object.freeze({ingestAuthenticated});
