# 레벨 디자인 규칙 + 층간 교전 통합 지시서

대상 저장소: `ChoW0n/fps-Pro-Team-Manager`
기준 커밋: `6fcded0`
근거: 실제 맵 데이터 측정 + 엔진 800경기 배치 실행 + 브라우저 실행 확인

이 문서는 두 작업을 하나로 합친 것이다. 층을 올리기 전에 맵을 줄여야 하기 때문이다.

---

## 0. 결론 — 순서가 중요하다

현재 맵은 **레식 한 층의 5~7배 넓이에, 최장 사선 61m**다. 이 상태에서 층만 올리면 넓은 공간이 두 배가 되어 문제가 커진다.

| 지표 | 현재 (실측) | 레식 기준 | 배율 |
|---|---|---|---|
| 최장 무차폐 사선 | **61.0m** | 25m 내외 | 2.4배 |
| 25m 초과 사선 비율 | **97%** (785/809 개통 쌍) | 10% 미만 | — |
| 방 한 변 | 13~19m | 4~8m | 2~3배 |
| 방 면적 | 156~238m² | 25~60m² | 3~4배 |
| 한 층 실내 면적 | 약 3,150m² | 400~700m² | 5~7배 |
| 중앙 통로 | 43m × 10m 단일 구간 | 3~12m 구간 | 4배 |
| 사이트 A 직결 출입구 | **1개** | 3개 이상 | — |
| 계단·해치 | **0** | 계단 2+ / 해치 사이트당 1+ | — |
| 스폰→사이트 거리 편차 | 18m ~ 60m (3.3배) | 편차 20% 이내 | — |

그래서 **단계 A(사선 절단·방 세분) → 단계 B(층 추가) → 단계 C(사이트 재배치)** 순서로 간다. 단계 A를 건너뛰면 단계 B의 버그와 밸런스 붕괴를 구분할 수 없다.

### 이 진단이 설명하는 기존 QA 항목

- **P1-14 "맵이 실내 공간으로 읽히지 않는다"** — 방이 3~4배 크고 칸막이가 없어서 격자표로 보인다
- **P2-16 "교전이 너무 치명적"(명중률 79~89%)** — 97%의 사선이 25m를 넘는데, 고배율 조준경 수비수(BRANDT 조준 94, HALLORAN 96)가 그 거리를 지배한다
- **P2-20 "다섯 명이 어깨를 맞대고 진입"** — 방이 커서 대형이 퍼질 이유가 없고, 진입구 하나만 좁다
- **P0-02 "공격 승률 24.2%"** — 사이트 A 직결 출입구가 1개뿐인 순수 깔때기
- **P2-18 "한 칸에서 사망 6.7%"** — 61m 사선의 한쪽 끝이 고정 수비 위치다

---

## 1. 레식형 레벨 디자인 규칙 12개

각 규칙에 **수치 목표 / 현재 위반 / 적용 방법**을 붙였다. 수치는 검증 스크립트(8장)로 측정한다.

### R1. 사이트는 인접한 두 방 한 쌍

목표 하나가 서로 통하는 방 두 개에 걸쳐 있다. 수비는 두 방을 동시에 지켜야 하고, 공격은 어느 쪽으로 들어갈지 고른다.

- **목표**: 사이트당 방 2개, 두 방 사이 직접 연결 1개 이상
- **현재**: 사이트 A·B 각각 방 하나. 설치 지점 2개가 같은 방 안에 있어 선택이 아니다
- **적용**: 단계 C. A는 `objective-a-hall` + `control-room` 쌍, B는 `objective-b-hall` + `south-service` 쌍으로 묶고 설치 지점을 각 방에 하나씩 둔다

### R2. 사이트당 진입구 3개 이상, 그중 하나는 연질 벽

기존 문·창문으로 2개, 공격이 직접 뚫어서 만드는 것 1개 이상. 수비가 모든 입구를 동시에 볼 수 없어야 한다.

- **목표**: 사이트 방당 기존 출입구 2개 + 연질 벽 2면 이상
- **현재**: **A는 직결 출입구 1개**(관제 A 연결문). B는 3개
- **적용**: 단계 A에서 A 홀에 출입구 1개 추가, 연질 벽 2면 지정

### R3. 연질/경질 벽 구분과 보강 자원 제한

연질 벽은 뚫린다. 수비는 보강으로 막지만 **보강 자원이 막아야 할 면보다 적어야** 선택이 생긴다. 이 부족이 레식 수비 기획의 핵심이다.

- **목표**: 사이트 주변 보강 필요 면 ≥ 보강 자원 × 1.5
- **현재**: 연질 23면 / 경질 12면. 비율 자체는 적절하나 보강 자원 개념이 없고 `defensePreparation`이 5번 선수 1명의 단일 선택이다
- **적용**: 팀 보강 자원을 정수(예: 6면)로 두고 준비 화면에서 배분하게 한다. MEDVED의 4초 관통 장약이 보강면을 뚫는 기존 규칙은 유지

### R4. 해치 — 수직 압박의 원천

사이트 천장 또는 바닥에 연질 해치가 최소 1개. 공격은 열어서 수직 각을 만들고, 수비는 보강으로 막는다.

- **목표**: 사이트당 해치 1개 이상. 해치는 연질(파쇄·보강 대상)
- **현재**: 0개
- **적용**: 단계 B에서 이동용 해치, 단계 C에서 사이트 천장 해치

### R5. 계단 2개 이상

한 팀이 모든 수직 접근을 봉쇄할 수 없어야 한다. 계단 하나뿐이면 그 앞이 유일한 요충지가 되어 라운드가 획일화된다.

- **목표**: 층 쌍마다 계단 2개 이상 + 해치 1개 이상 (총 3개 경로)
- **현재**: 0개
- **적용**: 단계 B에서 계단 2개 + 해치 1개

### R6. 회전로 2개 이상

수비가 외부 노출 없이 사이트↔사이트를 이동할 수 있어야 하고, 그 경로가 2개여야 한다. 하나면 끊기는 순간 라운드가 끝난다.

- **목표**: 사이트 간 실내 경로 2개 이상, 각 경로가 서로 다른 방을 지남
- **현재**: 중앙 아트리움이 유일한 간선이다. 여기가 끊기면 회전이 불가능하고, 43m 단일 구간이라 회전 중 전구간이 사선에 노출된다
- **적용**: 단계 A에서 남측 방들(`maintenance` → `south-service` → `objective-b-hall` → `loading-bay`)을 잇는 제2 회전로를 문으로 연결. 이미 내부문이 일부 있으니 빠진 연결만 추가

