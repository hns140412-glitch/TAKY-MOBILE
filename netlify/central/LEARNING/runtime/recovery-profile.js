'use strict';

const VERSION='TAKY_LEARNING_RECOVERY_PROFILE_V1';
const clean=v=>String(v??'').trim();
const finite=v=>Number.isFinite(Number(v))?Number(v):null;

function derive(rows=[]){
  const seq=(Array.isArray(rows)?rows:[])
    .filter(e=>clean(e.learning_target_id))
    .filter(e=>(e.verified_outcome===0||e.verified_outcome===1)&&clean(e?.verification?.authority)==='LEARNING_VERIFICATION_RECEIPT')
    .filter(e=>Number.isFinite(Date.parse(e.observed_at||'')))
    .slice()
    .sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at)||clean(a.event_id).localeCompare(clean(b.event_id)));

  if(!seq.length){
    return {
      ok:true,
      profile_version:VERSION,
      status:(Array.isArray(rows)?rows:[]).some(e=>clean(e.learning_target_id))?'INSUFFICIENT_VERIFIED_TARGET_EVENTS':'INSUFFICIENT_TARGET_IDENTITY',
      target_count:0,
      recovery_episode_count:0,
      recovered_episode_count:0,
      unresolved_episode_count:0,
      assistance_rate:null,
      mean_attempt_count:null,
      median_recovery_hours:null,
      authority:'OBSERVATIONAL_RECOVERY_PROFILE_ONLY'
    };
  }

  const byTarget=new Map();
  for(const e of seq){
    const id=clean(e.learning_target_id);
    if(!byTarget.has(id))byTarget.set(id,[]);
    byTarget.get(id).push(e);
  }

  const episodes=[];
  let assistedCount=0, assistanceKnown=0;
  const attempts=[];
  for(const e of seq){
    if(e.assisted===true||clean(e.assistance)==='ASSISTED'){assistedCount++;assistanceKnown++;}
    else if(e.assisted===false||clean(e.assistance)==='UNASSISTED')assistanceKnown++;
    if(Number.isInteger(e.attempt_count))attempts.push(e.attempt_count);
  }

  for(const [target,items] of byTarget.entries()){
    for(let i=0;i<items.length;i++){
      const start=items[i];
      if(start.verified_outcome!==0)continue;
      const nextSuccess=items.slice(i+1).find(x=>x.verified_outcome===1);
      if(!nextSuccess){
        episodes.push({learning_target_id:target,start_event_id:start.event_id,recovered:false,recovery_hours:null});
        continue;
      }
      const hours=(Date.parse(nextSuccess.observed_at)-Date.parse(start.observed_at))/(1000*60*60);
      episodes.push({
        learning_target_id:target,
        start_event_id:start.event_id,
        recovery_event_id:nextSuccess.event_id,
        recovered:true,
        recovery_hours:Number.isFinite(hours)?Math.max(0,hours):null
      });
    }
  }

  const recovered=episodes.filter(x=>x.recovered&&Number.isFinite(x.recovery_hours));
  const hours=recovered.map(x=>x.recovery_hours).sort((a,b)=>a-b);
  const median=hours.length
    ?(hours.length%2?hours[Math.floor(hours.length/2)]:(hours[hours.length/2-1]+hours[hours.length/2])/2)
    :null;

  return {
    ok:true,
    profile_version:VERSION,
    status:'OBSERVED',
    target_count:byTarget.size,
    recovery_episode_count:episodes.length,
    recovered_episode_count:recovered.length,
    unresolved_episode_count:episodes.length-recovered.length,
    assistance_rate:assistanceKnown?assistedCount/assistanceKnown:null,
    mean_attempt_count:attempts.length?attempts.reduce((a,b)=>a+b,0)/attempts.length:null,
    median_recovery_hours:Number.isFinite(median)?Math.round(median*100)/100:null,
    episodes,
    authority:'OBSERVATIONAL_RECOVERY_PROFILE_ONLY',
    can_influence:['RECOVERY_INTENSITY','CHECKPOINT_SELECTION','ASSISTANCE_FADING'],
    cannot_influence:['MASTERY_TRUTH','SCHEDULE_DATE','PLANNER_DATE','DUE_AT','DEADLINE']
  };
}

function validate(profile={}){
  const issues=[];
  if(!profile?.ok)issues.push('PROFILE_NOT_OK');
  if(profile.authority!=='OBSERVATIONAL_RECOVERY_PROFILE_ONLY')issues.push('AUTHORITY_INVALID');
  for(const k of ['schedule_date','planner_date','due_at','due_date','deadline']){
    if(Object.prototype.hasOwnProperty.call(profile,k))issues.push('SCHEDULE_AUTHORITY_LEAK');
  }
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({VERSION,derive,validate});
