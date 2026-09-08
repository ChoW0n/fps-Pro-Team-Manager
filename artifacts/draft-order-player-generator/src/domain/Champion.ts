/**
 * 챔피언 정적 데이터 모듈입니다.
 * 다크 판타지 세계관의 포지션별 챔피언 25종과 세 가지 스킬을 제공합니다.
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
// 스킬 이펙트의 허용된 최소 시각 프리미티브 타입입니다.
export type EffectPrimitive = 'FLASH' | 'TREMOR' | 'PILLAR' | 'RIFT' | 'WAVE' | 'SHARD' | 'BURST' | 'SLASH' | 'TRAIL' | 'SPIRAL' | 'RUNE' | 'FLOAT';
// 스킬 종류 코드 타입입니다.
export type SkillKind = 'PASSIVE' | 'BASIC' | 'ULTIMATE';

/** 스킬의 시간 순서 이펙트 한 겹입니다. */
export interface EffectLayer {
  primitive: EffectPrimitive;
  startMs: number;
  durationMs: number;
  intensity: number;
}

/** 챔피언이 가진 스킬 한 종의 데이터입니다. */
export interface ChampionSkill {
  kind: SkillKind;
  name: string;
  description: string;
  effectLayers: EffectLayer[];
}

/** 패시브·기본기·궁극기 세 종을 빠짐없이 보관하는 구조입니다. */
export interface ChampionSkills {
  passive: ChampionSkill;
  basic: ChampionSkill;
  ultimate: ChampionSkill;
}

/**
 * 챔피언의 이름, 태그, 상징색과 세 가지 스킬을 보관하는 데이터 클래스입니다.
 */
export class Champion {
  /** 챔피언의 고정 데이터를 생성합니다. */
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
    public readonly symbolColor: string,
    public readonly skills: ChampionSkills,
  ) {}
}

/** 수식어와 고유명을 조합해 기존 소개용 전체 이름을 반환합니다. */
export function formatChampionIntroduction(champion: Champion): string {
  return `${champion.title}${champion.titleSeparator}${champion.name}`;
}

// 초기 데이터 선언에 쓰는 기본 레이어이며, 아래 역할별 프리셋으로 모두 교체됩니다.
const P: EffectLayer[] = [{ primitive: 'RUNE', startMs: 0, durationMs: 300, intensity: 1 }];
const B: EffectLayer[] = [
  { primitive: 'FLASH', startMs: 0, durationMs: 120, intensity: 1 },
  { primitive: 'TRAIL', startMs: 90, durationMs: 240, intensity: 1.2 },
  { primitive: 'BURST', startMs: 250, durationMs: 180, intensity: 1.5 },
];
const U: EffectLayer[] = [
  { primitive: 'RUNE', startMs: 0, durationMs: 300, intensity: 1 },
  { primitive: 'FLOAT', startMs: 120, durationMs: 300, intensity: 1.1 },
  { primitive: 'SPIRAL', startMs: 260, durationMs: 280, intensity: 1.2 },
  { primitive: 'TRAIL', startMs: 420, durationMs: 260, intensity: 1.4 },
  { primitive: 'RIFT', startMs: 600, durationMs: 350, intensity: 1.7 },
  { primitive: 'WAVE', startMs: 760, durationMs: 300, intensity: 1.5 },
  { primitive: 'BURST', startMs: 980, durationMs: 220, intensity: 2 },
];

/** 역할과 교전 방식에 맞는 세 스킬 레이어 프리셋입니다. */
interface SkillLayerPreset {
  passive: EffectLayer[];
  basic: EffectLayer[];
  ultimate: EffectLayer[];
}