### R7. 사선 상한 25m

주 교전 거리 5~15m. 25m를 넘는 직선은 차폐물이나 꺾임으로 끊는다.

- **목표**: 최장 무차폐 사선 ≤ 25m (1000단위). 25m 초과 사선 쌍 비율 ≤ 10%
- **현재**: **61.0m** (520,1020 → 2960,1060). 초과 비율 **97%**
- **적용**: 단계 A의 핵심 작업. 5장 참조

### R8. 방 크기 한 변 4~8m

5명이 동시에 들어가면 좁게 느껴져야 한다. 넓은 방은 교전이 아니라 산책이 된다.

- **목표**: 실내 방 한 변 4~8m(160~320단위), 면적 25~60m². 사이트 방만 예외적으로 80m²까지
- **현재**: 13~19m, 156~238m²
- **적용**: 단계 A에서 기존 방을 칸막이로 2~4등분. 외곽 셸은 유지

### R9. 스폰 피크 방지와 거리 균등

스폰 위치에서 건물 내부로 사선이 통하면 안 된다. 진입구별 사이트 거리가 크게 다르면 진입구 선택이 사실상 고정된다.

- **목표**: 스폰 지점에서 건물 내부 실내 지점으로의 사선 0개. 진입구→사이트 거리 편차 20% 이내
- **현재**: 동쪽 서비스→A 20m vs 서문→A 60m (**3배**). 이것이 진입로 선택이 승률을 크게 흔드는 이유다
- **적용**: 단계 A에서 진입구 위치를 조정하거나 내부 경로 길이로 보정

### R10. 캠핑 불가 — 모든 각은 대응 가능

어떤 위치도 일방적으로 안전하면 안 된다. 모든 수비 위치는 연질 벽, 해치, 또는 다른 각에서 열려야 한다.

- **목표**: 모든 `defenderSetups` 위치가 연질 벽 2면 이내 또는 해치 사선 안
- **현재**: 수비 앵커가 고정되어 `2700,1260` 한 칸에서 전체 사망의 6.7%가 발생한다(120경기 786건 중 53건). 같은 위치가 매 라운드 반복된다
- **적용**: 단계 A에서 앵커마다 연질 벽 인접을 보장하고, 앵커 후보를 지금의 5개에서 8~10개로 늘려 라운드마다 달라지게 한다

### R11. 사전 정보 수집 경로

드론·카메라가 지나갈 저상 통로가 있어야 준비 단계가 의미를 갖는다.

- **목표**: 사이트당 드론 접근 경로 2개 이상, 그중 1개는 저상 통로
- **현재**: `portal-maintenance-hatch`(포복 통로) 1개뿐. AUBERT 드론은 지상 통로만 이동하고 닫힌 창문을 통과하지 못한다
- **적용**: 단계 A에서 저상 통로 2개 추가. 사람은 포복으로만, 드론은 자유롭게 통과

### R12. 콜아웃 — 짧고 고유한 방 이름

관전과 보고에서 위치를 말로 지목할 수 있어야 한다.

- **목표**: 방 이름 2~5자, 층 접두어 포함, 중복 없음
- **현재**: "설비 유지보수실", "B 냉각동 홀" 등 길다. 전술 보기에서 3.6px로 찍혀 읽히지도 않는다(P1-11)
- **적용**: 짧은 `callout` 필드를 별도로 두고 렌더는 그것을 쓴다. `label`은 기획용으로 유지

---

## 2. 통합 로드맵

| 단계 | 내용 | 맵 데이터 | 엔진 | 렌더 | 선행 조건 |
|---|---|---|---|---|---|
| **0** | P0-01 선발조 교착 수정 | — | 상수 1~2개 | — | 없음 |
| **A** | 사선 절단 · 방 세분 · 진입구 보강 | 큰 변경 | 없음 | 없음 | 0 완료 |
| **B** | 층 추가 · 계단 · 해치 · 층간 차단 | 2층 추가 | 중간 변경 | 중간 변경 | A 완료 |
| **C** | 사이트 쌍 구조 · 천장 해치 · 보강 자원 | 중간 변경 | 중간 변경 | 소 변경 | B 완료 |
| **D** | 층간 사격 (아트리움 보이드 한정) | 소 변경 | 소 변경 | 소 변경 | C 완료 |

**단계 0을 먼저 하는 이유**: 계단은 기존 문 통과 예약 큐(`reservations`)를 그대로 타는데 그 큐에 이미 교착 버그가 있다. 선발조 전원이 동일한 합류 좌표(`lane 0`)를 받고 도착 판정 24단위가 아군 최소 간격 26.4단위보다 작아 `regrouping → entering` 전환이 성립하지 않는다. 계단은 폭이 좁아 이 교착이 더 잘 난다. 순서를 바꾸면 "계단에서 멈춤"과 "선발조 교착"이 섞인다.

**단계 A가 순수 데이터 작업인 이유**: 엔진의 모든 기하 판정이 `map.walls` / `map.covers`만 참조한다. 벽과 엄폐물을 추가하는 것은 코드 변경이 아니다. 기존 14개 스위트가 그대로 돌아야 하고, 돌지 않으면 좌표가 통행을 막은 것이니 좌표를 고친다.

---

## 3. 단계 A — 사선 절단과 방 세분

### A-1. 61m 사선 끊기 (최우선)

사선 `(520,1020) → (2960,1060)`은 `central-atrium`(x 500~2220)과 `objective-a-hall`(x 2240~3000)을 관통한다. 아트리움을 세 구간으로 자른다.

```ts
// 아트리움 칸막이: 43m 단일 구간을 14m 세 구간으로 자른다. 문틈은 엇갈리게 배치해 직선 사선을 남기지 않는다.
wall('atrium-partition-west', p(1060, 1000), p(1060, 1180), 'interior'),
wall('atrium-partition-west-b', p(1060, 1300), p(1060, 1400), 'interior'),
// 문틈 x=1060, y 1180~1300 (아래쪽)
wall('atrium-partition-east', p(1620, 1000), p(1620, 1120), 'interior'),
wall('atrium-partition-east-b', p(1620, 1240), p(1620, 1400), 'interior'),
// 문틈 x=1620, y 1120~1240 (위쪽)
```

