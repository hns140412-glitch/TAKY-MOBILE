export const ACTION_REGISTRY_VERSION = '0.1.0-staging';

const actions = [
  {
    actionId:'image.cleanup.declutter',
    domain:'IMAGE', displayName:'사진/공간 정리', slash:['/declutter'],
    phrases:['사진 정리','공간 정리','방 정리','잡동사니 정리'],
    signals:[['잡동사니','정리'],['방','정리'],['사진','정리']],
    truthClass:'RESTORATIVE_EDIT', usageClass:'MEDIUM', approvalClass:'REVERSIBLE',
    toolRoute:'IMAGE_EDIT_ADAPTER', adapterStatus:'ADAPTER_REQUIRED',
    preserve:'원본 구조·주요 대상·시점 보존', validation:'원본 대비 불필요한 물건만 제거되었는지 시각 검증'
  },
  {
    actionId:'image.cleanup.crowd_remove',
    domain:'IMAGE', displayName:'배경 사람 제거', slash:['/crowdclean'],
    phrases:['배경 사람 제거','뒤에 사람 없애줘','사람들 지워줘'],
    signals:[['배경','사람'],['사람','제거'],['사람','없애'],['사람','지워']],
    truthClass:'RESTORATIVE_EDIT', usageClass:'MEDIUM', approvalClass:'REVERSIBLE',
    toolRoute:'IMAGE_EDIT_ADAPTER', adapterStatus:'ADAPTER_REQUIRED',
    preserve:'주 피사체·장소·시점 보존', validation:'주 피사체가 변형되지 않았는지 검증'
  },
  {
    actionId:'image.correct.brighten',
    domain:'IMAGE', displayName:'밝기/톤 보정', slash:['/brighten'],
    phrases:['사진 밝게','밝기 보정','톤 보정'],
    signals:[['사진','밝게'],['밝기','보정'],['톤','보정']],
    truthClass:'RESTORATIVE_EDIT', usageClass:'LOW', approvalClass:'REVERSIBLE',
    toolRoute:'IMAGE_EDIT_ADAPTER', adapterStatus:'ADAPTER_REQUIRED',
    preserve:'피사체 정체성·구도 보존', validation:'하이라이트/피부톤/암부 과보정 여부 검증'
  },
  {
    actionId:'image.visualize.thermal_style',
    domain:'IMAGE', displayName:'열화상 스타일 시각화', slash:['/thermalcam'],
    phrases:['열화상처럼 보여줘','열화상 스타일','열화상 카메라처럼'],
    signals:[['열화상','처럼'],['열화상','스타일'],['열화상','보여']],
    truthClass:'EXPLANATORY_SIMULATION', usageClass:'MEDIUM', approvalClass:'REVERSIBLE',
    toolRoute:'IMAGE_EDIT_ADAPTER', adapterStatus:'ADAPTER_REQUIRED',
    preserve:'원본 장면의 위치·윤곽', validation:'실측 온도로 오인될 표현이 없는지 검증',
    warning:'시뮬레이션이며 실제 온도 측정값이 아닙니다.'
  },
  {
    actionId:'technical.analyze.heat_actual',
    domain:'TECHNICAL', displayName:'실제 발열 위치 분석', slash:[],
    phrases:['실제 발열 위치 분석','발열 분석'],
    signals:[['실제','발열','분석'],['발열','위치','분석']],
    truthClass:'EVIDENTIARY_ANALYSIS', usageClass:'HIGH', approvalClass:'PREFLIGHT_REQUIRED',
    toolRoute:'TECHNICAL_EVIDENCE_ANALYSIS', adapterStatus:'EVIDENCE_REQUIRED',
    preserve:'원본 측정자료·센서값·사양의 출처', validation:'실측 데이터와 결론의 역추적 검증',
    warning:'생성한 열화상 이미지는 실제 발열 증거로 사용할 수 없습니다.'
  },
  {
    actionId:'document.compare',
    domain:'DOCUMENT', displayName:'문서 비교', slash:['/doccompare'],
    phrases:['문서 비교','두 문서 비교','문서 대조'],
    signals:[['문서','비교'],['문서','대조']],
    truthClass:'EVIDENTIARY_ANALYSIS', usageClass:'MEDIUM', approvalClass:'READ_ONLY',
    toolRoute:'DOCUMENT_COMPARE_ADAPTER', adapterStatus:'ADAPTER_REQUIRED',
    preserve:'원문·버전·출처', validation:'차이점이 원문 위치로 역추적 가능한지 검증'
  },
  {
    actionId:'spreadsheet.audit',
    domain:'SPREADSHEET', displayName:'엑셀/시트 검토', slash:['/sheetaudit'],
    phrases:['엑셀 검토','시트 검토','스프레드시트 검토'],
    signals:[['엑셀','검토'],['시트','검토'],['스프레드시트','검토']],
    truthClass:'EVIDENTIARY_ANALYSIS', usageClass:'MEDIUM', approvalClass:'READ_ONLY',
    toolRoute:'SPREADSHEET_AUDIT_ADAPTER', adapterStatus:'ADAPTER_REQUIRED',
    preserve:'수식·참조·원본 데이터', validation:'값뿐 아니라 수식/참조/합계 일관성 검증'
  },
  {
    actionId:'cad.area_validate',
    domain:'CAD', displayName:'CAD 면적 검증', slash:['/cadarea'],
    phrases:['cad 면적 검증','cad 면적 산출','면적 검증'],
    signals:[['cad','면적'],['면적','검증'],['면적','산출']],
    truthClass:'EVIDENTIARY_ANALYSIS', usageClass:'HIGH', approvalClass:'PREFLIGHT_REQUIRED',
    toolRoute:'CAD_AREA_VALIDATION_ADAPTER', adapterStatus:'EVIDENCE_REQUIRED',
    preserve:'레이어·객체·폐합 폴리라인·원본 단위', validation:'CAD 객체 → 산출값 → 시트 결과 역검증',
    warning:'스크린샷만으로 권위 있는 면적값을 확정하지 않습니다.'
  },
  {
    actionId:'piano.compare.teacher_reference',
    domain:'AUDIO_PIANO', displayName:'선생님 시연과 연습 녹음 비교', slash:['/pianocompare'],
    phrases:['선생님 시연과 비교','피아노 녹음 비교','연습 녹음 비교'],
    signals:[['선생님','시연','비교'],['피아노','녹음','비교'],['연습','녹음','비교']],
    truthClass:'EVIDENTIARY_ANALYSIS', usageClass:'MEDIUM', approvalClass:'READ_ONLY',
    toolRoute:'PIANO_REFERENCE_COMPARE_ADAPTER', adapterStatus:'ADAPTER_REQUIRED',
    preserve:'선생님 기준녹음·곡/구간·아이 이전 기록', validation:'같은 곡/구간/손/템포 기준인지 확인'
  },
  {
    actionId:'deployment.preview',
    domain:'DEPLOYMENT', displayName:'Preview 배포', slash:['/preview'],
    phrases:['프리뷰 배포','preview 배포','스테이징 배포'],
    signals:[['프리뷰','배포'],['preview','배포'],['스테이징','배포']],
    truthClass:'OPERATIONAL_ACTION', usageClass:'MEDIUM', approvalClass:'PREVIEW_ONLY',
    toolRoute:'DEPLOYMENT_ADAPTER', adapterStatus:'APPROVAL_REQUIRED',
    preserve:'Production 미변경', validation:'배포 상태 + 실제 URL 접근 검증',
    warning:'Preview 성공 상태만으로 실제 기기 접근 PASS를 주장하지 않습니다.'
  }
];

