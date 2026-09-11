# 2026-09-11 오퍼레이터 보행 시트

12명 각각 한 행동·4프레임을 한 장에서 제작했습니다. `*/walk-v1-keyed.png`는 선택한 생성 원본이며 `*/walk-v1-anchors.json`은 해당 원본의 헬멧 중심·총구 좌표입니다. 게임에서는 `public/operators/*-walk-v1.webp`의 투명 시트를 사용합니다. 원본은 게임 초기 로딩에 포함되지 않습니다.

검수 중 같은 앞발 반복, 잘못된 측면 총기, 불필요한 탄창 노출, GSS9 오기, 오른쪽 프레임의 소총 축소를 수정했습니다. 탈락 후보를 런타임 경로에 넣지 않았습니다. 현재 결과는 보행 시트이며 전체 행동 팩이나 제조사·군 장비 고증 인증이 아닙니다. 부대별 실제 지급 시기·장비 변형 전체 대조는 남아 있습니다.

## 공통 제작 지시

한 행동의 연속 4프레임, 2×2. 수직 90도 탑다운 정사영, 오른쪽 방향. 1프레임 위쪽 발 전진/아래쪽 발 후방, 2프레임 통과, 3프레임 반대 발 전진, 4프레임 반대 통과. 헬멧·몸통·총기 크기를 고정하고 실제로 보이는 발·무릎만 표현한다. 상체에 옆으로 누운 다리를 붙이지 않는다. 오른손 파지, 견착, 왼손 앞쪽 지지와 무기의 강체 형태를 유지한다. 총기 역시 위에서 보며 아래쪽 탄창은 가려진다. P90의 상부 탄창은 별도 구조다. 순수 마젠타 배경, 그림자·문자·효과 제외. 기존 인물별 복장·총기는 유지한다.

MAGPIE의 기존 수직 원화를 시점 기준으로 사용했습니다. 9명 기존 아틀라스는 장비·색상 확인에만 사용했고 잘못된 사선 시점을 복제하지 않도록 수정했습니다. 원화 생성은 비결정적이며 아래 후처리만 재실행할 수 있습니다. `walk-batch-20260911.json`에는 추가 10명의 선택 원본 경로·이름·월드 크기를 기록했습니다. MAGPIE·해동은 앞선 두 파일 묶음에 있습니다.

## 재실행 예

```sh
python -B scripts/prepare-operator-sprite.py art-source/operators/magpie/walk-v1-keyed.png artifacts/draft-order-player-generator/public/operators/magpie-walk-v1.webp artifacts/draft-order-player-generator/src/operators/magpie-walk-v1.json --frame-anchors art-source/operators/magpie/walk-v1-anchors.json --action walk --world-width 44 --key-magenta
node tests/operator-action-state.cjs
node tests/operator-sprite-audit.cjs
```

가공은 승인된 배경 제거·연결된 인물 분리·피벗 정렬·균일 축소·WebP 압축입니다. 관절이나 무기를 코드로 다시 그리지 않았고 확대하지 않았습니다. 출처 이미지의 실제 인물 장축은 각 프레임 512px 이상이며 수치는 메타데이터에 저장됩니다. 런타임 셀 장축은 최대 512px입니다.

## 실제 연결

`operatorStateVisual`은 살아 있는 선수의 전진 보행에만 이 시트를 사용합니다. 경기 시각을 사용하고, 정지·횡이동·후진·달리기·저자세·장전·사격·목표 작업·구조·방패·통로 넘기·다운에는 앞걸음을 재사용하지 않습니다. 수색·복귀·재배치도 실제 몸동작이 보행일 때 같은 시트를 사용합니다. Canvas와 SVG가 같은 선택 함수를 호출합니다.

사격 자세와 물리 총구는 기존 계약을 유지하므로 기존 정지·사격 원화와의 외형 전환 개선이 남아 있습니다. 4프레임의 접지·중간 자세와 이동 거리별 재생은 후속 검수 대상입니다. 전체 행동 팩 완성으로 집계하지 않습니다.

## 이번에 확보한 1차 자료

- [Colt Canada L119A2](https://www.coltcanada.com/fleet-upgrades-licensed-programs-custom-builds/): 통합 상부·탄색 개머리판과 손잡이 구성.
- [HK MP5](https://www.heckler-koch.com/en/Products/Military%20and%20Law%20Enforcement/Submachine%20guns/MP5): SD의 통합 소음기 구분. 일반 MP5 수치를 SD 실측값으로 옮기지 않았습니다.
- [HK416](https://www.heckler-koch.com/en/Products/Military%20and%20Law%20Enforcement/Assault%20rifles/HK416), [HK417](https://www.heckler-koch.com/en/Products/Military%20and%20Law%20Enforcement/Assault%20rifles/HK417): 서로 다른 소총 계열·구경·탄창 구분.
- [IWI X95](https://iwi.net/iwi-x95/): 불펍 계열 구분.
- [Beretta ARX160](https://www.berettadefense.com/products/arx160-11-bdt/): 폴리머 총몸·접철/신축 개머리판·상부 레일. 특정 부대의 지급 변형까지 검증한 자료는 아닙니다.

나머지 모델의 제조사 원문 대조가 충분하지 않습니다. 스프라이트 확대 검수와 제조사 구조 확인을 같은 완료 판정으로 취급하지 않습니다.
