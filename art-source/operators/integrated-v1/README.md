# 통합형 오퍼레이터 시안 v1

2026-09-13 생성한 12명 외형 시안이다. 승인된 Survivor 계열 탑뷰 인체 비율을 기준으로 복장·특수장비·주무기를 한 이미지에 통합했다.

- 공격: MAGPIE, COLLIER, 해동, ARBEL, AUBERT, MEDVED
- 수비: REUSS, BRANDT, MARCHAND, HALLORAN, 성곽, SAVELLI
- 공통 시점: 오른쪽 조준, 90도 수직 탑뷰
- 총기 기준: 상부 레일과 조준기를 중심으로 표현하며 측면 탄창과 측면 총몸을 노출하지 않는다.
- 상태: 승인된 외형 생성 원본. `scripts/art/prepare_integrated_operators.py`가 투명 배경 분리, 게임 해상도 축소, 피벗·총구 앵커 산출을 재현한다.
- 적용 범위: 기본 서기·이동 자세에만 사용한다. 웅크림·다운·방패·재장전 등 전용 동작은 기존 렌더러를 유지한다.
- 검수 결과: 12개 런타임 PNG의 실제 알파 채널과 디코드, 소총 개머리판·상부 레일·총열 중심선을 확인했다.

전체 비교: `validation/operator-integrated-roster-v1.png`
