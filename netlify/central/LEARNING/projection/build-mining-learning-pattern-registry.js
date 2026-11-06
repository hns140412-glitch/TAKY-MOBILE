'use strict';

const fs=require('node:fs');
const path=require('node:path');

const VERSION='TAKY_LEARNING_REFERENCE_PATTERN_PROJECTOR_V1';
const ROOT=path.resolve(__dirname,'..');
const templatePath=path.join(ROOT,'data','mining-learning-pattern-registry-template-v1.json');
const rulesPath=path.join(ROOT,'data','learning-reference-pattern-projection-rules-v1.json');
const ledgerPath=path.resolve(__dirname,'..','..','CURRENT','DATA','REFERENCE_INTAKE_DISPOSITION_LEDGER.json');
const outPath=path.join(ROOT,'data','mining-learning-pattern-registry-v1.json');
const receiptPath=path.resolve(__dirname,'..','..','CURRENT','DATA','LEARNING_REFERENCE_PATTERN_PROJECTION_CURRENT.json');

const clean=v=>String(v??'').trim();
const uniq=a=>[...new Set((a||[]).filter(Boolean))];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));

function mergeLedger(entries=[]){
  const bySource=new Map();
  for(const e of entries){
    const source=clean(e.source_key||e.details?.source_id);
    if(!source)continue;
    const prev=bySource.get(source)||{
      source_id:source,
      states:[],
      acquisition_states:[],
      details:{},
      source_direction_signals:[],
      applicability_scope:[]
    };
    prev.states.push(clean(e.state));
    prev.acquisition_states.push(clean(e.acquisition_state));
    const d=e.details||{};
    prev.details={...prev.details,...d};
    prev.source_direction_signals=uniq([
      ...prev.source_direction_signals,
      ...(Array.isArray(d.source_direction_signals)?d.source_direction_signals:[])
    ]);
    prev.applicability_scope=uniq([
      ...prev.applicability_scope,
      ...(Array.isArray(d.applicability_scope)?d.applicability_scope:[])
    ]);
    prev.last_state=clean(e.state);
    prev.last_recorded_at=clean(e.recorded_at);
    bySource.set(source,prev);
  }
  return [...bySource.values()];
}

function patternsFor(ref,rules){
  const patterns=[];
  for(const signal of ref.source_direction_signals||[]){
    patterns.push(...(rules.signal_to_patterns?.[signal]||[]));
  }
  for(const scope of ref.applicability_scope||[]){
    patterns.push(...(rules.scope_to_patterns?.[scope]||[]));
  }
  return uniq(patterns);
}

function isEligible(ref,rules){
  const d=ref.details||{};
  const e=rules.eligibility||{};
  return clean(ref.last_state)===clean(e.state)
    && clean(d.domain)===clean(e.domain)
    && clean(d.consumer)===clean(e.consumer);
}

function isDiscoveryOnly(ref,rules){
  const scopes=new Set(ref.applicability_scope||[]);
  const known=rules.no_runtime_pattern_scopes||[];
  return known.some(x=>scopes.has(x)) && patternsFor(ref,rules).length===0;
}

