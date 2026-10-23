import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///D:/Git%20PWA/Play%20Camp/node_modules/playwright-core/index.mjs';

// Local-only: external origins are aborted; the canonical gateway is mocked per scenario.
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const OUT=path.join(ROOT,'artifacts',process.env.E2E_OUT_DIR||'admin-console-20261012');
fs.mkdirSync(OUT,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  const full=path.resolve(ROOT,rel);
  if(!full.startsWith(ROOT)||!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);return res.end('not found')}
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type',types[path.extname(full)]||'application/octet-stream');
  fs.createReadStream(full).pipe(res);
});
const PORT=4191,BASE=`http://127.0.0.1:${PORT}/`;
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));

const BUNDLE={ok:true,repository:'hns140412-glitch/TAKY',ref:'main',fetchedAt:new Date().toISOString(),files:[{path:'TAKY.md',sha:'feedc0de99887766',content:'#'}]};
const result={pass:false,scenarios:{}};
let browser;
// Shape produced by netlify/functions/release-status.mjs; the deploy is deliberately older than main.
const release=at=>({ok:true,contract:'TAKY_MOBILE_RELEASE_STATUS_V1',checkedAt:new Date(at).toISOString(),
  github:{repository:'hns140412-glitch/TAKY-MOBILE',ref:'main',status:'LIVE',sha:'9bcb7d9aa11bb22cc33dd44ee55ff66778899001',committedAt:'2026-10-11T15:00:00Z'},
  netlify:{status:'LIVE',deployId:'6a9ea85873979b00083c30cf',state:'ready',commitRef:'7ad757ef3caeb93f103c97b5fc6b6ab5efff39e9',publishedAt:'2026-09-07T12:04:53.141Z'},
  revisionMatch:'MISMATCH'});
let releaseCalls=0;
async function scenario(name,viewport,gateway,fn){
  const context=await browser.newContext({serviceWorkers:'block',viewport});
  releaseCalls=0;
  let sessionGranted=false,protectedCallsBeforeAuth=0;
  const errors=[];
  await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin!==`http://127.0.0.1:${PORT}`)return route.abort();
    if(u.pathname==='/.netlify/functions/admin-session'){
      const method=route.request().method();
      if(method==='GET')return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({ok:true,authorized:sessionGranted})});
      if(method==='POST'){
        const key=route.request().postDataJSON()?.key;
        sessionGranted=key==='local-console-qa-only';
        return route.fulfill({status:sessionGranted?200:401,contentType:'application/json',
          body:JSON.stringify({ok:sessionGranted,authorized:sessionGranted})});
      }
      if(method==='DELETE'){
        sessionGranted=false;
        return route.fulfill({status:200,contentType:'application/json',
          body:'{"ok":true,"authorized":false}'});
      }
    }
    if(u.pathname==='/.netlify/functions/admin-progress'){
      if(!sessionGranted)protectedCallsBeforeAuth++;
      return route.fulfill({status:sessionGranted?200:401,contentType:'application/json',
        body:JSON.stringify(sessionGranted?{ok:false,error:'LOCAL_QA_SNAPSHOT_UNAVAILABLE'}:
          {ok:false,error:'ADMIN_AUTH_REQUIRED'})});
    }
    if(u.pathname==='/.netlify/functions/canonical'){
      if(gateway==='auth')return route.fulfill({status:401,contentType:'application/json',body:'{"ok":false,"error":"AUTH_REQUIRED"}'});
      if(gateway==='ok'||gateway==='stale')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(BUNDLE)});
    }
    if(u.pathname==='/.netlify/functions/release-status'){
      releaseCalls++;
      if(gateway==='auth')return route.fulfill({status:401,contentType:'application/json',body:'{"ok":false,"error":"AUTH_REQUIRED"}'});
      if(gateway==='ok')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(release(Date.now()))});
      if(gateway==='stale')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(release(Date.now()-3600_000))});
    }
    return route.continue();
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(BASE,{waitUntil:'load'});
  const saveyCard=page.locator('#appGrid .app-card').filter({hasText:'SAVEY'});
  assert.equal(await saveyCard.locator('a.app-open').getAttribute('href'),'https://savey-taky.netlify.app');
  assert.equal(await saveyCard.locator('a[href*="app.netlify.com/projects/savey-taky/deploys"]').count(),0,
    'deploy links must stay private before login');
  assert.equal(await page.locator('.nav-btn[data-target="ops"]').isVisible(),false,
    'OPS must stay hidden for the unauthenticated visitor');
  assert.equal(await page.locator('#operationsPanel').isVisible(),false,
    'operations details must not be exposed to guests');
  assert.equal(protectedCallsBeforeAuth,0,'private progress never fetched as guest');
  await page.locator('#adminLoginBtn').click();
  await page.locator('#adminLoginKey').fill('local-console-qa-only');
  await page.locator('#adminLoginSubmitBtn').click();
  await page.locator('.nav-btn[data-target="ops"]').waitFor({state:'visible',timeout:9000});
  assert.equal(sessionGranted,true,'local synthetic session must be accepted before checking OPS');
  assert.equal(protectedCallsBeforeAuth,0,'no protected API reads before signed session');
  // Successful login opens the private administrator screen. The legacy OPS
  // strip lives on the TAKY home screen and is not visible until returning.
  await page.locator('.nav-btn[data-target="taky"]').click();
  await page.waitForSelector('#operationsList .ops-strip-counts');
  await page.waitForFunction(()=>!/checking/.test(document.getElementById('canonicalStatus').textContent));
  await page.waitForSelector('[data-check="github-revision"][data-evidence]',{state:'attached'});
  const out=await fn(page);
  out.releaseCalls=releaseCalls;
  out.guestIsolation=true;
  out.protectedCallsBeforeAuth=protectedCallsBeforeAuth;
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=0,`${name}: horizontal overflow ${overflow}px`);
  assert.deepEqual(errors,[],`${name}: page errors`);
  result.scenarios[name]={...out,overflow};
  await context.close();
}

