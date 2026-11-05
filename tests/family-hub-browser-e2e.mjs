import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///D:/Git%20PWA/Play%20Camp/node_modules/playwright-core/index.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:4198');
    const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root)||!(await stat(file)).isFile()){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');
    res.setHeader('Cache-Control','no-store');res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(4198,'127.0.0.1',resolve));
const cases=[
 {id:'no-session',provider:null,expect:'TAKY_FAMILY_RUNTIME_REQUIRED'},
 {id:'wrong-family',provider:{family_id:'SIM-A',getFamilyId:'SIM-B',self_member_id:'P-1',authorized_member_ids:['C-1']},expect:'FAMILY_SCOPE_UNVERIFIED'},
 {id:'parent-and-child',provider:{family_id:'SIM-A',getFamilyId:'SIM-A',self_member_id:'P-1',authorized_member_ids:['C-1']},expect:'CENTRAL_BOUND'},
 {id:'child-only',provider:{family_id:'SIM-B',getFamilyId:'SIM-B',self_member_id:'C-2',authorized_member_ids:[]},expect:'CENTRAL_BOUND'},
];
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 for(const item of cases){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  const seen=[];
  if(item.provider){
   const p=item.provider;
   await context.addInitScript(p=>{
     globalThis.TAKY_FAMILY_RUNTIME={
       apiBaseUrl:'http://127.0.0.1:4198/',
       getFamilyId:async()=>p.getFamilyId,
       currentSession:async()=>({family_id:p.family_id,self_member_id:p.self_member_id,authorized_member_ids:p.authorized_member_ids}),
       getToken:async()=> 'simulated-authorized-token-001',
     };
   },p);
  }
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='http://127.0.0.1:4198')return route.abort();
   if(url.pathname==='/api/family/member-profile'){
    const req=route.request(),body=JSON.parse(req.postData()||'{}');
    seen.push({body,auth:req.headers()['authorization']});
    const allowed=item.provider?.getFamilyId===item.provider?.family_id;
    const scoped=allowed&&item.provider&&body.family_id===item.provider.family_id&&[item.provider.self_member_id,...item.provider.authorized_member_ids].includes(body.member_id);
    return route.fulfill({status:scoped?200:403,contentType:'application/json',
      body:JSON.stringify(scoped?{ok:true,found:true,projection:{member_id:body.member_id,display_name:body.member_id==='P-1'?'부모':'학습자',school_stage:'E5',profile_version:2}}:{ok:false})});
   }
   if(url.pathname.includes('/.netlify/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});
   return route.continue();
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:4198/');
  await page.waitForFunction(()=>document.querySelector('#familyHub')?.dataset.familyState!=='');
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#familyHub').getAttribute('data-family-state'),item.expect,item.id);
  const privateArea=page.locator('#familyHub [data-family-private]');
  if(item.expect!=='CENTRAL_BOUND'){
   assert.equal(await privateArea.isVisible(),false,item.id);
   assert.equal(seen.length,0);
  }else{
   assert.equal(await privateArea.isVisible(),true);
   const choices=page.locator('#familyHub [data-family-members] .family-member-choice');
   assert.equal(await choices.count(),1+item.provider.authorized_member_ids.length);
   await page.waitForFunction(()=>document.querySelector('#familyHub')?.dataset.memberState==='CENTRAL_PROFILE_BOUND');
   const original=await page.locator('[data-family-detail]').innerText();
   assert.match(original,/중앙 프로필 확인/);
   assert.match(await page.locator('[data-family-savey]').innerText(),/금융 권한은 SAVEY에서 별도 인증/);
   if(await choices.count()>1){
    await choices.last().click();
    await page.waitForFunction(()=>document.querySelectorAll('#familyHub [data-family-members] .family-member-choice')[1]?.getAttribute('aria-pressed')==='true');
    assert.match(await page.locator('[data-family-detail]').innerText(),/학습자/);
   }
   for(const row of seen){
    assert.equal(row.body.family_id,item.provider.family_id);
    assert.ok([item.provider.self_member_id,...item.provider.authorized_member_ids].includes(row.body.member_id));
    assert.match(row.auth,/^Bearer simulated-authorized-token/);
   }
   assert.equal(await page.locator('body').innerText().then(x=>x.includes('simulated-authorized-token')),false,'never expose bearer token in UI');
   if(item.id==='parent-and-child')await page.screenshot({path:path.join(root,'artifacts/learning-loop-multi-specialist-roundtrip-20261010/09-mobile-family-central-mock.png'),animations:'disabled'});
   await page.evaluate(()=>{delete globalThis.TAKY_FAMILY_RUNTIME;dispatchEvent(new Event('taky-central-auth-cleared'))});
   await page.waitForFunction(()=>document.querySelector('#familyHub')?.dataset.familyState==='TAKY_FAMILY_RUNTIME_REQUIRED');
   assert.equal(await privateArea.isVisible(),false,'family signout must conceal previous profile');
  }
  assert.equal(errors.length,0,errors.join(';'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
  console.log('FAMILY_HUB_BROWSER_PASS',item.id,{profiles:seen.length});
  await context.close();
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
