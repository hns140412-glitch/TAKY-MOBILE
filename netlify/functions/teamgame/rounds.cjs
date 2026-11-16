// Round catalog + content banks. Original TAKY content; learning-first.
'use strict';

const CHOSUNG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function chosungOf(word) {
  return [...word].map((ch) => {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) return ch;
    return CHOSUNG[Math.floor(c / 588)];
  }).join('');
}

// 낱말: [word, category]
const WORDS = [
  ['바다', '자연'], ['나무', '자연'], ['구름', '하늘'], ['무지개', '하늘'], ['기차', '탈것'], ['자전거', '탈것'],
  ['사과', '과일'], ['포도', '과일'], ['수박', '과일'], ['토끼', '동물'], ['거북이', '동물'], ['고양이', '동물'],
  ['연필', '학용품'], ['지우개', '학용품'], ['가방', '물건'], ['우산', '물건'], ['모자', '옷'], ['양말', '옷'],
  ['소방차', '탈것'], ['다람쥐', '동물'], ['도서관', '장소'], ['놀이터', '장소'], ['병원', '장소'], ['시계', '물건'],
  ['비행기', '탈것'], ['코끼리', '동물'], ['냉장고', '물건'], ['운동장', '장소'], ['딸기', '과일'], ['바나나', '과일'],
  ['눈사람', '겨울'], ['해바라기', '꽃'], ['소나무', '자연'], ['피아노', '악기'], ['양치질', '생활'], ['우체국', '장소'],
];
// 영어: [english, korean]
const ENGLISH = [
  ['apple', '사과'], ['tree', '나무'], ['water', '물'], ['book', '책'], ['dog', '개'], ['cat', '고양이'],
  ['sun', '해'], ['moon', '달'], ['star', '별'], ['bird', '새'], ['fish', '물고기'], ['rain', '비'],
  ['red', '빨강'], ['blue', '파랑'], ['school', '학교'], ['friend', '친구'], ['happy', '행복한'], ['big', '큰'],
  ['small', '작은'], ['run', '달리다'], ['eat', '먹다'], ['hand', '손'], ['egg', '달걀'], ['milk', '우유'],
  ['house', '집'], ['car', '자동차'], ['flower', '꽃'], ['family', '가족'], ['mother', '엄마'], ['father', '아빠'],
  ['bread', '빵'], ['door', '문'], ['window', '창문'], ['chair', '의자'], ['desk', '책상'], ['green', '초록'],
  ['yellow', '노랑'], ['sleep', '자다'], ['swim', '헤엄치다'], ['rabbit', '토끼'], ['bear', '곰'], ['snow', '눈'],
];
// 한자: [hanja, 훈음]
const HANJA = [
  ['山', '메 산'], ['水', '물 수'], ['火', '불 화'], ['木', '나무 목'], ['金', '쇠 금'], ['土', '흙 토'],
  ['日', '날 일'], ['月', '달 월'], ['人', '사람 인'], ['大', '큰 대'], ['小', '작을 소'], ['口', '입 구'],
  ['目', '눈 목'], ['手', '손 수'], ['足', '발 족'], ['上', '윗 상'], ['下', '아래 하'], ['中', '가운데 중'],
  ['天', '하늘 천'], ['父', '아비 부'], ['母', '어미 모'], ['子', '아들 자'], ['女', '여자 녀'], ['王', '임금 왕'],
  ['門', '문 문'], ['地', '땅 지'], ['入', '들 입'], ['出', '날 출'], ['心', '마음 심'], ['生', '날 생'],
  ['白', '흰 백'], ['年', '해 년'], ['東', '동녘 동'], ['西', '서녘 서'], ['南', '남녘 남'], ['北', '북녘 북'],
  ['一', '한 일'], ['二', '두 이'], ['三', '석 삼'], ['四', '넉 사'], ['五', '다섯 오'], ['十', '열 십'],
  ['力', '힘 력'], ['石', '돌 석'], ['雨', '비 우'], ['學', '배울 학'], ['校', '학교 교'], ['先', '먼저 선'],
];

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function choiceQuiz(bank, r, n, toPrompt, toAnswer) {
  const order = shuffle(bank, r).slice(0, n);
  return order.map((item) => {
    const right = toAnswer(item);
    const wrongs = shuffle(bank.filter((b) => toAnswer(b) !== right), r).slice(0, 3).map(toAnswer);
    const choices = shuffle([right, ...wrongs], r);
    return { prompt: toPrompt(item), choices, answer: choices.indexOf(right) };
  });
}

// O/X: [statement, true?]
const OX = [
  ['문어의 다리는 8개다', true], ['펭귄은 날 수 있다', false], ['무지개 색은 일곱 가지로 말한다', true], ['거미는 곤충이다', false],
  ['해는 동쪽에서 뜬다', true], ['1년은 52주보다 길다', true], ['바나나는 나무에서 자라는 과일이 아니라 풀에서 자란다', true],
  ['물은 0도에서 끓는다', false], ['고래는 물고기다', false], ['한글은 세종대왕 때 만들어졌다', true], ['달은 스스로 빛을 낸다', false],
  ['축구 한 팀은 경기장에 11명이 나온다', true], ['소금물은 맹물보다 무겁다', true], ['박쥐는 새다', false], ['피아노 건반은 모두 흰색이다', false],
  ['지구에서 가장 큰 바다는 태평양이다', true], ['딸기 씨는 열매 겉에 있다', true], ['개구리는 어릴 때 올챙이다', true], ['토마토는 채소로만 분류된다', false],
  ['하루는 24시간이다', true], ['소리는 물속에서도 전해진다', true], ['얼음은 물에 가라앉는다', false], ['지구는 태양 둘레를 돈다', true],
  ['사람은 코로만 숨을 쉴 수 있다', false], ['겨울에 북쪽 하늘에서 해가 뜬다', false], ['꿀벌은 곤충이다', true],
];

