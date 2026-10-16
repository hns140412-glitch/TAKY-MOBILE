import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///D:/Git%20PWA/Play%20Camp/node_modules/playwright-core/index.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
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
await new Promise(resolve=>server.listen(4188,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({serviceWorkers:'block'});
  const page=await context.newPage();
  await page.addInitScript(()=>{window.__takyOpened=[];window.open=(url,target,features)=>{window.__takyOpened.push({url,target,features});return {closed:false}}});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:4188')return route.abort();return route.continue()});
  await page.goto('http://127.0.0.1:4188/',{waitUntil:'load'});
  await page.waitForSelector('[data-app-work="ready-set"]');
  await page.locator('[data-app-work="ready-set"]').click();
  await page.waitForSelector('[data-work-execute="app-work-ready-set"]');
  await page.locator('.nav-btn[data-target="taky"]').click();
  await page.locator('#input').fill('ㄱ');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(()=>window.__takyOpened.length===1);
  const opened=await page.evaluate(()=>window.__takyOpened[0]);
  assert.equal(opened.url,'https://profound-ganache-902032.netlify.app');
  assert.equal(opened.target,'_blank');
  await page.locator('.nav-btn[data-target="work"]').click();
  const workText=await page.locator('#workList').innerText();
  assert.match(workText,/Ready & Set 실행/);
  assert.match(workText,/DISPATCHED/);
  assert.match(workText,/OPEN_DISPATCHED/);
  const chat=await page.locator('#chat').innerText();
  assert.match(chat,/다음 액션을 실제 실행했습니다/);
  console.log(JSON.stringify({pass:true,contract:'TAKY_MOBILE_CONTINUE_BROWSER_E2E_V1',opened:opened.url,state:'DISPATCHED',receipt:'OPEN_DISPATCHED'}));
  await context.close();
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
