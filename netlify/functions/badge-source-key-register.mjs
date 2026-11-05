import { env, isAuthorized } from './_auth.mjs';
import { createBadgeSourceKeyAdmin } from './_badge_source_key_admin.mjs';

export async function handleBadgeSourceKeyRegister(request,{adminFactory}={}){
  if(request.method!=='POST'){
    return new Response(JSON.stringify({ok:false,error:'METHOD_NOT_ALLOWED'}),{
      status:405,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }

  const secret=env('TAKY_SESSION_SECRET');
  if(!isAuthorized(request,secret)){
    return new Response(JSON.stringify({ok:false,error:'AUTH_REQUIRED'}),{
      status:401,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }

  let input;
  try{input=await request.json();}
  catch{
    return new Response(JSON.stringify({ok:false,error:'INVALID_JSON'}),{
      status:400,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }

  try{
    const admin=await (adminFactory||(()=>createBadgeSourceKeyAdmin()))();
    const record=await admin.register(input);
    return new Response(JSON.stringify({
      ok:true,
      app_id:record.app_id,
      installation_id:record.installation_id,
      key_id:record.key_id,
      status:record.status,
      badge_activation_authorized:false,
      economy_mutation_authorized:false
    }),{
      status:201,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }catch(error){
    return new Response(JSON.stringify({
      ok:false,
      error:String(error?.message||error),
      disposition:'FAIL_CLOSED'
    }),{
      status:/CONFLICT/.test(String(error?.message||error))?409:400,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }
}

export default request=>handleBadgeSourceKeyRegister(request);
