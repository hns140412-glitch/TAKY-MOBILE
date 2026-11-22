import googleAuthLibrary from 'google-auth-library';
import {configured,validKey,adminCookie,logoutCookie,authorized,sameOrigin,respond} from './_admin-session.mjs';
import {readCentralConfig} from './_central_host.mjs';
import {createDriveClient,createDriveMembershipProvider} from './_central_drive.mjs';
import {createDeviceTokens,deviceAwareOAuthClient,subjectVerifier} from './_family_device.mjs';
// Owner auto-admin (Taky 2026-11-22): a family sign-in whose members.json row is ACTIVE and has
// permissions ["TAKY_ADMIN"] opens the admin session without the access key.
export async function familyAdmin(credential,{config=readCentralConfig(),fetchImpl,oauth2Client}={}){
 if(typeof credential!=='string'||credential.length<16||credential.length>8192||config.missing.length)return false;
 try{
  const drive=createDriveClient({...config.drive,...(fetchImpl?{fetchImpl}:{})});
  const client=deviceAwareOAuthClient(oauth2Client||new googleAuthLibrary.OAuth2Client(),createDeviceTokens(config.ticketSecret));
  const sub=await subjectVerifier(client,config.clientIds)(credential);
  const rows=await createDriveMembershipProvider({drive,folderId:config.folderId})({provider:'GOOGLE_OIDC',subject:sub});
  return rows.some(r=>r.status==='ACTIVE'&&Array.isArray(r.permissions)&&r.permissions.includes('TAKY_ADMIN'));
 }catch{return false}
}
export default async request=>{
 if(request.method==='GET'){const ok=configured()&&authorized(request);
  // Rolling: a still-valid session is re-issued, so a device that keeps using admin never signs in again.
  return respond({ok:true,authorized:ok},200,ok?{'Set-Cookie':adminCookie()}:{});}
 if(!['POST','DELETE'].includes(request.method))return respond({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, POST, DELETE'});
 if(!sameOrigin(request))return respond({ok:false,error:'ORIGIN_DENIED'},403);
 if(request.method==='DELETE')return respond({ok:true,authorized:false},200,{'Set-Cookie':logoutCookie()});
 if(!configured())return respond({ok:false,error:'ADMIN_NOT_CONFIGURED'},503);
 try{const body=await request.json();
  const ok=typeof body?.family_credential==='string'?await familyAdmin(body.family_credential):validKey(body?.key);
  if(!ok)return respond({ok:false,error:'ADMIN_AUTH_FAILED'},401);
 return respond({ok:true,authorized:true},200,{'Set-Cookie':adminCookie()});}
 catch{return respond({ok:false,error:'INVALID_REQUEST'},400)}
};
