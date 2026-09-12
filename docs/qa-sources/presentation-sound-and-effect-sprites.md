# 연출·캐릭터 QA + 이펙트 스프라이트 제작 설명서 + 사운드 도입안

대상: `ChoW0n/fps-Pro-Team-Manager` `319c199`
검증: 엔진 20경기 배치 실행으로 사건·상태 분포 측정, 렌더·아트 파이프라인 코드 추적, 브라우저 실행 확인
저장소는 읽기만 했다.

이 문서는 세 가지를 하나로 합친 것이다. 연출이 부족한 원인(1·2부), 그 원인을 스프라이트로 메우는 제작 절차(3부), 사운드 도입(4부).

---

## 0. 왜 밋밋한지 — 두 숫자

```
한 경기에서 발생하는 사건        약 2,900회
그중 화면에 표현되는 사건         84회 (2.9%)

관전 화면에서 캐릭터가 완전히 정지한 시간   39.7%
```

연출이 부족한 게 아니라 **이미 일어나고 있는 일의 97%를 화면이 버리고 있다.** 엔진은 초당 28개의 사건을 뱉는데 렌더러는 세 종류만 그린다.

그래서 3부의 스프라이트 작업은 "새 연출을 발명하는 것"이 아니라 **이미 있는 사건에 그림을 붙이는 것**이다. 붙일 자리가 이미 코드에 있다.

---

# 1부. 연출 QA

## 1-1. 사건별 표현 현황 `[측정]` `[코드]`

20경기 평균, 경기당 횟수.

| 사건 | 횟수/경기 | 현재 화면 표현 | 3부에서 붙일 스프라이트 |
|---|---|---|---|
| `sound` | **2,306.2** | 없음 | — (4부 사운드) |
| `action` | **443.3** | 없음 | — (판단 티커) |
| `intel` | **70.6** | 없음 | — |
| `shot` | 38.0 | 궤적선 (1.5px, 0.1초) | **총구 화염** |
| `impact` | 38.0 | 링 + 5가시 (0.28초) | **혈흔 / 탄착 먼지** |
| `utility` | 8.4 | 폭발원 + 파편 | **폭발 / 파쇄 잔해** |
| `death` | **7.0** | 없음 | **쓰러진 몸 + 혈흔 잔상** |
| `objective` | **5.5** | 없음 | **설치 장치** |
| `downed` | **5.0** | 없음 | — (코드 연출) |
| `revive` | **0.9** | 없음 | — (코드 연출) |
| `reload` | **0.4** | 없음 | — |

`BroadcastCanvas.tsx`의 사건 렌더링은 `shot` · `impact` · `utility(grenade-exploded/wall-breached)` 세 분기가 전부다.

**가장 큰 구멍은 사망이다.** 경기당 7명이 죽는데 몸이 반투명해지는 것(`globalAlpha = .4`)이 전부다. 라운드의 결정적 순간에 아무 일도 일어나지 않는다. 설치·해체(5.5회)도 같다.

## 1-2. 캐릭터가 40%의 시간 동안 정지해 있다 `[측정]` `[코드]`

| action | 비율 | 시각 표현 |
|---|---|---|
| `approach` | 41.1% | 다리 stride (sin) |
| **`hold`** | **39.7%** | **없음 — 완전 정지** |
| `reposition` | 4.5% | stride |
| `search` | 3.6% | 없음 |
| `aim` | **3.4%** | **없음** |
| `downed` | 3.1% | 회전 + 표식 |
| `fire` | 1.3% | 반동 kick 0.14초 |
| `plant` | 1.1% | 손 접근 |
| `revive` | 0.8% | 없음 |
| `disable` | 0.8% | 손 접근 |
| `utility` | 0.4% | 투척 팔 |
| `reload` | 0.1% | 손 접근 |

`minimalOperator.ts`의 애니메이션은 사실상 한 줄이다.

```ts
const step = !reducedMotion && moving && !down ? Math.sin(time*(unit.locomotion==='sprint'?15:10)) : 0;
```

**움직일 때만 다리가 움직인다.** `moving` 조건이 `|velocity| > 1`이므로 멈춘 캐릭터는 완전한 정물이 된다.

locomotion도 5종 중 2종만 구분된다.

| locomotion | 비율 | 표현 |
|---|---|---|
| `walk` | 66.8% | stride 속도 10 |
| `crouch` | 18.5% | 뒤 오프셋 −17 |
| `sprint` | 9.5% | stride 속도 15 |
| `crawl` | **4.1%** | **walk와 동일** |
| `vault` | **1.1%** | **walk와 동일** |

## 1-3. 카메라가 거의 가만히 있다 `[코드]`

```ts
const blast = ... (event.goal==='grenade-exploded' || event.goal==='wall-breached')
const shake = blast ? (1 - blastAge/.38) * Math.min(7, scale*5) : 0;
```

**수류탄과 파쇄에만 흔들림이 있다.** 경기당 8.4회다. 사격 38회, 사망 7회, 설치 5.5회에는 반응하지 않는다. 컷도 없고 라운드 시작·종료 시퀀스도 없다.

## 1-4. 모든 것이 같은 명도다 `[화면]`

- 지형·캐릭터·가젯이 전부 중간 명도의 회색-청록 계열이다. 눈이 어디를 봐야 할지 정하지 못한다
- 정적 지형 캐시를 `globalAlpha = .86`으로 덮어 지면이 더 흐려진다
- 사망·피격·설치가 색으로 구분되지 않는다
- 진영 색은 2×4단위 점 하나 (이전 QA P1-06)

## 1-5. 이미 있는데 안 쓰는 재료 `[측정]`