export const ACTIONS = Object.freeze(actions.map(action => Object.freeze(action)));

const normalize = value => String(value || '').toLowerCase().replace(/\s+/g,' ').trim();

export function getAction(actionId) {
  return ACTIONS.find(action => action.actionId === actionId) || null;
}

export function resolveAction(text='') {
  const raw = normalize(text);
  if (!raw) return null;

  for (const action of ACTIONS) {
    if (action.slash.some(alias => normalize(alias) === raw)) return { action, confidence:1, trigger:'slash-exact' };
  }

  let best = null;
  for (const action of ACTIONS) {
    let score = 0;
    for (const phrase of action.phrases) if (raw.includes(normalize(phrase))) score += 3;
    for (const signal of action.signals) if (signal.every(token => raw.includes(normalize(token)))) score += 2;
    if (!best || score > best.score) best = { action, score };
  }

  if (!best || best.score < 2) return null;
  return { action:best.action, confidence:best.score >= 3 ? 0.95 : 0.82, trigger:'natural-language' };
}

export function discoverActions(text='', limit=5) {
  const matched = resolveAction(text);
  const featuredIds = [
    'image.cleanup.declutter',
    'document.compare',
    'spreadsheet.audit',
    'cad.area_validate',
    'deployment.preview'
  ];
  const ordered = [];
  if (matched) ordered.push(matched.action);
  for (const id of featuredIds) {
    const action = getAction(id);
    if (action && !ordered.some(item => item.actionId === id)) ordered.push(action);
  }
  return ordered.slice(0, limit);
}
