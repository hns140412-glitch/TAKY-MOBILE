import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from 'file:///D:/Git%20PWA/Play%20Camp/node_modules/playwright-core/index.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const base='http://127.0.0.1:4199';
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,base);
  const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));
  if(!f.startsWith(root)||!(await stat(f)).isFile()){res.writeHead(404);return res.end('not found')}
  res.setHeader('Content-Type',f.endsWith('.html')?'text/html':f.endsWith('.css')?'text/css':'text/javascript');
  res.setHeader('Cache-Control','no-store');res.end(await readFile(f));
 }catch{res.writeHead(404);res.end('not found')}
});
await new Promise(r=>server.listen(4199,'127.0.0.1',r));
const fakeJwt=['eyJhbGciOiJSUzI1NiJ9',Buffer.from(JSON.stringify({sub:'fixture-user',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'synthetic-signature-not-a-real-token'].join('.');
const clientId='15791067602-lvao9ohkbj3l5s3clbfb9n106uqssaol.apps.googleusercontent.com';
const families=[
 {family_id:'SIM-A',self_member_id:'PARENT-1',authorized_member_ids:['PARENT-1','CHILD-1']},
 {family_id:'SIM-B',self_member_id:'PARENT-2',authorized_member_ids:['PARENT-2']}
];
const cases=[
 {name:'unconfigured',config:'missing',response:'allow',expect:'UNBOUND'},
 {name:'wrong-origin-config',config:'wrong-origin',response:'allow',expect:'UNBOUND'},
 {name:'central-denies',config:'valid',response:'deny',expect:'UNBOUND'},
 {name:'parent',config:'valid',response:'allow',expect:'BOUND'},
 {name:'multiple-family',config:'valid',response:'multiple',expect:'BOUND'},
 {name:'missing-membership',config:'valid',response:'missing',expect:'UNBOUND'}
];
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 for(const c of cases){
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  const sent=[],errors=[];
  await ctx.addInitScript(()=>{
   const fakeButton=(element)=>{
    const btn=document.createElement('button');btn.textContent='TEST Google 선택';
    btn.type='button';btn.id='simulatedGoogleButton';
    btn.addEventListener('click',()=>globalThis.__fakeGisCallback?.({credential:globalThis.__fixtureCredential}));
    element.appendChild(btn);
   };
   globalThis.google={accounts:{id:{
    initialize:options=>{globalThis.__fakeGisCallback=options.callback;globalThis.__fakeGisClientId=options.client_id},
    renderButton:fakeButton,disableAutoSelect:()=>{}
   }}};
  });
  await ctx.addInitScript(token=>{globalThis.__fixtureCredential=token},fakeJwt);
  await ctx.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname==='/.netlify/functions/family-auth-config'){
    if(c.config==='missing')return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"state":"FAMILY_LOGIN_NOT_CONFIGURED"}'});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      ok:true,googleClientId:clientId,apiBaseUrl:'https://central.example.test',
      loginOrigin:c.config==='wrong-origin'?'https://attacker.example':base
    })});
   }
   if(u.origin==='https://central.example.test'){
    sent.push({url:u.href,authorization:route.request().headers().authorization,body:route.request().postDataJSON?.()});
    if(u.pathname==='/api/family/session'){
     if(c.response==='deny')return route.fulfill({status:403,contentType:'application/json',body:'{"ok":false}'});
     const groups=c.response==='multiple'?families:c.response==='missing'?[]:[families[0]];
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,session:{identity_provider:'GOOGLE_OIDC_VERIFIED',families:groups}})});
    }
    if(u.pathname==='/api/family/member-profile'){
     const data=route.request().postDataJSON();
     const valid=families.some(f=>f.family_id===data.family_id&&[f.self_member_id,...f.authorized_member_ids].includes(data.member_id));
     return route.fulfill({status:valid?200:403,contentType:'application/json',body:JSON.stringify(valid?{ok:true,found:true,projection:{member_id:data.member_id,display_name:'검증 가족',school_stage:'E5'}}:{ok:false})});
    }
   }
   if(u.origin!==base)return route.abort();
   if(u.pathname.startsWith('/.netlify/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});
   return route.continue();
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base);
  await page.waitForFunction(()=>document.documentElement.dataset.takyFamilySigninReady==='true');
  assert.equal(await page.locator('#familySignInBtn').isEnabled(),true);
  await page.getByRole('button',{name:'Google 가족 로그인'}).click();
  if(c.config==='valid'){
   await page.locator('#simulatedGoogleButton').waitFor();
   assert.equal(await page.evaluate(()=>globalThis.__fakeGisClientId),clientId);
   await page.locator('#simulatedGoogleButton').click();
   if(c.response==='multiple'){
    await page.locator('#familyChooseTarget button').first().waitFor();
    assert.equal(await page.locator('#familyChooseTarget button').count(),2);
    await page.locator('#familyChooseTarget button').nth(1).click();
   }
  }
  if(c.expect==='BOUND'){
   await page.waitForFunction(()=>document.documentElement.dataset.takyCentralAuth==='BOUND');
   await page.waitForFunction(()=>document.getElementById('familyHub')?.dataset.memberState==='CENTRAL_PROFILE_BOUND');
   assert.equal(await page.locator('[data-family-private]').isVisible(),true);
   const family=await page.evaluate(()=>globalThis.TAKY_FAMILY_RUNTIME.getFamilyId());
   assert.equal(family,c.response==='multiple'?'SIM-B':'SIM-A');
   assert.ok(sent.some(x=>x.url.endsWith('/api/family/session')));
   assert.ok(sent.every(x=>String(x.authorization||'').startsWith('Bearer ')));
   assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('synthetic-signature-not-a-real-token')),false);
   if(c.name==='parent'){
    const before=sent.length;
    await page.reload();
    await page.locator('#simulatedGoogleButton').waitFor();
    assert.equal(await page.evaluate(()=>Boolean(globalThis.TAKY_FAMILY_RUNTIME)),false);
    assert.equal(await page.locator('[data-family-private]').isVisible(),false);
    assert.equal(sent.length,before,'no central request before user re-click');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('taky.familySignin.resume')),'1');
    await page.locator('#simulatedGoogleButton').click();
    await page.waitForFunction(()=>document.documentElement.dataset.takyCentralAuth==='BOUND');
    await page.waitForFunction(()=>document.getElementById('familyHub')?.dataset.memberState==='CENTRAL_PROFILE_BOUND');
    assert.ok(sent.slice(before).some(x=>x.url.endsWith('/api/family/session')));
    assert.equal(await page.evaluate(()=>globalThis.TAKY_FAMILY_RUNTIME.getFamilyId()),'SIM-A');
    assert.equal(await page.evaluate(()=>JSON.stringify([localStorage,sessionStorage,Object.entries(sessionStorage)]).includes('synthetic-signature')),false);
   }
   await page.getByRole('button',{name:'가족 로그아웃'}).click();
   await page.waitForFunction(()=>document.getElementById('familyHub')?.dataset.familyState==='TAKY_FAMILY_RUNTIME_REQUIRED');
   assert.equal(await page.locator('[data-family-private]').isVisible(),false);
   assert.equal(await page.evaluate(()=>Boolean(globalThis.TAKY_FAMILY_RUNTIME)),false);
   if(c.name==='parent'){
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('taky.familySignin.resume')),null);
    const before=sent.length;await page.reload();await page.waitForTimeout(550);
    assert.equal(await page.locator('#simulatedGoogleButton').count(),0);
    assert.equal(sent.length,before);
   }
  }else{
   await page.waitForTimeout(550);
   assert.equal(await page.locator('[data-family-private]').isVisible(),false);
   assert.equal(await page.evaluate(()=>Boolean(globalThis.TAKY_FAMILY_RUNTIME)),false);
   assert.equal(await page.locator('#familySignOutBtn').isVisible(),false);
   if(c.config!=='valid')assert.equal(sent.length,0);
  }
  if(c.name==='unconfigured')await page.screenshot({path:path.join(root,'artifacts/learning-loop-multi-specialist-roundtrip-20261010/10-mobile-login-not-configured.png'),animations:'disabled'});
  assert.deepEqual(errors,[],c.name+' '+errors);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('CENTRAL_FAMILY_LOGIN_BROWSER_PASS',c.name,'requests',sent.length);
  await ctx.close();
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
