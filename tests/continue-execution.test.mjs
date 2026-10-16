import assert from 'node:assert/strict';
import {selectNextExecutableWork,executeWorkAction,applyExecutionResult,isExecutableWork} from '../src/execution.mjs';

const hold={id:'hold',title:'hold',state:'HOLD',next:'wait'};
const app={id:'app',title:'Ready',state:'PLANNED',action:{type:'OPEN_APP',appId:'ready-set'}};
const screen={id:'screen',title:'Work',state:'PLANNED',action:{type:'OPEN_SCREEN',target:'work'}};

assert.equal(isExecutableWork(hold),false);
assert.equal(selectNextExecutableWork([hold,app,screen]).id,'app');

const opened=[];
const appResult=await executeWorkAction(app,{openApp:async id=>{opened.push(id);return {ok:true,url:'https://example.test/app'}}});
assert.equal(appResult.ok,true);
assert.equal(appResult.status,'DISPATCHED');
assert.deepEqual(opened,['ready-set']);
const appApplied=applyExecutionResult(app,appResult);
assert.equal(appApplied.state,'DISPATCHED');
assert.equal(appApplied.execution.completed,true);
assert.equal(isExecutableWork(appApplied),false);

let active='taky';
const screenResult=await executeWorkAction(screen,{openScreen:async target=>{active=target;return true}});
assert.equal(screenResult.ok,true);
assert.equal(screenResult.status,'VERIFIED');
assert.equal(active,'work');

const failed=await executeWorkAction(app,{openApp:async()=>({ok:false,reason:'APP_LINK_NOT_VERIFIED'})});
assert.equal(failed.ok,false);
assert.equal(failed.status,'FAILED');
assert.equal(failed.reason,'APP_LINK_NOT_VERIFIED');

const canonical={id:'canonical',title:'Canonical',state:'PLANNED',action:{type:'CANONICAL_REFRESH'}};
const canonicalResult=await executeWorkAction(canonical,{refreshCanonical:async()=>({ok:true,source:'REMOTE_VERIFIED'})});
assert.equal(canonicalResult.ok,true);
assert.equal(canonicalResult.status,'VERIFIED');

console.log(JSON.stringify({pass:true,contract:'TAKY_MOBILE_CONTINUE_EXECUTION_V1',checks:16,openApp:'DISPATCHED',openScreen:'VERIFIED',canonical:'VERIFIED',holdSkipped:true}));