// 맞춤법: [바른 말, 틀린 말, 뜻 힌트]
const SPELL = [
  ['설거지', '설겆이', '그릇 씻기'], ['깨끗이', '깨끗히', '말끔하게'], ['며칠', '몇일', '오늘이 ○○일?'], ['웬일', '왠일', '어찌 된 일'],
  ['어떡해', '어떻해', '큰일 났을 때'], ['금세', '금새', '아주 빨리'], ['베개', '배게', '잘 때 머리 밑'], ['찌개', '찌게', '보글보글 반찬'],
  ['희한하다', '희안하다', '아주 신기하다'], ['일부러', '일부로', '알면서 짐짓'], ['오랜만', '오랫만', '오래간만에 만나요'], ['깍두기', '깍뚜기', '무로 만든 김치'],
  ['눈곱', '눈꼽', '아침 눈가에'], ['곰곰이', '곰곰히', '깊이 생각하며'], ['할게', '할께', '내가 ○○!'], ['무릎', '무릅', '다리 가운데 마디'],
  ['어이없다', '어의없다', '기가 막히다'], ['떡볶이', '떡볶기', '빨간 분식'], ['낭떠러지', '낭떨어지', '깎아지른 절벽'], ['돌멩이', '돌맹이', '작은 돌'],
];
// 반대말: [낱말, 반대말]
const OPPOSITE = [
  ['크다', '작다'], ['길다', '짧다'], ['높다', '낮다'], ['무겁다', '가볍다'], ['빠르다', '느리다'], ['덥다', '춥다'], ['밝다', '어둡다'],
  ['많다', '적다'], ['넓다', '좁다'], ['깊다', '얕다'], ['열다', '닫다'], ['앞', '뒤'], ['위', '아래'], ['오다', '가다'], ['웃다', '울다'],
  ['시작', '끝'], ['이기다', '지다'], ['입다', '벗다'], ['쉽다', '어렵다'], ['새것', '헌것'],
];
// 빠진 알파벳: [english, 뜻]
const ENG_SPELL = [
  ['cat', '고양이'], ['dog', '개'], ['sun', '해'], ['hat', '모자'], ['pig', '돼지'], ['cup', '컵'], ['bus', '버스'], ['fish', '물고기'],
  ['milk', '우유'], ['book', '책'], ['tree', '나무'], ['star', '별'], ['frog', '개구리'], ['duck', '오리'], ['lion', '사자'], ['bear', '곰'],
  ['cake', '케이크'], ['ship', '배'], ['moon', '달'], ['rain', '비'],
];
// 속담 잇기: [앞, 뒤]
const PROVERB = [
  ['가는 말이 고와야', '오는 말이 곱다'], ['낮말은 새가 듣고', '밤말은 쥐가 듣는다'], ['세 살 버릇', '여든까지 간다'], ['티끌 모아', '태산'],
  ['원숭이도', '나무에서 떨어진다'], ['소 잃고', '외양간 고친다'], ['돌다리도', '두들겨 보고 건너라'], ['백지장도', '맞들면 낫다'],
  ['천 리 길도', '한 걸음부터'], ['고래 싸움에', '새우 등 터진다'], ['하늘이 무너져도', '솟아날 구멍이 있다'], ['우물 안', '개구리'],
  ['등잔 밑이', '어둡다'], ['발 없는 말이', '천 리 간다'], ['누워서', '떡 먹기'], ['빈 수레가', '요란하다'], ['호랑이도 제 말 하면', '온다'],
];
// 다른 하나 찾기: 갈래별 낱말
const GROUPS = {
  과일: ['사과', '포도', '수박', '딸기', '바나나', '귤', '복숭아'], 동물: ['토끼', '사자', '기린', '펭귄', '곰', '코끼리', '하마'],
  탈것: ['기차', '버스', '배', '자전거', '비행기', '트럭'], 악기: ['피아노', '북', '기타', '피리', '바이올린', '트럼펫'],
  날씨: ['비', '눈', '바람', '구름', '안개', '천둥'], 운동: ['축구', '야구', '수영', '줄넘기', '농구', '태권도'], 채소: ['당근', '오이', '배추', '감자', '양파', '시금치'],
};
// 넌센스: [질문, 답]
const NONSENSE = [
  ['세상에서 가장 뜨거운 바다는?', '열바다'], ['왕이 넘어지면?', '킹콩'], ['다리미가 좋아하는 음식은?', '피자'], ['소가 웃으면?', '우하하'],
  ['세상에서 가장 빠른 닭은?', '후다닥'], ['미소의 반대말은?', '당기소'], ['아몬드가 죽으면?', '다이아몬드'], ['오리가 얼면?', '언덕'],
  ['깨가 죽으면?', '주근깨'], ['차가 놀라면?', '카놀라'], ['신발이 화나면?', '신발끈'],
  ['세상에서 가장 쉬운 숫자는?', '19만'], ['물고기 중 공부를 제일 오래 한 물고기는?', '고등어'], ['개 중에 가장 예쁜 개는?', '무지개'], ['사과가 웃으면?', '풋사과'],
];
// 나라와 수도
const CAPITAL = [
  ['프랑스', '파리'], ['일본', '도쿄'], ['중국', '베이징'], ['미국', '워싱턴 D.C.'], ['영국', '런던'], ['독일', '베를린'], ['이탈리아', '로마'],
  ['캐나다', '오타와'], ['호주', '캔버라'], ['브라질', '브라질리아'], ['스페인', '마드리드'], ['러시아', '모스크바'], ['이집트', '카이로'],
  ['태국', '방콕'], ['베트남', '하노이'], ['튀르키예', '앙카라'], ['인도', '뉴델리'], ['멕시코', '멕시코시티'],
  ['그리스', '아테네'], ['네덜란드', '암스테르담'], ['스웨덴', '스톡홀름'], ['아르헨티나', '부에노스아이레스'], ['케냐', '나이로비'],
  ['필리핀', '마닐라'], ['몽골', '울란바토르'], ['노르웨이', '오슬로'], ['포르투갈', '리스본'], ['뉴질랜드', '웰링턴'],
];
// 상식 4지선다: [질문, 정답, 오답 3개]
const TRIVIA = [
  ['날수가 가장 적은 달은?', '2월', ['4월', '6월', '11월']], ['피아노 건반은 모두 몇 개?', '88개', ['76개', '64개', '100개']],
  ['태양계에서 가장 큰 행성은?', '목성', ['토성', '지구', '화성']], ['올림픽 오륜기의 고리는 몇 개?', '5개', ['4개', '6개', '7개']],
  ['한글의 기본 자음은 몇 개?', '14개', ['19개', '10개', '24개']], ['세계에서 가장 높은 산은?', '에베레스트', ['백두산', '한라산', '킬리만자로']],
  ['거미의 다리는 몇 개?', '8개', ['6개', '10개', '4개']], ['물이 어는 온도(섭씨)는?', '0도', ['10도', '-10도', '4도']],
  ['1년 중 낮이 가장 긴 날은?', '하지', ['동지', '춘분', '추분']], ['세계에서 가장 넓은 바다는?', '태평양', ['대서양', '인도양', '북극해']],
  ['무지개 맨 바깥쪽 색은?', '빨강', ['보라', '노랑', '파랑']], ['축구공에 있는 오각형 조각은 몇 개?', '12개', ['20개', '10개', '16개']],
  ['한 시간은 몇 분?', '60분', ['100분', '30분', '90분']], ['오징어 다리는 몇 개?', '10개', ['8개', '6개', '12개']],
  ['지구에서 가장 가까운 별은?', '태양', ['북극성', '시리우스', '견우성']], ['태극기 가운데 무늬의 이름은?', '태극', ['무궁화', '팔괘', '사괘']],
  ['어른 몸의 뼈는 대략 몇 개?', '206개', ['106개', '306개', '56개']], ['훈민정음을 만든 왕은?', '세종대왕', ['태조', '정조', '광개토대왕']],
];

