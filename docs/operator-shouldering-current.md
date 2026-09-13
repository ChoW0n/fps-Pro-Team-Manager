# 총기 중심선·견착 보정 — 2026-09-13

작업 기준: `feat/modular-operator-renderer`, PR #15, 시작 커밋 `2a02c65`.
목표는 총을 오른쪽 외곽에 얹은 인상을 제거하고 어깨·양손·총을 하나의 자세로 읽게 하는 것이다. 통짜 시트와 새 총기 원화는 만들지 않았다. 실제 브라우저는 실행하지 않았다.

## 조사 근거와 한계

실물 사진/설명과 게임 화면의 투영을 구분한다. **6개 총종 전체의 동일 시점 수직 탑뷰 견착 사진 세트는 확보하지 못했다.** 아래 자료를 바탕으로 관절 관계를 설계했으며, 코드의 좌표·회전각은 실측이나 군 교범 표준값이 아니다.

| 대상 | 확인한 자료 | 적용과 한계 |
|---|---|---|
| 소총 | [미 육군 USAMU의 견착 설명](https://www.army.mil/article/75586/usamu_trains_soldiers_in_advanced_marksmanship_skills) | 검색에 노출된 어깨 포켓 접촉 설명을 확인. 본문 열기는 429로 실패했으므로 상세 각도 근거로 쓰지 않았다. 총 뒤끝을 어깨 안쪽에 접촉시키는 관계만 적용 |
| 기관단총 | [H&K MP5 공식 자료](https://www.heckler-koch.com/en/Products/Military%20and%20Law%20Enforcement/Submachine%20guns/MP5) | MP5/SD/K와 개머리판·핸드가드 변형을 구분. MP5SD는 기존 전방 앵커를 보존하고 MPX/K1A는 별도 smg 식별. 분류는 화면 표현용 |
| 불펍 | [IWI X95](https://iwi.net/iwi-x95/) | 불펍 배치와 후방 무게중심 설명 확인. 카빈의 손 간격을 복제하지 않고 기존 X95 PNG의 접점을 유지 |
| 지정사수 | [H&K HK417](https://www.heckler-koch.com/en/Products/Military%20and%20Law%20Enforcement/Assault%20rifles/HK417) | 별도 긴 총기 외형을 유지. 지지손을 더 안쪽으로 두고 몸통은 약 6.9도 회전. 이 각도는 게임 설계값 |
| 볼트액션 | [캐나다 국방부 C14 자료와 사진](https://www.canada.ca/en/department-national-defence/services/procurement/sniper-systems-project.html), [NRA 자세 자료](https://www.nrafamily.org/content/master-the-prone-shooting-position/) | C14 사진은 휴대 중인 장면으로 확인되어 견착 각도 근거에서 제외. 일반 장총 자세와 사용자 요구를 구분해 C14는 리시버 가까이 받치는 약 17.2도 몸통 회전으로 설계. 모든 볼트액션의 유일한 실전 자세라고 주장하지 않음 |
| 권총 | [양손 파지 자료](https://www.pewpewtactical.com/how-to-grip-a-pistol/), [GLOCK Gen5 프레임 자료](https://eu.glock.com/en/technology/gen5) | 어깨 견착 없이 몸 중심 앞에서 양손을 모음. 8종 모두 공통 권총 PNG이므로 개별 모델 고증 완료는 아님 |

PGW 검색 결과의 홈페이지는 실제 열기에서 무관한 내용이 나와 근거에서 제외했다. 검색 요약을 사진 확인으로 대체하지 않았다.

## 유사 게임 비교

[Door Kickers 2 공식 페이지](https://inthekillhouse.com/doorkickers2/)의 tactics GIF를 내려받아 한 프레임을 확인했고, [Thunder Tier One 공식 Steam 화면](https://store.steampowered.com/app/377300/Thunder_Tier_One/)의 배급사 스크린샷을 확인했다. 아래는 화면 관찰에 따른 해석이며 내부 리깅·레이어 구현을 확인한 것은 아니다.

| 관찰 항목 | Door Kickers 2 | Thunder Tier One | 이번 적용 |
|---|---|---|---|
| 중심선 | 작은 인물의 몸 앞에서 총열 방향이 돌출됨 | 경사 시점에서 총과 팔이 상체 앞에 모임 | 총열의 오른쪽 오프셋을 7.5에서 약 3.2~3.5로 줄임 |
| 어깨 | 작은 프레임에서 포켓의 정밀 위치는 판독 불가 | 군장과 팔이 겹쳐 어깨 접점이 일부 가려짐 | 포켓을 명시적 좌표로 두고 개머리판 뒤끝과 일치 |
| 팔꿈치 | 정확한 각도는 판독 불가 | 자세·투영별 비대칭 굽힘을 볼 수 있으나 실측 불가 | 좌우 팔꿈치를 서로 반대 바깥쪽으로 굽혀 받치는 공간을 형성 |
| 가림 | 헬멧·몸체의 큰 덩어리와 전방 총열이 먼저 읽힘 | 3D 깊이로 상체·팔·총이 부분적으로 가려짐 | 머리가 방아쇠손을 지우지 않게 머리/군장 후에 팔→총→손을 그림 |

작은 스크린샷에서 팔꿈치 각도를 임의 측정해 고증 수치로 기록하지 않는다. Thunder Tier One의 경사 시점 비율을 수직 탑뷰에 그대로 복제하지 않는다.

## 구현 계약

- `weaponMuzzleOffset`은 그대로 둔다. 시뮬레이션 발사 원점, 충돌, 성능 데이터는 변경하지 않았다.
- `weaponMountPose`가 표시용 개머리판·총구·양손·어깨 포켓·몸통 회전을 계산한다. 일반 장총 뒤끝은 `(-8, 3.4)`이며 C14/지정사수는 회전된 포켓에 일치시킨다.
- 총기 PNG와 균일 축척은 보존한다. 방아쇠손은 원본 gripPoint, 지지손은 총종별 접점에 고정한다. C14의 지지손은 기존 magazine/support 사이 22%, 지정사수는 55% 위치다.
- 방아쇠팔 8+9, 지지팔 12+12는 탑뷰 투영용 고정 길이이다. 원화 인체 치수가 아니다. 팔꿈치가 총 아래로 눌려 보이던 굽힘 방향을 수정했다.
- 레이어: 그림자 → 하체 → 몸통 → 머리/군장 → 팔 → 총 → 손 → 팀 표식. 머리 위치를 뒤/왼쪽으로 이동해 무기와 손을 덮지 않게 했다.
- 반동은 총과 파지손에 같은 변위를 적용한다. 중계 총구 효과도 표시용 반동 좌표를 사용하고 시뮬레이션에 되돌려 주지 않는다.
- PR 리뷰에서 지적된 장전 2.4초 상수를 실제 진행시간+남은시간으로 교체했다. 동작 축소 투척에서는 팔과 총이 같은 고정 진행률을 쓴다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| `node tests/operator-shouldering.cjs` | 20무기·160방향, 포켓 접촉, 중심선, 반동 중 고정 팔 길이, 표시/시뮬레이션 원점 분리, 장전 시간 비례, 동작 축소 투척 통과 |
| `node tests/modular-operator-contract.cjs` | 12주무기 접점·레이어·하체/상체 분리 통과 |
| `node tests/weapon-presentation.cjs` | 실제 PNG 12종·96방향·회전 경계·표시 총구 정렬 통과 |
| `node tests/weapon-grip-contract.cjs` | 기존 시뮬레이션 총구 계약과 8보조무기 매핑 통과 |
| 앱 TypeScript `--noEmit` | 통과 |
| Vite 프로덕션 빌드 | PORT=5000, BASE_PATH=/로 통과. 기존 500kB 초과 청크 경고 있음 |
| 실제 브라우저 | 사용자 지시에 따라 미실행 |

환경의 pnpm 실행 래퍼가 설치 스크립트 정책으로 중단되어, 이미 설치된 TypeScript/Vite의 Node 진입점으로 검증했다. 이 과정의 pnpm 설정 변경은 되돌렸고 의존성을 추가하지 않았다.

정적 검수표: [64px/128px](../validation/operator-shouldering-64-128.png), [5개 확대 자세](../validation/modular-operator-five-weapon-poses.png), [좌표 기록](../validation/operator-shouldering.json).

직접 확인한 범위: 64px에서 긴 C14·짧은 권총·불펍/P90의 큰 실루엣과 파지 배치, 128px에서 양손과 총의 겹침. 느슨하게 총 아래에 손 두 개를 나란히 놓던 형태를 제거했다. 자동 검사는 미술 승인이나 실물 고증의 대체물이 아니다. 비슷한 카빈의 세부 모델 식별, 최종 인체 파츠, 방패/포복 전용 파지는 미완료다.

## 다음 채팅 시작점

PR #15의 이 문서와 `modularOperator.ts`를 먼저 읽는다. 우선 사용자가 위 64/128 정적 검수표의 견착을 평가하고, 채택된 자세를 기준으로 MAGPIE 분리 원화를 제작한다. 새 총기 원화나 카빈식 C14 자세로 되돌리지 않는다. 브라우저 실행 금지와 외형/성능 분리를 유지한다.
