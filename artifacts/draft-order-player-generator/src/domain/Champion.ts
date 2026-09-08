/**
 * 챔피언 정적 데이터 모듈입니다.
 * 다크 판타지 세계관의 포지션별 챔피언 25종을 제공합니다.
 */

import type { Position } from './Player';

// 경기 시점 태그 타입입니다.
export type Timing = 'EARLY' | 'LATE';
// 교전 방식 태그 타입입니다.
export type Engagement = 'DIVE' | 'POKE';
// 공격 범위 태그 타입입니다.
export type RangeType = 'SINGLE' | 'AOE';
// 전투 역할 태그 타입입니다.
export type ChampionRole = 'TANK' | 'DAMAGE' | 'UTILITY';
// 자동 계산하는 이펙트 코드 타입입니다.
export type EffectType = 'RIFT' | 'BLOOD' | 'WAVE';

/**
 * 챔피언의 이름, 태그, 시그니처 스킬을 보관하는 데이터 클래스입니다.
 */
export class Champion {
  /**
   * 챔피언의 고정 데이터를 생성합니다.
   */
  constructor(
    public readonly title: string,
    public readonly name: string,
    public readonly titleSeparator: '' | ' ',
    public readonly position: Position,
    public readonly timing: Timing,
    public readonly engagement: Engagement,
    public readonly range: RangeType,
    public readonly role: ChampionRole,
    public readonly difficulty: number,
    public readonly signatureSkill: { name: string; description: string },
  ) {}
}

/**
 * 수식어와 고유명을 조합해 기존 소개용 전체 이름을 반환합니다.
 */
export function formatChampionIntroduction(champion: Champion): string {
  return `${champion.title}${champion.titleSeparator}${champion.name}`;
}

/**
 * 챔피언의 태그에서 이펙트 코드를 자동으로 판정합니다.
 */
export function getChampionEffectType(champion: Champion): EffectType {
  if (champion.role === 'TANK' || (champion.engagement === 'DIVE' && champion.timing === 'EARLY')) return 'RIFT';
  if (champion.role === 'DAMAGE' && champion.engagement === 'DIVE') return 'BLOOD';
  return 'WAVE';
}

