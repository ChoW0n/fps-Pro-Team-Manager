/** 제조사 확인 정보와 게임용 사격 제어 계수를 구분합니다. 실측 반동 재현값은 아닙니다. */
export interface WeaponHandling {
  family: 'carbine' | 'smg' | 'marksman' | 'bolt';
  caliber: string;
  cyclicRpm: number;
  velocity: number;
  damage: number;
  cone: number;
  kick: number;
  recovery: number;
  comfortableDistance: number;
  source?: string;
}
export const WORLD_UNITS_PER_METRE = 40;
const hk = 'https://www.heckler-koch.com/en/Products/Military%20and%20Law%20Enforcement/';
const carbine: WeaponHandling = {family:'carbine',caliber:'5.56×45',cyclicRpm:750,velocity:790,damage:32,cone:.012,kick:.022,recovery:.055,comfortableDistance:650};
const smg: WeaponHandling = {family:'smg',caliber:'9×19',cyclicRpm:800,velocity:320,damage:25,cone:.017,kick:.015,recovery:.065,comfortableDistance:400};
export const WEAPON_HANDLING: Record<string,WeaponHandling> = {
  'L119A2 카빈': {...carbine},
  'HK416': {...carbine,cyclicRpm:850,source:hk+'Assault%20rifles/HK416'},
  'MP5SD': {...smg,source:hk+'Submachine%20guns/MP5'},
  '타보르 X95': {...carbine,source:'https://iwi.net/iwi-x95/'},
  'SIG MPX': {...smg,source:'https://www.sigsauer.com/sig-mpx-pcc.html'},
  'AS Val 소음소총': {...carbine,caliber:'9×39',velocity:290,cone:.018,comfortableDistance:480},
  'HK417': {...carbine,family:'marksman',caliber:'7.62×51',cyclicRpm:600,velocity:730,damage:43,cone:.007,kick:.035,recovery:.045,comfortableDistance:900,source:hk+'Assault%20rifles/HK417'},
  'PSG-1 정밀소총': {...carbine,family:'marksman',caliber:'7.62×51',cyclicRpm:0,damage:55,cone:.005,kick:.045,recovery:.04,comfortableDistance:1100},
  'C14 팀버울프': {...carbine,family:'bolt',caliber:'.338 Lapua Magnum',cyclicRpm:0,velocity:820,damage:85,cone:.004,kick:.06,recovery:.035,comfortableDistance:1200},
  'FN P90': {...smg,caliber:'5.7×28',velocity:700,damage:26,cone:.013,comfortableDistance:550,source:'https://fnherstal.com/en/defence/portable-weapons/fn-p90/'},
  'K1A 기관단총': {...carbine},
  '베레타 ARX160': {...carbine},
};
/** 알려지지 않은 이름은 보수적인 카빈 제어 모델을 사용합니다. */
export function weaponHandling(name: string): WeaponHandling { return WEAPON_HANDLING[name] ?? carbine; }
/** 선수 조준·숙련과 멈춰 조준한 시간은 탄퍼짐과 잔여 반동을 줄입니다. */
export function shotCone(profile: WeaponHandling, control: number, recoil: number, settled: number, exposure=1, range=0): number {
  const skill=Math.max(0,Math.min(1,control));
  const base=profile.cone+(1-skill)*.047+recoil*(1-skill*.65)+Math.max(0,.45-settled)*.06+(1-exposure)*.016;
  // 유효 거리 밖의 작은 조준 오차를 연속적으로 확대합니다. AI 예상과 실제 탄도가 같은 식을 씁니다.
  const over=Math.max(0,range/profile.comfortableDistance-1);
  return Math.min(.45,base*(1+over*over*(profile.family==='smg'||profile.family==='carbine'?1.5:.35)));
}
/** 먼 거리에서는 방아쇠를 끊고 조준을 회복합니다. 발사 속도 상한은 별도로 지킵니다. */
export function shotInterval(profile: WeaponHandling, range: number, control: number, burst: number): number {
  if(profile.family==='bolt') return 1.3+(1-control)*.7;
  if(profile.family==='marksman') return .35+(1-control)*.25;
  const limit=range>profile.comfortableDistance?2:3;
  return burst%limit===0 ? .23+(1-control)*.24 : Math.max(.1,60/profile.cyclicRpm);
}

/** 기존 탄퍼짐으로 예상되는 표적 폭을 비교합니다. 승패나 실제 명중을 미리 뽑지 않습니다. */
export function estimatedShotQuality(range: number, cone: number, exposure: number): number {
  const spreadRadius = Math.max(1, Math.tan(Math.min(.5, cone)) * range);
  return Math.max(0, Math.min(1, (12 / spreadRadius) ** 2)) * exposure;
}