// 탱커는 전열 충돌과 지형 장악을 드러내는 프리미티브를 사용합니다.
const TANK_PRESET: SkillLayerPreset = {
  passive: [{ primitive: 'RUNE', startMs: 0, durationMs: 360, intensity: 1 }, { primitive: 'FLOAT', startMs: 160, durationMs: 260, intensity: 0.8 }],
  basic: [{ primitive: 'RUNE', startMs: 0, durationMs: 180, intensity: 1 }, { primitive: 'TREMOR', startMs: 140, durationMs: 260, intensity: 1.3 }, { primitive: 'PILLAR', startMs: 310, durationMs: 300, intensity: 1.5 }],
  ultimate: [{ primitive: 'RUNE', startMs: 0, durationMs: 280, intensity: 1 }, { primitive: 'TREMOR', startMs: 140, durationMs: 360, intensity: 1.2 }, { primitive: 'PILLAR', startMs: 320, durationMs: 420, intensity: 1.5 }, { primitive: 'RIFT', startMs: 530, durationMs: 360, intensity: 1.8 }, { primitive: 'WAVE', startMs: 700, durationMs: 300, intensity: 1.4 }, { primitive: 'TREMOR', startMs: 860, durationMs: 300, intensity: 1.6 }, { primitive: 'BURST', startMs: 1080, durationMs: 200, intensity: 1.8 }],
};
// 돌진 딜러는 빠른 진입과 단일 목표 폭발을 드러내는 프리미티브를 사용합니다.
const DIVE_DAMAGE_PRESET: SkillLayerPreset = {
  passive: [{ primitive: 'TRAIL', startMs: 0, durationMs: 280, intensity: 1 }],
  basic: [{ primitive: 'FLASH', startMs: 0, durationMs: 100, intensity: 1.1 }, { primitive: 'TRAIL', startMs: 80, durationMs: 220, intensity: 1.4 }, { primitive: 'SLASH', startMs: 240, durationMs: 180, intensity: 1.7 }],
  ultimate: [{ primitive: 'FLASH', startMs: 0, durationMs: 110, intensity: 1.2 }, { primitive: 'TRAIL', startMs: 80, durationMs: 280, intensity: 1.5 }, { primitive: 'SLASH', startMs: 240, durationMs: 200, intensity: 1.8 }, { primitive: 'SPIRAL', startMs: 380, durationMs: 260, intensity: 1.3 }, { primitive: 'SLASH', startMs: 530, durationMs: 220, intensity: 2 }, { primitive: 'BURST', startMs: 690, durationMs: 240, intensity: 2.2 }, { primitive: 'TRAIL', startMs: 820, durationMs: 220, intensity: 1.4 }],
};
// 견제 딜러는 원거리 광역 압박을 드러내는 프리미티브를 사용합니다.
const POKE_DAMAGE_PRESET: SkillLayerPreset = {
  passive: [{ primitive: 'SHARD', startMs: 0, durationMs: 260, intensity: 1 }],
  basic: [{ primitive: 'SHARD', startMs: 0, durationMs: 180, intensity: 1.1 }, { primitive: 'WAVE', startMs: 130, durationMs: 250, intensity: 1.3 }, { primitive: 'BURST', startMs: 290, durationMs: 180, intensity: 1.5 }],
  ultimate: [{ primitive: 'PILLAR', startMs: 0, durationMs: 300, intensity: 1 }, { primitive: 'SPIRAL', startMs: 150, durationMs: 300, intensity: 1.2 }, { primitive: 'SHARD', startMs: 300, durationMs: 320, intensity: 1.5 }, { primitive: 'WAVE', startMs: 470, durationMs: 300, intensity: 1.6 }, { primitive: 'SHARD', startMs: 630, durationMs: 280, intensity: 1.8 }, { primitive: 'BURST', startMs: 820, durationMs: 220, intensity: 2 }, { primitive: 'WAVE', startMs: 960, durationMs: 260, intensity: 1.4 }],
};
// 유틸리티는 아군 보호와 전장 흐름 제어를 드러내는 프리미티브를 사용합니다.
const UTILITY_PRESET: SkillLayerPreset = {
  passive: [{ primitive: 'RUNE', startMs: 0, durationMs: 320, intensity: 1 }, { primitive: 'FLOAT', startMs: 130, durationMs: 240, intensity: 0.9 }],
  basic: [{ primitive: 'RUNE', startMs: 0, durationMs: 190, intensity: 1 }, { primitive: 'FLOAT', startMs: 120, durationMs: 280, intensity: 1.1 }, { primitive: 'WAVE', startMs: 270, durationMs: 250, intensity: 1.3 }],
  ultimate: [{ primitive: 'RUNE', startMs: 0, durationMs: 300, intensity: 1 }, { primitive: 'FLOAT', startMs: 150, durationMs: 330, intensity: 1.1 }, { primitive: 'SPIRAL', startMs: 300, durationMs: 300, intensity: 1.3 }, { primitive: 'WAVE', startMs: 450, durationMs: 320, intensity: 1.5 }, { primitive: 'PILLAR', startMs: 610, durationMs: 300, intensity: 1.4 }, { primitive: 'RUNE', startMs: 760, durationMs: 300, intensity: 1.5 }, { primitive: 'WAVE', startMs: 920, durationMs: 260, intensity: 1.7 }],
};

