import { validateBadgeObservation } from './_badge_transport_core.mjs';

export async function handleBadgeObservation(request,{ledgerFactory}={}){
  if(request.method!=='POST'){
    return new Response(JSON.stringify({ok:false,error:'METHOD_NOT_ALLOWED'}),{status:405,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  let input;
  try{ input=await request.json(); }
  catch{
    return new Response(JSON.stringify({ok:false,error:'INVALID_JSON'}),{status:400,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  try{ validateBadgeObservation(input); }
  catch(error){
    return new Response(JSON.stringify({ok:false,error:String(error?.message||error)}),{status:400,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  if(typeof ledgerFactory!=='function'){
    return new Response(JSON.stringify({
      ok:false,
      error:'BADGE_TRANSPORT_PERSISTENCE_NOT_CONFIGURED',
      disposition:'FAIL_CLOSED',
      badge_award_authorized:false,
      economy_mutation_authorized:false,
      catalog_activation_allowed:false
    }),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  return new Response(JSON.stringify({ok:false,error:'BADGE_TRANSPORT_LEDGER_ADAPTER_PENDING'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
