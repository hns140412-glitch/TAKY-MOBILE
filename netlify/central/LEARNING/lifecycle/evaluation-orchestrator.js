'use strict';

const Report=require('../benchmark/promotion-report.js');
const Ledger=require('./evaluation-ledger.js');

function evaluateAndRecord(ledger={},benchmarkReplayResult={},options={}){
  const report=Report.buildPromotionReport(benchmarkReplayResult,options.promotion_policy||{});
  if(!report.ok)return {ok:false,reason:'PROMOTION_REPORT_FAILED',report};

  const appended=Ledger.appendEvaluation(ledger,report,{
    created_at:options.created_at
  });
  if(!appended.ok)return {ok:false,reason:'LEDGER_APPEND_FAILED',detail:appended};

  return {
    ok:true,
    report,
    ledger:appended.ledger,
    ledger_entry:appended.entry,
    deduplicated:appended.deduplicated===true
  };
}

function reevaluationPlan(ledger={},nextEvidenceReceipts={},policyVersion=''){
  const queue=Ledger.reconsiderationQueue(ledger,{
    evidence_receipt_by_scope:nextEvidenceReceipts,
    policy_version:policyVersion
  });
  return {
    ok:true,
    queue,
    pending_count:queue.length,
    invariant:'NO_HOLD_OR_REVIEW_RESULT_IS_DROPPED'
  };
}

function selfValidate(result={}){
  const issues=[];
  if(!result.ok)issues.push('RESULT_NOT_OK');
  if(result.ledger&& !Ledger.validateLedger(result.ledger).ok)issues.push('LEDGER_INVALID');
  if(result.report && !result.ledger_entry)issues.push('REPORT_WITHOUT_LEDGER_ENTRY');
  return {ok:issues.length===0,issues};
}

module.exports=Object.freeze({evaluateAndRecord,reevaluationPlan,selfValidate});