엔진이 주는데 화면이 버리는 정보들이다. 새로 만들 것이 없다.

| 재료 | 양 | 쓸 곳 |
|---|---|---|
| `unit.goal` 문자열 | 경기당 443회 변경 | 하단 판단 티커. "장거리 사선 불리 · 엄폐 우회" 같은 판단이 이미 한글로 나온다 |
| `unit.suppression` | 매 틱 | 압박 중 화면 떨림 |
| `unit.tacticalWarning` | 경기당 8회 | 경고 연출 |
| **`impactHeight` / `hitRegion`** | 피격마다 | **헤드샷 전용 혈흔 스프라이트** |
| `engagements[]` | 라운드마다 | 1대1 대결 하이라이트 |
| `sound` 사건 | 2,306회 | 4부 |

---

# 2부. 코드로 해결하는 연출 (스프라이트 불필요)

3부보다 먼저 하는 게 좋은 것들이다. 그림이 필요 없다.

## 2-1. 아이들 모션 — 40% 정지 해소 (가장 싸고 효과 큼)

```ts
// 멈춰 있어도 호흡과 좌우 경계는 유지한다. 실제 상태가 없을 때 가짜 동작을 만들지는 않는다.
const idle = !reducedMotion && !moving && !down
  ? Math.sin(time * 1.6 + seedOf(unit.id)) : 0;          // 호흡 ±0.6단위
const scanIdle = unit.action === 'hold' || unit.action === 'aim'
  ? Math.sin(time * 0.5 + seedOf(unit.id)) * 0.09 : 0;    // 시선 좌우 ±5도
```

- `seedOf(unit.id)`로 위상을 어긋나게 해 다섯 명이 동시에 숨 쉬지 않게 한다
- 몸 방향(`facing`)은 바꾸지 말고 **헬멧 폴리곤만** 흔든다. 엔진 시야 판정은 `facing` 기준이므로 판정에 영향이 없다
- `aim`일 때는 호흡 폭을 절반으로 줄이고 흔들림을 멈춘다 — 조준 중이라는 신호가 된다

## 2-2. 카메라 연출

- **설치·해체 시작**: 0.4초 동안 15% 확대. `objective` 사건에 위치가 있다
- **사망**: 0.15초 짧은 흔들림 (수류탄의 1/3 세기)
- **마지막 한 명**: 생존자 1명이 되면 그 선수로 컷 고정 + 테두리 색 변경
- **라운드 시작**: 0.8초 전체 지도 → 선두 진입조 줌인
- **라운드 종료**: 마지막 사건 위치로 컷하고 0.5초 정지 후 패널

모두 `reducedMotion`일 때 꺼진다.

## 2-3. 명도 정리

- 정적 지형 `globalAlpha` .86 → .62, 캐릭터·가젯은 1.0
- 사이트 A/B 영역에 약한 색조를 깔아 위치 감각을 만든다
- 진영 색을 캐릭터 **외곽선 전체**에 적용 (이전 QA P1-06 수정을 겸함)
- 피격 시 몸에 0.2초 플래시

## 2-4. 판단 티커

`unit.goal`이 경기당 443회 바뀌고 내용이 이미 한글 문장이다.

```
"장거리 사선 불리 · 엄폐 우회"
"열세 판단 후 후퇴·재배치"
"마지막 소리 위치 수색"
```

화면 하단에 `[선수명] 판단 내용` 한 줄 티커. goal이 바뀔 때만 갱신. **선수 위에 띄우지 말 것** — 이전 QA P1-12에서 라벨 4개가 이미 겹친다.

---

# 3부. 이펙트 스프라이트 제작 설명서

이 부는 GPT에게 그대로 넘길 수 있게 썼다.

## 3-1. 핵심 결정: 프레임 시트를 만들지 않는다

이펙트는 움직이는 것이라 보통 스프라이트 시트(연속 프레임)를 쓴다. **이 프로젝트에서는 하지 않는다.**

이유는 두 가지다.

1. **이미지 생성기는 프레임 간 일관성을 못 만든다.** 8프레임 폭발 시트를 요청하면 프레임마다 형태·색·광원이 튄다. 애니메이션이 아니라 슬라이드쇼가 된다.
2. **필요가 없다.** 총구 화염은 0.06초, 탄착은 0.28초다. 그 시간에 사람 눈은 형태 변화를 추적하지 못한다. 크기와 투명도만 변해도 충분하다.

대신 이 규칙을 쓴다.

> **1 이펙트 = 스틸 이미지 N개 변형 + 코드가 주는 3가지 변화(크기·투명도·회전)**

변형 N개는 사건마다 시드로 골라 반복감을 없앤다. 이미 `seeded()` 함수가 `BroadcastCanvas.tsx`에 있으니 그걸 쓴다.

```ts
// 같은 사건은 항상 같은 변형을 고른다. 결정론이 깨지면 관전/비관전이 갈린다.
const variant = Math.floor(seeded(`${event.time}:${event.actor}`, 7) * part.variants);
```

## 3-2. 기존 무기 파이프라인을 그대로 재사용한다

새 구조를 만들지 않는다. 무기 스프라이트가 이미 쓰는 것을 그대로 쓴다.

| 요소 | 기존 (무기) | 이펙트에서 |
|---|---|---|
| 파일 위치 | `public/operators/weapons/top/*.png` | `public/operators/effects/*.png` |
| 로더 | `asset(file)` — `BroadcastCanvas.tsx:66`, 지연 로딩 + Map 캐시 | 그대로 |
| 축소본 캐시 | `thumbnail(image, target)` — `weaponParts.ts` | 그대로 재사용 |
| 앵커 변환 | `part()` — 원본 픽셀 → 전장 좌표 | 같은 방식 (3-4) |
| 자산 검증 | `validation/weapon-sprite-assets.json` | `effect-sprite-assets.json` |
| 렌더 검증 | `tests/weapon-presentation.cjs` (`@napi-rs/canvas`) | `tests/effect-presentation.cjs` |
| 프롬프트 기록 | `art-source/topview-final-prompt.txt` | `art-source/effect-prompts-v1.json` |

