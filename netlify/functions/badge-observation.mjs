import { ingestBadgeObservation, validateBadgeObservation } from './_badge_transport_core.mjs';
import { createNetlifyBlobsBadgeLedger } from './_badge_blobs_ledger.mjs';
import { verifyBadgeSourceSignature } from './_badge_source_auth.mjs';
import { createNetlifyBlobsBadgeSourceKeyRegistry } from './_badge_source_key_registry.mjs';

export async function handleBadgeObservation(request,{
  ledgerFactory,
  keyRegistryFactory
}={}){
  if(request.method!=='POST'){
    return new Response(JSON.stringify({ok:false,error:'METHOD_NOT_ALLOWED'}),{
      status:405,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }

  let input;
  try{ input=await request.json(); }
  catch{
    return new Response(JSON.stringify({ok:false,error:'INVALID_JSON'}),{
      status:400,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }

  try{ validateBadgeObservation(input); }
  catch(error){
    return new Response(JSON.stringify({ok:false,error:String(error?.message||error)}),{
      status:400,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }

  const keyId=request.headers.get('x-taky-badge-key-id')||'';
  const signature=request.headers.get('x-taky-badge-signature')||'';
  const keyFactory=keyRegistryFactory||(()=>createNetlifyBlobsBadgeSourceKeyRegistry());

  try{
    const keyRegistry=await keyFactory();
    await verifyBadgeSourceSignature(input,{keyId,signature,keyRegistry});
  }catch(error){
    return new Response(JSON.stringify({
      ok:false,
      error:String(error?.message||error),
      disposition:'FAIL_CLOSED',
      badge_award_authorized:false,
      economy_mutation_authorized:false,
      catalog_activation_allowed:false
    }),{
      status:401,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }

  const ledgerFactoryResolved=ledgerFactory||(()=>createNetlifyBlobsBadgeLedger());

  try{
    const ledger=await ledgerFactoryResolved();
    const receipt=await ingestBadgeObservation(input,{ledger});
    return new Response(JSON.stringify({
      ok:true,
      receipt,
      badge_award_authorized:false,
      economy_mutation_authorized:false,
      catalog_activation_allowed:false
    }),{
      status:202,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }catch(error){
    const message=String(error?.message||error);
    const conflict=/CONFLICT/.test(message);
    return new Response(JSON.stringify({
      ok:false,
      error:message,
      disposition:'FAIL_CLOSED',
      badge_award_authorized:false,
      economy_mutation_authorized:false,
      catalog_activation_allowed:false
    }),{
      status:conflict?409:503,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }
}

export default request=>handleBadgeObservation(request);
