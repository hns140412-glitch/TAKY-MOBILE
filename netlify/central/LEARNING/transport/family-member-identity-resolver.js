'use strict';
const VERSION='TAKY_FAMILY_MEMBER_IDENTITY_RESOLVER_V1';
const clean=v=>String(v??'').trim();

function resolve(principal={},options={}){
  const issues=[];
  if(principal.authenticated!==true)issues.push('AUTHENTICATION_REQUIRED');
  const principalId=clean(principal.principal_id||principal.sub||principal.user_id);
  if(!principalId)issues.push('PRINCIPAL_ID_REQUIRED');
  const families=Array.isArray(principal.families)?principal.families:[];
  const requestedFamily=clean(options.requested_family_id||principal.active_family_id);
  if(!requestedFamily&&families.length!==1)issues.push('FAMILY_SCOPE_EXPLICIT_SELECTION_REQUIRED');

  const targetFamily=requestedFamily || clean(families[0]?.family_id);
  const membership=families.find(x=>clean(x?.family_id)===targetFamily);
  if(targetFamily&&!membership)issues.push('FAMILY_NOT_AUTHORIZED_FOR_PRINCIPAL');

  const memberIds=new Set(
    Array.isArray(membership?.authorized_member_ids)
      ? membership.authorized_member_ids.map(clean).filter(Boolean)
      : []
  );
  const selfMember=clean(membership?.self_member_id);
  if(selfMember)memberIds.add(selfMember);
  if(targetFamily&&memberIds.size===0)issues.push('AUTHORIZED_MEMBER_SET_REQUIRED');

  return {
    ok:issues.length===0,
    resolver_version:VERSION,
    issues,
    identity:issues.length?null:{
      authenticated:true,
      principal_id:principalId,
      family_id:targetFamily,
      authorized_member_ids:[...memberIds].sort(),
      identity_provider:clean(principal.identity_provider)||'UPSTREAM_AUTH_PROVIDER'
    }
  };
}

module.exports=Object.freeze({VERSION,resolve});