/** 스킬 데이터를 함께 적어 둔 포지션별 정적 챔피언 목록입니다. */
export const CHAMPIONS: Champion[] = [
  new Champion('몰락한', '기사', ' ', 'TOP', 'EARLY', 'POKE', 'SINGLE', 'TANK', 2, '#35D6FF', { passive: { kind: 'PASSIVE', name: '파편 왕관', description: '무너진 갑주 조각이 견제에 버틴 기사의 방벽을 단단히 한다.', effectLayers: P }, basic: { kind: 'BASIC', name: '성검 파쇄', description: '라인에서 성검을 뻗어 적 하나를 밀어내고 소규모 교전의 길을 연다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '검은 서약', description: '한타의 전열에 망가진 성검의 서약을 내려 적들의 진입을 단절한다.', effectLayers: U } }),
  new Champion('핏빛 서약자', '모르', ' ', 'TOP', 'LATE', 'DIVE', 'SINGLE', 'DAMAGE', 4, '#FF3D71', { passive: { kind: 'PASSIVE', name: '피의 인장', description: '피로 맺은 인장이 돌진 뒤 단일 처형자의 굶주림을 채운다.', effectLayers: P }, basic: { kind: 'BASIC', name: '혈서 찌르기', description: '라인의 적에게 혈서를 새겨 짧은 교전에서 추격할 틈을 만든다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '혈서 단죄', description: '결정적 한타에서 피의 계약을 거두어 가장 약한 적을 처형한다.', effectLayers: U } }),
  new Champion('회색 성녀', '이르마', ' ', 'TOP', 'LATE', 'POKE', 'AOE', 'UTILITY', 3, '#C4B5FD', { passive: { kind: 'PASSIVE', name: '침묵의 성가', description: '죽은 성가가 광역 견제를 돕는 성녀의 숨결을 남긴다.', effectLayers: [] }, basic: { kind: 'BASIC', name: '회색 낙조', description: '라인에 회색 성가를 흩뿌려 작은 교전의 적 진형을 늦춘다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '장례의 합창', description: '한타 한가운데 장례의 합창을 울려 아군이 물러날 길을 만든다.', effectLayers: U } }),
  new Champion('첫 불의', '수호자', ' ', 'TOP', 'EARLY', 'DIVE', 'AOE', 'TANK', 3, '#FF8A3D', { passive: { kind: 'PASSIVE', name: '꺼지지 않는 재', description: '첫 불의 재가 돌진하는 수호자의 광역 방패를 되살린다.', effectLayers: P }, basic: { kind: 'BASIC', name: '화염 돌격', description: '라인에서 불꽃으로 들이받아 근처 적과의 소규모 교전을 연다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '태초의 화염', description: '결정적 한타에 태초의 불길을 터뜨려 적 전열을 갈라 놓는다.', effectLayers: U } }),
  new Champion('황혼의 사냥꾼', '벨트', ' ', 'TOP', 'EARLY', 'POKE', 'SINGLE', 'TANK', 4, '#FDE047', { passive: { kind: 'PASSIVE', name: '저무는 표식', description: '황혼의 표식이 견제 후 사냥꾼의 단일 방어를 높인다.', effectLayers: [] }, basic: { kind: 'BASIC', name: '그림자 화살', description: '라인의 먹잇감에게 그림자 화살을 날려 작은 교전을 억제한다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '황혼 추적', description: '한타의 결정적 순간 황혼 길을 열어 도망치는 적을 붙든다.', effectLayers: U } }),
  new Champion('늪의 망령', '세블', ' ', 'JUNGLE', 'EARLY', 'DIVE', 'AOE', 'TANK', 2, '#2DD4BF', { passive: { kind: 'PASSIVE', name: '수렁의 갑피', description: '늪의 진흙이 돌진 탱커의 광역 압박을 견디게 한다.', effectLayers: P }, basic: { kind: 'BASIC', name: '늪 손아귀', description: '강가 교전에서 늪의 손을 뻗어 가까운 적들의 발목을 묶는다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '검은 수렁', description: '한타의 길목을 검은 수렁으로 잠겨 적 전열 전체를 가둔다.', effectLayers: U } }),
  new Champion('짐승화한', '자', ' ', 'JUNGLE', 'LATE', 'DIVE', 'SINGLE', 'DAMAGE', 5, '#A3E635', { passive: { kind: 'PASSIVE', name: '월식의 허기', description: '가려진 달의 허기가 돌진 암살자의 단일 추격을 키운다.', effectLayers: P }, basic: { kind: 'BASIC', name: '야수 도약', description: '소규모 교전에서 야수로 뛰어들어 고립된 적을 할퀸다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '월식 발톱', description: '결정적 한타에서 월식의 발톱으로 핵심 적을 찢어발긴다.', effectLayers: U } }),
  new Champion('역병의', '운반자', ' ', 'JUNGLE', 'LATE', 'POKE', 'AOE', 'UTILITY', 3, '#84CC16', { passive: { kind: 'PASSIVE', name: '썩은 포자', description: '부패한 포자가 광역 견제 유틸리티의 독기를 퍼뜨린다.', effectLayers: [] }, basic: { kind: 'BASIC', name: '부패 숨결', description: '강가의 적에게 썩은 숨결을 뿜어 작은 교전의 발을 늦춘다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '역병의 장막', description: '한타 중심에 역병 장막을 내려 적들이 흩어지게 만든다.', effectLayers: U } }),
  new Champion('뼈절단자', '카르', ' ', 'JUNGLE', 'EARLY', 'DIVE', 'SINGLE', 'DAMAGE', 3, '#FB7185', { passive: { kind: 'PASSIVE', name: '톱니 골수', description: '톱니 골수가 돌진 딜러의 단일 상처를 깊게 만든다.', effectLayers: P }, basic: { kind: 'BASIC', name: '백골 절단', description: '정글 소규모 교전에서 뼈날로 적 갑주를 빠르게 베어낸다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '골수 수확', description: '한타의 끝에 백골 폭풍을 불러 핵심 적을 수확한다.', effectLayers: U } }),
  new Champion('안개 사슴', '로웬', ' ', 'JUNGLE', 'EARLY', 'POKE', 'AOE', 'TANK', 2, '#67E8F9', { passive: { kind: 'PASSIVE', name: '창백한 뿔', description: '창백한 뿔의 안개가 광역 견제를 하는 탱커를 감싼다.', effectLayers: P }, basic: { kind: 'BASIC', name: '뿔안개 분사', description: '강가에서 안개를 뿜어 작은 교전의 진입로를 가린다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '백록의 숲', description: '한타에 거대한 사슴뿔 숲을 세워 적 전열을 갈라 둔다.', effectLayers: U } }),
  new Champion('글린트', '마도사', ' ', 'MID', 'LATE', 'POKE', 'AOE', 'DAMAGE', 4, '#60A5FA', { passive: { kind: 'PASSIVE', name: '유리 잔광', description: '유리 잔광이 광역 견제 마도사의 주문을 증폭한다.', effectLayers: P }, basic: { kind: 'BASIC', name: '유리 번개', description: '라인 먼 곳에 유리 벼락을 떨어뜨려 소규모 교전을 흔든다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '천공 유리비', description: '결정적 한타 위로 유리비를 쏟아 적 진형을 산산이 부순다.', effectLayers: U } }),
  new Champion('검은 종의', '리리아', ' ', 'MID', 'EARLY', 'DIVE', 'SINGLE', 'DAMAGE', 5, '#E879F9', { passive: { kind: 'PASSIVE', name: '심장 공명', description: '검은 종의 공명이 돌진 암살자의 단일 표적을 드러낸다.', effectLayers: P }, basic: { kind: 'BASIC', name: '울림의 손끝', description: '라인에서 종소리를 찔러 넣어 짧은 교전의 적을 흔든다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '조종의 울림', description: '한타의 결정적 순간 검은 울림으로 적 핵심을 끌어낸다.', effectLayers: U } }),
  new Champion('잿빛 예언자', '토른', ' ', 'MID', 'LATE', 'POKE', 'SINGLE', 'TANK', 3, '#94A3B8', { passive: { kind: 'PASSIVE', name: '재의 문장', description: '재의 문장이 견제 탱커의 단일 방벽을 견고하게 한다.', effectLayers: [] }, basic: { kind: 'BASIC', name: '계시의 재', description: '라인에 재의 계시를 남겨 작은 교전의 적 걸음을 묶는다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '종말 예언', description: '한타의 갈림길에 종말 예언을 새겨 적의 퇴로를 봉한다.', effectLayers: U } }),
  new Champion('심연의 광대', '미르', ' ', 'MID', 'EARLY', 'DIVE', 'AOE', 'DAMAGE', 4, '#818CF8', { passive: { kind: 'PASSIVE', name: '뒤집힌 웃음', description: '심연의 웃음이 돌진 딜러의 광역 난무를 부추긴다.', effectLayers: P }, basic: { kind: 'BASIC', name: '광대의 도약', description: '라인 교전에서 비틀린 도약으로 가까운 적들을 휘젓는다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '심연 난무', description: '결정적 한타에 심연 균열을 열어 적진 전체를 집어삼킨다.', effectLayers: U } }),
  new Champion('유리 무덤의', '세라', ' ', 'MID', 'EARLY', 'POKE', 'AOE', 'UTILITY', 2, '#22D3EE', { passive: { kind: 'PASSIVE', name: '묘비의 서리', description: '유리 무덤의 서리가 광역 견제와 아군 보호를 돕는다.', effectLayers: P }, basic: { kind: 'BASIC', name: '수정 장송', description: '라인에 수정 조각을 띄워 작은 교전의 적 시야를 가린다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '유리 묘역', description: '한타의 중심을 유리 묘역으로 덮어 아군의 진형을 지킨다.', effectLayers: U } }),
  new Champion('월식 사수', '베이라', ' ', 'ADC', 'LATE', 'POKE', 'SINGLE', 'DAMAGE', 3, '#FACC15', { passive: { kind: 'PASSIVE', name: '가려진 달', description: '가려진 달빛이 원거리 단일 견제의 조준을 날카롭게 한다.', effectLayers: P }, basic: { kind: 'BASIC', name: '식월 탄환', description: '라인 먼 곳의 적에게 식월 탄환을 쏘아 소규모 교전을 연다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '월식 사형선고', description: '한타의 결정적 순간 달빛 탄환으로 적 핵심을 관통한다.', effectLayers: U } }),
  new Champion('장송의 화살', '라스크', ' ', 'ADC', 'EARLY', 'POKE', 'AOE', 'UTILITY', 4, '#F9A8D4', { passive: { kind: 'PASSIVE', name: '애도의 깃', description: '검은 깃털이 광역 견제와 아군 보조의 여운을 남긴다.', effectLayers: [] }, basic: { kind: 'BASIC', name: '애도의 우박', description: '라인에 검은 화살비를 흩려 작은 교전의 적 진형을 늦춘다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '장송의 폭우', description: '한타 위에 장송의 폭우를 내리게 해 아군의 진입을 돕는다.', effectLayers: U } }),
  new Champion('피안개 저격수', '오린', ' ', 'ADC', 'LATE', 'POKE', 'SINGLE', 'DAMAGE', 5, '#F43F5E', { passive: { kind: 'PASSIVE', name: '혈무 조준선', description: '피안개의 조준선이 원거리 단일 처형자의 숨을 고른다.', effectLayers: P }, basic: { kind: 'BASIC', name: '심장 표적', description: '라인의 적 심장을 겨눠 소규모 교전에서 거리를 벌린다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '핏빛 최후통첩', description: '결정적 한타에서 안개 너머의 적 핵심에게 최후의 탄환을 보낸다.', effectLayers: U } }),
  new Champion('피의', '사냥꾼', ' ', 'ADC', 'EARLY', 'DIVE', 'SINGLE', 'DAMAGE', 5, '#EF4444', { passive: { kind: 'PASSIVE', name: '피 냄새', description: '피 냄새가 돌진 단일 사냥꾼의 추격 본능을 깨운다.', effectLayers: P }, basic: { kind: 'BASIC', name: '붉은 추적', description: '짧은 교전에서 피자국을 따라 돌진해 적 하나를 물어뜯는다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '사냥의 만월', description: '한타의 결정적 순간 피의 만월로 적 후열을 끝까지 추적한다.', effectLayers: U } }),
  new Champion('백골 매 사냥꾼', '티르', ' ', 'ADC', 'LATE', 'DIVE', 'SINGLE', 'UTILITY', 2, '#D8B4FE', { passive: { kind: 'PASSIVE', name: '뼈깃 감각', description: '백골 매의 감각이 돌진 유틸리티의 단일 추적을 돕는다.', effectLayers: [] }, basic: { kind: 'BASIC', name: '해골 매', description: '소규모 교전에서 뼈 매를 보내 적 하나의 시야를 훔친다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '망자의 비행', description: '한타의 길목에 망자의 매떼를 풀어 적 핵심의 퇴로를 지운다.', effectLayers: U } }),
  new Champion('성물 감시자', '아마라', ' ', 'SUPPORT', 'EARLY', 'DIVE', 'AOE', 'TANK', 2, '#FBBF24', { passive: { kind: 'PASSIVE', name: '금 간 성물', description: '금 간 성물이 돌진 탱커의 광역 보호막을 되살린다.', effectLayers: P }, basic: { kind: 'BASIC', name: '성물 방벽', description: '소규모 교전에서 성물 방벽을 세워 아군의 진입을 받친다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '성역 붕괴', description: '결정적 한타에서 무너진 성역을 펼쳐 적 전열을 밀어낸다.', effectLayers: U } }),
  new Champion('잿불', '사제', ' ', 'SUPPORT', 'LATE', 'POKE', 'AOE', 'UTILITY', 2, '#FB923C', { passive: { kind: 'PASSIVE', name: '식지 않는 재', description: '식지 않는 재가 광역 견제 사제의 아군 보호를 이어 준다.', effectLayers: P }, basic: { kind: 'BASIC', name: '재의 축복', description: '라인 교전에서 아군을 재로 감싸며 가까운 적을 태운다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '화장 의식', description: '한타의 한복판에 화장 의식을 열어 아군의 전진을 지킨다.', effectLayers: U } }),
  new Champion('속죄의 사슬', '바니', ' ', 'SUPPORT', 'EARLY', 'DIVE', 'SINGLE', 'TANK', 4, '#38BDF8', { passive: { kind: 'PASSIVE', name: '죄의 무게', description: '속죄의 무게가 돌진 탱커의 단일 구속을 단단하게 한다.', effectLayers: [] }, basic: { kind: 'BASIC', name: '속죄 구속', description: '작은 교전에서 사슬로 적 하나를 묶어 아군의 공격을 돕는다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '심판의 고리', description: '결정적 한타에서 거대한 사슬 고리로 적 핵심을 심판한다.', effectLayers: U } }),
  new Champion('종', '지기', '', 'SUPPORT', 'LATE', 'POKE', 'AOE', 'UTILITY', 4, '#A78BFA', { passive: { kind: 'PASSIVE', name: '여운의 종', description: '종의 여운이 광역 견제와 아군 지원을 오래 남긴다.', effectLayers: P }, basic: { kind: 'BASIC', name: '불길한 종소리', description: '라인에 종소리를 울려 작은 교전의 적 발걸음을 늦춘다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '종말의 종소리', description: '한타의 결정적 순간 마지막 종소리로 적 진형을 무너뜨린다.', effectLayers: U } }),
  new Champion('망각의 북 연주자', '크로', ' ', 'SUPPORT', 'EARLY', 'POKE', 'AOE', 'UTILITY', 5, '#34D399', { passive: { kind: 'PASSIVE', name: '잊힌 박자', description: '망각의 박자가 광역 견제 유틸리티의 흐름을 지킨다.', effectLayers: P }, basic: { kind: 'BASIC', name: '망각의 장단', description: '라인에서 북을 울려 작은 교전의 적 진형을 흐트러뜨린다.', effectLayers: B }, ultimate: { kind: 'ULTIMATE', name: '망각의 진혼곡', description: '한타의 절정에 진혼곡을 울려 아군이 승부를 끝내게 한다.', effectLayers: U } }),
];

// 챔피언 태그에 맞는 공용 프리셋을 명시적으로 배정해 같은 궁극기 연출을 피합니다.
CHAMPIONS.forEach((champion) => {
  const preset = champion.role === 'TANK'
    ? TANK_PRESET
    : champion.role === 'UTILITY'
      ? UTILITY_PRESET
      : champion.engagement === 'DIVE'
        ? DIVE_DAMAGE_PRESET
        : POKE_DAMAGE_PRESET;
  champion.skills.passive.effectLayers = preset.passive;
  champion.skills.basic.effectLayers = preset.basic;
  champion.skills.ultimate.effectLayers = preset.ultimate;
});

/** 지정 포지션의 챔피언 목록을 반환합니다. */
export function getChampionsByPosition(position: Position): Champion[] {
  return CHAMPIONS.filter((champion) => champion.position === position);
}