/**
 * 부대와 총기는 실제 고증 자료를 사용하지만, 오퍼레이터 인물과 특수 장비는 모두 이 게임을 위한 창작입니다.
 * 기존 게임의 인물이나 장비를 가져오지 않습니다.
 */

import type { Role } from './Player';

export type OperatorSide = '공격' | '수비';

export const OPERATOR_ROLE_LABELS: Record<Role, string> = {
  SEARCH: '수색',
  ENTRY: '진입',
  FIREPOWER: '화력',
  DEFENSIVE_SETUP: '수비설계',
  BLOCKING: '차단',
};

export interface SpecialUnit {
  name: string;
  country: string;
  doctrine: string;
  statLink: string;
}

export interface SpecialEquipment {
  name: string;
  description: string;
  effect: string;
}

export interface OperatorStats {
  aim: number;
  entry: number;
  informationGathering: number;
  defensiveSetup: number;
  clutch: number;
}

export class Operator {
  public readonly callSign: string;
  public readonly unit: SpecialUnit;
  public readonly side: OperatorSide;
  public readonly role: Role;
  public readonly firearms: string[];
  public readonly equipment: SpecialEquipment;
  public readonly stats: OperatorStats;

  /** 오퍼레이터의 소속·장비·전술 능력치를 생성합니다. */
  constructor(
    callSign: string,
    unit: SpecialUnit,
    side: OperatorSide,
    role: Role,
    firearms: string[],
    equipment: SpecialEquipment,
    stats: OperatorStats,
  ) {
    this.callSign = callSign;
    this.unit = unit;
    this.side = side;
    this.role = role;
    this.firearms = firearms;
    this.equipment = equipment;
    this.stats = stats;
  }
}

export const UNITS: SpecialUnit[] = [
  {
    name: '22 SAS 연대 CRW',
    country: '영국',
    doctrine: '1970년대 초 대테러부대를 두고 근접전투와 인질구출을 전담시켰다. 폰트릴라스의 킬링 하우스와 실제 여객기 동체에서 훈련한다. 최소 단위가 4인 조이고 각 대대는 해상, 공수, 기동, 산악 네 특기조로 나뉜다.',
    statLink: '진입과 팀 궁합',
  },
  {
    name: '국가헌병대 개입부대 GIGN',
    country: '프랑스',
    doctrine: '창설 이래 화력 절제가 교리의 뿌리다. 신입에게 MR73 리볼버를 주며 그 뜻을 새긴다. 14개월 교육에 협상이 들어 있고 40명 규모의 관찰 수색 부대가 정찰을 전담한다. 1800여 작전에서 인질 600명 이상을 구출했다.',
    statLink: '정보수집과 조준',
  },
  {
    name: '연방경찰 국경수비대 9조 GSG 9',
    country: '독일',
    doctrine: '1972년부터 2003년까지 1500회 넘는 임무에서 발포는 단 다섯 번이었다. 네 개 부대로 나뉘어 1조는 저격, 2조는 잠수와 해상, 3조는 공수, 4조는 베를린 도시 대테러와 화생방을 맡는다.',
    statLink: '수비설계와 조준, 진입은 낮음',
  },
  {
    name: '제707특수임무단',
    country: '대한민국',
    doctrine: '육군 특수전사령부 소속 대테러 부대다. 인질 구출과 요인 경호를 맡는다. MP5를 오래 써 왔고 HK416을 수천 정 도입했다.',
    statLink: '균형과 침착',
  },
  {
    name: '연방보안국 알파 그룹',
    country: '러시아',
    doctrine: '인질 구출과 대테러를 맡되 강행 돌파를 주저하지 않는다. 소음 소총 계열을 즐겨 쓴다.',
    statLink: '진입이 최상이고 정보수집이 낮음',
  },
  {
    name: '사이렛 매트칼',
    country: '이스라엘',
    doctrine: '참모본부 직할 정찰부대다. 적진 깊숙이 들어가 정보를 가져오는 것이 본래 임무이고 대테러는 그 위에 얹혔다.',
    statLink: '정보수집이 최상',
  },
  {
    name: '제2합동임무부대 JTF 2',
    country: '캐나다',
    doctrine: '대테러와 정밀 저격을 맡는다. 극한 거리 사격 기록으로 알려져 있다.',
    statLink: '조준이 최상',
  },
  {
    name: '카라비니에리 특수개입단 GIS',
    country: '이탈리아',
    doctrine: '헌병 소속 특수부대로 조직범죄 소탕에서 쌓은 건물 장악 경험이 두텁다. 베레타 계열을 쓴다.',
    statLink: '수비설계',
  },
];

/** 이름으로 고증 부대를 찾아 오퍼레이터 데이터에 연결합니다. */
const unit = (name: string): SpecialUnit => UNITS.find((candidate) => candidate.name === name)!;

