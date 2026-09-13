# 경기 기획 문서 — 목표와 현행을 구분

다른 대화에 흩어져 있던 문서 3종을 원문 그대로 모았다. 아래 문서는 목표 설계이며 구현 완료 보고서가 아니다.

1. [완성형 경기 명세](FPS_MATCH_IMPLEMENTATION_SPEC_KO.md)
2. [작업 분해와 완료 게이트](FPS_MATCH_IMPLEMENTATION_WORK_BREAKDOWN_KO.md)
3. [중계 UI 흐름·디자인](BROADCAST_UI_FLOW_DESIGN_SPEC_KO.md)

적용 우선순위: 최신 사용자 지시 → AGENTS.md → PROJECT_STATE.md → 해당 기획 문서. 원문의 포복, 고정 틱 수치, UI 연출 목표는 현행 구현 여부와 별도로 검토한다. 현재 확정은 서기·앉기와 Survivor 비율이며 문서가 이것을 되돌리지 않는다.

전체 0~12단계를 다시 만들지 않는다. 현재 코어·목표·중계·아트 구현을 재사용하며, **AI 안정화 → 한 라운드 관전 → 음향·장비**의 순서로 남은 게이트만 해결한다.
