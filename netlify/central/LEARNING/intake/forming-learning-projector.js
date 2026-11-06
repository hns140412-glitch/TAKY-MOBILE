'use strict';
const fs=require('node:fs');
const path=require('node:path');
const projector=require('../projection/build-mining-learning-pattern-registry');
const ROOT=path.resolve(__dirname,'..','..');
const load=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function projectApproved(handoff, options={}){
 const issues=[];
 if(handoff?.ok!==true||handoff?.stage!=='FORMING_APPROVED_HANDOFF'||handoff?.eligible_for_projection!==true)issues.push('APPROVED_FORMING_REQUIRED');
 if(handoff?.owner_namespace!=='LEARNING_OS')issues.push('LEARNING_OWNER_REQUIRED');
 if(!['KNOWLEDGE_FORMING','CONTENT_FORMING'].includes(handoff?.forming_kind))issues.push('LEARNING_FORMING_KIND_REQUIRED');
 const ledger=options.ledger||load(path.join(ROOT,'CURRENT','DATA','REFERENCE_INTAKE_DISPOSITION_LEDGER.json'));
 const rules=options.rules||load(path.join(ROOT,'LEARNING','data','learning-reference-pattern-projection-rules-v1.json'));
 if(ledger?.schema!=='TAKY_REFERENCE_INTAKE_DISPOSITION_LEDGER_V1'||!Array.isArray(ledger.entries))issues.push('LEDGER_INVALID');
 if(rules?.schema!=='TAKY_LEARNING_REFERENCE_PATTERN_PROJECTION_RULES_V1')issues.push('RULES_INVALID');
 if(issues.length)return {ok:false,issues};
 const merged=projector.mergeLedger(ledger.entries);
 const approved=new Set((handoff.index_refs||[]).map(x=>x.source_id+'|'+x.source_ref));
 const selected=merged.filter(x=>projector.isEligible(x,rules) && approved.has(x.source_id+'|'+String(x.details?.source_ref||'INDEX:'+x.source_id).trim()));
 if(!selected.length)return {ok:false,issues:['NO_LEDGER_ELIGIBLE_APPROVED_SOURCE']};
 const candidates=selected.map(x=>({source_id:x.source_id,source_ref:String(x.details?.source_ref||'INDEX:'+x.source_id).trim(),patterns:projector.patternsFor(x,rules)}));
 return {ok:true,stage:'LEARNING_PATTERN_PROJECTION_CANDIDATE',artifact_id:handoff.artifact_id,artifact_revision:handoff.artifact_revision,approval_evidence_ref:handoff.approval_evidence_ref,candidates,write_performed:false,learning_engine_decision:null};
}
module.exports=Object.freeze({projectApproved});