**문틈을 엇갈리게 두는 것이 핵심이다.** 같은 y에 정렬하면 벽을 세 개 세워도 직선 사선이 그대로 남는다.

아트리움 방 정의도 셋으로 쪼갠다.

```ts
{ id: 'atrium-west', label: '아트리움 서구역', callout: '서홀', rect: rect(500, 1000, 540, 400), kind: 'corridor', preferredEngagementDistance: 320 },
{ id: 'atrium-mid',  label: '아트리움 중앙',   callout: '중홀', rect: rect(1080, 1000, 520, 400), kind: 'corridor', preferredEngagementDistance: 320 },
{ id: 'atrium-east', label: '아트리움 동구역', callout: '동홀', rect: rect(1640, 1000, 580, 400), kind: 'corridor', preferredEngagementDistance: 360 },
```

아트리움↔A 홀 경계(x 2220~2240)에도 차폐를 넣어 관통을 막는다.

```ts
{ id: 'a-hall-gate-cover', label: 'A 홀 입구 차폐', rect: rect(2260, 1120, 70, 180), kind: 'partition' },
```

**완료 판정**: 검증 스크립트의 최장 사선이 25m(1000단위) 이하, 25m 초과 비율 10% 이하.

### A-2. 큰 방 세분

13~19m 방을 칸막이로 나눈다. 기존 방 하나를 두 개로 쪼개고 사이에 문틈 하나를 둔다. 적용 대상과 목표:

| 기존 방 | 현재 | 처리 |
|---|---|---|
| 관제 통제실 19×13m | 238m² | 2등분 → 각 9×13m, 문틈 1개 |
| 남쪽 적재장 19×13m | 238m² | 2등분 + 적재 상자 차폐 3개 |
| B 냉각동 홀 16×13m | 194m² | 사이트 방이므로 1개 유지, 차폐 4개 추가 |
| A 연구동 홀 19×10m | 190m² | 사이트 방이므로 1개 유지, 차폐 4개 + 출입구 1개 추가 |
| 북측 사무실 / 서버 실험실 / 유지보수실 / 남측 서비스실 각 14×13m | 175m² | 각 2등분, 문틈 1개 |
| 행정 로비 13×13m | 156m² | 유지 (진입 완충 구간) |

칸막이는 **전부 `breachable: true`(연질)로 둔다.** 새로 만든 벽을 경질로 두면 R3의 보강 긴장이 사라지고 통로만 줄어든다.

### A-3. 사이트 A 진입구 추가 (R2)

A 홀의 직결 출입구가 1개뿐이다. 두 개를 더 만든다.

```ts
// 적재장에서 A 홀로 올라오는 기존 문 (남쪽 접근)
{ id: 'portal-loading-a', label: 'A 홀 남문', callout: 'A남', center: p(2640, 1400), width: 80, axis: 'horizontal', fromRoom: 'loading-bay', toRoom: 'objective-a-hall' },
// 동쪽 중정에서 직접 (외부 진입 → A 최단 경로를 하나 더)
{ id: 'portal-east-a', label: 'A 홀 동문', callout: 'A동', center: p(3000, 1200), width: 80, axis: 'vertical', fromRoom: 'east-courtyard', toRoom: 'objective-a-hall' },
```

연질 벽 지정도 함께 한다. A 홀 북벽·서벽을 `breachable: true`로 두어 공격이 자기 입구를 만들 수 있게 한다.

### A-4. 제2 회전로 (R6)

남측 방들을 하나의 회전 간선으로 잇는다. 빠진 연결만 추가한다.

```ts
{ id: 'portal-maintenance-atrium-w', label: '유지보수 서문', center: p(620, 1400), width: 80, axis: 'horizontal', fromRoom: 'atrium-west', toRoom: 'maintenance' },
{ id: 'portal-loading-b', label: '적재장 서문', center: p(2240, 1640), width: 80, axis: 'vertical', fromRoom: 'objective-b-hall', toRoom: 'loading-bay' },
```

**완료 판정**: 사이트 A↔B 실내 경로가 2개 이상이고, 두 경로가 서로 다른 방을 지난다.

### A-5. 수비 앵커 확장 (R10)

`defenderSetups`를 5개에서 9개로 늘리고, 각 앵커가 연질 벽 2면 이내에 있도록 한다. 라운드마다 배치가 달라져 `2700,1260` 고정 킬 포인트가 사라진다.

### A-6. 저상 통로 추가 (R11)

```ts
{ id: 'portal-crawl-server', traversal: 'crawl', label: '서버 저상 통로', callout: '서버덕트', center: p(1920, 920), width: 70, axis: 'horizontal', fromRoom: 'server-lab', toRoom: 'atrium-east' },
{ id: 'portal-crawl-loading', traversal: 'crawl', label: '적재 저상 통로', callout: '적재덕트', center: p(2560, 1400), width: 70, axis: 'horizontal', fromRoom: 'loading-bay', toRoom: 'objective-a-hall' },
```

### A-7. 콜아웃 필드 (R12)

`TacticalRoom`에 `callout?: string`을 추가하고, 렌더는 `callout ?? label`을 쓴다. 2~5자.

---

## 4. 단계 B — 층간 교전

### B-0. 설계 핵심

세 문장이 전부다.

1. **층은 지도의 레이어다.** `TacticalMapDefinition`에 `floors`를 추가하고 각 층이 자기 `walls / covers / rooms / portals`를 갖는다. 좌표계(3600×2400)는 공유한다.
2. **기존 기하 함수는 건드리지 않는다.** `layer(map, floor)`가 그 층의 지오메트리를 담은 **`TacticalMapDefinition`과 같은 모양의 객체**를 반환한다. 호출부에서 인자만 바꾸면 `canStand` · `canTraverse` · `hasLineOfSight` · `findPath` · `visionPolygon` 내부는 한 줄도 수정하지 않는다.
3. **계단은 두 층 모두에서 설 수 있는 좌표다.** 통과하면 `unit.floor`가 바뀐다. 새 경로 탐색 시스템을 만들지 않는다.

`domain/` 8,815줄은 브라우저 의존과 외부 라이브러리 import가 **0건**이고 모든 기하 판정이 `(point, map)` 형태다. 그래서 이 치환이 통한다. `floors`가 없는 지도는 `layer()`가 자기 자신을 반환하므로 **기존 14개 스위트가 수정 없이 전부 통과해야 한다.** 이것이 회귀 안전장치다.