export const OPERATORS: Operator[] = [
  new Operator('MAGPIE', unit('22 SAS 연대 CRW'), '공격', 'ENTRY', ['L119A2 카빈', '글록 17'], {
    name: '경첩 절단 산탄',
    description: '문 경첩만 노려 쏘아 문틀을 남기고 문짝만 떨군다.',
    effect: '진입 지점 하나를 소음 없이 여는 것이고 두 발 소지한다.',
  }, { aim: 74, entry: 92, informationGathering: 62, defensiveSetup: 40, clutch: 70 }),
  new Operator('COLLIER', unit('22 SAS 연대 CRW'), '공격', 'FIREPOWER', ['MP5SD', 'SIG P226'], {
    name: '소음 제압',
    description: '소음기 사양으로 교전해도 위치가 늦게 드러난다.',
    effect: '교전에서 이겨도 상대의 정보 획득이 절반만 오르는 것이다.',
  }, { aim: 88, entry: 74, informationGathering: 66, defensiveSetup: 44, clutch: 78 }),
  new Operator('해동', unit('제707특수임무단'), '공격', 'ENTRY', ['HK416', 'K5 권총'], {
    name: '인질 식별 광학',
    description: '열상과 가시광을 겹쳐 비전투원을 가려낸다.',
    effect: '인질 상황에서 아군 전체의 오인 사격을 없애는 것이다.',
  }, { aim: 80, entry: 82, informationGathering: 70, defensiveSetup: 56, clutch: 84 }),
  new Operator('ARBEL', unit('사이렛 매트칼'), '공격', 'SEARCH', ['타보르 X95', '글록 19'], {
    name: '벽면 청음 탐침',
    description: '벽에 대고 진동을 읽어 반대편 인원 수를 세며 소리를 내지 않는다.',
    effect: '수색 시간 1초당 정보를 1.4배로 모으는 것이고 발각 위험은 그대로다.',
  }, { aim: 70, entry: 66, informationGathering: 94, defensiveSetup: 48, clutch: 72 }),
  new Operator('AUBERT', unit('국가헌병대 개입부대 GIGN'), '공격', 'SEARCH', ['SIG MPX', 'MR73 리볼버'], {
    name: '저소음 관측 비행체',
    description: '날개를 접어 좁은 틈으로 들어가며 정지 비행 중에는 거의 들리지 않는다.',
    effect: '복귀하지 않고 원격으로 계속 관측하는 것이며 발각되면 기체만 잃는다.',
  }, { aim: 76, entry: 60, informationGathering: 88, defensiveSetup: 52, clutch: 68 }),
  new Operator('MEDVED', unit('연방보안국 알파 그룹'), '공격', 'ENTRY', ['AS Val 소음소총', 'SR-1 베크토르'], {
    name: '충격 파쇄봉',
    description: '벽체를 한 번에 무너뜨리는 지향성 파쇄 장약이다.',
    effect: '예정에 없던 진입 지점을 만드는 것이고 대신 큰 소리가 나 상대 전원이 방향을 안다.',
  }, { aim: 78, entry: 94, informationGathering: 48, defensiveSetup: 44, clutch: 80 }),
  new Operator('REUSS', unit('연방경찰 국경수비대 9조 GSG 9'), '수비', 'DEFENSIVE_SETUP', ['HK417', 'HK USP'], {
    name: '지향성 차단벽',
    description: '통로 한쪽에서만 열리는 접이식 방벽이다.',
    effect: '진입 지점 하나를 한 방향으로만 통하게 만드는 것이다.',
  }, { aim: 80, entry: 44, informationGathering: 64, defensiveSetup: 92, clutch: 66 }),
  new Operator('BRANDT', unit('연방경찰 국경수비대 9조 GSG 9'), '수비', 'FIREPOWER', ['PSG-1 정밀소총', '글록 17'], {
    name: '고정 관측 사선',
    description: '미리 정해 둔 사선에 총을 고정해 그 선을 지나는 것을 놓치지 않는다.',
    effect: '한 통로에서 조준이 크게 오르는 것이며 자리를 옮기면 사라진다.',
  }, { aim: 94, entry: 38, informationGathering: 60, defensiveSetup: 74, clutch: 62 }),
  new Operator('MARCHAND', unit('국가헌병대 개입부대 GIGN'), '수비', 'BLOCKING', ['FN P90', 'MR73 리볼버'], {
    name: '음향 탐지 그물',
    description: '바닥에 까는 진동 감지선을 밟으면 위치가 드러난다.',
    effect: '상대 선발조의 발각 위험을 1.6배로 올리는 것이다.',
  }, { aim: 78, entry: 50, informationGathering: 86, defensiveSetup: 80, clutch: 70 }),
  new Operator('HALLORAN', unit('제2합동임무부대 JTF 2'), '수비', 'BLOCKING', ['C14 팀버울프', 'SIG P226'], {
    name: '장거리 감시선',
    description: '건물 밖 먼 지점에서 접근로를 지켜본다.',
    effect: '상대 선발조의 접근을 미리 알리고 정보 획득을 30퍼센트 깎는 것이다.',
  }, { aim: 96, entry: 40, informationGathering: 78, defensiveSetup: 66, clutch: 64 }),
  new Operator('성곽', unit('제707특수임무단'), '수비', 'DEFENSIVE_SETUP', ['K1A 기관단총', 'K5 권총'], {
    name: '강화 격벽',
    description: '기존 벽에 덧대는 복합 장갑판으로 파쇄 장약을 한 번 견딘다.',
    effect: '벽 하나를 뚫을 수 없게 만드는 것이고 두 장 소지한다.',
  }, { aim: 74, entry: 46, informationGathering: 62, defensiveSetup: 90, clutch: 72 }),
  new Operator('SAVELLI', unit('카라비니에리 특수개입단 GIS'), '수비', 'DEFENSIVE_SETUP', ['베레타 ARX160', '베레타 92FS'], {
    name: '역방향 함정등',
    description: '문이 열리는 순간 안쪽에서 바깥으로 강한 빛을 쏜다.',
    effect: '그 문으로 들어오는 상대의 첫 교전 승률을 크게 낮추는 것이다.',
  }, { aim: 76, entry: 52, informationGathering: 66, defensiveSetup: 88, clutch: 68 }),
];

/** 콜사인으로 오퍼레이터를 찾습니다. */
export function getOperator(callSign: string): Operator | undefined {
  return OPERATORS.find((candidate) => candidate.callSign === callSign);
}