**새 라이브러리를 추가하지 않는다.** 파티클 엔진도 넣지 않는다. 지금 있는 캔버스 `drawImage`와 `seeded()`로 끝난다.

## 3-3. 만들 이펙트 목록

| # | 이펙트 | 변형 수 | 붙는 사건 | 방향 | 권장 원본 크기 |
|---|---|---|---|---|---|
| 1 | 총구 화염 | 4 | `shot` | 총열 축 | 512×256 |
| 2 | 혈흔 분사 | 4 | `impact` `hit=true` | 탄환 진행 방향 | 512×512 |
| 3 | 헤드샷 혈흔 | 2 | `impact` `hitRegion='head'` | 탄환 진행 방향 | 512×512 |
| 4 | 탄착 먼지 | 3 | `impact` `hit=false` | 없음 | 512×512 |
| 5 | 폭발 | 3 | `utility` `grenade-exploded` | 없음 | 768×768 |
| 6 | 파쇄 잔해 | 2 | `utility` `wall-breached` | 벽 법선 | 768×512 |
| 7 | 설치 장치 | 1 | `objective` | 없음 (정물) | 512×512 |
| 8 | 가젯 설치물 | 5 | 가젯 렌더 | facing | 512×512 각 |
| | **합계** | **24장** | | | |

8번 내역: 관측 카메라 / 정찰 드론 / 전력 노드 / 요격 센서 / 설치형 방패.

**연막은 만들지 않는다.** `smokeEffect.ts`의 `createSmokeTexture()`가 이미 절차적으로 만들고 잘 작동한다. 교체하면 얻는 것 없이 회귀 위험만 생긴다.

## 3-4. 앵커 규칙 — 무기와 같은 방식

무기는 `muzzle`(총구)과 `rear`(개머리판)를 원본 픽셀로 주고, 코드가 전장 길이로 환산한다.

```ts
// weaponParts.ts — 기존 방식
const scale = length / (muzzle[0] - rear);
const local = (p) => [(p[0] - muzzle[0]) * scale, (p[1] - muzzle[1]) * scale];
```

이펙트도 똑같이 **두 점 + 전장 길이**로 정의한다.

| 이펙트 | `origin` (월드 좌표에 고정될 픽셀) | `axis` (방향·길이를 정할 픽셀) | `length` (전장 단위) |
|---|---|---|---|
| 총구 화염 | 화염이 총열에 붙는 뿌리 | 화염 끝 | 무기별 12~20 |
| 혈흔 | 피격 지점 (좁은 쪽 끝) | 분사 먼 쪽 끝 | 26 |
| 헤드샷 혈흔 | 피격 지점 | 분사 끝 | 34 |
| 탄착 먼지 | 중심 | 우측 가장자리 | 반경 10 |
| 폭발 | 중심 | 우측 가장자리 | 반경 42 |
| 파쇄 잔해 | 벽면 접점 | 잔해 먼 쪽 | 30 |
| 정물 (7·8) | 중심 | 우측 가장자리 | 반경 9~12 |

`length`는 기존 코드의 반경 값을 그대로 가져왔다. 폭발 42, 파쇄 30, 탄착 링 최대 반경 약 8 — 전부 `BroadcastCanvas.tsx`에 이미 있는 숫자다. **새로 정하지 말고 기존 값을 쓴다.** 그래야 지금 그려지는 도형을 스프라이트로 갈아끼워도 크기가 안 바뀐다.

## 3-5. GPT 프롬프트 템플릿

기존 `art-source/topview-final-prompt.txt`가 성공한 이유를 그대로 따른다. 대문자 제약, 명시적 부정, 알파 경고.

### 공통 머리말 (모든 이펙트에 붙인다)

```
Production INDIVIDUAL raster game EFFECT sprite for a 2D STRICT TOP-DOWN
tactical game. Camera looks straight DOWN at the ground; optical axis is
vertical. NOT side view, NOT isometric, NOT perspective.
Art direction: minimal military, low saturation, 2-3 clean cel shading blocks,
consistent bold dark contour where a contour exists, NO photoreal gradients,
NO lens flare, NO bloom.
Actual TRANSPARENT ALPHA PNG. Never a painted checkerboard pattern.
No text, no logo, no watermark, no UI frame, no floor grid, no drop shadow.
Single effect centered in frame with generous transparent margin.
```

### 1. 총구 화염 — 4변형

```
SUBJECT: muzzle flash seen from DIRECTLY ABOVE.
Shape: short asymmetric star-burst of hot gas expanding along ONE horizontal
axis. Root at LEFT edge (attaches to barrel tip), tip pointing RIGHT.
Length about 3x its width. Wide 2:1 composition.
Color: pale yellow-white core #FFF3C4, mid amber #FFC24A, thin dark smoke
fringe #6B5B3E at the outer tips only.
NO barrel, NO gun, NO hand, NO character in the image. Flash ONLY.
NO circular symmetric burst; it must read as directional.
Make 4 VARIANTS with different spike counts and asymmetry: variant 1 compact
3-spike, variant 2 long narrow 2-spike, variant 3 wide 5-spike, variant 4
irregular with a small detached spark cluster.
```

### 2. 혈흔 분사 — 4변형