### B-1. 타입 추가 — `src/domain/tacticalMaps.ts`

```ts
/** 한 층의 지오메트리다. 좌표계는 지도 전체와 공유하고 층마다 벽·엄폐·방·포털만 갖는다. */
export interface TacticalFloor {
  index: number;            // 0 = 지상
  label: string;
  callout: string;          // 예: '1F', '2F'
  walls: TacticalWall[];
  covers: TacticalCover[];
  rooms: TacticalRoom[];
  portals: TacticalPortal[];
  searchPoints?: TacticalPoint[];
  defenderSetups?: DefenderSetup[];
  openings?: TacticalRect[];   // 단계 D에서 사용. 뚫린 공간
}

/** 층을 잇는 연결부다. center는 두 층 모두에서 설 수 있어야 한다. */
export interface TacticalStair {
  id: string;
  label: string;
  callout: string;
  kind: 'stair' | 'hatch';
  center: TacticalPoint;
  width: number;
  lowerFloor: number;
  upperFloor: number;
  oneWay?: 'down';
  breachable?: boolean;     // 해치는 연질. 단계 C에서 보강 대상
}
```

`TacticalMapDefinition`에 두 줄 추가한다. **기존 필드는 하나도 지우지 않는다.**

```ts
  floors?: TacticalFloor[];
  stairs?: TacticalStair[];
```

### B-2. 헬퍼 추가 — 같은 파일 하단

```ts
/** 해당 층의 지오메트리만 담은 지도 뷰를 반환한다. 층 정의가 없으면 원본을 그대로 쓴다. */
export function layer(map: TacticalMapDefinition, floor = 0): TacticalMapDefinition {
  const found = map.floors?.find(item => item.index === floor);
  if (!found) return map;
  return {
    ...map,
    walls: found.walls,
    covers: found.covers,
    rooms: found.rooms,
    portals: found.portals,
    searchPoints: found.searchPoints ?? map.searchPoints,
    defenderSetups: found.defenderSetups ?? map.defenderSetups,
  };
}

/** 한 층에서 사용할 수 있는 연결부만 반환한다. */
export function stairsOn(map: TacticalMapDefinition, floor: number): TacticalStair[] {
  return (map.stairs ?? []).filter(s => s.lowerFloor === floor || s.upperFloor === floor);
}
```

### B-3. 2층 데이터

단계 A로 방이 세분된 뒤라 2층도 레식 기준(한 변 4~8m)에 맞춰 작게 만든다. 아래 좌표는 단계 A 이후의 1층 방 좌표를 전제한다.

```ts
  floors: [
    // 1층은 기존 map 최상위 필드를 그대로 사용하므로 여기 정의하지 않는다.
    {
      index: 1, label: '2층 상부 사무동', callout: '2F',
      // 2층은 북측 사무동 위쪽과 아트리움 상부 캣워크만 존재한다. 1층 전체를 덮지 않는다.
      rooms: [
        { id: 'upper-office-w', label: '2층 서측 사무실', callout: '2서무', rect: rect(1040, 420, 280, 500), kind: 'room' },
        { id: 'upper-office-e', label: '2층 동측 사무실', callout: '2동무', rect: rect(1360, 420, 280, 500), kind: 'room' },
        { id: 'upper-lab',      label: '2층 실험동',     callout: '2실험', rect: rect(1680, 420, 520, 500), kind: 'room' },
        { id: 'upper-catwalk',  label: '2층 캣워크',     callout: '캣워크', rect: rect(1040, 920, 1180, 280), kind: 'corridor', preferredEngagementDistance: 320 },
      ],
      walls: [
        wall('upper-outer-north', p(1040, 420), p(2200, 420), 'outer'),
        wall('upper-outer-west',  p(1040, 420), p(1040, 1200), 'outer'),
        wall('upper-outer-east',  p(2200, 420), p(2200, 920), 'outer'),
        wall('upper-outer-east-c',p(2220, 920), p(2220, 1200), 'outer'),
        wall('upper-outer-south', p(1040, 1200), p(2220, 1200), 'outer'),
        // 내부 칸막이 — 전부 연질
        wall('upper-part-offices',  p(1340, 420), p(1340, 800), 'interior'),
        wall('upper-part-lab',      p(1660, 420), p(1660, 780), 'interior'),
        wall('upper-part-catwalk-w',p(1040, 920), p(1300, 920), 'interior'),
        wall('upper-part-catwalk-m',p(1420, 920), p(1780, 920), 'interior'),
        wall('upper-part-catwalk-e',p(1900, 920), p(2220, 920), 'interior'),
      ],
      covers: [
        { id: 'upper-desk-w',   label: '2층 서측 책상', rect: rect(1080, 560, 180, 60), kind: 'partition' },
        { id: 'upper-desk-e',   label: '2층 동측 책상', rect: rect(1400, 560, 180, 60), kind: 'partition' },
        { id: 'upper-rack',     label: '2층 실험 장비', rect: rect(1760, 520, 240, 70), kind: 'partition' },
        { id: 'upper-crate-mid',label: '캣워크 상자',   rect: rect(1520, 1020, 140, 70), kind: 'partition' },
        { id: 'upper-crate-e',  label: '캣워크 팔레트', rect: rect(1960, 1040, 120, 70), kind: 'partition' },
      ],
      portals: [
        { id: 'upper-portal-offices', label: '2층 사무실 연결문', callout: '2무문', center: p(1340, 870), width: 80, axis: 'vertical', fromRoom: 'upper-office-w', toRoom: 'upper-office-e' },
        { id: 'upper-portal-lab',     label: '2층 실험동문',     callout: '2실문', center: p(1660, 850), width: 80, axis: 'vertical', fromRoom: 'upper-office-e', toRoom: 'upper-lab' },
        { id: 'upper-portal-cat-w',   label: '2층 서측 캣워크문', callout: '캣서', center: p(1360, 920), width: 80, axis: 'horizontal', fromRoom: 'upper-office-e', toRoom: 'upper-catwalk' },
        { id: 'upper-portal-cat-e',   label: '2층 동측 캣워크문', callout: '캣동', center: p(1840, 920), width: 80, axis: 'horizontal', fromRoom: 'upper-lab', toRoom: 'upper-catwalk' },
      ],
      searchPoints: [p(1180, 700), p(1500, 700), p(1900, 650), p(1630, 1080)],
      defenderSetups: [
        { id: 'upper-catwalk-anchor', label: '캣워크 감시',   position: p(1700, 1080), fallback: p(1900, 700) },
        { id: 'upper-stair-w-watch',  label: '서측 계단 감시', position: p(1180, 820), fallback: p(1100, 560) },
        { id: 'upper-stair-e-watch',  label: '동측 계단 감시', position: p(1960, 780), fallback: p(2100, 620) },
      ],
    },
  ],
  stairs: [
    // 계단 좌표는 1층 방과 2층 방 양쪽 안에 있어야 한다. 아래 값은 그 조건을 만족한다.
    { id: 'stair-west', label: '서측 계단', callout: '서계단', kind: 'stair', center: p(1180, 670), width: 90, lowerFloor: 0, upperFloor: 1 },
    { id: 'stair-east', label: '동측 계단', callout: '동계단', kind: 'stair', center: p(1920, 670), width: 90, lowerFloor: 0, upperFloor: 1 },
    // 해치는 캣워크(2F, y920~1200)와 아트리움 동구역(1F, y1000~1400)이 겹치는 구간
    { id: 'hatch-atrium', label: '아트리움 해치', callout: '중해치', kind: 'hatch', center: p(1760, 1100), width: 70, lowerFloor: 0, upperFloor: 1, oneWay: 'down', breachable: true },
  ],
```

