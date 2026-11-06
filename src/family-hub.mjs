// TAKY Mobile consumes an existing TAKY central family runtime. It never
// manufactures auth, trusts family names for permissions, or persists bearer tokens.
const clean=x=>typeof x==='string'?x.trim():'';
export function allowedMembers(session){
  const self=clean(session?.self_member_id);
  const granted=Array.isArray(session?.authorized_member_ids)?session.authorized_member_ids.map(clean):[];
  return [...new Set([self,...granted].filter(Boolean))];
}
export async function verifyFamilyContext(runtime){
  if(!runtime||typeof runtime.getToken!=='function'||typeof runtime.getFamilyId!=='function'||typeof runtime.currentSession!=='function')
    return {ok:false,state:'TAKY_FAMILY_RUNTIME_REQUIRED'};
  try{
    const [session,selectedFamily,token]=await Promise.all([
      runtime.currentSession(),runtime.getFamilyId(),runtime.getToken()
    ]);
    const familyId=clean(session?.family_id),wanted=clean(selectedFamily),self=clean(session?.self_member_id);
    if(!familyId||!wanted||familyId!==wanted||!self)
      return {ok:false,state:'FAMILY_SCOPE_UNVERIFIED'};
    const members=allowedMembers(session);
    if(!members.includes(self)||members.length>30||!clean(token)||clean(token).length<16)
      return {ok:false,state:'FAMILY_SESSION_INCOMPLETE'};
    // Token remains in the provider; returned UI context contains no secret.
    return {ok:true,familyId,self,members,provider:runtime};
  }catch{return {ok:false,state:'CENTRAL_FAMILY_AUTH_UNAVAILABLE'};}
}
export async function memberProfile(context,memberId,fetchImpl=fetch){
  const id=clean(memberId);
  if(!context?.ok||!context.members.includes(id))return {ok:false,state:'MEMBER_NOT_AUTHORIZED'};
  let base;
  try{
    base=new URL(context.provider.apiBaseUrl);
    const local=['localhost','127.0.0.1'].includes(base.hostname);
    if(base.username||base.password||!((local&&['http:','https:'].includes(base.protocol))||base.protocol==='https:'))
      return {ok:false,state:'CENTRAL_BASE_URL_INVALID'};
  }catch{return {ok:false,state:'CENTRAL_BASE_URL_INVALID'}}
  try{
    const token=clean(await context.provider.getToken());
    if(token.length<16)return {ok:false,state:'TOKEN_UNAVAILABLE'};
    const url=new URL('/api/family/member-profile',base);
    const response=await fetchImpl(url.href,{
      method:'POST',cache:'no-store',redirect:'error',
      headers:{'content-type':'application/json','authorization':'Bearer '+token},
      body:JSON.stringify({family_id:context.familyId,action:'GET',member_id:id})
    });
    if(!response.ok)return {ok:false,state:'CENTRAL_PROFILE_UNAVAILABLE'};
    const body=await response.json();
    if(!body?.found)return {ok:false,state:'PROFILE_NOT_FOUND'};
    const p=body.projection;
    if(!p||clean(p.member_id)!==id)return {ok:false,state:'PROFILE_SCOPE_MISMATCH'};
    return {ok:true,id,display:clean(p.display_name)||clean(p.nickname)||'가족 구성원',stage:clean(p.school_stage),version:p.profile_version};
  }catch{return {ok:false,state:'CENTRAL_PROFILE_UNAVAILABLE'};}
}
// The family hub reads the existing server-owned learning decision for one
// explicit Play Camp activity, not a global mastery or school-grade total.
const ACTIVITY_SCOPE={subject:'영어',concept_skill_target:'phoneme_blending'};

export async function memberLearning(context,memberId,fetchImpl=fetch){
  const id=clean(memberId);
  if(!context?.ok||!context.members.includes(id))return {ok:false,state:'MEMBER_NOT_AUTHORIZED'};
  try{
    const base=new URL(context.provider.apiBaseUrl);
    const local=['127.0.0.1','localhost'].includes(base.hostname);
    if(base.username||base.password||base.search||base.hash||
       !(base.protocol==='https:'||(local&&base.protocol==='http:')))
      return {ok:false,state:'CENTRAL_BASE_URL_INVALID'};
    const token=clean(await context.provider.getToken());
    if(token.length<16)return {ok:false,state:'TOKEN_UNAVAILABLE'};
    const response=await fetchImpl(new URL('/api/learning/decision',base).href,{
      method:'POST',cache:'no-store',redirect:'error',
      headers:{'content-type':'application/json','authorization':'Bearer '+token},
      body:JSON.stringify({family_id:context.familyId,member_id:id,...ACTIVITY_SCOPE})
    });
    if(!response.ok)return {ok:false,state:'CENTRAL_LEARNING_READ_UNAVAILABLE'};
    const data=await response.json();
    const trace=data?.runtime_result?.trace;
    const observed=trace?.observation_review_evidence_count;
    const verified=trace?.verified_evidence_count;
    if(data?.ok!==true||data.authenticated_server_response!==true||
       data?.receipt_scope?.family_id!==context.familyId||
       data?.receipt_scope?.member_id!==id||
       !Number.isSafeInteger(observed)||observed<0||
       !Number.isSafeInteger(verified)||verified<0)
      return {ok:false,state:'CENTRAL_LEARNING_SCOPE_INVALID'};
    return {ok:true,state:'CENTRAL_LEARNING_READ',observed,verified};
  }catch{return {ok:false,state:'CENTRAL_LEARNING_READ_UNAVAILABLE'};}
}

