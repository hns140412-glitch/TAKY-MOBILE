// Public, non-secret bootstrap. No central URL or authorized origin is guessed.
const readEnv=name=>globalThis.Netlify?.env?.get?.(name)??process.env[name]??'';
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0',
 'X-Content-Type-Options':'nosniff','Vary':'Origin'
}});
export default async function(request){
 if(request.method!=='GET')return json(405,{ok:false,state:'GET_REQUIRED'});
 try{
  const page=new URL(request.url);
  const mobileOrigin=page.origin;
  const approvedOrigins=String(readEnv('TAKY_FAMILY_LOGIN_ALLOWED_ORIGINS')).split(',').map(s=>s.trim()).filter(Boolean);
  const clientId=String(readEnv('TAKY_GOOGLE_WEB_CLIENT_ID')).trim();
  // "self" = the central API is hosted by this same deploy (netlify/functions/central.mjs).
  const rawBase=String(readEnv('TAKY_CENTRAL_API_BASE_URL')).trim();
  const base=rawBase==='self'?mobileOrigin+'/':rawBase;
  const originAllowed=approvedOrigins.includes(mobileOrigin);
  const url=new URL(base);
  const local=['localhost','127.0.0.1'].includes(url.hostname);
  if(!originAllowed||!(url.protocol==='https:'||(local&&url.protocol==='http:'))
    ||url.username||url.password||url.hash||url.search||url.pathname!=='/'
    ||!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId)
    ||!(mobileOrigin.startsWith('https://')||(page.hostname==='localhost'||page.hostname==='127.0.0.1'))){
    return json(503,{ok:false,state:'FAMILY_LOGIN_NOT_CONFIGURED'});
  }
  return json(200,{ok:true,googleClientId:clientId,apiBaseUrl:url.origin,
    // Google origin approval and central CORS are ALSO required at deployment.
    loginOrigin:mobileOrigin,identity:'GOOGLE_OIDC_ID_TOKEN'});
 }catch{return json(503,{ok:false,state:'FAMILY_LOGIN_NOT_CONFIGURED'});}
}