function build(options={}){
  // An indexed Ledger is not independently approved FORMING. The only
  // supported invocation is an in-memory preview until the publishing owner
  // supplies an independently verified approval + atomic publish protocol.
  if(options.dry_run!==true){
    const error=new Error('FORMING_APPROVAL_REQUIRED_FOR_LEARNING_REGISTRY_WRITE');
    error.code='FORMING_APPROVAL_REQUIRED';
    throw error;
  }
  const formingGate=options.forming_gate||null;
  if(formingGate && (formingGate.ok!==true || formingGate.stage!=='LEARNING_PATTERN_PROJECTION_CANDIDATE' || formingGate.write_performed!==false))
    throw new Error('FORMING_PROJECTION_GATE_INVALID');
  const template=read(templatePath);
  const rules=read(rulesPath);
  const ledger=read(ledgerPath);
  if(template?.schema!=='TAKY_LEARNING_REFERENCE_PATTERN_REGISTRY_TEMPLATE_V1')throw new Error('PATTERN_TEMPLATE_INVALID');
  if(rules?.schema!=='TAKY_LEARNING_REFERENCE_PATTERN_PROJECTION_RULES_V1')throw new Error('PATTERN_RULES_INVALID');
  if(ledger?.schema!=='TAKY_REFERENCE_INTAKE_DISPOSITION_LEDGER_V1'||!Array.isArray(ledger.entries))throw new Error('REFERENCE_LEDGER_INVALID');

  const merged=mergeLedger(ledger.entries);
  const eligible=merged.filter(x=>isEligible(x,rules));
  // A forming-gated projection is limited to entries independently eligible in the ledger.
  // Caller-supplied gates are candidates, not an independent approval authority.
  const formingAllowed=formingGate?new Set((formingGate.candidates||[]).map(x=>clean(x.source_id)+'|'+clean(x.source_ref))):null;
  const scopedEligible=formingAllowed?eligible.filter(x=>formingAllowed.has(x.source_id+'|'+(clean(x.details?.source_ref)||('INDEX:'+x.source_id)))):eligible;
  const dynamic=[];
  const discoveryOnly=[];
  const heldUnmapped=[];

  for(const ref of scopedEligible){
    const patterns=patternsFor(ref,rules);
    if(patterns.length){
      dynamic.push({
        source_id:ref.source_id,
        source_ref:clean(ref.details?.source_ref)||('INDEX:'+ref.source_id),
        domain:'LEARNING/MINED_REFERENCE',
        source_actor_class:clean(ref.details?.source_actor_class)||null,
        source_direction:clean(ref.details?.source_direction)||null,
        authority_ceiling:clean(ref.details?.authority_ceiling)||'REFERENCE_ONLY',
        projected_from:{
          source_direction_signals:ref.source_direction_signals,
          applicability_scope:ref.applicability_scope
        },
        patterns,
        projection_state:'RUNTIME_PATTERN_CANDIDATE'
      });
    }else if(isDiscoveryOnly(ref,rules)){
      discoveryOnly.push({
        source_id:ref.source_id,
        source_ref:clean(ref.details?.source_ref)||('INDEX:'+ref.source_id),
        applicability_scope:ref.applicability_scope,
        disposition:'DISCOVERY_ONLY_NO_RUNTIME_PATTERN'
      });
    }else{
      heldUnmapped.push({
        source_id:ref.source_id,
        source_ref:clean(ref.details?.source_ref)||('INDEX:'+ref.source_id),
        source_direction_signals:ref.source_direction_signals,
        applicability_scope:ref.applicability_scope,
        disposition:'HELD_NO_EXPLICIT_PATTERN_RULE'
      });
    }
  }

  const registry={
    schema:'TAKY_LEARNING_REFERENCE_PATTERN_REGISTRY_V2',
    version:template.version,
    generated_at:new Date().toISOString(),
    generated_by:VERSION,
    authority_class:template.authority_class,
    policy:template.policy,
    sources:[...(template.static_sources||[]),...dynamic],
    patterns:template.patterns,
    canonical_sequence:template.canonical_sequence,
    projection_summary:{
      indexed_learning_refs:scopedEligible.length,
      runtime_pattern_refs:dynamic.length,
      discovery_only_refs:discoveryOnly.length,
      held_unmapped_refs:heldUnmapped.length
    }
  };

  const receipt={
    schema:'TAKY_LEARNING_REFERENCE_PATTERN_PROJECTION_RECEIPT_V1',
    generated_at:registry.generated_at,
    projector_version:VERSION,
    ledger_path:path.relative(path.resolve(__dirname,'..','..'),ledgerPath).replace(/\\/g,'/'),
    registry_path:path.relative(path.resolve(__dirname,'..','..'),outPath).replace(/\\/g,'/'),
    rules_path:path.relative(path.resolve(__dirname,'..','..'),rulesPath).replace(/\\/g,'/'),
    summary:registry.projection_summary,
    projected:dynamic.map(x=>({source_id:x.source_id,patterns:x.patterns,authority_ceiling:x.authority_ceiling})),
    discovery_only:discoveryOnly,
    held_unmapped:heldUnmapped,
    guards:rules.guards||[]
  };

  // No file writes from a candidate build. A real approval must be checked
  // at a separate trusted publication boundary, not a self-reported gate.
  return {registry,receipt,write_performed:false,
    state:'PREVIEW_ONLY_INDEPENDENT_FORMING_APPROVAL_NOT_PUBLISHED'};
}

if(require.main===module){
  // Fail closed for legacy CLI refresh jobs. Do not emit a successful but
  // stale receipt that downstream stages could misinterpret as updated.
  const {registry,receipt}=build({dry_run:true});
  console.error(JSON.stringify({
    ok:false,state:'HOLD',reason:'FORMING_APPROVAL_REQUIRED_FOR_LEARNING_REGISTRY_WRITE',
    projector:VERSION,write_performed:false,
    summary:registry.projection_summary,
    projected:receipt.projected,
    discovery_only:receipt.discovery_only,
    held_unmapped_count:receipt.held_unmapped.length
  },null,2));
  process.exitCode=2;
}

module.exports=Object.freeze({VERSION,mergeLedger,patternsFor,isEligible,isDiscoveryOnly,build});
