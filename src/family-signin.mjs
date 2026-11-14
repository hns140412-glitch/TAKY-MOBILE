// Existing TAKY contract: Google credential -> central /api/family/session -> TAKY_FAMILY_RUNTIME.
// Family membership comes ONLY from the verified server response.
// One sign-in per device (Taky 2026-11-14, "로그인은 한번하면 다시 안하고 싶은데"): after the first Google
// sign-in the central server issues a DEVICE token (no family scope, no identity fields; membership is
// re-checked on every call). It is kept in this origin's localStorage, renewed on every visit and
// deleted on sign-out. A home-screen app and the browser keep separate storage, so each signs in once.
const clean=v=>typeof v==='string'?v.trim():'';
const jsonConfig='/.netlify/functions/family-auth-config';
const DEVICE_KEY='taky.familyDevice.v1';
const DEVICE_TOKEN=/^tdv1\.[A-Za-z0-9_-]{20,900}\.[A-Za-z0-9_-]{43}$/;
let sdkLoading=null;
async function browserGoogleSdk(){
 if(globalThis.google?.accounts?.id)return globalThis.google.accounts.id;
 if(!sdkLoading)sdkLoading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>globalThis.google?.accounts?.id?resolve(globalThis.google.accounts.id):reject(Error('GOOGLE_SDK_UNAVAILABLE'));
  script.onerror=()=>reject(Error('GOOGLE_SDK_UNAVAILABLE'));
  document.head.appendChild(script);
 }).catch(error=>{sdkLoading=null;throw error});
 return sdkLoading;
}
const validClientId=v=>/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(clean(v));
const safeBase=raw=>{
 const u=new URL(raw),local=['localhost','127.0.0.1'].includes(u.hostname);
 if(!(u.protocol==='https:'||(local&&u.protocol==='http:'))||u.username||u.password||u.search||u.hash||u.pathname!=='/')
  throw Error('CENTRAL_API_ORIGIN_NOT_APPROVED');
 return u.origin;
};
function sanitizeFamily(f){
 const familyId=clean(f?.family_id),self=clean(f?.self_member_id);
 const members=Array.isArray(f?.authorized_member_ids)?f.authorized_member_ids.map(clean):[];
 if(!familyId||!self||members.length>30||members.some(x=>!x))return null;
 return {family_id:familyId,self_member_id:self,authorized_member_ids:[...new Set([self,...members])]};
}
export function verifyServerFamilyResponse(body){
 if(!body?.ok||!Array.isArray(body?.session?.families))return [];
 const result=body.session.families.map(sanitizeFamily);
 if(!result.length||result.length>20||result.some(x=>!x))return [];
 if(new Set(result.map(x=>x.family_id)).size!==result.length)return [];
 return result;
}
// viaCentral (apps other than TAKY Mobile): sign in on the TAKY central page instead of in the app. One sign-in
// there serves every app sharing that browser storage (Android Chrome + its home-screen apps, desktop): an app
// opened for the first time makes one quick, silent stop at central and comes back signed in. Where storage is
// separate (iOS home-screen apps) the Ready handoff pass covers it. (Taky 2026-11-14: "둘다 병행구조로 진행해")
const CENTRAL_CHECK_KEY='taky.familySignin.centralCheckedAt';
const CENTRAL_CHECK_MS=12*60*60*1000;
export const CONNECT_PATH='/family-connect.html';
export function createFamilySignin({fetchImpl=fetch,googleSdk=browserGoogleSdk,viaCentral=false,navigate=u=>location.assign(u)}={}){
 let pending=false,epoch=0,holder=null,installed=null;
 const dom=()=>({panel:document.getElementById('familyLogin'),
  action:document.getElementById('familySignInBtn'),google:document.getElementById('familyGoogleTarget'),
  options:document.getElementById('familyChooseTarget'),status:document.getElementById('familyLoginStatus'),
  signout:document.getElementById('familySignOutBtn')});
 const MARK='taky.familySignin.resume';
 // Non-secret "was signed in on this device" flag: if the device token is gone or revoked, the next
 // visit asks Google for a FRESH credential automatically (One Tap auto-select).
 const markGet=()=>{try{return globalThis.localStorage?.getItem(MARK)==='1'}catch{return false}};
 const markSet=()=>{try{globalThis.localStorage?.setItem(MARK,'1')}catch{}};
 const markClear=()=>{try{globalThis.localStorage?.removeItem(MARK);globalThis.sessionStorage?.removeItem(MARK)}catch{}};
 const deviceGet=()=>{try{const v=clean(globalThis.localStorage?.getItem(DEVICE_KEY));return DEVICE_TOKEN.test(v)?v:''}catch{return ''}};
 const deviceSet=v=>{try{globalThis.localStorage?.setItem(DEVICE_KEY,v)}catch{}};
 const deviceClear=()=>{try{globalThis.localStorage?.removeItem(DEVICE_KEY)}catch{}};
 const say=value=>{const {status}=dom();if(status)status.textContent=value;};
 const resetView=()=>{const x=dom();x.google?.replaceChildren();x.options?.replaceChildren();if(x.signout)x.signout.hidden=true;
  if(x.action)x.action.hidden=false};
 function signOut(){
  epoch++;pending=false;markClear();deviceClear();
  if(installed&&globalThis.TAKY_FAMILY_RUNTIME===installed)delete globalThis.TAKY_FAMILY_RUNTIME;
  holder=null;installed=null;
  resetView();say('로그인하지 않음 · 가족 개인정보 숨김');
  try{globalThis.google?.accounts?.id?.disableAutoSelect?.()}catch{}
  document.documentElement.dataset.takyCentralAuth='UNBOUND';
  globalThis.dispatchEvent(new Event('taky-central-auth-cleared'));
 }
 const resumeGoogle=()=>void begin({resume:true}).then(r=>{
  if(r.state==='GOOGLE_BUTTON_READY'&&!installed)say('가족 로그인을 다시 연결하는 중이에요. 자동으로 안 되면 Google 로그인 버튼을 눌러 주세요.');
 });
 const mount=()=>{
  const {action,signout}=dom();
  if(!action||!signout)return {ok:false,state:'FAMILY_LOGIN_VIEW_MISSING'};
  action.addEventListener('click',()=>void (viaCentral?goCentral({silent:false}):begin()));
  signout.addEventListener('click',signOut);
  action.disabled=false;
  // Testable readiness means handlers are bound, NOT that anyone is signed in.
  document.documentElement.dataset.takyFamilySigninReady='true';
  const handed=takeHandoff();
  if(handed==='none')centralCheckedSet();
  if(!globalThis.TAKY_FAMILY_RUNTIME&&!installed){
   if(viaCentral&&!deviceGet()&&handed!=='none'&&!centralCheckedRecently()&&!separateStorageApp()){
    centralCheckedSet();void goCentral({silent:true});return {ok:true,state:'CENTRAL_CHECK'};
   }
   // Signed in on this device before: continue silently with the device token (no Google prompt).
   if(deviceGet())void restore().then(r=>{if(!r.ok&&r.state==='DEVICE_SIGNIN_ENDED'&&markGet()&&!installed)resumeGoogle()});
   else if(markGet())resumeGoogle();
  }
  return {ok:true};
 };
 // Opened by another signed-in TAKY app (Ready) with a 2-minute pass in the URL fragment: keep it as this
 // origin's device token (restore() trades it for a long-lived one at once) and remove it from the address bar.
 function takeHandoff(){
  try{
   // Fragment normally; the query when the link went through an Android intent (which owns the fragment).
   const h=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
   const q=new URLSearchParams(String(location.search||'').replace(/^\?/,''));
   const inHash=h.has('taky_handoff');
   if(!inHash&&!q.has('taky_handoff'))return false;
   const t=clean((inHash?h:q).get('taky_handoff'));
   h.delete('taky_handoff');q.delete('taky_handoff');
   const rest=h.toString(),qs=q.toString();
   globalThis.history?.replaceState?.(globalThis.history.state,'',location.pathname+(qs?'?'+qs:'')+(rest?'#'+rest:''));
   if(t==='none')return 'none';
   if(!DEVICE_TOKEN.test(t))return false;
   deviceSet(t);markSet();return true;
  }catch{return false}
 }
 const centralCheckedSet=()=>{try{globalThis.localStorage?.setItem(CENTRAL_CHECK_KEY,String(Date.now()))}catch{}};
 const centralCheckedRecently=()=>{try{const t=Number(globalThis.localStorage?.getItem(CENTRAL_CHECK_KEY)||0);return t>0&&Date.now()-t<CENTRAL_CHECK_MS}catch{return false}};
 // iOS home-screen app: its storage is its own, so central there never knows a sign-in; skip the silent stop.
 const separateStorageApp=()=>{try{return globalThis.navigator?.standalone===true}catch{return false}};
 // Go to the central sign-in page; it comes back to this exact page with #taky_handoff=<pass> or =none.
 async function goCentral({silent}){
  try{
   const {central}=await loadConfig();
   const back=new URL(location.href);back.hash='';
   const u=new URL(CONNECT_PATH,central);u.searchParams.set('return',back.href);if(silent)u.searchParams.set('silent','1');
   navigate(u.href);return {ok:true,state:'CENTRAL_REDIRECT'};
  }catch{
   if(!silent){resetView();say('중앙 로그인 페이지를 열지 못했어요. 잠시 뒤 다시 눌러 주세요.');}
   return {ok:false,state:'CENTRAL_LOGIN_UNAVAILABLE'};
  }
 }
 // Android: open the target as an intent so an installed TAKY home-screen app (WebAPK) can take the link instead
 // of a browser tab inside the current app; anything else (or no installed app) falls back to the plain link.
 // The pass rides in the query here because an intent link uses the fragment itself.
 function androidIntentUrl(href){
  const u=new URL(href);const h=new URLSearchParams(u.hash.replace(/^#/,''));const pass=h.get('taky_handoff');
  if(pass){h.delete('taky_handoff');u.searchParams.set('taky_handoff',pass);u.hash=h.toString();}
  if(u.hash)return null;
  return 'intent://'+u.host+u.pathname+u.search+'#Intent;scheme=https;S.browser_fallback_url='+encodeURIComponent(u.href)+';end';
 }
 async function openApp(target,{android=/Android/i.test(globalThis.navigator?.userAgent||'')}={}){
  const href=await handoffUrl(target);
  const intent=android?(()=>{try{return androidIntentUrl(href)}catch{return null}})():null;
  navigate(intent||href);
  return {ok:true,via:intent?'ANDROID_INTENT':'LINK'};
 }
 // For the signed-in app that opens another TAKY app: the target URL with a 2-minute pass attached.
 // Not signed in, or the target is not an approved TAKY app -> the plain URL (the app then asks to sign in).
 async function handoffUrl(target){
  const plain=String(target||'');
  try{
   if(!installed)return plain;
   const url=new URL(plain,location.href);
   const central=new URL(installed.apiBaseUrl).origin;
   const r=await fetchImpl(new URL('/api/family/handoff',central).href,{method:'POST',cache:'no-store',redirect:'error',
    headers:{'content-type':'application/json','authorization':'Bearer '+await installed.getToken()},body:JSON.stringify({target:url.href})});
   const b=await r.json();const t=clean(b?.handoff_token);
   if(!r.ok||!b?.ok||!DEVICE_TOKEN.test(t)||b?.target_origin!==url.origin)return plain;
   const h=new URLSearchParams(url.hash.replace(/^#/,''));h.set('taky_handoff',t);url.hash=h.toString();
   return url.href;
  }catch{return plain}
 }
 async function loadConfig(){
  const res=await fetchImpl(jsonConfig,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'});
  const config=await res.json();
  if(!res.ok||!config?.ok||config?.loginOrigin!==location.origin||!validClientId(config?.googleClientId))
   throw Error('CENTRAL_LOGIN_CONFIGURATION_REQUIRED');
  return {config,central:safeBase(config.apiBaseUrl)};
 }
 // Google credential (first sign-in) or device token (renewal) -> fresh device token.
 // {revoked:true} = the server refused it; {} = unreachable or an older server without the endpoint.
 async function deviceExchange(central,bearer){
  try{
   const r=await fetchImpl(new URL('/api/family/device',central).href,{method:'POST',cache:'no-store',redirect:'error',
    headers:{'content-type':'application/json','authorization':'Bearer '+bearer},body:'{}'});
   if(r.status===401||r.status===403)return {revoked:true};
   const b=await r.json();const t=clean(b?.device_token);
   return r.ok&&b?.ok&&DEVICE_TOKEN.test(t)?{token:t}:{};
  }catch{return {}}
 }
 async function restore(){
  const saved=deviceGet();
  if(!saved)return {ok:false,state:'NO_DEVICE_SIGNIN'};
  if(pending)return {ok:false,state:'SIGNIN_ALREADY_IN_PROGRESS'};
  if(installed)return {ok:true,state:'ALREADY_SIGNED_IN'};
  const ticket=++epoch;pending=true;resetView();say('이 기기의 가족 로그인을 이어가는 중…');
  try{
   const {central}=await loadConfig();
   if(ticket!==epoch)return {ok:false,state:'SUPERSEDED'};
   const x=await deviceExchange(central,saved);
   if(ticket!==epoch)return {ok:false,state:'SUPERSEDED'};
   if(x.revoked){deviceClear();resetView();say('이 기기의 가족 로그인이 끝났어요. 다시 로그인해 주세요.');return {ok:false,state:'DEVICE_SIGNIN_ENDED'}}
   const token=x.token||saved;if(x.token)deviceSet(x.token);
   const r=await acceptCredential(token,central,ticket,{device:true});
   return r;
  }catch{
   if(ticket===epoch){resetView();say('중앙 서버에 연결하지 못했어요. 잠시 뒤 다시 열거나 Google 로그인 버튼을 눌러 주세요.');}
   return {ok:false,state:'CENTRAL_LOGIN_UNAVAILABLE'};
  }finally{if(ticket===epoch)pending=false}
 }
 async function begin({resume=false}={}){
  if(pending)return {ok:false,state:'SIGNIN_ALREADY_IN_PROGRESS'};
  if(installed)return {ok:true,state:'ALREADY_SIGNED_IN'};
  const ticket=++epoch;pending=true;resetView();say('가족 로그인 설정 확인 중…');
  try{
   const {config,central}=await loadConfig();
   if(ticket!==epoch)return {ok:false,state:'SUPERSEDED'};
   const sdk=await googleSdk();
   if(ticket!==epoch)return {ok:false,state:'SUPERSEDED'};
   if(!sdk||typeof sdk.initialize!=='function'||typeof sdk.renderButton!=='function')throw Error('GOOGLE_LOGIN_UNAVAILABLE');
   sdk.initialize({client_id:config.googleClientId,auto_select:resume,use_fedcm_for_prompt:true,
    callback:response=>void acceptCredential(response?.credential,central,ticket)});
   const target=dom().google;
   if(!target)throw Error('GOOGLE_BUTTON_MISSING');
   sdk.renderButton(target,{theme:'outline',size:'large',text:'signin_with',shape:'pill'});
   say('Google 계정으로 로그인하세요. 가족 권한은 중앙 서버에서 확인합니다.');
   // Returning device: ask Google for a fresh credential without a click. The server still verifies it.
   if(resume&&typeof sdk.prompt==='function'){try{sdk.prompt()}catch{}}
   return {ok:true,state:'GOOGLE_BUTTON_READY'};
  }catch{
   if(ticket===epoch){resetView();say('중앙 로그인 설정 또는 Google 연결이 없어 로그인할 수 없습니다.');}
   return {ok:false,state:'CENTRAL_LOGIN_UNAVAILABLE'};
  }finally{if(ticket===epoch)pending=false}
 }
 async function acceptCredential(raw,central,ticket,{device=false}={}){
  if(ticket!==epoch)return {ok:false,state:'SUPERSEDED'};
  let credential=clean(raw);
  // Format check is NOT token verification; server verifies signature, audience, membership.
  if(device?!DEVICE_TOKEN.test(credential):(credential.length<100||credential.length>8192||credential.split('.').length!==3)){
   say('Google 로그인 응답이 유효하지 않습니다.');return {ok:false,state:'CREDENTIAL_INVALID'};
  }
  say(device?'이 기기의 가족 로그인을 이어가는 중…':'중앙 가족 소속 확인 중…');
  let ended=!device;
  try{
   const response=await fetchImpl(new URL('/api/family/session',central).href,{
    method:'POST',cache:'no-store',redirect:'error',
    headers:{'content-type':'application/json','authorization':'Bearer '+credential},body:'{}'
   });
   if(ticket!==epoch)return {ok:false,state:'SUPERSEDED'};
   if(!response.ok){if(response.status===401||response.status===403){ended=true;if(device)deviceClear()}throw Error('CENTRAL_SESSION_REJECTED')}
   const body=await response.json();
   if(ticket!==epoch)return {ok:false,state:'SUPERSEDED'};
   const families=verifyServerFamilyResponse(body);
   if(!families.length){ended=true;if(device)deviceClear();throw Error('AUTHORIZED_FAMILY_NOT_FOUND')}
   if(!device){
    // Keep this device signed in: swap the 1-hour Google credential for a renewable device token.
    const x=await deviceExchange(central,credential);
    if(ticket!==epoch)return {ok:false,state:'SUPERSEDED'};
    if(x.token){deviceSet(x.token);credential=x.token}
   }
   holder={credential,central,families,ticket};
   if(families.length===1)return await selectFamily(families[0].family_id,ticket);
   const x=dom();x.options?.replaceChildren();
   for(let i=0;i<families.length;i++){
     const b=document.createElement('button');b.type='button';b.className='family-member-choice';
     b.textContent=`승인된 가족 ${i+1}`;
     b.addEventListener('click',()=>void selectFamily(families[i].family_id,ticket));
     x.options?.appendChild(b);
   }
   say('중앙 서버에서 승인된 가족을 선택하세요.');
   return {ok:true,state:'FAMILY_SELECTION'};
  }catch{
   if(ticket===epoch){holder=null;resetView();
    say(!device?'가족 소속을 확인하지 못했습니다. 로그인 상태가 적용되지 않았습니다.':ended?'이 기기의 가족 로그인이 끝났어요. 다시 로그인해 주세요.':'중앙 서버에 연결하지 못했어요. 잠시 뒤 다시 열어 주세요.');}
   return {ok:false,state:!device?'CENTRAL_SESSION_REJECTED':ended?'DEVICE_SIGNIN_ENDED':'CENTRAL_LOGIN_UNAVAILABLE'};
  }
 }
 async function selectFamily(id,ticket=epoch){
  if(ticket!==epoch||!holder)return {ok:false,state:'SESSION_SUPERSEDED'};
  const family=holder.families.find(f=>f.family_id===id);
  if(!family)return {ok:false,state:'FAMILY_NOT_AUTHORIZED'};
  const {credential,central}=holder;
  const runtime=Object.freeze({
   apiBaseUrl:central+'/',
   async getToken(){if(ticket!==epoch)throw Error('SESSION_CLEARED');return credential},
   async getFamilyId(){if(ticket!==epoch)throw Error('SESSION_CLEARED');return family.family_id},
   async currentSession(){if(ticket!==epoch)throw Error('SESSION_CLEARED');return {...family}}
  });
  installed=runtime;markSet();globalThis.TAKY_FAMILY_RUNTIME=runtime;
  const x=dom();if(x.action)x.action.hidden=true;
  if(x.signout)x.signout.hidden=false;
  x.google?.replaceChildren();x.options?.replaceChildren();
  document.documentElement.dataset.takyCentralAuth='BOUND';
  say('중앙 가족 인증 완료 · 본인과 허용된 구성원만 조회합니다.');
  globalThis.dispatchEvent(new Event('taky-central-auth-ready'));
  return {ok:true,state:'BOUND',family_id:family.family_id};
 }
 return {mount,begin,restore,signOut,selectFamily,handoffUrl,openApp,goCentral,status:()=>({state:installed?'BOUND':holder?'FAMILY_SELECTION':'UNBOUND'})};
}
