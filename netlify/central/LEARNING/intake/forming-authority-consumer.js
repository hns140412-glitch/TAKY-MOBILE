'use strict';
const fs=require('node:fs');
const {verifyBoundApproval}=require('./forming-bound-approval');
const {consume}=require('./approved-forming-consumer');
// Only a reviewed, scope-exact authority binding may nominate an approval.
function consumeFromAuthority(prepared, recordPath, options={}){
 const f=prepared?.formed;
 if(!f?.artifact_id||!f?.artifact_revision)return {ok:false,stage:'AUTHORITY',issues:['FORMING_ARTIFACT_MISSING']};
 const proof=verifyBoundApproval(recordPath,f.artifact_id,f.artifact_revision,options);
 if(!proof.ok)return {ok:false,stage:'AUTHORITY',issues:[proof.reason]};
 const receipt=proof.approval;
 if(receipt.owner_namespace!==f.owner_namespace||receipt.target_consumer!==f.target_consumer)return {ok:false,stage:'AUTHORITY',issues:['APPROVAL_SCOPE_MISMATCH']};
 return consume(prepared,()=>receipt,f.target_consumer);
}
module.exports=Object.freeze({consumeFromAuthority});