**좌표 검증 의무**: 세 연결부 모두 `canStand(center, layer(map, lowerFloor))`와 `canStand(center, layer(map, upperFloor))`가 **둘 다 true**여야 한다. 하나라도 false면 벽·엄폐 좌표를 조정한다(검사 T1).

R5를 만족한다 — 계단 2개 + 해치 1개로 수직 경로 3개다.

### B-4. 엔진 변경 — `TacticalRealtimeSimulation.ts`

**(a) 유닛 상태** — `RealtimeUnitState`(63행 부근)에 추가

```ts
  floor: number;   // 현재 층. 0 = 지상
```

유닛 생성부(286행 부근)에서 `floor: 0` 초기화. 2층 시작 수비수는 **1단계에서 5명 중 1명만**. 여러 명을 올리면 밸런스 변화와 버그를 구분할 수 없다.

**(b) 기하 호출부 인자 치환** — 기계적 작업이다. `map` → `layer(map, unit.floor)`

- `canStand(point, map)`
- `canTraverse(from, to, map)`
- `hasLineOfSight(from, to, map)` — 관측자 기준 층
- `targetExposure(from, to, map)`
- `traceShot(from, to, map)` — 사수 기준 층
- `findPath(start, goal, map, nodes)` — `nodes`도 그 층의 노드만
- `canSee` / `canObserve` 내부의 `map` 사용

**성능 주의**: 틱 시작 시 `const layers = new Map<number, TacticalMapDefinition>()`로 층별 뷰를 한 번만 만들어 재사용한다. 매 호출마다 `layer()`를 새로 만들면 객체 스프레드가 틱당 수백 번 발생한다. (참고: 현재 틱 계산은 중앙값 0.87ms / 100ms 예산이라 여유는 충분하지만 낭비할 이유가 없다.)

**(c) 층간 차단 — 세 곳에 한 줄씩**

```ts
// canObserve: 다른 층은 관측 대상이 아니다. (단계 D에서 opening 예외 추가)
if (target.floor !== unit.floor) return false;

// 사격 대상 선정
.filter(target => target.floor === unit.floor)

// 총알 충돌 판정 (477행, 1159행 부근)
&& target.floor === bullet.floor
```

`Bullet`에 `floor: number` 추가, 발사 시 사수의 층을 넣는다.

**(d) 가젯 층 귀속**

`RealtimeGadget`에 `floor: number` 추가. 연막·수류탄·카메라·드론·전력 노드·요격기 전부 설치한 유닛의 층을 갖고 **같은 층에만** 반경을 적용한다. 폭탄 장치는 단계 B에서 전부 1층이므로 `floor: 0` 고정.

**(e) 계단 통과** — 기존 traversal 블록(1603행 부근) **바로 뒤에 별도 블록으로 추가**한다. 창문·틀·포복 처리는 수정하지 않는다.

```ts
// 계단·해치는 양 층에서 설 수 있는 좌표를 지나며 층을 바꾼다. 통과 중에는 사격하지 않는다.
const stair = stairsOn(map, unit.floor).find(item =>
  distance(unit.position, item.center) < 55
  && pointToSegmentDistance(item.center, unit.position, waypoint) < item.width / 2);
if (stair) {
  const target = unit.floor === stair.lowerFloor ? stair.upperFloor : stair.lowerFloor;
  // 해치는 내려가는 방향만 허용한다.
  const allowed = !(stair.oneWay === 'down' && target > unit.floor);
  if (allowed && unit.traversal?.portalId !== stair.id) {
    unit.traversal = { portalId: stair.id, kind: stair.kind, until: now + STAIR_SECONDS[stair.kind] };
    log({ time: now, type: 'action', actor: unit.id, side: unit.side, position: { ...unit.position },
      goal: 'traversal:' + stair.kind,
      message: stair.kind === 'hatch' ? `${stair.callout} 하강` : `${stair.callout} ${target > unit.floor ? '상행' : '하행'}` });
  }
  if (allowed) {
    if (now < unit.traversal!.until) { unit.action = 'utility'; unit.velocity = { x: 0, y: 0 }; return; }
    if (unit.floor !== target) {
      unit.floor = target;
      log({ time: now, type: 'action', actor: unit.id, side: unit.side, position: { ...unit.position },
        goal: 'floor-changed', message: `${stair.callout} 통과 · ${target + 1}층` });
    }
  }
}
```

`traversal.kind` 유니온에 `'stair' | 'hatch'` 추가. 통과 시간은 **조정용 상수 한 곳에 모은다.**

```ts
// 조정용 상수 — 실측 밸런스에 따라 반드시 바뀐다.
const STAIR_SECONDS = { stair: 1.6, hatch: 1.1 } as const;
const CROSS_FLOOR_SOUND_SCALE = 0.55;   // 인접 층 소리 전달 배율
```

**(f) 층간 경로** — 전체 층 A\*를 만들지 않는다. 두 구간으로 나눈다.

