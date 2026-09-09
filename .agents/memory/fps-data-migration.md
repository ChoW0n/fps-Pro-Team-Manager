---
name: Tactical FPS data migration
description: 전술 FPS 데이터 계층과 기존 MOBA 화면 사이의 임시 호환 원칙
---

새 전술 FPS 데이터 계층을 도입할 때는 새 역할과 능력치를 source of truth로 삼고, 다음 화면 교체 전까지 기존 MOBA 화면·시뮬레이터가 컴파일되도록 호환 getter와 레거시 챔피언 폭만 유지한다.

**Why:** 화면 교체는 별도 단계로 명시되어 있어 데이터 전환과 UI 전환을 한 번에 묶으면 기존 검증 흐름을 불필요하게 깨뜨린다.

**How to apply:** 새 화면을 붙이는 단계에서 레거시 position/getter와 챔피언 폭을 제거하고 Player, Team, 관련 표시 모듈을 Role·Operator 기준으로 직접 전환한다.