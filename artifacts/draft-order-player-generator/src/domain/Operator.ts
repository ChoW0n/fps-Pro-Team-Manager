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
  aggression: number;
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
  }, { aim: 74, entry: 92, informationGathering: 62, defensiveSetup: 40, clutch: 70, aggression: 90 }),
  new Operator('COLLIER', unit('22 SAS 연대 CRW'), '공격', 'FIREPOWER', ['MP5SD', 'SIG P226'], {
    name: '소음 제압',
    description: '소음기 사양으로 교전해도 위치가 늦게 드러난다.',
    effect: '교전에서 이겨도 상대의 정보 획득이 절반만 오르는 것이다.',
  }, { aim: 88, entry: 74, informationGathering: 66, defensiveSetup: 44, clutch: 78, aggression: 68 }),
  new Operator('해동', unit('제707특수임무단'), '공격', 'ENTRY', ['HK416', 'K5 권총'], {
    name: '신호 차단 펄스',
    description: '6m 안의 활성 전자 신호를 감지하고 자기 위치에 EMP를 투척한다.',
    effect: '1회 사용. 7m 반경 내 아군·적군 전자장비를 벽 너머까지 8초 정지시킨다. 요격될 수 있으며 전력에 막힌 파쇄조의 요청을 받아 접근한다.',
  }, { aim: 80, entry: 82, informationGathering: 70, defensiveSetup: 56, clutch: 84, aggression: 74 }),
  new Operator('ARBEL', unit('사이렛 매트칼'), '공격', 'SEARCH', ['타보르 X95', '글록 19'], {
    name: '차폐 연막',
    description: '확인한 긴 사선 사이에 연막을 던지고 접근을 이어 간다.',
    effect: '연막은 양 팀의 관측을 막지만 총알을 막지 않는다. 실제 통로·사선을 활용해야 한다.',
  }, { aim: 70, entry: 66, informationGathering: 94, defensiveSetup: 48, clutch: 72, aggression: 56 }),
  new Operator('AUBERT', unit('국가헌병대 개입부대 GIGN'), '공격', 'SEARCH', ['SIG MPX', 'MR73 리볼버'], {
    name: '반향 표식',
    description: '외곽에 고정해 실내의 움직임과 설치음을 수집하는 소형 반사 표식이다.',
    effect: '1회 설치 후 최대 35초 운용. 범위 안에서 실제로 발생한 적 발소리·설치음의 당시 위치만 팀에 전달한다. 적의 현재 위치·신원은 알려주지 않으며 EMP·근거리 제거에 취약하다.',
  }, { aim: 76, entry: 60, informationGathering: 88, defensiveSetup: 52, clutch: 68, aggression: 48 }),
  new Operator('MEDVED', unit('연방보안국 알파 그룹'), '공격', 'ENTRY', ['AS Val 소음소총', 'SR-1 베크토르'], {
    name: '충격 파쇄봉',
    description: '벽체를 한 번에 무너뜨리는 지향성 파쇄 장약이다.',
    effect: '일반 벽은 2초, 보강된 연질 벽은 4초 장약 설치 후 통로를 연다. 1회 사용하며 소리 전파 범위의 상대에게 방향 단서가 남는다. 설치 중 동료 엄호가 필요하다.',
  }, { aim: 78, entry: 94, informationGathering: 48, defensiveSetup: 44, clutch: 80, aggression: 96 }),
  new Operator('REUSS', unit('연방경찰 국경수비대 9조 GSG 9'), '수비', 'DEFENSIVE_SETUP', ['HK417', 'HK USP'], {
    name: '지향성 차단벽',
    description: '통로 한쪽에서만 열리는 접이식 방벽이다.',
    effect: '진입 지점 하나를 한 방향으로만 통하게 만드는 것이다.',
  }, { aim: 80, entry: 44, informationGathering: 64, defensiveSetup: 92, clutch: 66, aggression: 34 }),
  new Operator('BRANDT', unit('연방경찰 국경수비대 9조 GSG 9'), '수비', 'FIREPOWER', ['PSG-1 정밀소총', '글록 17'], {
    name: '정밀 관측 조준경',
    description: '2.5배 집중 관측과 정밀소총으로 거점 지원 각을 유지한다.',
    effect: '조준경은 집중 인지 시간을 줄이지만 기동이 느려진다. 실외 순환 로머로 배정하지 않으며 실제 시야 없이 사격하지 않는다.',
  }, { aim: 94, entry: 38, informationGathering: 60, defensiveSetup: 74, clutch: 62, aggression: 28 }),
  new Operator('MARCHAND', unit('국가헌병대 개입부대 GIGN'), '수비', 'BLOCKING', ['FN P90', 'MR73 리볼버'], {
    name: '거점 관측 카메라',
    description: '현재 위치에 소형 카메라를 설치해 접근을 감시한다.',
    effect: '실제 시야·벽·연막을 검사한 위치만 팀에 보고한다. EMP에 정지하며 발견한 적이 가까이 접근하면 제거할 수 있다.',
  }, { aim: 78, entry: 50, informationGathering: 86, defensiveSetup: 80, clutch: 70, aggression: 38 }),
  new Operator('HALLORAN', unit('제2합동임무부대 JTF 2'), '수비', 'BLOCKING', ['C14 팀버울프', 'SIG P226'], {
    name: '중량 정밀 지원',
    description: '2.5배 집중 관측과 볼트액션 소총으로 팀의 재진입을 지원한다.',
    effect: '긴 사선에 적합하지만 발사 간격이 길고 기동이 느리다. 실외 순환 로머로 배정하지 않으며 적 정보 획득량에 고정 배율을 적용하지 않는다.',
  }, { aim: 96, entry: 40, informationGathering: 78, defensiveSetup: 66, clutch: 64, aggression: 24 }),
  new Operator('성곽', unit('제707특수임무단'), '수비', 'DEFENSIVE_SETUP', ['K1A 기관단총', 'K5 권총'], {
    name: '보강 전력 노드',
    description: '보강된 연질 벽의 실내 쪽에 전력 노드를 연결한다.',
    effect: '2초 설치. 연결 벽의 파쇄 장약을 정지시킨다. EMP로 8초 꺼지거나 근거리에서 제거되면 파쇄가 재개된다. 보강 자체는 공용 방어 준비에서 선택한다.',
  }, { aim: 74, entry: 46, informationGathering: 62, defensiveSetup: 90, clutch: 72, aggression: 31 }),
  new Operator('SAVELLI', unit('카라비니에리 특수개입단 GIS'), '수비', 'DEFENSIVE_SETUP', ['베레타 ARX160', '베레타 92FS'], {
    name: '근접 요격 센서',
    description: '현재 위치에 두 발 분량의 투척물 요격기를 설치한다.',
    effect: '2초 설치. 5.5m 안의 직접 보이는 적 연막탄·수류탄·EMP를 비행 중 두 번 요격한다. 이미 퍼진 연막은 지우지 않으며 EMP에 정지한다.',
  }, { aim: 76, entry: 52, informationGathering: 66, defensiveSetup: 88, clutch: 68, aggression: 42 }),
];

/** 콜사인으로 오퍼레이터를 찾습니다. */
export function getOperator(callSign: string): Operator | undefined {
  return OPERATORS.find((candidate) => candidate.callSign === callSign);
}