```ts
/** 목표 층이 다르면 자기 층에서 가장 가까운 연결부를 중간 목표로 삼는다. */
function crossFloorGoal(unit, goal, goalFloor, map) {
  if (unit.floor === goalFloor) return goal;
  const options = stairsOn(map, unit.floor)
    .filter(s => (s.lowerFloor === goalFloor || s.upperFloor === goalFloor)
      && !(s.oneWay === 'down' && goalFloor > unit.floor));
  if (!options.length) return undefined;   // 도달 불가면 현재 임무를 유지한다
  return options.sort((a, b) => distance(unit.position, a.center) - distance(unit.position, b.center))[0].center;
}
// ponytail: 2층 전용 2구간 경로. 3층 이상이면 연결부 그래프 BFS로 교체.
```

**(g) 소리** — `sound` 이벤트는 인접 층(±1)에 범위 `CROSS_FLOOR_SOUND_SCALE`배로 전달한다. 2층 이상 차이는 전달하지 않는다. 시야를 열지 않고 위층 적의 존재를 알리는 유일한 수단이며, 레식의 발소리 정보에 해당한다.

### B-5. `spectatorView.ts`

- `visionPolygon(unit, map, smokes)` 호출부에서 `layer(map, unit.floor)`를 넘긴다. 내부는 수정하지 않는다.
- 연막 필터에 `gadget.floor === unit.floor` 추가.
- **P1-13 같이 고칠 것**: 광선 25개 균등 분할 때문에 시야 폴리곤이 벽을 3.0% 새어나간다(측정: 내부 표본 915,207점 중 27,816점, 30/30경기). 2층 캣워크는 좁아서 이 누출이 훨씬 눈에 띈다. 각 벽 끝점 각도(±0.0001rad)를 광선 목록에 추가하고 각도순 정렬하면 해결된다. 같은 파일이라 함께 처리하는 것이 싸다.

### B-6. 렌더 — `BroadcastCanvas.tsx`

- 관전 층 상태 `viewFloor` 추가. 기본값은 선택 선수의 층이고 선수가 층을 바꾸면 자동 전환.
- **정적 지형 캐시 키에 `viewFloor`를 포함한다.** 현재 키는 `map.id + breaches + fortifications`뿐이라 층을 바꿔도 캐시가 갱신되지 않는다.
- `paintBattleMap(ctx, map)` → `paintBattleMap(ctx, layer(map, viewFloor))`
- 유닛·가젯·장치를 `floor === viewFloor`로 필터.
- **아래층 윤곽**: 2층을 볼 때 1층 벽을 `globalAlpha 0.18`로 먼저 깔아 공간 관계를 보이게 한다. **유닛은 그리지 않는다**(정보 누출).
- 계단·해치 표식: 계단은 사다리꼴 3단, 해치는 원 안에 하강 화살표.
- **P1-11 같이 고칠 것**: `ctx.font = '10px sans-serif'`가 월드 단위로 해석되어 전술 보기(배율 0.355)에서 3.6px이 된다. 층 라벨을 추가하면 바로 드러난다. `fontSize / scale` 방식으로 바꾸고 콜아웃(R12)을 함께 적용한다.

### B-7. HUD — `TacticalRoundLive.tsx`

- 현재 층 표시(`1F / 2F` 토글), 활성 층 강조.
- 선수 카드에 층 배지. 2층 선수를 즉시 구분할 수 있어야 한다.
- 전술 보기에서 층 탭 수동 전환 허용. 단 **보이는 정보는 바뀌지 않는다** — 우리 팀 개인 시야로 확인된 것만 표시하는 원칙 유지.
- **P1-10 주의**: 전술 보기 뷰포트가 여유 없이 지도 전체를 반환해 상단 스코어보드가 월드 y 0~186을 덮는다. 층 탭을 상단에 두면 가려지는 영역이 더 늘어난다. **탭은 하단이나 측면에 둔다.**

### B-8. 층 사이를 넘어가는 것 / 넘어가지 않는 것

| 항목 | 단계 B | 단계 D |
|---|---|---|
| 시야 | ✗ | opening 안에서만 위→아래 |
| 사격·탄도 | ✗ | opening 안에서만 위→아래 |
| 소리 | △ 인접 층 0.55배 | 동일 |
| 팀 보고 | ○ 층 정보 포함 | 동일 |
| 연막·수류탄·EMP 반경 | ✗ | ✗ |
| 카메라·드론 관측 | ✗ | opening 안에서만 |
| 이동 | ○ 계단·해치만 | 동일 |
| 파쇄 장약 | ✗ 벽만 | 해치 보강 파쇄 추가 |
| 폭탄 사이트 | 전부 1층 | 단계 C에서 재배치 |
| 소생 | ○ 같은 층만 | 동일 |

---

## 5. 단계 C — 사이트 쌍 구조와 보강 자원

단계 B가 안정된 뒤에 한다.

### C-1. 사이트를 방 쌍으로 (R1)

```
A 사이트: objective-a-hall + control-room   (1층, 연결문 portal-control-a 유지)
B 사이트: objective-b-hall + south-service  (1층, 연결문 portal-service-b 유지)
```

`TacticalSite`에 `roomIds: string[]`를 추가하고 `plantAnchors`를 각 방에 하나씩 배치한다. 공격은 어느 방에 설치할지 고르고, 수비는 두 방을 동시에 지켜야 한다.

### C-2. 사이트 천장 해치 (R4)

A·B 사이트 천장에 각각 연질 해치를 둔다. 2층에서 해치를 열면 사이트로 수직 각이 생긴다(사격은 단계 D). 수비는 보강으로 막는다.

이 시점에 2층 영역을 사이트 위쪽까지 확장해야 한다. 단계 B의 2층은 북측 사무동과 캣워크만 덮으므로, A 사이트(x 2240~3000) 위쪽 방을 추가한다.

### C-3. 보강 자원 (R3)

- 팀 보강 자원을 정수로 둔다. 시작값 **6면**
- 준비 화면에서 보강할 면을 고른다. 현재 `defensePreparation`의 5번 선수 단일 선택을 팀 배분으로 바꾼다
- 보강 필요 면(사이트 인접 연질 벽 + 천장 해치)이 **자원의 1.5배 이상**이어야 선택이 의미를 갖는다. 측정해서 조정한다
- MEDVED의 4초 관통 장약이 보강면을 뚫는 기존 규칙, 성곽의 전력 노드가 파쇄를 멈추는 기존 규칙은 유지