try{
  browser=await chromium.launch({headless:true,channel:'chrome'});

  await scenario('mobile-unreachable',{width:390,height:844},'none',async page=>{
    await page.screenshot({path:path.join(OUT,'home-390.png')});
    const strip=await page.locator('#operationsList').innerText();
    assert.match(strip,/운영 콘솔/);
    assert.match(strip,/기준 새로고침/);
    await page.locator('[data-ops-open]').click();
    assert.equal(await page.locator('.screen[data-screen="ops"]').isVisible(),true);
    assert.equal(await page.locator('.nav-btn[data-target="ops"]').getAttribute('aria-current'),'page');
    assert.equal(await page.locator('.ops-lane').count(),6);
    assert.equal(await page.locator('[data-check="canonical"]').getAttribute('data-state'),'NOT_CONNECTED');
    assert.equal(await page.locator('[data-check="owner-session"]').getAttribute('data-state'),'NOT_CONNECTED');
    assert.equal(await page.locator('[data-check="netlify-deploy"]').getAttribute('data-state'),'UNVERIFIED');
    assert.equal(await page.locator('[data-check="netlify-deploy"]').getAttribute('data-evidence'),'UNAVAILABLE');
    assert.match(await page.locator('[data-check="netlify-deploy"]').textContent(),/기록 증거: 6a9ea858 .*실시간 상태 아님/);
    assert.equal(await page.locator('[data-check="github-revision"]').getAttribute('data-state'),'NOT_CONNECTED');
    assert.equal(await page.locator('[data-check="local-store"]').getAttribute('data-state'),'VERIFIED');
    // Expand every lane and check touch targets.
    for(const s of await page.locator('.ops-lane summary').all())await s.click();
    await page.screenshot({path:path.join(OUT,'ops-390-expanded.png'),fullPage:true});
    const small=await page.evaluate(()=>[...document.querySelectorAll('#opsConsole button, #opsConsole summary, .nav-btn')]
      .map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height<44).length);
    assert.equal(small,0,'ops/nav targets below 44px');
    // Keyboard: summary toggles via Enter and shows a focus ring.
    const first=page.locator('.ops-lane summary').first();
    await page.locator('#opsRecheckBtn').focus();
    for(let i=0;i<8&&!(await first.evaluate(e=>e===document.activeElement));i++)await page.keyboard.press('Tab');
    assert.equal(await first.evaluate(e=>e===document.activeElement),true,'first lane reachable by Tab');
    const ring=await first.evaluate(e=>getComputedStyle(e).outlineStyle);
    assert.notEqual(ring,'none');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.ops-lane').first().evaluate(d=>d.open),false);
    // Existing navigation still works.
    for(const t of ['work','lab','trace','taky']){
      await page.locator(`.nav-btn[data-target="${t}"]`).click();
      assert.equal(await page.locator(`.screen[data-screen="${t}"]`).isVisible(),true,t);
    }
    return {lanes:6};
  });

  await scenario('mobile-auth-required',{width:390,height:844},'auth',async page=>{
    const primary=page.locator('#operationsList .ops-primary');
    assert.equal(await primary.getAttribute('data-ops-action'),'auth');
    assert.equal(await page.locator('[data-check="netlify-deploy"]').getAttribute('data-evidence'),'AUTH_REQUIRED');
    assert.equal(await page.locator('[data-check="netlify-deploy"]').getAttribute('data-state'),'UNVERIFIED');
    await primary.click();
    assert.equal(await page.locator('#authSheet').isVisible(),true);
    return {primary:'auth'};
  });

  await scenario('desktop-remote-verified',{width:1280,height:800},'ok',async page=>{
    await page.locator('.nav-btn[data-target="ops"]').click();
    assert.equal(await page.locator('[data-check="canonical"]').getAttribute('data-state'),'VERIFIED');
    assert.match(await page.locator('[data-check="canonical"]').textContent(),/feedc0de/);
    assert.equal(await page.locator('[data-check="owner-session"]').getAttribute('data-state'),'VERIFIED');
    assert.equal(await page.locator('[data-check="hns-master"]').getAttribute('data-state'),'NOT_CONNECTED');
    const deploy=page.locator('[data-check="netlify-deploy"]');
    assert.equal(await deploy.getAttribute('data-evidence'),'LIVE_VERIFIED');
    assert.equal(await deploy.getAttribute('data-state'),'VERIFIED');
    assert.match(await deploy.textContent(),/6a9ea858 · ready · commit 7ad757ef .*main 최신과 다름/);
    assert.equal(await page.locator('[data-check="github-revision"]').getAttribute('data-state'),'VERIFIED');
    assert.match(await page.locator('[data-check="github-revision"]').textContent(),/9bcb7d9a/);
    // Release lane auto-opens because the published deploy is behind main.
    assert.equal(await page.locator('details[data-lane="release"]').evaluate(d=>d.open),true);
    for(const d of await page.locator('.ops-lane').all())if(!(await d.evaluate(e=>e.open)))await d.locator('summary').click();
    await page.screenshot({path:path.join(OUT,'ops-1280-expanded.png'),fullPage:true});
    await page.locator('details[data-lane="release"]').screenshot({path:path.join(OUT,'release-1280-live.png')});
    // Explicit recheck issues exactly one more read; no polling.
    const before=releaseCalls;
    await page.locator('#opsRecheckBtn').click();
    await page.waitForFunction(()=>!/checking/.test(document.getElementById('canonicalStatus').textContent));
    await page.waitForTimeout(300);
    assert.equal(releaseCalls-before,1);
    return {canonical:'VERIFIED',release:'LIVE_VERIFIED'};
  });

  await scenario('mobile-release-stale',{width:390,height:844},'stale',async page=>{
    await page.locator('.nav-btn[data-target="ops"]').click();
    const deploy=page.locator('[data-check="netlify-deploy"]');
    assert.equal(await deploy.getAttribute('data-evidence'),'HISTORICAL');
    assert.equal(await deploy.getAttribute('data-state'),'UNVERIFIED');
    assert.match(await deploy.textContent(),/과거 조회 .*현재 상태로 단정하지 않음/);
    assert.equal(await page.locator('[data-check="github-revision"]').getAttribute('data-state'),'UNVERIFIED');
    await page.locator('details[data-lane="release"] summary').click();
    if(!(await page.locator('details[data-lane="release"]').evaluate(d=>d.open)))await page.locator('details[data-lane="release"] summary').click();
    await page.locator('details[data-lane="release"]').screenshot({path:path.join(OUT,'release-390-stale.png')});
    return {release:'HISTORICAL'};
  });

  // Real TAKY localhost fixture host (read-only QA summary endpoint) serving this repo root; blocks all external origins.
  {
    const HOST='D:/Git PWA/TAKY/ENFORCEMENT/family_qa_local_static_host.cjs',QPORT=4192;
    const child=spawn(process.execPath,[HOST,ROOT.replace(/[\\/]+$/,''),String(QPORT)],{stdio:['ignore','pipe','inherit']});
    try{
      await new Promise((ok,bad)=>{child.stdout.on('data',d=>/TAKY_QA_FIXTURE_READY/.test(String(d))&&ok());child.on('exit',()=>bad(new Error('host exited')));setTimeout(()=>bad(new Error('host timeout')),8000)});
      const raw=await (await fetch(`http://127.0.0.1:${QPORT}/__taky_qa_summary`)).text();
      const sum=JSON.parse(raw);
      assert.ok(raw.length<=8192&&!/[A-Za-z]:\\|[A-Za-z]:\//.test(raw),'summary bounded, no absolute paths');
      assert.deepEqual(Object.keys(sum).sort(),['contract','finishedAt','gaps','mode','productionVerified','statuses','verdict']);
      assert.equal((await fetch(`http://127.0.0.1:${QPORT}/__taky_qa_summary`,{method:'POST'})).status===200,false);
      const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
      const external=[];
      let locallyAuthorized=false,guestProtectedReads=0;
      await context.route('**/*',route=>{
        const u=new URL(route.request().url());
        if(u.origin!==`http://127.0.0.1:${QPORT}`){external.push(u.origin);return route.abort();}
        if(u.pathname==='/.netlify/functions/admin-session'){
          const method=route.request().method();
          if(method==='GET')return route.fulfill({status:200,contentType:'application/json',
            body:JSON.stringify({ok:true,authorized:locallyAuthorized})});
          if(method==='POST'){
            locallyAuthorized=route.request().postDataJSON()?.key==='local-qa-summary-only';
            return route.fulfill({status:locallyAuthorized?200:401,contentType:'application/json',
              body:JSON.stringify({ok:locallyAuthorized,authorized:locallyAuthorized})});
          }
        }
        if(u.pathname==='/.netlify/functions/admin-progress'){
          if(!locallyAuthorized)guestProtectedReads++;
          return route.fulfill({status:200,contentType:'application/json',body:'{"ok":false,"error":"LOCAL_QA_ONLY"}'});
        }
        return route.continue();
      });
      const page=await context.newPage();
      const errs=[];page.on('pageerror',e=>errs.push(String(e)));
      await page.goto(`http://127.0.0.1:${QPORT}/`,{waitUntil:'load'});
      // The app initializes IndexedDB asynchronously after the load event;
      // rendered cards prove boot/bind has reached the interaction phase.
      await page.locator('#appGrid .app-card').first().waitFor({state:'attached',timeout:12000});
      assert.equal(await page.locator('.nav-btn[data-target="ops"]').isVisible(),false);
      assert.equal(guestProtectedReads,0);
      await page.locator('#adminLoginBtn').click();
      await page.locator('#adminLoginSheet:not(.hidden)').waitFor({state:'visible',timeout:6000});
      await page.locator('#adminLoginKey').fill('local-qa-summary-only');
      await page.locator('#adminLoginSubmitBtn').click();
      await page.locator('.nav-btn[data-target="ops"]').waitFor({state:'visible',timeout:8000});
      assert.equal(guestProtectedReads,0);
      await page.locator('.nav-btn[data-target="ops"]').click();
      const qa=page.locator('[data-check="local-qa-report"]');
      await qa.waitFor({state:'attached'});
      await page.waitForFunction(()=>document.querySelector('[data-check="local-qa-report"]')?.dataset.state==='UNVERIFIED');
      assert.match(await qa.textContent(),new RegExp(`통과 ${sum.statuses.passed} · 실패 ${sum.statuses.failed} · 차단 ${sum.statuses.blocked} · 열린 갭 ${sum.statuses.openGaps}`));
      assert.match(await qa.textContent(),/이 PC 로컬 검증/);
      assert.match(await qa.textContent(),/운영 검증 아님/);
      assert.equal(await qa.locator('[data-gap]').count(),sum.statuses.openGaps);
      assert.equal(sum.productionVerified,false);
      const lane=page.locator('details[data-lane="incidents"]');
      if(!(await lane.evaluate(d=>d.open)))await lane.locator('summary').click();
      await qa.scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(OUT,'ops-qa-390.png'),fullPage:true});
      assert.deepEqual(errs,[]);assert.deepEqual(external,[]);
      result.scenarios['local-qa-report']={passed:sum.statuses.passed,gaps:sum.statuses.openGaps,state:'UNVERIFIED'};
      await context.close();
    }finally{child.kill();}
  }
  // Off localhost the app must not request the endpoint and must show NOT_CONNECTED (never a false live report).
  {
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
    const hit=[];
    await context.route('**/*',route=>{const u=new URL(route.request().url());
      if(u.hostname==='taky-offsite.test'){
        if(u.pathname==='/__taky_qa_summary')hit.push(u.pathname);
        const rel=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1));
        const full=path.resolve(ROOT,rel);
        if(!full.startsWith(ROOT)||!fs.existsSync(full)||!fs.statSync(full).isFile())return route.fulfill({status:404,body:'nf'});
        return route.fulfill({status:200,contentType:types[path.extname(full)]||'application/octet-stream',body:fs.readFileSync(full)});}
      return route.abort();});
    const page=await context.newPage();
    await page.goto('http://taky-offsite.test/',{waitUntil:'load'});
    // Off-localhost guests may not access the OPS QA panel or make local
    // machine QA reads; NOT_CONNECTED is a private admin state, not a
    // public badge to expose.
    assert.equal(await page.locator('.nav-btn[data-target="ops"]').isVisible(),false);
    assert.equal(await page.locator('#operationsPanel').isVisible(),false);
    assert.deepEqual(hit,[]);
    result.scenarios['qa-off-localhost']={state:'PRIVATE_NOT_CONNECTED',requests:0};
    await context.close();
  }

  result.pass=true;
  console.log(JSON.stringify({contract:'TAKY_MOBILE_ADMIN_CONSOLE_BROWSER_E2E_V1',...result}));
}finally{
  fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(result,null,2));
  await browser?.close();
  await new Promise(r=>server.close(r));
}
