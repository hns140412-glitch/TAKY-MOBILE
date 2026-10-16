const { chromium }=require('D:/Git PWA/Play Camp/node_modules/playwright-core');
const {spawn}=require('node:child_process');
const target='http://127.0.0.1:4396/';
const fs=require('node:fs');
const out='D:/Git PWA/TAKY-MOBILE/artifacts/device-mock-audit-20261011/path-migration-e2e';
async function sleep(n){await new Promise(r=>setTimeout(r,n))}
async function main(){
  const server=spawn('python.exe',['-m','http.server','4396','--bind','127.0.0.1'],{cwd:'D:/Git PWA/TAKY-MOBILE',windowsHide:true,stdio:'ignore'});
  let browser;
  const results={timestamp:new Date().toISOString(),target,server_pid:server.pid,steps:[],errors:[]};
  const stamp=(label,start,detail)=>results.steps.push({label,ms:Date.now()-start,detail:detail||''});
  try{
    let ready=false;for(let i=0;i<25;i++){try{const r=await fetch(target,{signal:AbortSignal.timeout(2000)});if(r.status===200){ready=true;break}}catch{}await sleep(250)}
    if(!ready)throw Error('STATIC_SERVER_NO_HTTP_200');
    let started=Date.now();
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-extensions','--disable-background-networking']});
    stamp('chrome_launch',started);
    const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
    page.on('pageerror',e=>results.errors.push(String(e).slice(0,300)));
    started=Date.now(); await page.goto('data:text/html,<html><body>ready</body></html>',{waitUntil:'domcontentloaded',timeout:15000}); stamp('data_domcontentloaded',started);
    started=Date.now(); await page.goto(target,{waitUntil:'commit',timeout:20000}); stamp('mobile_http_commit',started);
    started=Date.now(); await page.waitForLoadState('domcontentloaded',{timeout:20000}); stamp('mobile_domcontentloaded',started);
    results.readyState=await page.evaluate('document.readyState');
    results.url=page.url();
    results.appCardCount=await page.locator('#appGrid .app-card').count();
    results.pass=results.steps.length===4;
  }catch(e){results.pass=false;results.errors.push(String(e).slice(0,700))}
  finally {try{await browser?.close()}catch{};try{server.kill()}catch{};fs.writeFileSync(out+'/browser-probe-result.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
