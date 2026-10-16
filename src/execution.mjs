const NON_REEXECUTABLE_STATES = new Set(['DISPATCHED','VERIFIED','FAILED','AWAITING_RESULT']);
const LEARNING_RESULT_STATES = new Set(['COMPLETED','PARTIAL','DEFERRED','BLOCKED','WAITING_FOR_PARENT']);

const clean = value => String(value ?? '').trim();

export function actionLabel(action={}) {
  const type=clean(action.type).toUpperCase();
  if(type==='OPEN_APP') return '앱 열기';
  if(type==='START_LEARNING_LOOP') return '학습 시작';
  if(type==='OPEN_SCREEN') return '화면 열기';
  if(type==='CANONICAL_REFRESH') return '기준 새로고침';
  return type || '실행 없음';
}

export function isExecutableWork(work={}) {
  if(!work || work.execution?.completed===true) return false;
  if(NON_REEXECUTABLE_STATES.has(clean(work.execution?.status).toUpperCase())) return false;
  const type=clean(work.action?.type).toUpperCase();
  return ['OPEN_APP','START_LEARNING_LOOP','OPEN_SCREEN','CANONICAL_REFRESH'].includes(type);
}

export function selectNextExecutableWork(works=[]) {
  return works.find(isExecutableWork) || null;
}

function receiptBase(work, action) {
  return {
    receiptId:'exec-'+Date.now()+'-'+Math.random().toString(16).slice(2),
    workId:work.id || null,
    actionType:action.type,
    attemptedAt:new Date().toISOString(),
  };
}

export async function executeWorkAction(work, adapters={}) {
  if(!isExecutableWork(work)) return {ok:false,status:'NOT_EXECUTABLE',reason:'NO_EXECUTABLE_ACTION',work};
  const action={...work.action,type:clean(work.action.type).toUpperCase()};
  const receipt=receiptBase(work,action);
  try{
    if(action.type==='OPEN_APP'){
      if(!clean(action.appId)) throw new Error('APP_ID_REQUIRED');
      const result=await adapters.openApp?.(action.appId);
      if(!result?.ok) throw new Error(result?.reason || 'APP_OPEN_FAILED');
      return {ok:true,status:'DISPATCHED',completed:true,receipt:{...receipt,target:result.url || action.appId,result:'OPEN_DISPATCHED'}};
    }
    if(action.type==='START_LEARNING_LOOP'){
      if(!clean(action.appId)) throw new Error('APP_ID_REQUIRED');
      if(!clean(action.returnNonce)) throw new Error('RETURN_NONCE_REQUIRED');
      const result=await adapters.prepareLearningLoop?.({
        appId:action.appId,
        workId:work.id || null,
        returnNonce:action.returnNonce,
      });
      if(!result?.ok || !clean(result.url)) throw new Error(result?.reason || 'LEARNING_LOOP_PREPARE_FAILED');
      return {
        ok:true,
        status:'AWAITING_RESULT',
        completed:false,
        navigateTo:result.url,
        receipt:{
          ...receipt,
          target:result.url,
          result:'LEARNING_LOOP_DISPATCHED_AWAITING_RESULT',
        },
      };
    }
    if(action.type==='OPEN_SCREEN'){
      if(!clean(action.target)) throw new Error('SCREEN_TARGET_REQUIRED');
      const result=await adapters.openScreen?.(action.target);
      if(result===false) throw new Error('SCREEN_OPEN_FAILED');
      return {ok:true,status:'VERIFIED',completed:true,receipt:{...receipt,target:action.target,result:'SCREEN_ACTIVE'}};
    }
    if(action.type==='CANONICAL_REFRESH'){
      const result=await adapters.refreshCanonical?.();
      if(!result?.ok) throw new Error(result?.reason || 'CANONICAL_REFRESH_FAILED');
      return {ok:true,status:'VERIFIED',completed:true,receipt:{...receipt,target:'CANONICAL',result:result.source || 'REFRESHED'}};
    }
    return {ok:false,status:'NOT_EXECUTABLE',reason:'UNSUPPORTED_ACTION',work};
  }catch(error){
    return {ok:false,status:'FAILED',completed:true,reason:String(error?.message || error),receipt:{...receipt,result:'FAILED',error:String(error?.message || error)}};
  }
}

export function applyExecutionResult(work,result) {
  return {
    ...work,
    state:result.ok ? result.status : 'FAILED',
    execution:{status:result.status,completed:result.completed===true,reason:result.reason || null,receipt:result.receipt || null},
  };
}

export function applyLearningLoopReturn(work,payload={}) {
  if(!work || clean(work.action?.type).toUpperCase()!=='START_LEARNING_LOOP')
    return {ok:false,reason:'WORK_NOT_LEARNING_LOOP',work};
  if(work.execution?.status!=='AWAITING_RESULT' || work.execution?.completed===true)
    return {ok:false,reason:'WORK_NOT_AWAITING_RESULT',work};
  if(clean(payload.workId)!==clean(work.id))
    return {ok:false,reason:'WORK_ID_MISMATCH',work};
  if(!clean(work.action?.returnNonce) || clean(payload.returnNonce)!==clean(work.action.returnNonce))
    return {ok:false,reason:'RETURN_NONCE_MISMATCH',work};
  if(clean(payload.fromApp)!=='ready-set')
    return {ok:false,reason:'RETURN_SOURCE_MISMATCH',work};
  if(!clean(payload.sessionId))
    return {ok:false,reason:'SESSION_ID_REQUIRED',work};
  const taskState=clean(payload.taskState).toUpperCase();
  if(!LEARNING_RESULT_STATES.has(taskState))
    return {ok:false,reason:'INVALID_LEARNING_RESULT',work};

  const prior=work.execution?.receipt || {};
  const returnedAt=new Date().toISOString();
  return {
    ok:true,
    work:{
      ...work,
      state:taskState,
      next:'학습 결과 확인 완료',
      execution:{
        status:'VERIFIED',
        completed:true,
        reason:null,
        receipt:{
          ...prior,
          result:'LEARNING_LOOP_RESULT_RECEIVED',
          returnedAt,
          sessionId:clean(payload.sessionId),
          taskState,
          eventId:clean(payload.eventId) || null,
          source:'ready-set',
        },
      },
    },
  };
}