// 포지션마다 정확히 다섯 종을 보관하는 정적 챔피언 목록입니다.
export const CHAMPIONS: Champion[] = [
  new Champion('몰락한', '기사', ' ', 'TOP', 'EARLY', 'POKE', 'SINGLE', 'TANK', 2, { name: '검은 서약', description: '부서진 성검으로 적의 전열에 암흑의 낙인을 새긴다.' }),
  new Champion('핏빛 서약자', '모르', ' ', 'TOP', 'LATE', 'DIVE', 'SINGLE', 'DAMAGE', 4, { name: '혈서 단죄', description: '피로 맺은 계약을 끊어 단일 적을 처형한다.' }),
  new Champion('회색 성녀', '이르마', ' ', 'TOP', 'LATE', 'POKE', 'AOE', 'UTILITY', 3, { name: '회색 성가', description: '죽은 성가가 넓은 전장에 서늘한 침묵을 퍼뜨린다.' }),
  new Champion('첫 불의', '수호자', ' ', 'TOP', 'EARLY', 'DIVE', 'AOE', 'TANK', 3, { name: '태초의 화염', description: '꺼지지 않는 첫 불꽃으로 적진을 갈라 놓는다.' }),
  new Champion('황혼의 사냥꾼', '벨트', ' ', 'TOP', 'EARLY', 'POKE', 'SINGLE', 'TANK', 4, { name: '황혼 추적', description: '저무는 빛을 따라 먹잇감에게 그림자 화살을 보낸다.' }),
  new Champion('늪의 망령', '세블', ' ', 'JUNGLE', 'EARLY', 'DIVE', 'AOE', 'TANK', 2, { name: '수렁의 손', description: '검은 늪의 손아귀가 적들의 발목을 전장에 묶는다.' }),
  new Champion('짐승화한', '자', ' ', 'JUNGLE', 'LATE', 'DIVE', 'SINGLE', 'DAMAGE', 5, { name: '월식 발톱', description: '달이 가려질 때 야수의 발톱이 한 적을 찢어발긴다.' }),
  new Champion('역병의', '운반자', ' ', 'JUNGLE', 'LATE', 'POKE', 'AOE', 'UTILITY', 3, { name: '부패한 숨결', description: '썩은 안개가 넓은 지역에 느린 죽음을 흩뿌린다.' }),
  new Champion('뼈절단자', '카르', ' ', 'JUNGLE', 'EARLY', 'DIVE', 'SINGLE', 'DAMAGE', 3, { name: '백골 절단', description: '톱니 뼈날이 가장 약한 적의 갑주를 베어낸다.' }),
  new Champion('안개 사슴', '로웬', ' ', 'JUNGLE', 'EARLY', 'POKE', 'AOE', 'TANK', 2, { name: '사슴뿔 안개', description: '창백한 뿔에서 피어난 안개가 적의 진입로를 가린다.' }),
  new Champion('글린트', '마도사', ' ', 'MID', 'LATE', 'POKE', 'AOE', 'DAMAGE', 4, { name: '유리 번개', description: '빛나는 파편의 벼락이 먼 적들 사이에서 폭발한다.' }),
  new Champion('검은 종의', '리리아', ' ', 'MID', 'EARLY', 'DIVE', 'SINGLE', 'DAMAGE', 5, { name: '조종의 울림', description: '검은 종소리가 한 적의 심장을 향해 파고든다.' }),
  new Champion('잿빛 예언자', '토른', ' ', 'MID', 'LATE', 'POKE', 'SINGLE', 'TANK', 3, { name: '재의 계시', description: '재로 쓴 예언이 적의 다음 걸음을 묶어 세운다.' }),
  new Champion('심연의 광대', '미르', ' ', 'MID', 'EARLY', 'DIVE', 'AOE', 'DAMAGE', 4, { name: '심연 난무', description: '웃음소리와 함께 열린 균열이 적진을 집어삼킨다.' }),
  new Champion('유리 무덤의', '세라', ' ', 'MID', 'EARLY', 'POKE', 'AOE', 'UTILITY', 2, { name: '수정 장송곡', description: '유리 조각의 노래가 전장을 차가운 묘지로 바꾼다.' }),
  new Champion('월식 사수', '베이라', ' ', 'ADC', 'LATE', 'POKE', 'SINGLE', 'DAMAGE', 3, { name: '식월 탄환', description: '가려진 달빛을 압축한 탄환이 먼 적을 관통한다.' }),
  new Champion('장송의 화살', '라스크', ' ', 'ADC', 'EARLY', 'POKE', 'AOE', 'UTILITY', 4, { name: '애도의 우박', description: '검은 화살비가 넓은 전장에 장송의 비를 내린다.' }),
  new Champion('피안개 저격수', '오린', ' ', 'ADC', 'LATE', 'POKE', 'SINGLE', 'DAMAGE', 5, { name: '혈무 조준', description: '핏빛 안개 너머의 심장만을 겨누어 한 발을 쏜다.' }),
  new Champion('피의', '사냥꾼', ' ', 'ADC', 'EARLY', 'DIVE', 'SINGLE', 'DAMAGE', 5, { name: '붉은 추적', description: '피 냄새를 따라 돌진해 도망친 적에게 송곳니를 박는다.' }),
  new Champion('백골 매 사냥꾼', '티르', ' ', 'ADC', 'LATE', 'DIVE', 'SINGLE', 'UTILITY', 2, { name: '해골 매', description: '뼈로 만든 매가 적의 시야와 발걸음을 훔쳐 간다.' }),
  new Champion('성물 감시자', '아마라', ' ', 'SUPPORT', 'EARLY', 'DIVE', 'AOE', 'TANK', 2, { name: '성물 방벽', description: '금 간 성물이 아군 앞에 어두운 장벽을 세운다.' }),
  new Champion('잿불', '사제', ' ', 'SUPPORT', 'LATE', 'POKE', 'AOE', 'UTILITY', 2, { name: '재의 축복', description: '식지 않은 재가 아군을 감싸고 적을 태운다.' }),
  new Champion('속죄의 사슬', '바니', ' ', 'SUPPORT', 'EARLY', 'DIVE', 'SINGLE', 'TANK', 4, { name: '속죄 구속', description: '죄를 묶는 사슬이 적 하나를 심판의 자리에 세운다.' }),
  new Champion('종', '지기', '', 'SUPPORT', 'LATE', 'POKE', 'AOE', 'UTILITY', 4, { name: '종말의 종소리', description: '마지막 종소리가 넓은 전장에 불길한 파동을 남긴다.' }),
  new Champion('망각의 북 연주자', '크로', ' ', 'SUPPORT', 'EARLY', 'POKE', 'AOE', 'UTILITY', 5, { name: '망각의 장단', description: '잊힌 북소리가 적의 의지와 진형을 흐트러뜨린다.' }),
];

/**
 * 지정 포지션의 챔피언 목록을 반환합니다.
 */
export function getChampionsByPosition(position: Position): Champion[] {
  return CHAMPIONS.filter((champion) => champion.position === position);
}