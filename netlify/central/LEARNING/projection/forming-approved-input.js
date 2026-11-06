'use strict';
const {projectApproved}=require('../intake/forming-learning-projector');
const {build}=require('./build-mining-learning-pattern-registry');
function previewApproved(handoff, options={}){
 const gate=projectApproved(handoff,options);
 if(!gate.ok)return {ok:false,stage:'FORMING_GATE',issues:gate.issues,write_performed:false};
 const projection=build({forming_gate:gate,dry_run:true});
 return {ok:true,stage:'PROJECTOR_PREVIEW',input:{artifact_id:gate.artifact_id,artifact_revision:gate.artifact_revision,approval_evidence_ref:gate.approval_evidence_ref,candidates:gate.candidates},summary:projection.registry.projection_summary,projected:projection.receipt.projected,write_performed:false};
}
// This is deliberately a non-persistent consumption rehearsal. Only the
// existing FORMING authority verifier may admit source scope; previewApproved
// above remains a legacy *untrusted* preview utility.
function previewBoundApproved(prepared, approvalRecordPath, authorityOptions={}) {
 const {consumeFromAuthority}=require('../intake/forming-authority-consumer');
 const approved=consumeFromAuthority(prepared,approvalRecordPath,authorityOptions);
 if(!approved.ok)return {ok:false,stage:'FORMING_AUTHORITY',issues:approved.issues||[],
                         write_performed:false,learning_consumed:false};
 const gate=projectApproved(approved);
 if(!gate.ok)return {ok:false,stage:'FORMING_PROJECTION',issues:gate.issues||[],
                      write_performed:false,learning_consumed:false};
 // Do not let a past approval silently authorize changed mapping rules.
 const fs=require('node:fs'),path=require('node:path');
 const rules=JSON.parse(fs.readFileSync(path.resolve(__dirname,
   '..','data','learning-reference-pattern-projection-rules-v1.json'),'utf8'));
 if(prepared?.formed?.ruleset_revision!==rules.version)
   return {ok:false,stage:'FORMING_RULESET',issues:['RULESET_REVISION_MISMATCH'],
           write_performed:false,learning_consumed:false};
 const projection=build({forming_gate:gate,dry_run:true});
 const allowed=new Set(gate.candidates.map(x=>x.source_id+'|'+x.source_ref));
 const selected=(projection.registry.sources||[]).filter(x=>
   allowed.has(x.source_id+'|'+x.source_ref) && x.projection_state==='RUNTIME_PATTERN_CANDIDATE');
 if(!selected.length)return {ok:false,stage:'FORMING_PROJECTION',
   issues:['NO_APPROVED_PATTERN_SOURCE'],write_performed:false,learning_consumed:false};
 const registry={...projection.registry,sources:selected,
   projection_scope:{
     mode:'BOUND_FORMING_PREVIEW_ONLY',
     artifact_id:approved.artifact_id,
     artifact_revision:approved.artifact_revision,
     approved_source_ids:selected.map(x=>x.source_id),
     source_patterns_only:true, operational:false,
   }};
 return {ok:true,stage:'BOUND_FORMING_LEARNING_PREVIEW',registry,
   artifact_id:approved.artifact_id,artifact_revision:approved.artifact_revision,
   approval_evidence_ref:approved.approval_evidence_ref,
   source_ids:selected.map(x=>x.source_id),
   summary:projection.registry.projection_summary,
   write_performed:false,learning_consumed:false,app_runtime_bound:false,
   release_approved:false,authority:'INDEPENDENT_AUTHORITY_CHECKED_LOCAL_PREVIEW_ONLY'};
}

function previewBoundSelector(prepared, approvalRecordPath, authorityOptions, termInput) {
 const scope=previewBoundApproved(prepared,approvalRecordPath,authorityOptions);
 if(!scope.ok)return scope;
 const Selector=require('../pedagogy/grade-aware-term-selector');
 const decision=Selector.select(termInput,{
   mode:'BOUND_FORMING_PREVIEW_ONLY',registry:scope.registry
 });
 if(!decision.ok)return {ok:false,stage:'LEARNING_SELECTOR_PREVIEW',
   issues:[decision.reason||'SELECTION_REJECTED'],
   learning_consumed:false,write_performed:false};
 return {...scope,decision,learning_consumed:false,write_performed:false};
}
module.exports=Object.freeze({previewApproved,previewBoundApproved,previewBoundSelector});
