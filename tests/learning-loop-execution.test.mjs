import assert from 'node:assert/strict';
import {executeWorkAction,applyExecutionResult,applyLearningLoopReturn,isExecutableWork,selectNextExecutableWork} from '../src/execution.mjs';

const work={
  id:'learning-loop-1',title:'오늘 학습 실행',state:'PLANNED',
  action:{type:'START_LEARNING_LOOP',appId:'ready-set',returnNonce:'nonce-1234567890'}
};
let prepared=null;
const dispatched=await executeWorkAction(work,{
  prepareLearningLoop:async input=>{
    prepared=input;
    return {ok:true,url:'https://ready.example/?taky_mobile_work_id=learning-loop-1'};
  }
});
assert.equal(dispatched.ok,true);
assert.equal(dispatched.status,'AWAITING_RESULT');
assert.equal(dispatched.completed,false);
assert.equal(dispatched.receipt.result,'LEARNING_LOOP_DISPATCHED_AWAITING_RESULT');
assert.equal(prepared.workId,'learning-loop-1');
assert.equal(prepared.returnNonce,'nonce-1234567890');

const waiting=applyExecutionResult(work,dispatched);
assert.equal(waiting.state,'AWAITING_RESULT');
assert.equal(waiting.execution.completed,false);
assert.equal(isExecutableWork(waiting),false);
assert.equal(selectNextExecutableWork([waiting]),null);

const rejected=applyLearningLoopReturn(waiting,{
  workId:'learning-loop-1',returnNonce:'wrong',fromApp:'ready-set',
  sessionId:'s1',taskState:'COMPLETED',eventId:'e1'
});
assert.equal(rejected.ok,false);
assert.equal(rejected.reason,'RETURN_NONCE_MISMATCH');

const accepted=applyLearningLoopReturn(waiting,{
  workId:'learning-loop-1',returnNonce:'nonce-1234567890',fromApp:'ready-set',
  sessionId:'s1',taskState:'COMPLETED',eventId:'e1'
});
assert.equal(accepted.ok,true);
assert.equal(accepted.work.state,'COMPLETED');
assert.equal(accepted.work.execution.status,'VERIFIED');
assert.equal(accepted.work.execution.completed,true);
assert.equal(accepted.work.execution.receipt.result,'LEARNING_LOOP_RESULT_RECEIVED');
assert.equal(accepted.work.execution.receipt.sessionId,'s1');
assert.equal(accepted.work.execution.receipt.taskState,'COMPLETED');
assert.equal(isExecutableWork(accepted.work),false);

for(const state of ['PARTIAL','DEFERRED','BLOCKED','WAITING_FOR_PARENT']){
  const base=applyExecutionResult({...work,id:'loop-'+state,action:{...work.action,returnNonce:'n-'+state}},{
    ...dispatched,
    receipt:{...dispatched.receipt,workId:'loop-'+state}
  });
  const r=applyLearningLoopReturn(base,{
    workId:'loop-'+state,returnNonce:'n-'+state,fromApp:'ready-set',sessionId:'s-'+state,taskState:state
  });
  assert.equal(r.ok,true,state);
  assert.equal(r.work.state,state);
  assert.equal(r.work.execution.completed,true);
}
console.log(JSON.stringify({pass:true,contract:'TAKY_MOBILE_LEARNING_LOOP_EXECUTION_V1',awaitingResult:true,nonceGuard:true,resultStates:5},null,2));