**P2-15 선행 조건**: MEDVED는 480경기 중 5%만 등장한다(`PlayerGenerator.ts:49`의 `basics` 표가 역할별 열 명을 고정 지급하고 편성 정렬이 역할 일치를 우선해서 표 밖의 MEDVED·SAVELLI가 밀린다). 보강 자원을 넣기 전에 이걸 고쳐야 한다. 안 고치면 보강을 뚫을 수단이 게임에 없는 상태로 수비만 강해진다.

---

## 6. 단계 D — 층간 사격 (아트리움 보이드 한정)

`TacticalFloor.openings`를 쓴다. 뚫린 공간이다.

```ts
// 2층 캣워크에서 1층 아트리움 동구역이 내려다보이는 구간
openings: [rect(1640, 960, 560, 200)],
```

규칙은 네 줄이다.

```
층간 관측·사격 허용 조건 (전부 만족)
1. 층 차이가 정확히 1
2. 사수와 대상의 (x, y)가 둘 다 같은 opening 사각형 안
3. 두 점 사이가 각자의 층에서 opening 경계까지 벽에 막히지 않음
4. 위→아래만 허용
```

기존 2D 기하를 그대로 쓰고 3차원 계산이 없다. **명중률·피해 보정은 넣지 않는다** — 각도 이점은 위치 자체가 주는 것이고, 임의 배율은 채택하지 않은 방식이다.

이후 후보: 아래→위 사격, 계단 사선 교전, 지하층, 사이트 2층 이전.

---

## 7. 검증 도구 — `tests/level-design-audit.cjs`

규칙을 눈으로 판단하지 않고 수치로 판정한다. 아래를 그대로 만든다. 층 인자를 받아 각 층을 따로 측정한다.

```js
// 레벨 디자인 규칙을 수치로 측정한다. 합격/불합격 판정이 아니라 현재값 보고다.
const fs=require('node:fs'), ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText,f);
const R='../artifacts/draft-order-player-generator/src/domain/';
const {BREACHLINE_MAP, layer}=require(R+'tacticalMaps.ts');
const U=40;                       // 1m = 40 월드 단위
const FLOOR=Number(process.argv[2]??0);
const M=layer(BREACHLINE_MAP, FLOOR);

// 벽과 엄폐물을 하나의 선분 집합으로 모은다.
const segs=M.walls.filter(w=>w.kind!=='door-gap').map(w=>[w.from,w.to]);
for(const c of M.covers){const r=c.rect,p=[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},
  {x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}];
  p.forEach((q,i)=>segs.push([q,p[(i+1)%4]]));}

/** 두 점 사이에 벽·엄폐물이 있는지 검사한다. */
const blocked=(a,b)=>{for(const[p,q]of segs){
  const r={x:b.x-a.x,y:b.y-a.y},s={x:q.x-p.x,y:q.y-p.y},d=r.x*s.y-r.y*s.x;
  if(Math.abs(d)<1e-9)continue;
  const t=((p.x-a.x)*s.y-(p.y-a.y)*s.x)/d,u=((p.x-a.x)*r.y-(p.y-a.y)*r.x)/d;
  if(t>1e-6&&t<1-1e-6&&u>=0&&u<=1)return true;}return false;};

/** 실내에서 설 수 있는 지점인지 간이 판정한다. */
const stand=pt=>M.rooms.some(r=>r.kind!=='yard'
    &&pt.x>r.rect.x+14&&pt.x<r.rect.x+r.rect.width-14
    &&pt.y>r.rect.y+14&&pt.y<r.rect.y+r.rect.height-14)
  && !M.covers.some(c=>pt.x>c.rect.x-12&&pt.x<c.rect.x+c.rect.width+12
    &&pt.y>c.rect.y-12&&pt.y<c.rect.y+c.rect.height+12);

const pts=[];
for(let x=40;x<M.width;x+=40)for(let y=40;y<M.height;y+=40){const pt={x,y};if(stand(pt))pts.push(pt);}

// R7 사선 상한
let longest=0,pair=null,over=0,open=0;
for(let i=0;i<pts.length;i+=3)for(let j=i+3;j<pts.length;j+=7){
  const a=pts[i],b=pts[j],d=Math.hypot(a.x-b.x,a.y-b.y);
  if(blocked(a,b))continue;
  open++; if(d>25*U)over++;
  if(d>longest){longest=d;pair=[a,b];}}

console.log(`[층 ${FLOOR}] 실내 표본 ${pts.length}지점 / 실내 면적 약 ${(pts.length*40*40/U/U).toFixed(0)}m²`);
console.log(`R7 최장 사선 ${(longest/U).toFixed(1)}m (목표 ≤25m)`,
  pair?`${Math.round(pair[0].x)},${Math.round(pair[0].y)} → ${Math.round(pair[1].x)},${Math.round(pair[1].y)}`:'');
console.log(`R7 25m 초과 비율 ${(100*over/Math.max(1,open)).toFixed(1)}% (목표 ≤10%)`);

// R8 방 크기
const bad=M.rooms.filter(r=>r.kind!=='yard'&&(r.rect.width>8*U||r.rect.height>8*U));
console.log(`R8 한 변 8m 초과 방 ${bad.length}개:`, bad.map(r=>`${r.callout??r.label}(${(r.rect.width/U).toFixed(0)}×${(r.rect.height/U).toFixed(0)}m)`).join(' '));

// R2 사이트 진입구
for(const s of BREACHLINE_MAP.sites){
  const ids=s.roomIds??[s.roomId];
  const ports=M.portals.filter(p=>ids.includes(p.fromRoom)||ids.includes(p.toRoom));
  const soft=M.walls.filter(w=>w.breachable&&ids.some(id=>{
    const r=M.rooms.find(x=>x.id===id); if(!r)return false;
    const inside=pt=>pt.x>=r.rect.x-30&&pt.x<=r.rect.x+r.rect.width+30
      &&pt.y>=r.rect.y-30&&pt.y<=r.rect.y+r.rect.height+30;
    return inside(w.from)||inside(w.to);}));
  console.log(`R2 사이트 ${s.id}: 출입구 ${ports.length}개(목표 ≥3) / 인접 연질 벽 ${soft.length}면(목표 ≥2)`);
}

// R5 수직 경로
const st=BREACHLINE_MAP.stairs??[];
console.log(`R5 수직 경로 ${st.length}개 — 계단 ${st.filter(s=>s.kind==='stair').length} / 해치 ${st.filter(s=>s.kind==='hatch').length} (목표 계단 ≥2, 해치 ≥1)`);

// R9 스폰 거리 편차
const ds=BREACHLINE_MAP.entrances.flatMap(e=>BREACHLINE_MAP.sites
  .map(s=>Math.hypot(e.outside.x-s.center.x,e.outside.y-s.center.y)/U));
console.log(`R9 진입구→사이트 거리 ${Math.min(...ds).toFixed(0)}~${Math.max(...ds).toFixed(0)}m, 편차 ${(Math.max(...ds)/Math.min(...ds)).toFixed(1)}배 (목표 ≤1.2배)`);
```

