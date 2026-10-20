import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Test-only local Workbench reader. Netlify never reads the operator's PC.
const CONTROL=path.win32.resolve('D:\\Git PWA\\TAKY_AI_WORKBENCH\\00_CONTROL');
const GENERATED=path.win32.join(CONTROL,'_GENERATED_EXECUTION_REALITY');
const MOBILE=path.win32.resolve('D:\\Git PWA\\TAKY-MOBILE\\artifacts');
const POINTER='LATEST_EXECUTION_REALITY_POINTER.json';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const inside=(p,folder)=>{
 const rel=path.win32.relative(folder,p);
 return rel===''||(!rel.startsWith('..'+path.win32.sep)&&rel!=='..'&&!path.win32.isAbsolute(rel));
};
function verified(entry, allowed){
 if(!entry||typeof entry.latest_path!=='string'||!/^[a-f0-9]{64}$/.test(entry.latest_sha256||''))throw Error('POINTER_ENTRY_INVALID');
 const p=path.win32.resolve(entry.latest_path);
 if(!allowed.some(base=>inside(p,base)))throw Error('POINTER_PATH_OUTSIDE_ALLOWED_OPERATOR_EXPORTS');
 const bytes=fs.readFileSync(p);
 if(hash(bytes)!==entry.latest_sha256)throw Error('POINTER_PAYLOAD_HASH_MISMATCH');
 return bytes;
}
export function readLatestLocalAdminFixture(){
 const paths=fs.readdirSync(GENERATED).filter(n=>/^LATEST_EXECUTION_REALITY_POINTER(?:\.[a-f0-9]{20})?\.json$/.test(n)).map(n=>path.win32.join(GENERATED,n));
 const verifiedCandidates=[];
 for(const p of paths)try{
  const entry=JSON.parse(fs.readFileSync(p,'utf8'));
  if(entry.schema!=='TAKY_EXECUTION_REALITY_LATEST_POINTER_V1'||!Number.isFinite(Date.parse(entry.generated_at)))continue;
  const snap=verified(entry.snapshot,[CONTROL]);
  const board=verified(entry.dashboard,[CONTROL]);
  const admin=verified(entry.admin_local_only,[GENERATED,MOBILE]);
  const snapshot=JSON.parse(snap.toString('utf8')), data=JSON.parse(admin.toString('utf8'));
  if(snapshot.schema!=='TAKY_PROJECT_EXECUTION_REALITY_DERIVED_V1'||data.schema!=='TAKY_MOBILE_ADMIN_PROGRESS_SNAPSHOT_V1')continue;
  if(snapshot.generated_at!==entry.generated_at||data.generatedAt!==entry.generated_at)continue;
  verifiedCandidates.push({pointer:p,date:Date.parse(entry.generated_at),sha:hash(fs.readFileSync(p)),payload:data,snapshot:entry.snapshot.latest_sha256,
    board:hash(board),adminHash:entry.admin_local_only.latest_sha256});
 }catch{ /* Invalid or stale candidate is skipped, never trusted. */ }
 assert.ok(verifiedCandidates.length>0,'NO_SHA_VERIFIED_WORKBENCH_POINTER');
 verifiedCandidates.sort((a,b)=>b.date-a.date||b.pointer.localeCompare(a.pointer));
 const latest=verifiedCandidates[0];
 const fixed=path.win32.join(GENERATED,POINTER);
 let fixedCurrent=false;
 try{fixedCurrent=fs.existsSync(fixed)&&hash(fs.readFileSync(fixed))===latest.sha;}catch{}
 return {...latest,fixedCurrent};
}
