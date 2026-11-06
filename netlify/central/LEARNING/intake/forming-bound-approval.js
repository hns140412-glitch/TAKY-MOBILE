'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const clean=x=>String(x??'').trim();
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function verifyBoundApproval(recordPath,artifactId,revision,opts={}){
 if(!opts.authorityRoot||!opts.evidenceRoot)return {ok:false,reason:'AUTHORITY_ROOTS_REQUIRED'};
 const root=path.resolve(opts.authorityRoot), evidenceRoot=path.resolve(opts.evidenceRoot);
 const inside=(base,p)=>p.startsWith(base+path.sep);
 if(!recordPath)return {ok:false,reason:'RECORD_MISSING'};
 const file=path.resolve(recordPath);
 if(!inside(root,file))return {ok:false,reason:'RECORD_OUTSIDE_AUTHORITY_ROOT'};
 let receipt;
 try{receipt=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){return {ok:false,reason:'RECORD_UNREADABLE'};}
 if(receipt.issuer!=='FORMING_APPROVAL_AUTHORITY'||receipt.decision!=='APPROVED'||receipt.artifact_id!==artifactId||receipt.artifact_revision!==revision)return {ok:false,reason:'APPROVAL_BINDING_INVALID'};
 if(!clean(receipt.owner_namespace)||!clean(receipt.target_consumer)||!clean(receipt.approved_by)||!clean(receipt.approved_at))return {ok:false,reason:'APPROVAL_FIELDS_MISSING'};
 if(!opts.independentAuthorityCheck || typeof opts.independentAuthorityCheck!=='function')return {ok:false,reason:'INDEPENDENT_AUTHORITY_CHECK_REQUIRED'};
 const evidence=path.resolve(evidenceRoot,clean(receipt.evidence_ref));
 if(!inside(evidenceRoot,evidence))return {ok:false,reason:'EVIDENCE_PATH_INVALID'};
 let bytes;
 try{bytes=fs.readFileSync(evidence);}catch(_){return {ok:false,reason:'EVIDENCE_UNAVAILABLE'};}
 if(!/^[0-9a-f]{64}$/i.test(clean(receipt.evidence_sha256))||sha(bytes)!==receipt.evidence_sha256.toLowerCase())return {ok:false,reason:'EVIDENCE_HASH_MISMATCH'};
 let valid=false;
 try{valid=opts.independentAuthorityCheck({receipt,artifactId,revision,evidencePath:evidence})===true;}catch(_){}
 if(!valid)return {ok:false,reason:'INDEPENDENT_AUTHORITY_DENIED'};
 return {ok:true,approval:{issuer:receipt.issuer,decision:receipt.decision,artifact_id:artifactId,artifact_revision:revision,evidence_ref:receipt.evidence_ref,owner_namespace:receipt.owner_namespace,target_consumer:receipt.target_consumer}};
}
module.exports={verifyBoundApproval};