export async function mountFamilyHub(root,{runtime=globalThis.TAKY_FAMILY_RUNTIME,fetchImpl=fetch}={}){
  if(!root)return {ok:false,state:'MOUNT_TARGET_MISSING'};
  const mountVersion=String((Number(root.dataset.familyGeneration)||0)+1);
  root.dataset.familyGeneration=mountVersion;
  const status=root.querySelector('[data-family-status]'),membersRoot=root.querySelector('[data-family-members]'),detail=root.querySelector('[data-family-detail]');
  const panel=root.querySelector('[data-family-private]');
  const learningStatus=root.querySelector('[data-family-learning-status]');
  const learningList=root.querySelector('[data-family-learning-list]');
  panel.hidden=true;membersRoot.replaceChildren();detail.textContent='';
  learningStatus.textContent='';
  learningList.replaceChildren();
  root.dataset.learningState='UNBOUND';
  const ctx=await verifyFamilyContext(runtime);
  if(root.dataset.familyGeneration!==mountVersion)return {ok:false,state:'SUPERSEDED'};
  root.dataset.familyState=ctx.ok?'CENTRAL_BOUND':ctx.state;
  status.textContent=ctx.ok?'중앙 가족 인증 확인됨':'가족 세션 미연결 · 학습앱 데모와 구분';
  if(!ctx.ok)return ctx;
  panel.hidden=false;
  let generation=0;
  const buttons=new Map();
  async function select(id){
    if(!ctx.members.includes(id))return {ok:false,state:'MEMBER_NOT_AUTHORIZED'};
    const ticket=++generation;
    for(const [key,button] of buttons)button.setAttribute('aria-pressed',String(key===id));
    detail.textContent='중앙 프로필 확인 중…';
    const [result,learning]=await Promise.all([
      memberProfile(ctx,id,fetchImpl),memberLearning(ctx,id,fetchImpl)
    ]);
    if(ticket!==generation||root.dataset.familyGeneration!==mountVersion)return {ok:false,state:'SUPERSEDED'};
    detail.textContent=result.ok?`${result.display}${result.stage?' · '+result.stage:''} · 중앙 프로필 확인`:
      result.state==='PROFILE_NOT_FOUND'?'아직 등록된 프로필이 없어요. Ready & Set에서 프로필과 캐릭터를 만들면 여기에 표시돼요.':
      '중앙 프로필을 불러오지 못했어요. 잠시 후 다시 열어 주세요.';
    root.dataset.memberState=result.ok?'CENTRAL_PROFILE_BOUND':result.state;
    root.dataset.learningState=learning.state;
    learningStatus.textContent=learning.ok
      ? `Play Camp 영어 소리 합치기 · 관찰 ${learning.observed}건 · 검증된 성과 ${learning.verified}건 (관찰은 숙달 판정 아님)`
      : '중앙 학습 기록 조회 불가 · 이전 기록을 임의로 표시하지 않습니다.';
    return result;
  }
  for(const [index,id] of ctx.members.entries()){
    const button=document.createElement('button');
    button.type='button';button.className='family-member-choice';
    button.textContent=id===ctx.self?'내 계정':`가족 구성원 ${index+1}`;
    button.dataset.memberChoice=String(index+1);
    button.setAttribute('aria-pressed',String(id===ctx.self));
    button.addEventListener('click',()=>void select(id).then(out=>{
      if(out?.ok)root.querySelector('[data-family-learning]')?.scrollIntoView({block:'start'});
    }));
    buttons.set(id,button);membersRoot.appendChild(button);
  }
  // The finance role is never inferred from family membership or self member ID.
  const savey=root.querySelector('[data-family-savey]');
  savey.textContent='SAVEY · 금융 권한은 SAVEY에서 별도 인증';
  await select(ctx.self);
  return {ok:true,state:'CENTRAL_BOUND',members:ctx.members.length};
}
