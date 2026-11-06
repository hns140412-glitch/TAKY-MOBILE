'use strict';
const MAP=require('../projection/academic-vocab-1387-level-map-v1.json');
const VERSION='TAKY_ACADEMIC_VOCAB_OVERLAY_V1';
const clean=v=>String(v??'').trim();
function stagePolicy(stage){
  const s=clean(stage).toUpperCase();
  if(/^E[1-4]$/.test(s))return {primary:1,foundation:[],contextual:[2,3,4]};
  if(/^E[5-6]$/.test(s))return {primary:2,foundation:[1],contextual:[3,4]};
  if(/^M[1-3]$/.test(s))return {primary:3,foundation:[1,2],contextual:[4]};
  if(/^H[1-3]$/.test(s))return {primary:4,foundation:[1,2,3],contextual:[]};
  return null;
}
function lookup(term){
  const levels=MAP.levels?.[clean(term)]||[];
  return {listed:levels.length>0,levels:[...levels]};
}
function classify(term,stage){
  const policy=stagePolicy(stage),hit=lookup(term);
  if(!policy)return {term:clean(term),listed:hit.listed,levels:hit.levels,role:'STAGE_UNSUPPORTED'};
  let role='UNLISTED';
  if(hit.levels.includes(policy.primary))role='PRIMARY';
  else if(hit.levels.some(x=>policy.foundation.includes(x)))role='FOUNDATION';
  else if(hit.levels.some(x=>policy.contextual.includes(x)))role='CONTEXTUAL_ONLY';
  return {term:clean(term),listed:hit.listed,levels:hit.levels,role,primary_level:policy.primary};
}
function decorate(recommendations=[],cards=[],stage=''){
  const byId=new Map();
  const recs=(recommendations||[]).map(r=>{
    const meta=classify(r.term,stage);
    byId.set(r.term_id||r.id,meta);
    return {...r,academic_vocabulary:meta};
  });
  const cs=(cards||[]).map(c=>({...c,academicVocabulary:byId.get(c.id)||classify(c.term,stage)}));
  return {recommendations:recs,cards:cs,stage_policy:stagePolicy(stage)};
}
module.exports=Object.freeze({VERSION,stagePolicy,lookup,classify,decorate});