// ---- added 2026-11-16: more missions (family = learning, company = quick wits) ----
// 영어 문장 빈칸: [문장, 정답, 오답 3]
const ENG_SENT = [
  ['I ___ a cat.', 'have', ['has', 'is', 'am']], ['She ___ my friend.', 'is', ['am', 'are', 'be']], ['We ___ happy.', 'are', ['is', 'am', 'be']],
  ['I ___ apples.', 'like', ['likes', 'liking', 'is']], ['He ___ to school.', 'goes', ['go', 'going', 'am']], ['I can ___ fast.', 'run', ['runs', 'running', 'ran']],
  ['This ___ my bag.', 'is', ['are', 'am', 'do']], ['They ___ playing.', 'are', ['is', 'am', 'does']], ['Good ___!', 'morning', ['apple', 'blue', 'run']],
  ['How ___ you?', 'are', ['is', 'am', 'do']], ['I ___ ten years old.', 'am', ['is', 'are', 'has']], ['Do you ___ milk?', 'like', ['likes', 'is', 'are']],
  ['A bird can ___.', 'fly', ['flies', 'flying', 'read']], ['It is ___ today.', 'sunny', ['sun', 'suns', 'sunnys']], ['Where ___ my pencil?', 'is', ['are', 'am', 'do']],
  ['I have two ___.', 'dogs', ['dog', 'doges', 'a dog']], ["Let's ___ together!", 'play', ['plays', 'played', 'playing']], ['Thank ___!', 'you', ['me', 'he', 'it']],
];
// 한자 합체: [한자1, 한자2, 훈음 힌트, 낱말]
const HANJA_WORD = [
  ['火', '山', '불 화 + 메 산', '화산'], ['大', '門', '큰 대 + 문 문', '대문'], ['人', '口', '사람 인 + 입 구', '인구'], ['山', '水', '메 산 + 물 수', '산수'],
  ['父', '母', '아비 부 + 어미 모', '부모'], ['子', '女', '아들 자 + 여자 녀', '자녀'], ['天', '地', '하늘 천 + 땅 지', '천지'], ['水', '中', '물 수 + 가운데 중', '수중'],
  ['王', '子', '임금 왕 + 아들 자', '왕자'], ['女', '王', '여자 녀 + 임금 왕', '여왕'], ['入', '口', '들 입 + 입 구', '입구'], ['出', '口', '날 출 + 입 구', '출구'],
  ['上', '下', '윗 상 + 아래 하', '상하'], ['手', '足', '손 수 + 발 족', '수족'], ['中', '心', '가운데 중 + 마음 심', '중심'], ['生', '日', '날 생 + 날 일', '생일'],
  ['木', '手', '나무 목 + 손 수', '목수'], ['日', '月', '날 일 + 달 월', '일월'],
];
// 흉내말: [문장(○○ 자리), 흉내말]
const MIMIC = [
  ['강아지가 ○○ 짖어요', '멍멍'], ['고양이가 ○○ 울어요', '야옹'], ['병아리가 ○○ 울어요', '삐약삐약'], ['비가 ○○ 내려요', '주룩주룩'],
  ['별이 ○○ 빛나요', '반짝반짝'], ['토끼가 ○○ 뛰어요', '깡충깡충'], ['아기가 ○○ 웃어요', '방긋방긋'], ['시계가 ○○ 가요', '째깍째깍'],
  ['오리가 ○○ 걸어요', '뒤뚱뒤뚱'], ['문을 ○○ 두드려요', '똑똑'], ['눈이 ○○ 내려요', '펑펑'], ['개구리가 ○○ 울어요', '개굴개굴'],
  ['돼지가 ○○ 울어요', '꿀꿀'], ['거북이가 ○○ 기어가요', '엉금엉금'], ['찌개가 ○○ 끓어요', '보글보글'], ['초인종이 ○○ 울려요', '딩동'],
];
// 영어 반대말
const ENG_OPP = [
  ['big', 'small'], ['hot', 'cold'], ['up', 'down'], ['open', 'close'], ['fast', 'slow'], ['happy', 'sad'], ['long', 'short'], ['day', 'night'],
  ['in', 'out'], ['left', 'right'], ['black', 'white'], ['good', 'bad'], ['full', 'empty'], ['wet', 'dry'], ['yes', 'no'], ['push', 'pull'],
  ['come', 'go'], ['win', 'lose'], ['early', 'late'], ['old', 'new'],
];
// 누구일까요: [하는 일, 직업]
const JOBS = [
  ['아픈 사람을 치료해요', '의사'], ['불을 끄고 사람을 구해요', '소방관'], ['학생들을 가르쳐요', '선생님'], ['맛있는 음식을 만들어요', '요리사'],
  ['비행기를 조종해요', '조종사'], ['편지와 소포를 전해 줘요', '집배원'], ['집과 건물을 설계해요', '건축가'], ['머리카락을 다듬어요', '미용사'],
  ['빵을 구워요', '제빵사'], ['아픈 동물을 치료해요', '수의사'], ['논밭에서 곡식을 길러요', '농부'], ['우주선을 타고 우주로 가요', '우주비행사'],
  ['도서관에서 책을 빌려주고 정리해요', '사서'], ['그림을 그려요', '화가'], ['범인을 잡고 마을을 지켜요', '경찰관'], ['무대에서 노래를 불러요', '가수'],
];
// 뒤죽박죽 낱말 (세 글자 이상, 같은 글자 없음)
const SCRAMBLE = ['무지개', '자전거', '거북이', '고양이', '지우개', '소방차', '다람쥐', '도서관', '놀이터', '코끼리', '비행기', '해바라기', '피아노', '냉장고', '할머니', '선생님', '운동장', '줄넘기', '눈사람', '텔레비전', '아이스크림', '도토리'];
// 수수께끼: [질문, 정답, 오답 3]
const RIDDLE = [
  ['다리는 넷인데 걷지 못하는 것은?', '의자', ['강아지', '자동차', '거미']], ['먹을수록 늘어나는데 배는 안 부른 것은?', '나이', ['연필', '모자', '신발']],
  ['내 것인데 남이 더 많이 부르는 것은?', '이름', ['돈', '연필', '우산']], ['낮에는 자고 밤에 눈을 뜨는 새는?', '부엉이', ['참새', '까치', '비둘기']],
  ['하늘에서 내리는 하얀 솜은?', '눈', ['비', '구름', '우박']], ['이가 많아도 밥을 못 먹는 것은?', '빗', ['숟가락', '컵', '신발']],
  ['늘 앞으로만 가고 뒤로는 못 가는 것은?', '시간', ['자동차', '거북이', '기차']], ['깎을수록 커지는 것은?', '구멍', ['연필', '사과', '손톱']],
  ['맑은 날엔 접혀 있다가 비 오는 날 펴지는 것은?', '우산', ['책', '부채', '이불']], ['등에 집을 지고 다니는 느림보는?', '달팽이', ['토끼', '다람쥐', '강아지']],
  ['밤마다 모양이 조금씩 바뀌는 것은?', '달', ['해', '별', '구름']], ['아침엔 네 발, 낮엔 두 발, 저녁엔 세 발로 걷는 것은?', '사람', ['강아지', '의자', '새']],
];
// 동물 OX (회사): [문장, 참?]
const ANIMAL_OX = [
  ['기린의 목뼈 수는 사람과 같은 7개다', true], ['낙타 혹에는 물이 가득 들어 있다', false], ['문어는 심장이 3개다', true], ['타조는 날 수 있다', false],
  ['돌고래는 물고기다', false], ['나비는 발로 맛을 느낀다', true], ['고양이는 단맛을 거의 못 느낀다', true], ['북극곰의 피부는 검은색이다', true],
  ['꿀벌은 춤으로 꽃 위치를 알린다', true], ['박쥐는 포유류다', true], ['금붕어의 기억력은 3초뿐이다', false], ['소의 위는 4개로 나뉘어 있다', true],
  ['상어는 뼈가 연골로 되어 있다', true], ['펭귄은 남극에만 산다', false], ['개미는 제 몸무게보다 무거운 것을 든다', true], ['거미는 다리가 6개다', false],
];
// 음식 초성 (회사): [음식, 힌트]
const FOOD = [
  ['떡볶이', '분식'], ['김밥', '소풍'], ['비빔밥', '한식'], ['불고기', '고기'], ['짜장면', '중식'], ['탕수육', '중식'], ['치킨', '야식'], ['피자', '야식'],
  ['라면', '분식'], ['냉면', '여름'], ['삼겹살', '회식'], ['김치찌개', '점심'], ['순대', '분식'], ['붕어빵', '겨울 간식'], ['호떡', '겨울 간식'], ['팥빙수', '여름'],
  ['잡채', '잔치'], ['갈비탕', '국물'], ['샌드위치', '빵'], ['햄버거', '패스트푸드'],
];
const COINS = [500, 100, 50, 10];
// 사자성어 완성 (회사): [앞 두 글자, 뒤 두 글자]
const IDIOM = [
  ['일석', '이조'], ['동문', '서답'], ['작심', '삼일'], ['유비', '무환'], ['다다', '익선'], ['우왕', '좌왕'], ['이심', '전심'], ['역지', '사지'],
  ['감언', '이설'], ['동고', '동락'], ['과유', '불급'], ['자업', '자득'], ['아전', '인수'], ['죽마', '고우'], ['대기', '만성'], ['십중', '팔구'],
];
// 회사 영어 약어: [약어, 뜻]
const ABBR = [
  ['ASAP', '가능한 한 빨리'], ['FYI', '참고로 알려 드려요'], ['CEO', '최고 경영자'], ['KPI', '핵심 성과 지표'], ['ETA', '도착 예정 시간'], ['TBD', '아직 정하지 않음'],
  ['FAQ', '자주 묻는 질문'], ['DIY', '직접 만들기'], ['VIP', '아주 중요한 손님'], ['BTW', '그런데 말이야'], ['RSVP', '참석 여부를 알려 주세요'], ['CC', '참조로 함께 받기'],
  ['Q&A', '묻고 답하기'], ['R&D', '연구 개발'],
];
const COLORS = [['빨강', '#E5484D'], ['파랑', '#3E7BFA'], ['초록', '#2FA36B'], ['노랑', '#E8B400']];

