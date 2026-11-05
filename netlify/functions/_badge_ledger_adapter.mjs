export const BADGE_LEDGER_ADAPTER_CONTRACT='TAKY_BADGE_LEDGER_ADAPTER_V1';

export function assertBadgeLedgerAdapter(adapter){
  if(!adapter || typeof adapter!=='object')
    throw new Error('BADGE_LEDGER_ADAPTER_REQUIRED');
  for(const method of ['get','append','recordConflict']){
    if(typeof adapter[method]!=='function')
      throw new Error(`BADGE_LEDGER_ADAPTER_METHOD_REQUIRED_${method.toUpperCase()}`);
  }
  return adapter;
}

/**
 * Contract only.
 * Production adapter semantics:
 * - get(dedupeKey) -> immutable stored entry or null
 * - append(dedupeKey, entry) -> succeeds once only, never overwrite
 * - recordConflict(conflict) -> append-only conflict evidence
 */
export function createUnavailableBadgeLedgerAdapter(){
  const fail=()=>{throw new Error('BADGE_LEDGER_PRODUCTION_ADAPTER_NOT_CONFIGURED')};
  return Object.freeze({
    contract:BADGE_LEDGER_ADAPTER_CONTRACT,
    get:fail,
    append:fail,
    recordConflict:fail
  });
}
