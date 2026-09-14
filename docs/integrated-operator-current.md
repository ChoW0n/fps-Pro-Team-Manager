# 통합 오퍼레이터 외형 v1 — 현재 적용 범위

기준일: 2026-09-14. 승인된 Survivor 계열 탑뷰 비율을 유지하면서 12명의 복장·장비·주무기를 한 장의 기본 외형으로 연결했다.

## 적용

- MAGPIE, COLLIER, 해동, ARBEL, AUBERT, MEDVED, REUSS, BRANDT, MARCHAND, HALLORAN, 성곽, SAVELLI 전원을 개별 PNG로 표시한다.
- 서기와 전진 이동은 통합 외형을 사용한다.
- 웅크림과 COLLIER 다운/포복은 기존 전용 시트를 유지한다.
- 방패, 재장전, 투척, 소생, 장애물 통과, 횡이동·후진은 기존 조립식 렌더러로 폴백한다.
- 표시용 피벗·총구만 새 원화에 맞췄다. 시뮬레이션의 판정, 능력치, 실제 발사 원점은 변경하지 않았다.

## 자산 파이프라인

- 생성 원본: `art-source/operators/integrated-v1/`
- 투명 런타임 PNG: `artifacts/draft-order-player-generator/public/operators/*-integrated-v1.png`
- 재현 스크립트: `scripts/art/prepare_integrated_operators.py`
- 런타임 매니페스트: `artifacts/draft-order-player-generator/src/operators/manifest.json`

배경 분리는 원본 가장자리의 완만한 청회색을 2차 평면으로 추정한 뒤, 가장 큰 연결 실루엣만 남긴다. 파일은 임시 PNG로 완전히 쓴 뒤 원자적으로 교체하여 0바이트 중간 결과를 만들지 않는다.

## 검증 경계

- 12개 PNG 디코드, 실제 알파 채널, 크롭·피벗·총구 범위를 검사했다.
- Node Canvas 16개 장면과 상태 선택 계약, TypeScript 및 프로덕션 빌드를 검증 대상으로 삼는다.
- [런타임 투명도 비교](../validation/operator-integrated-runtime.png)와 [생성 원본 12인 비교](../validation/operator-integrated-roster-v1.png)를 남긴다.
- 브라우저·실기기 플레이 및 애니메이션의 미술 승인까지 통과했다는 뜻은 아니다.