const FAMILIES = { body: '몸', react: '반응', rule: '규칙', puzzle: '퍼즐', brain: '두뇌' };
const ROUNDS = [
  // pack: learn | event | both. better: 'high' (default) | 'low'
  { id: 'tap', family: 'body', pack: 'both', title: '탐험대 북 치기', how: '북을 둥둥! 화면의 큰 버튼을 최대한 많이 눌러요', ev: ['스피드 탭 배틀', '팀원끼리 손을 바꿔 가며 버튼을 연타해요'], kind: 'count', seconds: 10, unit: '번' },
  { id: 'shake', family: 'body', pack: 'both', ev: ['셰이크 챌린지', '폰을 꼭 쥐고 팀원이 돌아가며 흔들어요'], title: '흔들어 깨우기', how: '폰을 꼭 쥐고 흔들어요 (흔들기가 안 되면 버튼을 눌러요)', kind: 'count', seconds: 10, unit: '번' },
  { id: 'chosung', family: 'brain', pack: 'learn', title: '초성 낱말', how: '초성과 힌트를 보고 맞는 낱말을 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'english', family: 'brain', pack: 'learn', title: '영어 짝꿍', how: '영어 낱말의 뜻을 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'hanja', family: 'brain', pack: 'learn', title: '한자 뜻 찾기', how: '한자의 뜻과 소리를 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'math', family: 'brain', pack: 'both', ev: ['암산 배틀', '팀원 모두 머리를 맞대고 계산 답을 골라요'], title: '빠른 셈', how: '계산 답을 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'order', pack: 'both', ev: ['숫자 스캔', '1부터 차례로 숫자를 찾아 눌러요. 팀원은 옆에서 다음 숫자를 외쳐 주세요'], family: 'puzzle', title: '숫자 길 잇기', how: '1부터 차례로 숫자를 눌러요. 다 누르면 새 판이 나와요', kind: 'count', input: 'order', seconds: 30, unit: '칸' },
  { id: 'memory', pack: 'both', ev: ['패턴 기억 배틀', '불빛 순서를 팀원과 나눠 외워 따라 눌러요'], family: 'puzzle', title: '불빛 따라하기', how: '켜졌던 칸을 순서대로 눌러요. 맞히면 하나씩 길어져요', kind: 'level', seconds: 40, unit: '단계' },
  { id: 'arrow', pack: 'event', family: 'rule', title: '거꾸로 화살표', how: '화살표와 반대쪽을 눌러요', kind: 'quiz', seconds: 25, unit: '개' },
  { id: 'stroop', family: 'rule', pack: 'event', title: '색깔 함정', how: '글자 뜻이 아니라 글자 색을 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'react', family: 'react', pack: 'both', ev: ['0.1초 반사신경', '화면이 초록색으로 바뀌면 바로 눌러요. 다섯 번의 평균 대결'], title: '초록불 반응', how: '화면이 초록색으로 바뀌면 바로 눌러요 (먼저 누르면 다시)', kind: 'react', seconds: 25, unit: 'ms', better: 'low' },
  { id: 'ox', family: 'brain', pack: 'event', title: 'O X 퀴즈', how: '맞으면 O, 틀리면 X', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'spell', family: 'brain', pack: 'learn', title: '바른 글자', how: '두 낱말 중 바르게 쓴 말을 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'opposite', family: 'brain', pack: 'learn', title: '반대말 찾기', how: '낱말과 뜻이 반대인 말을 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'engspell', family: 'brain', pack: 'learn', title: '빠진 알파벳', how: '뜻을 보고 빈칸에 들어갈 알파벳을 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'proverb', family: 'brain', pack: 'learn', title: '속담 잇기', how: '속담 앞부분을 보고 뒷부분을 골라요', kind: 'quiz', seconds: 35, unit: '개' },
  { id: 'unit', family: 'brain', pack: 'learn', title: '단위 바꾸기', how: 'm와 cm, 시간과 분처럼 단위를 바꿔요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'odd', family: 'puzzle', pack: 'learn', title: '하나만 달라요', how: '넷 중에서 무리가 다른 하나를 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'bigger', family: 'react', pack: 'event', title: '더 큰 수', how: '두 수 중 더 큰 쪽을 빨리 눌러요', kind: 'quiz', seconds: 20, unit: '개' },
  { id: 'next', family: 'puzzle', pack: 'learn', title: '다음 수는?', how: '수가 늘어나는 규칙을 찾아 다음 수를 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'alt', family: 'body', pack: 'both', ev: ['계단 오르기 대결', '왼발·오른발 버튼을 번갈아 눌러 계단을 올라요. 같은 발 두 번은 무효'], title: '징검다리 달리기', how: '왼발, 오른발 버튼을 번갈아 눌러요. 같은 발을 두 번 누르면 안 쳐줘요', kind: 'count', input: 'alt', seconds: 12, unit: '걸음' },
  { id: 'stop', family: 'react', pack: 'event', title: '딱 5초 멈추기', how: '시작을 누르고 마음속으로 5초를 센 뒤 멈춰요. 세 번 중 가장 가까운 기록', kind: 'timing', seconds: 30, unit: 'ms 차이', better: 'low' },
  { id: 'nonsense', family: 'brain', pack: 'event', title: '넌센스 퀴즈', how: '말장난 문제의 답을 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'capital', family: 'brain', pack: 'event', title: '나라와 수도', how: '나라 이름을 보고 수도를 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'trivia', family: 'brain', pack: 'event', title: '상식 한 판', how: '네 개 중 맞는 답을 골라요', kind: 'quiz', seconds: 35, unit: '개' },
  { id: 'gugu', family: 'brain', pack: 'learn', title: '구구단 번개', how: '구구단 답을 번개처럼 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'clock', family: 'brain', pack: 'learn', title: '시계 읽기', how: '시곗바늘을 보고 몇 시 몇 분인지 골라요', kind: 'quiz', seconds: 35, unit: '개' },
  { id: 'money', family: 'brain', pack: 'learn', title: '동전 세기', how: '동전을 모두 더하면 얼마일까요?', kind: 'quiz', seconds: 35, unit: '개' },
  { id: 'sum10', family: 'react', pack: 'learn', title: '10 짝꿍', how: '더해서 10이 되는 짝꿍 수를 빨리 골라요', kind: 'quiz', seconds: 20, unit: '개' },
  { id: 'stars', family: 'puzzle', pack: 'learn', title: '별 세기', how: '반짝이는 별이 모두 몇 개인지 세어요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'engsent', family: 'brain', pack: 'learn', title: '영어 문장 채우기', how: '영어 문장의 빈칸에 알맞은 낱말을 골라요', kind: 'quiz', seconds: 35, unit: '개' },
  { id: 'engopp', family: 'brain', pack: 'learn', title: '영어 반대말', how: '영어 낱말의 반대말을 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'hanjaword', family: 'brain', pack: 'learn', title: '한자 합체', how: '한자 두 개가 만나면 어떤 낱말이 될까요?', kind: 'quiz', seconds: 35, unit: '개' },
  { id: 'mimic', family: 'brain', pack: 'learn', title: '흉내말 찾기', how: '빈칸에 어울리는 소리·모양 흉내말을 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'groupname', family: 'brain', pack: 'learn', title: '무리 이름', how: '셋을 한데 묶는 이름을 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'job', family: 'brain', pack: 'learn', title: '누구일까요?', how: '하는 일을 듣고 어떤 직업인지 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'riddle', family: 'brain', pack: 'learn', title: '수수께끼', how: '수수께끼를 풀어 답을 골라요', kind: 'quiz', seconds: 35, unit: '개' },
  { id: 'scramble', family: 'puzzle', pack: 'both', title: '뒤죽박죽 낱말', how: '섞인 글자를 바로 놓으면 어떤 낱말일까요?', kind: 'quiz', seconds: 30, unit: '개', ev: ['단어 해독 작전', '섞인 글자를 팀원과 함께 풀어 진짜 단어를 골라요'] },
  { id: 'mixarrow', family: 'rule', pack: 'event', title: '헷갈리는 화살표', how: '"같은 쪽"이면 화살표 쪽, "반대쪽"이면 반대를 눌러요', kind: 'quiz', seconds: 25, unit: '개' },
  { id: 'animalox', family: 'brain', pack: 'event', title: '동물 OX', how: '동물 이야기, 진짜면 O 가짜면 X', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'idiom', family: 'brain', pack: 'event', title: '사자성어 완성', how: '앞 두 글자를 보고 뒤 두 글자를 골라요', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'abbr', family: 'brain', pack: 'event', title: '회사 약어 해독', how: '회의 때 자주 듣는 영어 약어, 무슨 뜻일까요?', kind: 'quiz', seconds: 30, unit: '개' },
  { id: 'food', family: 'brain', pack: 'event', title: '점심 메뉴 초성', how: '초성과 힌트를 보고 음식 이름을 골라요', kind: 'quiz', seconds: 30, unit: '개' },
];

function buildContent(roundId, seed) {
  const r = rng(seed);
  switch (roundId) {
    case 'chosung': return choiceQuiz(WORDS, r, 20, (w) => ({ big: chosungOf(w[0]), small: w[1] }), (w) => w[0]);
    case 'english': return choiceQuiz(ENGLISH, r, 20, (w) => ({ big: w[0], small: '무슨 뜻일까요?' }), (w) => w[1]);
    case 'hanja': return choiceQuiz(HANJA, r, 20, (w) => ({ big: w[0], small: '뜻과 소리는?' }), (w) => w[1]);
    case 'math': {
      const out = [];
      for (let i = 0; i < 25; i++) {
        const a = 2 + Math.floor(r() * 18), b = 1 + Math.floor(r() * 9), plus = r() < 0.6 || a - b < 0;
        const ans = plus ? a + b : a - b;
        const set = new Set([ans]);
        while (set.size < 4) { const d = ans + Math.floor(r() * 7) - 3; if (d >= 0) set.add(d); }
        const choices = shuffle([...set], r).map(String);
        out.push({ prompt: { big: `${a} ${plus ? '+' : '−'} ${b}`, small: '= ?' }, choices, answer: choices.indexOf(String(ans)) });
      }
      return out;
    }
    case 'stroop': {
      const out = [];
      for (let i = 0; i < 30; i++) {
        const w = COLORS[Math.floor(r() * 4)]; let ink = COLORS[Math.floor(r() * 4)];
        if (ink === w && r() < 0.75) ink = COLORS[(COLORS.indexOf(w) + 1 + Math.floor(r() * 3)) % 4];
        const choices = COLORS.map((c) => c[0]);
        out.push({ prompt: { big: w[0], small: '글자 색은?', ink: ink[1] }, choices, answer: choices.indexOf(ink[0]) });
      }
      return out;
    }
    case 'ox': return shuffle(OX, r).map((q) => ({ prompt: { big: q[0], small: '', long: true }, choices: ['O', 'X'], answer: q[1] ? 0 : 1 }));
    case 'order': { const boards = []; for (let i = 0; i < 12; i++) boards.push(shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], r)); return boards; }
    case 'memory': { const seq = []; for (let i = 0; i < 20; i++) seq.push(Math.floor(r() * 9)); return seq; }
    case 'arrow': { const out = []; for (let i = 0; i < 40; i++) { const left = r() < 0.5; out.push({ prompt: { big: left ? '←' : '→', small: '반대쪽!' }, choices: ['←', '→'], answer: left ? 1 : 0 }); } return out; }
    case 'spell': return shuffle(SPELL, r).map(([ok, bad, hint]) => { const choices = r() < 0.5 ? [ok, bad] : [bad, ok]; return { prompt: { big: hint, small: '바르게 쓴 말은?', mid: true }, choices, answer: choices.indexOf(ok) }; });
    case 'opposite': return choiceQuiz(OPPOSITE, r, 20, (w) => ({ big: w[0], small: '반대말은?' }), (w) => w[1]);
    case 'engspell': return shuffle(ENG_SPELL, r).map(([w, ko]) => {
      const k = Math.floor(r() * w.length), right = w[k];
      const pool = shuffle('abcdefghijklmnoprstuwy'.split('').filter((c) => c !== right), r).slice(0, 3);
      const choices = shuffle([right, ...pool], r);
      return { prompt: { big: w.split('').map((c, i) => (i === k ? '_' : c)).join(' '), small: ko }, choices, answer: choices.indexOf(right) };
    });
    case 'proverb': return choiceQuiz(PROVERB, r, 17, (w) => ({ big: w[0] + ' …', small: '뒷부분은?', mid: true }), (w) => w[1]);
    case 'unit': {
      const kinds = [['m', 'cm', 100], ['kg', 'g', 1000], ['시간', '분', 60], ['분', '초', 60], ['L', 'mL', 1000], ['cm', 'mm', 10]];
      const out = [], seen = new Set();
      while (out.length < 20) {
        const [a, b, f] = kinds[Math.floor(r() * kinds.length)], n = 1 + Math.floor(r() * 9), key = a + n; if (seen.has(key)) continue; seen.add(key);
        const ans = n * f, set = new Set([ans]); [ans * 10, ans / 10, n * (f === 60 ? 100 : 60), ans + f, ans - f].forEach((x) => { if (set.size < 4 && x > 0 && Number.isInteger(x)) set.add(x); });
        const choices = shuffle([...set], r).map((x) => `${x}${b}`);
        out.push({ prompt: { big: `${n}${a}`, small: `몇 ${b}일까요?` }, choices, answer: choices.indexOf(`${ans}${b}`) });
      }
      return out;
    }
    case 'odd': {
      const names = Object.keys(GROUPS), out = [];
      for (let i = 0; i < 20; i++) {
        const [g1, g2] = shuffle(names, r), same = shuffle(GROUPS[g1], r).slice(0, 3), diff = shuffle(GROUPS[g2], r)[0];
        const choices = shuffle([...same, diff], r);
        out.push({ prompt: { big: '다른 하나는?', small: `셋은 같은 무리예요 · ${i + 1}번째` }, choices, answer: choices.indexOf(diff) });
      }
      return out;
    }
    case 'bigger': {
      const out = [];
      for (let i = 0; i < 40; i++) {
        const a = 100 + Math.floor(r() * 900); let b = a;
        const rv = Number(String(a).split('').reverse().join(''));
        while (b === a) b = r() < 0.5 && a % 10 ? rv : a + Math.floor(r() * 21) - 10;
        const choices = [String(a), String(b)];
        out.push({ prompt: { big: '더 큰 수는?', small: `${i + 1}번째` }, choices, answer: a > b ? 0 : 1 });
      }
      return out;
    }
    case 'next': {
      const out = [];
      for (let i = 0; i < 20; i++) {
        const t = Math.floor(r() * 3), s0 = 1 + Math.floor(r() * 9), d = 2 + Math.floor(r() * 6);
        const seq = t === 0 ? [0, 1, 2, 3].map((k) => s0 + d * k) : t === 1 ? [0, 1, 2, 3].map((k) => s0 * 2 ** k) : [0, 1, 2, 3].map((k) => 50 + s0 - d * k);
        const ans = t === 0 ? s0 + d * 4 : t === 1 ? s0 * 16 : 50 + s0 - d * 4;
        const set = new Set([ans]); [ans + 1, ans - 1, ans + d, ans - d, ans + 2].forEach((x) => { if (set.size < 4 && x >= 0) set.add(x); });
        const choices = shuffle([...set], r).map(String);
        out.push({ prompt: { big: seq.join(' · ') + ' · ?', small: '다음 수는?', mid: true }, choices, answer: choices.indexOf(String(ans)) });
      }
      return out;
    }
    case 'nonsense': return choiceQuiz(NONSENSE, r, NONSENSE.length, (w) => ({ big: w[0], small: '', mid: true }), (w) => w[1]);
    case 'capital': return choiceQuiz(CAPITAL, r, CAPITAL.length, (w) => ({ big: w[0], small: '수도는?' }), (w) => w[1]);
    case 'trivia': return shuffle(TRIVIA, r).map(([q, ok, bad]) => { const choices = shuffle([ok, ...bad], r); return { prompt: { big: q, small: '', mid: true }, choices, answer: choices.indexOf(ok) }; });
    case 'gugu': {
      const out = [];
      for (let i = 0; i < 30; i++) {
        const a = 2 + Math.floor(r() * 8), b = 2 + Math.floor(r() * 8), ans = a * b, set = new Set([ans]);
        [a * (b + 1), a * (b - 1), (a + 1) * b, ans + 1, ans - 1, ans + 2].forEach((x) => { if (set.size < 4 && x > 0) set.add(x); });
        const choices = shuffle([...set], r).map(String);
        out.push({ prompt: { big: `${a} × ${b}`, small: '= ?' }, choices, answer: choices.indexOf(String(ans)) });
      }
      return out;
    }
    case 'clock': {
      const out = [], label = (h, m) => (m ? `${h}시 ${m}분` : `${h}시`);
      for (let i = 0; i < 20; i++) {
        const h = 1 + Math.floor(r() * 12), m = [0, 0, 30, 30, 15, 45, 5, 10, 20, 25, 35, 40, 50, 55][Math.floor(r() * 14)];
        const right = label(h, m), set = new Set([right]);
        const swapH = m ? m / 5 : 12, cands = [label(swapH, (h % 12) * 5), label(h % 12 + 1, m), label(h === 1 ? 12 : h - 1, m), label(h, (m + 30) % 60), label(h, (m + 15) % 60)];
        cands.forEach((x) => { if (set.size < 4) set.add(x); });
        const choices = shuffle([...set], r);
        out.push({ prompt: { big: '', small: '몇 시 몇 분일까요?', clock: [h, m] }, choices, answer: choices.indexOf(right) });
      }
      return out;
    }
    case 'money': {
      const out = [];
      for (let i = 0; i < 20; i++) {
        const n = COINS.map(() => Math.floor(r() * 4)); if (!n.some(Boolean)) n[1] = 2;
        const ans = n.reduce((a, k, j) => a + k * COINS[j], 0), set = new Set([ans]);
        [ans + 100, ans - 100, ans + 50, ans + 10, ans - 10, ans + 400].forEach((x) => { if (set.size < 4 && x > 0) set.add(x); });
        const choices = shuffle([...set], r).map((x) => `${x.toLocaleString('ko-KR')}원`);
        out.push({ prompt: { big: n.map((k, j) => (k ? `${COINS[j]}원×${k}` : '')).filter(Boolean).join('  '), small: '모두 얼마?', mid: true }, choices, answer: choices.indexOf(`${ans.toLocaleString('ko-KR')}원`) });
      }
      return out;
    }
    case 'sum10': {
      const out = [];
      for (let i = 0; i < 40; i++) {
        const a = 1 + Math.floor(r() * 9), ans = 10 - a, set = new Set([ans]);
        while (set.size < 4) set.add(1 + Math.floor(r() * 9));
        const choices = shuffle([...set], r).map(String);
        out.push({ prompt: { big: `${a} + ?`, small: '= 10' }, choices, answer: choices.indexOf(String(ans)) });
      }
      return out;
    }
    case 'stars': {
      const out = [];
      for (let i = 0; i < 20; i++) {
        const n = 4 + Math.floor(r() * 9); let line = '';
        for (let k = 0; k < n; k++) line += '★' + (r() < 0.35 ? '  ' : '');
        const set = new Set([n]); [n + 1, n - 1, n + 2, n - 2].forEach((x) => { if (set.size < 4) set.add(x); });
        const choices = shuffle([...set], r).map((x) => `${x}개`);
        out.push({ prompt: { big: line.trim(), small: '별은 모두 몇 개?', mid: true, ink: '#E0A100' }, choices, answer: choices.indexOf(`${n}개`) });
      }
      return out;
    }
    case 'engsent': return shuffle(ENG_SENT, r).map(([q, ok, bad]) => { const choices = shuffle([ok, ...bad], r); return { prompt: { big: q, small: '빈칸에 들어갈 말은?', mid: true }, choices, answer: choices.indexOf(ok) }; });
    case 'engopp': return choiceQuiz(ENG_OPP, r, 20, (w) => ({ big: w[0], small: '반대말은?' }), (w) => w[1]);
    case 'hanjaword': return choiceQuiz(HANJA_WORD, r, HANJA_WORD.length, (w) => ({ big: `${w[0]} + ${w[1]}`, small: w[2] }), (w) => w[3]);
    case 'mimic': return choiceQuiz(MIMIC, r, MIMIC.length, (w) => ({ big: w[0], small: '○○에 들어갈 말은?', mid: true }), (w) => w[1]);
    case 'groupname': {
      const names = Object.keys(GROUPS), out = [];
      for (let i = 0; i < 20; i++) {
        const g = names[Math.floor(r() * names.length)], three = shuffle(GROUPS[g], r).slice(0, 3);
        const choices = shuffle([g, ...shuffle(names.filter((x) => x !== g), r).slice(0, 3)], r);
        out.push({ prompt: { big: three.join(' · '), small: '셋을 묶는 이름은?', mid: true }, choices, answer: choices.indexOf(g) });
      }
      return out;
    }
    case 'job': return choiceQuiz(JOBS, r, JOBS.length, (w) => ({ big: w[0], small: '누구일까요?', mid: true }), (w) => w[1]);
    case 'riddle': return shuffle(RIDDLE, r).map(([q, ok, bad]) => { const choices = shuffle([ok, ...bad], r); return { prompt: { big: q, small: '', mid: true }, choices, answer: choices.indexOf(ok) }; });
    case 'scramble': return shuffle(SCRAMBLE, r).map((word) => {
      const sy = [...word], set = new Set([word]); let guard = 0;
      while (set.size < 4 && guard++ < 50) set.add(shuffle(sy, r).join(''));
      const mixed = (() => { let m = word; for (let k = 0; k < 10 && m === word; k++) m = shuffle(sy, r).join(''); return m; })();
      const choices = shuffle([...set], r);
      return { prompt: { big: [...mixed].join(' · '), small: '바로 놓으면?' }, choices, answer: choices.indexOf(word) };
    });
    case 'mixarrow': { const out = []; for (let i = 0; i < 40; i++) { const left = r() < 0.5, same = r() < 0.5; out.push({ prompt: { big: left ? '←' : '→', small: same ? '같은 쪽!' : '반대쪽!', ink: same ? '#2FA36B' : '#E5484D' }, choices: ['←', '→'], answer: (left === same) ? 0 : 1 }); } return out; }
    case 'animalox': return shuffle(ANIMAL_OX, r).map((q) => ({ prompt: { big: q[0], small: '', long: true }, choices: ['O', 'X'], answer: q[1] ? 0 : 1 }));
    case 'idiom': return choiceQuiz(IDIOM, r, IDIOM.length, (w) => ({ big: w[0] + ' ○○', small: '뒤 두 글자는?' }), (w) => w[1]);
    case 'abbr': return choiceQuiz(ABBR, r, ABBR.length, (w) => ({ big: w[0], small: '무슨 뜻?' }), (w) => w[1]);
    case 'food': return choiceQuiz(FOOD, r, FOOD.length, (w) => ({ big: chosungOf(w[0]), small: w[1] }), (w) => w[0]);
    case 'stop': return { target: 5000, tries: 3 };
    case 'react': { const waits = []; for (let i = 0; i < 12; i++) waits.push(1200 + Math.floor(r() * 2300)); return waits; }
    default: return null;
  }
}

// Points by finishing place: everyone who played gets at least 1.
// Company (event) = steep competition. Family (learn) = gentle ranks; the cooperative bonus lives in the engine.
function placePoints(place, pack) {
  const table = pack === 'learn' ? [6, 5, 4, 4, 3, 3, 3] : [10, 8, 6, 5, 4, 3, 2];
  return place < table.length ? table[place] : pack === 'learn' ? 3 : 1;
}
// The same mechanic gets its own name and wording in the company pack.
function viewOf(def, pack) { return pack === 'event' && def.ev ? { ...def, title: def.ev[0], how: def.ev[1] } : def; }

module.exports = { FAMILIES, ROUNDS, buildContent, placePoints, chosungOf, viewOf };
