import assert from 'node:assert/strict';
import {deriveOperations,renderOperationsConsole,renderOperationsStrip,STATES} from '../src/admin-status.mjs';

const apps=[
  {id:'ready-set',name:'Ready & Set',url:'https://profound-ganache-902032.netlify.app'},
  {id:'play-camp',name:'Play Camp',url:null,via:'ready-set'},
];
const lane=(m,id)=>m.lanes.find(l=>l.id===id);
const chk=(m,laneId,id)=>lane(m,laneId).checks.find(c=>c.id===id);

// 1. Offline/static: nothing remote may read as VERIFIED.
const cold=deriveOperations({apps,canonical:{source:'UNAVAILABLE',bundle:null},works:[],traces:[],storageMode:null,cacheKeys:[]});
assert.deepEqual(cold.lanes.map(l=>l.code),['A','B','C','D','E','F']);
for(const l of cold.lanes)for(const c of l.checks)assert.ok(STATES.includes(c.state),c.id);
assert.equal(chk(cold,'release','canonical').state,'NOT_CONNECTED');
assert.equal(chk(cold,'access','owner-session').state,'NOT_CONNECTED');
assert.equal(chk(cold,'release','netlify-deploy').state,'UNVERIFIED','recorded deploy evidence is never live');
assert.equal(chk(cold,'release','release-pass').state,'UNVERIFIED');
for(const id of ['hns-master','siezeall-dist'])assert.equal(chk(cold,'assets',id).state,'NOT_CONNECTED');
assert.equal(chk(cold,'learning','family-backup').state,'NOT_CONNECTED');
assert.equal(chk(cold,'incidents','remote-incidents').state,'NOT_CONNECTED');
assert.ok(lane(cold,'registry').checks.every(c=>c.state!=='VERIFIED'),'registered links are not verified deployments');
assert.equal(cold.primary.action,'refresh');

// 2. Auth required: primary action is device auth, session not verified.
const auth=deriveOperations({apps,canonical:{source:'AUTH_REQUIRED',bundle:null,authRequired:true},works:[],traces:[]});
assert.equal(chk(auth,'access','owner-session').state,'UNVERIFIED');
assert.equal(auth.primary.action,'auth');
assert.match(renderOperationsStrip(auth),/data-ops-action="auth"/);

// 3. Fresh cache is not a remote verification.
const bundle={ok:true,repository:'hns140412-glitch/TAKY',ref:'main',fetchedAt:'2026-10-12T00:00:00Z',files:[{path:'TAKY.md',sha:'abcdef1234567'}]};
const cached=deriveOperations({apps,canonical:{source:'CACHE_FRESH',bundle},works:[],traces:[]});
assert.equal(chk(cached,'release','canonical').state,'UNVERIFIED');
assert.equal(chk(cached,'access','owner-session').state,'UNVERIFIED');

// 4. Remote verified + learning receipt + failures.
const works=[
  {id:'l1',action:{type:'START_LEARNING_LOOP'},execution:{status:'VERIFIED',receipt:{result:'LEARNING_LOOP_RESULT_RECEIVED',returnedAt:'2026-10-11T10:00:00Z'}}},
  {id:'x',state:'FAILED',execution:{status:'FAILED'}},
];
const live=deriveOperations({apps,canonical:{source:'REMOTE_VERIFIED',bundle},works,traces:[{state:'REJECTED'}],storageMode:'INDEXEDDB',cacheKeys:['taky-mobile-mvp-v8-ops-console']});
assert.equal(chk(live,'release','canonical').state,'VERIFIED');
assert.match(chk(live,'release','canonical').detail,/abcdef12/);
assert.equal(chk(live,'access','owner-session').state,'VERIFIED');
assert.equal(chk(live,'learning','loop-receipts').state,'VERIFIED');
assert.equal(chk(live,'learning','local-store').state,'VERIFIED');
assert.equal(chk(live,'assets','device-cache').state,'UNVERIFIED','cache presence is not a hash match');
assert.equal(chk(live,'incidents','local-failures').attention,true);
assert.equal(live.primary.action,'trace');
assert.equal(lane(live,'incidents').attention,true);

// 5. Rendering escapes and carries state as text, not colour only.
const html=renderOperationsConsole(deriveOperations({apps:[{id:'e',name:'<img onerror=1>',url:'https://a.test'}],canonical:null,works:[],traces:[]}));
assert.ok(!html.includes('<img'));
assert.match(html,/미연결<span class="sr-code"> NOT_CONNECTED/);
assert.match(html,/<details class="ops-lane" data-lane="incidents">/);

// 6. Local QA report: historical offline evidence, never VERIFIED even with 22 passes; gaps escaped; missing -> NOT_CONNECTED.
const qa={contract:'TAKY_FAMILY_PERIODIC_QA_V1',mode:'deep',finishedAt:'2026-10-15T23:51:09.254Z',productionVerified:false,verdict:'TESTS_PASS_WITH_CRITICAL_GAPS',
  statuses:{passed:22,failed:0,blocked:0,openGaps:7},
  gaps:Array.from({length:7},(_,i)=>({id:`gap-${i}`,priority:'P0',area:i?'ALL':'<b>X</b>',why:i?'미검증':'<script>1</script>'}))};
const withQa=deriveOperations({apps,canonical:null,works:[],traces:[],qa});
const q=chk(withQa,'incidents','local-qa-report');
assert.equal(q.state,'UNVERIFIED');
assert.equal(q.scope,'이 PC 로컬 검증');
assert.match(q.detail,/통과 22 · 실패 0 · 차단 0 · 열린 갭 7 · 마지막 실행 2026-10-15 23:51Z/);
assert.match(q.detail,/운영 검증 아님/);
assert.ok(!q.attention);
const qaHtml=renderOperationsConsole(withQa);
assert.equal((qaHtml.match(/data-gap="/g)||[]).length,7);
assert.ok(!qaHtml.includes('<script>')&&!qaHtml.includes('<b>X'),'gap text escaped');
const qaBad=deriveOperations({apps,works:[],traces:[],qa:{...qa,statuses:{...qa.statuses,failed:1}}});
assert.equal(chk(qaBad,'incidents','local-qa-report').attention,true);
assert.equal(lane(qaBad,'incidents').attention,true);
for(const missing of [undefined,null,{},{...qa,statuses:{passed:'22'}},{...qa,productionVerified:true,finishedAt:'x'}])
  assert.equal(chk(deriveOperations({apps,works:[],traces:[],qa:missing}),'incidents','local-qa-report').state,'NOT_CONNECTED');
assert.equal(chk(cold,'incidents','local-qa-report').state,'NOT_CONNECTED');
assert.ok(!deriveOperations({apps,qa}).lanes.flatMap(l=>l.checks).some(c=>c.id==='local-qa-report'&&c.state==='VERIFIED'));

console.log(JSON.stringify({pass:true,contract:'TAKY_MOBILE_ADMIN_OPS_MODEL_V1',scenarios:6}));