실행: `node tests/level-design-audit.cjs 0` / `node tests/level-design-audit.cjs 1`

**현재값(기준 커밋 측정)**: 최장 사선 61.0m, 25m 초과 97%, 8m 초과 방 12개, 사이트 A 출입구 1개, 수직 경로 0개, 스폰 거리 편차 3.3배. 단계 A 완료 시 앞의 셋이, 단계 B 완료 시 수직 경로가 목표를 만족해야 한다.

---

## 8. 추가할 검사 — `tests/vertical-combat.cjs`

기존 스위트와 같은 방식(TypeScript transpile + 실제 엔진 실행)을 쓴다.

- **T1 연결부 좌표 유효성** — 모든 `stairs.center`가 `lowerFloor`와 `upperFloor` 양쪽에서 `canStand` true
- **T2 층간 차단** — 같은 좌표 부근에 층만 다르게 놓은 두 유닛이 서로 `canObserve` false이고, 발사해도 명중 사건 0건
- **T3 계단 통과** — `floor-changed` 사건이 발생하고, 통과 중(`unit.traversal` 유효) 사격 사건 0건, 완료 후 `unit.floor`가 목표 층
- **T4 층 건너뛰기 없음** — 모든 스냅샷에서 유닛 위치가 자기 층의 `canStand` true 지점이고, 층 변경은 항상 연결부 반경 안에서만 발생
- **T5 해치 단방향** — `oneWay: 'down'` 해치로 올라가는 층 변경 0건
- **T6 결정론** — 같은 시드에서 `run()`과 `createSession()`의 사건·스냅샷·결과 동일 (층 변경 포함)
- **T7 도달성** — 2층 시작 수비수가 사이트 방어 위치로 내려올 수 있고, 공격수가 2층 경유로 아트리움 도달 가능
- **T8 회귀** — `floors` 없는 지도에서 기존 14개 스위트 결과가 이전과 동일
- **T9 회전로 (R6)** — 사이트 A↔B 실내 경로 2개 이상이고 서로 다른 방을 지남
- **T10 밸런스 기록** — 단계별로 동일 조건 배치 실행의 공수 승률을 기록. **측정 조건에 `scoutPlan`을 반드시 포함할 것.** `docs/PROJECT_STATE.md`의 "48경기 공격 37승"은 `scoutPlan` 없는 경로를 측정한 값이라 실제 UI가 타는 경로와 다르다

T4와 T6이 가장 중요하다. 층 시스템의 전형적인 버그는 "좌표는 맞는데 층이 틀린 유닛"과 "관전과 비관전의 층이 갈리는 것"이다.

---

## 9. 하지 않는 것

이 목록의 항목을 임의로 구현하지 말 것. 구현하면 리뷰에서 되돌린다.

**단계 B에서 금지**
- 층 사이 관통 사격, 위층에서 아래층 내려다보기 (단계 D)
- 3차원 탄도, 수직 조준각
- 같은 층 안의 높낮이(경사·단차)
- 층 차이 피해 배율·명중률 보정 (단계 D에서도 금지)
- 층을 넘나드는 연막·EMP·수류탄 반경
- 파쇄 장약으로 바닥 뚫기 (단계 C에서 해치 한정으로만)
- 엘리베이터, 로프, 낙하 피해

**전 단계 금지**
- 층 시스템을 "확장 가능한 플러그인"으로 추상화 — 구현이 하나뿐인 인터페이스를 만들지 않는다
- 기하 판정을 층용으로 새로 작성 — `layer()`로 기존 함수를 재사용한다
- 3층 이상, 지하층 (규칙과 검사가 2층에서 검증된 뒤)
- 새 라이브러리 추가 — 이 작업에 필요한 것은 전부 이미 있다
- 스택·설계 임의 변경 — TypeScript · Canvas 2D · 10Hz 틱 구조 유지
- 결과 보정, AI 수치 임의 변경, 승패 배율 추가

---

## 10. 구현 제약

`replit.md`의 작업 규칙을 따른다. 이 작업에서 위반하기 쉬운 항목만 다시 적는다.

- 요청받지 않은 기능·파일·설정을 만들지 않는다. 9장 목록을 구현하지 않는다.
- 같은 로직을 두 번 구현하지 않는다. 새 코드를 쓰기 전에 이미 있는 함수를 먼저 찾는다.
- 파일 수를 최소로 유지한다. 데이터 클래스와 로직 클래스의 책임 분리는 유지한다.
- 영리한 코드보다 지루하고 읽기 쉬운 코드를 택한다.
- 모든 코드에 한글 주석을 달고 클래스·생성자·메서드마다 짧은 설명을 붙인다.
- 의도적으로 단순하게 처리해 한계가 생긴 부분에는 그 한계와 개선 방향을 한글 주석으로 남긴다.
- 필요한 패키지나 도구가 없으면 먼저 설치를 시도한다. 실제로 설치를 시도했다가 실패한 경우에만 사유와 함께 보고하고 멈춘다.
- 검증·실제 적용·플레이 확인을 구분해 보고한다. 타입 검사나 빌드 통과를 플레이 확인으로 쓰지 않는다.

---

## 11. 단계별 완료 보고에 포함할 것

- 변경한 파일과 함수 목록
- `level-design-audit.cjs` 각 층 실행 결과 (단계 A·B·C 각각)
- T1~T10 실행 결과
- 기존 14개 스위트 재실행 결과
- 실제 브라우저 화면 (단계 A: 방 구조가 실내로 읽히는지 / 단계 B: 2층 이동)
- 단계 전후 동일 조건 공수 승률 (`scoutPlan` 포함 조건)
- 조정용 상수의 현재 값 (`STAIR_SECONDS`, `CROSS_FLOOR_SOUND_SCALE`, 보강 자원 수)
- 남긴 `ponytail:` 주석 목록