```
SUBJECT: impact spray on the ground seen from DIRECTLY ABOVE, stylized.
Shape: narrow at the LEFT edge (the impact point), fanning out toward the
RIGHT into a cone of small droplets. Length about 2x width.
Color: desaturated crimson core #7A2B2B, darker edge #4A1C1C, a few
dust-brown specks #6A5844 mixed in. Muted, NOT bright red, NOT glossy.
Flat matte shapes only. NO wetness highlight, NO photoreal fluid.
NO body, NO wound, NO character. Spray ONLY.
Make 4 VARIANTS with different droplet counts and fan angles: variant 1
tight 20-degree fan, variant 2 wide 60-degree fan, variant 3 sparse large
droplets, variant 4 dense fine mist.
```

톤에 대한 판단이 필요하다. 위 색은 **미니멀 밀리터리 톤에 맞춘 저채도 안**이다. 선홍색 밝은 피를 쓰면 아트 톤과 충돌하고 연령 등급에도 영향이 있다. 저채도 안이 마음에 안 들면 대안은 **먼지 + 붉은 액센트 최소화**(#6A5844 주조 + #7A2B2B 20%)인데, 이 경우 피격 여부가 잘 안 보이므로 2-3의 몸 플래시를 반드시 같이 넣어야 한다.

### 3. 헤드샷 혈흔 — 2변형

```
Same as the impact spray above, but LARGER and MORE SYMMETRIC — a burst
rather than a directional fan, since a head hit sprays in several directions.
Length about 1.3x width. Slightly brighter core #8A3030.
Make 2 VARIANTS.
```

### 4. 탄착 먼지 — 3변형

```
SUBJECT: bullet impact dust puff on a hard surface, seen from DIRECTLY ABOVE.
Shape: roughly RADIAL small cloud with a few outward streaks. Centered.
Color: pale concrete grey #C6C3BA core fading to #8D8A82, a few darker
fragment specks #4A4741. Low opacity at the outer edge.
NO fire, NO orange, NO spark. Dust and fragments ONLY.
Square 1:1 composition. Make 3 VARIANTS with different streak directions.
```

### 5. 폭발 — 3변형

```
SUBJECT: fragmentation grenade detonation seen from DIRECTLY ABOVE.
Shape: RADIAL burst — bright irregular core, mid ring of expanding gas,
outer scatter of small fragments. Centered, roughly circular but NOT a
perfect circle.
Color: white-hot core #FFF6D8, amber mid #FFB13C, dark smoke ring #55483A,
fragment specks #3A342C.
NO mushroom cloud, NO vertical plume, NO side-view fireball.
Square 1:1 composition. Make 3 VARIANTS with different core shapes and
fragment scatter.
```

### 6. 파쇄 잔해 — 2변형

```
SUBJECT: breaching charge wall debris seen from DIRECTLY ABOVE.
Shape: fan of angular wall fragments spreading from the LEFT edge (the wall
face) toward the RIGHT, plus a dust haze behind them.
Color: plaster beige #BEAE8F, concrete grey #8D8A82, dark core fragments
#4A4741, dust #C6C3BA at low opacity.
Angular chunks with straight edges — this is a wall, not soil.
NO fire, NO orange glow. Wide 3:2 composition. Make 2 VARIANTS.
```

### 7. 설치 장치

```
SUBJECT: portable objective device on the ground, seen from DIRECTLY ABOVE.
Shape: rectangular hard case, open, with a small panel on top showing a
single indicator light and a short antenna stub. Compact and readable at
24x18 pixels on screen.
Color: dark case #16272F, panel #2FD4C4 indicator, metal trim #859080.
Strong dark contour so it reads against a grey floor.
Square 1:1 composition. Single object, no variants.
```

### 8. 가젯 설치물 — 5종 각 1장

각 프롬프트는 위 공통 머리말 + 아래 한 줄씩.

```
관측 카메라:  small tripod-mounted surveillance camera from above, one round
             lens facing RIGHT, dark body #3E4B57, lens ring #6EA8FF.
정찰 드론:    small four-wheeled ground drone from above, wheels visible at
             four corners, sensor dome on top, body #59666B, dome #899B91.
전력 노드:    compact battery pack with two cable stubs from above, body
             #65715A, terminal caps #303C37, one amber indicator #FFC53D.
요격 센서:    small twin-tube launcher pod from above, two round tube mouths
             facing RIGHT, body #718078, tube mouths #343E3B.
설치형 방패:  deployable ballistic shield seen from above — a narrow long
             rectangle with two support feet, face #56666B, feet #0B1115,
             one small viewport slot #839AA0.
```

## 3-6. 앵커 데이터 파일

무기의 `WEAPON_PARTS`와 같은 형식으로 새 파일을 만든다.

```ts
// effectParts.ts
/** 생성된 PNG의 기준점입니다. 코드로 이펙트 외형을 그리거나 대체하지 않습니다. */
type Point = [number, number];
export interface EffectPart {
  id: string;
  files: string[];        // 변형 파일들. seeded()로 고른다
  length: number;         // 전장 단위. 기존 도형 반경을 그대로 쓴다
  origin: Point;          // 월드 앵커에 고정될 원본 픽셀
  axis: Point;            // 방향·축척을 정할 원본 픽셀
  seconds: number;        // 지속 시간. 기존 코드 값과 맞춘다
  scaleFrom: number;      // 시작 배율
  scaleTo: number;        // 끝 배율
  fadeFrom: number;       // 시작 알파
  jitter: number;         // 회전 랜덤 ±라디안
}

/** 원본 픽셀 기준점을 전장 좌표로 환산합니다. 무기 스프라이트와 같은 방식입니다. */
function effect(id: string, files: string[], length: number, origin: Point, axis: Point,
                seconds: number, scaleFrom: number, scaleTo: number, fadeFrom = 1, jitter = 0): EffectPart {
  return { id, files: files.map(f => 'effects/' + f), length, origin, axis, seconds, scaleFrom, scaleTo, fadeFrom, jitter };
}

export const EFFECT_PARTS: Record<string, EffectPart> = {
  // 총구 화염: 0.06초. 기존 반동 kick(0.14초)보다 짧게 끝나야 총이 밀릴 때 화염이 남지 않는다.
  muzzle: effect('muzzle', ['muzzle-1-v1.png','muzzle-2-v1.png','muzzle-3-v1.png','muzzle-4-v1.png'],
    16, [40, 128], [472, 128], 0.06, 0.8, 1.15, 1, 0.14),
  // 혈흔: 기존 impact 링과 같은 0.28초에 등장하고 지면 잔상은 별도로 3초 유지한다.
  blood: effect('blood', ['blood-1-v1.png','blood-2-v1.png','blood-3-v1.png','blood-4-v1.png'],
    26, [48, 256], [464, 256], 0.28, 0.6, 1.0, 1, 0.10),
  bloodHead: effect('bloodHead', ['blood-head-1-v1.png','blood-head-2-v1.png'],
    34, [56, 256], [456, 256], 0.28, 0.6, 1.05, 1, 0.10),
  // 탄착 먼지: 기존 링 반경 3+age*18 → 최대 약 8. 반경 10으로 맞춘다.
  dust: effect('dust', ['dust-1-v1.png','dust-2-v1.png','dust-3-v1.png'],
    10, [256, 256], [500, 256], 0.28, 0.4, 1.0, 0.9, Math.PI),
  // 폭발: 기존 반경 42, 지속 0.65초를 그대로 쓴다.
  blast: effect('blast', ['blast-1-v1.png','blast-2-v1.png','blast-3-v1.png'],
    42, [384, 384], [740, 384], 0.65, 0.5, 1.3, 1, Math.PI),
  // 파쇄: 기존 반경 30, 지속 0.65초.
  breach: effect('breach', ['breach-1-v1.png','breach-2-v1.png'],
    30, [40, 256], [730, 256], 0.65, 0.5, 1.2, 1, 0.08),
};
```

`origin`·`axis` 픽셀값은 **실제 생성된 PNG를 보고 채운다.** 위 값은 3-3의 권장 크기를 가정한 예시다. 생성 후 3-8의 검증 이미지로 확인하고 조정한다.

## 3-7. 적용 코드

`BroadcastCanvas.tsx`의 기존 사건 렌더링 분기에 끼운다. **기존 도형 그리기를 지우지 말고 스프라이트 로딩 실패 시의 대체로 남긴다.**

```ts
/** 이펙트 스프라이트를 한 장 그립니다. 로딩 전이면 false를 반환해 기존 도형을 쓰게 합니다. */
function drawEffect(ctx: CanvasRenderingContext2D, part: EffectPart, asset: (f: string) => HTMLImageElement,
                    x: number, y: number, angle: number, age: number, seed: string): boolean {
  const t = age / part.seconds;
  if (t < 0 || t > 1) return true;                       // 시간 밖이면 그릴 것이 없다
  const index = Math.floor(seeded(seed, 7) * part.files.length);
  const image = asset(part.files[index]);
  if (!image.complete || !image.naturalWidth) return false;
  // 두 기준점 사이 픽셀 거리를 전장 길이로 환산합니다. 무기 스프라이트와 같은 계산입니다.
  const span = Math.hypot(part.axis[0] - part.origin[0], part.axis[1] - part.origin[1]);
  const unitScale = part.length / span;
  const grow = part.scaleFrom + (part.scaleTo - part.scaleFrom) * t;
  const rotate = angle + (seeded(seed, 11) - .5) * 2 * part.jitter;
  ctx.save();
  ctx.globalAlpha = part.fadeFrom * (1 - t * t);         // 뒤로 갈수록 빠르게 사라진다
  ctx.translate(x, y); ctx.rotate(rotate);
  ctx.scale(unitScale * grow, unitScale * grow);
  ctx.drawImage(image, -part.origin[0], -part.origin[1]);
  ctx.restore();
  return true;
}
```

호출부는 기존 분기 안에 한 줄씩 넣는다.

```ts
// 사격: 총구 화염을 엔진의 총구 좌표에 붙인다. 총구 기준점 수정이 선행되어야 한다.
if (event.type === 'shot' && event.position) {
  const muzzleAngle = Math.atan2(event.targetPosition!.y - event.position.y,
                                 event.targetPosition!.x - event.position.x);
  if (!drawEffect(ctx, EFFECT_PARTS.muzzle, asset, event.position.x, event.position.y,
                  muzzleAngle, age, `${event.time}:${event.actor}`)) {
    /* 기존 3단위 점 그리기 유지 */
  }
}

// 피격: 탄환 진행 방향으로 혈흔, 빗나감은 먼지.
if (event.type === 'impact' && event.position) {
  const dir = Math.atan2(event.position.y - (event.targetPosition?.y ?? event.position.y),
                         event.position.x - (event.targetPosition?.x ?? event.position.x)) + Math.PI;
  const part = !event.hit ? EFFECT_PARTS.dust
    : event.hitRegion === 'head' ? EFFECT_PARTS.bloodHead : EFFECT_PARTS.blood;
  if (!drawEffect(ctx, part, asset, event.position.x, event.position.y, dir, age,
                  `${event.time}:${event.actor}:hit`)) {
    /* 기존 링 + 5가시 그리기 유지 */
  }
}
```

### 지면 잔상 (혈흔만)

혈흔은 0.28초 뒤 사라지면 사망 지점이 남지 않는다. 별도로 3초 잔상을 둔다.

```ts
// 사망 지점의 혈흔은 알파 0.25로 3초 남겨 라운드 흐름을 읽게 합니다.
if (event.type === 'death' && event.position && age < 3) {
  drawEffect(ctx, EFFECT_PARTS.blood, asset, event.position.x, event.position.y,
             seeded(`${event.time}:death`, 3) * Math.PI * 2, 1 - 0.001,
             `${event.time}:death`);
}
```

`age`를 `seconds` 직전 값으로 고정해 성장은 끝난 상태로 그리고, 호출 쪽에서 `globalAlpha`를 0.25로 감싼다.

## 3-8. 검증 — 무기와 같은 두 단계

### 1단계: 자산 검증

`validation/weapon-sprite-assets.json`과 같은 형식으로 `effect-sprite-assets.json`을 만든다. 기록할 것.

```
file / width / height / bytes / transparentFraction / sha256
```

**`transparentFraction`이 가장 중요하다.** 기존 무기 스프라이트는 0.608~0.759다. 이펙트가 0.2 미만이면 알파가 체커보드로 칠해졌거나 배경이 불투명하게 들어온 것이다. 기존에 그 이유로 2장을 반려한 기록이 `art-source/weapon-sprites-v1.json`의 `rejected`에 남아 있다. 같은 실수를 반복하지 않도록 생성 직후 이 값을 먼저 본다.

### 2단계: 렌더 검증

`tests/weapon-presentation.cjs`와 같은 방식으로 `tests/effect-presentation.cjs`를 만든다. `@napi-rs/canvas`가 이미 있으니 추가 설치가 없다.

검사할 것.

- 각 이펙트를 8방향 × 3개 시점(t=0.1 / 0.5 / 0.9)으로 그린 비교 이미지 생성
- 총구 화염의 뿌리가 총구 좌표에 붙는지 (origin 정렬)
- 혈흔의 좁은 쪽이 피격 지점에 오는지
- 폭발·먼지의 중심이 사건 좌표와 일치하는지
- 변형 선택이 같은 시드에서 항상 같은지 (결정론)
- 스프라이트 미로딩 시 `drawEffect`가 false를 반환하고 기존 도형이 그려지는지

## 3-9. 파일 크기 — 기존 실수를 반복하지 말 것

기존 무기 스프라이트 12장이 **8.75MB**다. 장당 730KB, 원본 폭 1774~2172px이다. 화면에서는 30~60단위(약 30~60px)로 그려지므로 **30배 이상 과대하다.** `thumbnail()`이 런타임에 축소해 성능은 막았지만 다운로드 용량은 그대로다.

이펙트는 처음부터 작게 만든다.

| 항목 | 기존 무기 | 이펙트 목표 |
|---|---|---|
| 원본 폭 | 1774~2172px | **512~768px** |
| 장당 용량 | 약 730KB | **60KB 이하** |
| 총 용량 | 8.75MB | **1.5MB 이하 (24장)** |

생성은 큰 해상도로 하되 **저장 전에 512/768px로 줄이고 PNG 최적화를 거친다.** 참고로 현재 JS 번들이 457KB이므로, 이펙트 1.5MB는 이미 그보다 크다. 무기 스프라이트도 같이 줄이는 작업을 별도 항목으로 잡을 만하다.

## 3-10. 하지 말 것

- **연막을 스프라이트로 교체하지 않는다.** `createSmokeTexture()`가 이미 작동한다
- **프레임 시트를 만들지 않는다** (3-1)
- **파티클 시스템·애니메이션 라이브러리를 추가하지 않는다.** `drawImage` + `seeded()`로 끝난다
- **기존 도형 그리기를 지우지 않는다.** 로딩 실패 시 대체로 남긴다
- **`length` 값을 새로 정하지 않는다.** 기존 코드의 반경·지속 시간을 그대로 쓴다 (3-4)
- **무기 스프라이트 프롬프트에 이펙트를 섞지 않는다.** `topview-final-prompt.txt`의 마지막 줄이 명시적으로 `UNFIRED idle weapon ONLY. No muzzle flash, no smoke, no particles`다. 이 제약을 유지해야 무기 스프라이트가 깨끗하게 남는다
- **`reducedMotion`을 무시하지 않는다.** 이펙트도 `prefers-reduced-motion`에서 성장·흔들림을 끄고 마지막 프레임만 짧게 보여준다

## 3-11. 작업 순서

| 순서 | 내용 | 산출물 | 확인 |
|---|---|---|---|
| 1 | `effectParts.ts` + `drawEffect()` 골격, 파일 없는 상태 | 코드 | 기존 도형이 그대로 나옴 (회귀 없음) |
| 2 | 총구 화염 4장 생성 → 앵커 조정 | PNG 4 | 화염 뿌리가 총구에 붙음 |
| 3 | 혈흔 4장 + 헤드샷 2장 | PNG 6 | 좁은 쪽이 피격 지점, 방향이 탄환 진행과 일치 |
| 4 | 폭발 3장 + 파쇄 2장 + 먼지 3장 | PNG 8 | 중심 정렬, 기존 반경과 동일 크기 |
| 5 | 설치 장치 1 + 가젯 5 | PNG 6 | 24×18px로도 식별됨 |
| 6 | 자산·렌더 검증 JSON·테스트 | validation 2개 | `transparentFraction` 0.4 이상 |

2단계까지만 해도 사격 38회가 달라 보인다. **총구 기준점 수정(직전 QA 2부)이 2단계보다 먼저다** — 지금 총구 좌표가 옛 측면 원화 앵커라 어긋나 있어서, 화염을 붙이면 어긋난 위치에 붙는다.

---

# 4부. 사운드 도입안

## 4-1. 이 프로젝트는 사운드를 붙이기 쉬운 구조다

세 조건이 이미 충족돼 있다.

1. **결정론적 사건 로그.** 모든 사건에 `time`(0.1초 단위)과 `position`이 있다. 같은 시드에서 항상 같은 사건이 같은 시각에 나온다 → 오디오를 사건 로그에서 그대로 스케줄할 수 있다
2. **소리 사건이 이미 있다.** 경기당 2,306회. `{ time, actor, message: '총성'|'발소리', position }`
3. **청취 판정이 이미 있다.** `heard(unit, sound, map, now)`가 벽과 거리를 검사한다

새로 설계할 것은 믹싱 규칙과 샘플뿐이다. **Web Audio API만 쓴다** — `AudioContext` · `AudioBufferSourceNode` · `GainNode` · `BiquadFilterNode` 네 개면 된다. Howler 같은 래퍼는 이 규모에서 얻는 것이 없다.

## 4-2. 사건 → 소리 매핑

3부의 스프라이트와 같은 사건에 붙는다. 한 번에 같이 작업하면 효율적이다.

| 사건 | 샘플 | 우선순위 | 3부 스프라이트 |
|---|---|---|---|
| `shot` | 무기 family별 (carbine/smg/marksman/bolt) | 1 | 총구 화염 |
| `impact` `hit=true` | 피격 (몸/머리 구분) | 1 | 혈흔 |
| `impact` `hit=false` | 벽 탄착 | 3 | 탄착 먼지 |
| `death` | 쓰러짐 | 1 | 혈흔 잔상 |
| `objective` planted/defused | 장치 가동 / 해체 완료 | 1 | 설치 장치 |
| `utility` grenade-exploded | 폭발 | 1 | 폭발 |
| `utility` wall-breached | 파쇄 | 1 | 파쇄 잔해 |
| `utility` smoke-thrown | 연막 분사 | 2 | (기존 텍스처) |
| `utility` window-broken | 유리 | 2 | — |
| `action` traversal:* | 창틀 / 포복 | 3 | — |
| `reload` | 장전 | 2 | — |
| `downed` / `revive` | 신음 / 지혈 | 2 | — |
| `sound` 발소리 | 발소리 | 4 | — |
| 라운드 시작·종료 | UI 스팅어 | 0 | — |

## 4-3. 함정 세 개

### (1) `heard()`를 그대로 쓰면 거의 무음이 된다

```ts
return now - sound.at < 2.5 && distance(...) < 260 * sound.loudness * wallLoss;
```

260단위 = **6.5m**다. 총성이 6.5m, 벽 뒤면 2.3m, COLLIER 소음기는 2.5m. 이건 **AI의 청취 판정**이고 그 목적에는 맞지만, 중계 오디오에 쓰면 카메라 밖 총격전이 들리지 않는다.

중계용은 별도 반경을 쓴다. 권장: **화면에 보이는 범위 + 여유 40%**를 0dB, 그 밖은 거리 제곱 감쇠, 벽 뒤는 lowpass 600Hz. **카메라 위치 기준이고 선수 위치 기준이 아니다.**

### (2) 발소리 2,306회를 그대로 재생하면 소음이다

초당 28회다. 세 단계로 줄인다.

```
1. 같은 틱의 발소리를 위치로 묶는다 (반경 60단위 내 → 1회)
2. 카메라 시야 밖은 버린다
3. 발소리 채널 동시 발음 3개 제한, 오래된 것부터 정지
```

같은 유닛의 발소리는 최소 간격 0.28초를 강제한다. 걷기 10Hz sin 애니와 맞춰 두 걸음에 한 번만 낸다.

### (3) 4배속에서는 소리를 줄여야 한다

`playbackRate`를 올리면 총성이 찍찍거린다. 피치는 건드리지 않고 재생 대상을 바꾼다.

| 배속 | 재생 |
|---|---|
| 1× | 전부 |
| 2× | 우선순위 1~2, 발소리 끔 |
| 4× | 우선순위 0~1만 (총성·사망·목표·폭발) |

## 4-4. 모바일 자동재생

브라우저는 사용자 제스처 없이 `AudioContext`를 시작하지 못한다. **`편성 확정 · 출전 →` 버튼이 unlock 지점이다.**

```ts
// 출전 버튼 핸들러에서 한 번만 호출한다. 사용자 제스처 없이는 오디오가 시작되지 않는다.
async function unlockAudio(): Promise<void> {
  if (!context) context = new AudioContext();
  if (context.state === 'suspended') await context.resume();
  void loadSamples();   // 병렬 로딩, 실패해도 경기는 진행한다
}
```

경기 화면 진입까지 2초 정도 여유가 있어 로딩 시간이 가려진다. 음소거 토글은 관전 화면에 둔다. `prefers-reduced-motion`과는 별개 설정이다.

## 4-5. 샘플 예산 — 14개로 시작

```
총성 4   carbine / smg / marksman / bolt
피격 2   몸 / 머리
탄착 1   벽
폭발 2   수류탄 / 파쇄
이동 1   발소리
장치 2   설치 시작 / 해체 완료
UI   2   라운드 시작 / 라운드 종료
----------
합계 14
```

각 샘플에 `playbackRate` ±6%, `gain` ±2dB 랜덤을 주면 반복감이 사라진다. 소음기 무기(MP5SD, AS Val)는 같은 샘플에 lowpass 1.2kHz + gain −9dB로 만든다 — 별도 녹음이 필요 없다.

OGG/MP3 48kHz mono, 샘플당 20~60KB, **합계 500KB 이하**를 목표로 한다.

## 4-6. 구조

오디오는 렌더러에 넣지 않는다. 별도 모듈로 두고 `BroadcastCanvas`가 프레임마다 새 사건만 넘긴다.

```
domain/realtime/          ← 사건 생성 (변경 없음)
        ↓ events
components/matchAudio.ts  ← 신규. 사건을 받아 큐에 넣고 믹싱
        ↓ Web Audio
```

```ts
/** 사건 로그를 중계 오디오로 바꿉니다. 엔진 판정과 사건 내용은 변경하지 않습니다. */
export function createMatchAudio(load: (name: string) => AudioBuffer | undefined) {
  const ctx = new AudioContext();
  const master = ctx.createGain(); master.connect(ctx.destination);
  const lastStep = new Map<string, number>();   // 유닛별 마지막 발소리 시각
  let playing = 0;

  /** 카메라 기준 거리와 벽으로 음량·저역을 정합니다. 선수 위치가 아니라 카메라가 기준입니다. */
  function place(position: TacticalPoint, camera: Rect, occluded: boolean) {
    const cx = camera.x + camera.width/2, cy = camera.y + camera.height/2;
    const reach = camera.width * 0.7;
    const d = Math.hypot(position.x - cx, position.y - cy);
    const gain = Math.max(0, 1 - (d/reach)**2) * (occluded ? 0.45 : 1);
    const pan = Math.max(-1, Math.min(1, (position.x - cx) / (camera.width/2)));
    return { gain, pan, lowpass: occluded ? 600 : 18000 };
  }
  // 이하 큐 처리·동시 발음 제한·배속별 필터
}
```

## 4-7. 작업 순서

| 순서 | 내용 | 확인 |
|---|---|---|
| 1 | `matchAudio.ts` 골격 + unlock + 음소거 토글 | 출전 후 무음이어도 에러 없음 |
| 2 | 총성 4종 + 피격 2종 | 교전에서 소리가 남 |
| 3 | 폭발·파쇄·장치·UI 스팅어 | 결정적 순간에 소리가 남 |
| 4 | 발소리 + 3단 감쇠·병합 | 초당 발음 수를 로그로 확인 |
| 5 | 배속별 재생 대상 분기 | 4배속에서 찍찍거리지 않음 |
| 6 | 소음기 필터 변형 | COLLIER 교전이 조용함 |

1~3단계까지만 해도 밋밋함의 절반이 해결된다. 발소리는 가장 까다롭고 효과는 가장 작으니 마지막에 둔다.

---

# 5부. 통합 작업 순서

세 부를 합친 실행 순서다. 같은 사건을 다루는 작업끼리 묶었다.

| 순서 | 항목 | 작업량 | 효과 |
|---|---|---|---|
| 0 | **총구 기준점 수정** (직전 QA 2부) | 함수 1개 | 3부 2단계의 선행 조건 |
| 1 | **아이들 모션** (2-1) | 두 줄 | 화면 40%가 살아난다 |
| 2 | **`effectParts.ts` + `drawEffect()` 골격** (3-11 ①) | 작음 | 회귀 없이 붙일 자리를 만든다 |
| 3 | **총구 화염 + 총성** (3-11 ②, 4-7 ②) | 중간 | 사격 38회가 달라 보이고 들린다 |
| 4 | **혈흔 + 피격음 + 사망 연출** (3-11 ③, 2-2) | 중간 | 경기당 12회의 빈 순간이 채워진다 |
| 5 | **폭발·파쇄 스프라이트 + 소리** (3-11 ④, 4-7 ③) | 중간 | 결정적 순간 |
| 6 | **명도 정리** (2-3) | 작음 | 어디를 봐야 할지 정해진다 |
| 7 | **카메라 연출** (2-2) | 중간 | 라운드에 리듬이 생긴다 |
| 8 | **가젯·장치 스프라이트** (3-11 ⑤) | 중간 | 가젯이 도형이 아닌 물건으로 보인다 |
| 9 | **판단 티커** (2-4) | 작음 | 캐릭터에 성격이 생긴다 |
| 10 | **발소리·공간감** (4-7 ④~⑥) | 중간 | 공간감 완성 |

0번과 1번은 각각 함수 하나와 두 줄이다. 여기서 시작한다.

---

## 다른 QA와의 관계

연출·이펙트 작업 전에 알고 있어야 할 것들이다.

- **라운드가 9~81초에 끝난다.** 마지막 플레이에서 2:30 중 9초에 종료됐다. 카메라 연출과 라운드 시퀀스는 라운드가 지속되어야 의미가 있다. 교전 치명성 조정(이전 QA P2-16)이 선행되면 연출 효과가 훨씬 커진다
- **총구 기준점이 어긋나 있다** (직전 QA 2부). 총 중심선이 몸 정중앙(y ≈ 0)이고 총구 전방 오프셋이 오퍼레이터마다 19.4~32.7로 다르다. 이 수정이 총구 화염보다 먼저다
- **선수 위 라벨이 이미 4개 겹친다** (이전 QA P1-12). 판단 티커를 선수 위에 올리면 악화된다
- **진영 색이 2×4단위 점 하나다** (이전 QA P1-06). 2-3의 외곽선 색 적용이 그 수정을 겸한다
- **무기 스프라이트가 8.75MB다.** 이펙트를 작게 만드는 것과 별개로, 무기 쪽 축소도 별도 항목으로 잡을 만하다
