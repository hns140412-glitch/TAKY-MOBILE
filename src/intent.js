const rules = [
  { intent: 'CLOSE', test: /대화\s*종료|채팅\s*종료|종료해줘/i },
  { intent: 'HANDOFF', test: /인수인계|handoff/i },
  { intent: 'RESUME', test: /재개|이어(서|가기)|계속\s*하자/i },
  { intent: 'APPLY', test: /타키.*반영|반영해줘|업데이트.*반영|canonical.*write/i },
  { intent: 'REVIEW', test: /검토해줘|타키.*검토|비교.*검토|검증해줘/i },
  { intent: 'SOURCE_COMPARE', test: /원본.*대조|원대화.*대조|source.*compare/i },
  { intent: 'ARCHIVE', test: /대화전체보존|전체.*보존|archive/i },
  { intent: 'RECOVER', test: /복구전문가|포렌식복구|forensic/i },
];

export function routeIntent(text) {
  const raw = String(text || '').trim();
  if (!raw) return { intent: 'EMPTY', confidence: 1, trigger: 'empty' };
  if (raw === '/') return { intent: 'COMMAND_DISCOVERY', confidence: 1, trigger: '/' };
  if (raw === 'ㄱ') return { intent: 'CONTINUE', confidence: 1, trigger: 'ㄱ' };

  for (const rule of rules) {
    if (rule.test.test(raw)) return { intent: rule.intent, confidence: 0.95, trigger: rule.test.source };
  }
  return { intent: 'CHAT', confidence: 0.55, trigger: 'fallback' };
}

export function commandToIntent(command) {
  const map = {
    review: 'REVIEW',
    apply: 'APPLY',
    handoff: 'HANDOFF',
    resume: 'RESUME',
    source_compare: 'SOURCE_COMPARE',
    archive: 'ARCHIVE',
    close: 'CLOSE',
    recover: 'RECOVER',
    continue: 'CONTINUE',
  };
  return map[command] || 'CHAT';
}
