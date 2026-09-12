# DRAFT ORDER — 지식·스킬 라우팅 맵

이 문서는 저장소와 ChatGPT Library에 흩어진 자료를 찾는 **단일 인덱스**다. 실제 사실은 아래 우선순위의 원문에서 확인한다.

## 진실의 우선순위

1. 최신 사용자 요청과 명시적 결정
2. 현재 코드·테스트·실행 결과
3. `docs/PROJECT_STATE.md`
4. 현재 작업 문서
5. 날짜가 붙은 과거 문서와 Library 보관본

충돌하면 위 순서를 따른다. Library의 ZIP·패치·전달문은 복구 자료이지 현재 코드의 기준이 아니다.

## 작업 시작 읽기 규칙

모든 작업은 `AGENTS.md`에서 시작한다. 이어서 아래에서 **현재 작업과 직접 관련된 문서만 골라 총 3개 이내**로 읽는다. 해결되지 않은 의존성이 확인될 때만 더 읽는다.

| 작업 | 두 번째 문서 | 필요할 때 세 번째 문서 |
|---|---|---|
| 현재 상태·이어하기 | `docs/PROJECT_STATE.md` | 해당 `*-current.md` |
| 맵·레벨 디자인 | `docs/namsan-map-current.md` | `docs/level-design-and-vertical-combat.md`의 해당 단계 |
| AI·전투·밸런스 QA | `docs/qa-remediation-current.md` | `docs/2026-09-12-qa-debrief.md` |
| 스프라이트·무기·오퍼레이터 | `docs/sprite-production-current.md` | `docs/weapon-art-standard.md` |
| 모바일·관전 UI | `docs/mobile-qa-stack-20260912.md` | 관련 테스트 파일 |
| 자동 실행·모델 라우팅 | `docs/CODEX_AUTO.md` | 실행 로그 또는 스크립트 |
| 기획 원칙 확인 | 마스터프롬프트의 관련 절 | `docs/PROJECT_STATE.md` |

날짜 문서는 제목 검색으로 찾되 “최신”이라는 이유만으로 모두 읽지 않는다.

## 스킬 라우팅

| 작업 신호 | 우선 사용할 스킬 | 조합 |
|---|---|---|
| 구현·수정·리팩터링 | `game-engineering-workflow` | `ponytail`로 과설계 억제 |
| AI·통행·전투 재현 | `game-simulation-qa` | 결정론·수정 전후·회귀 검증 |
| 캐릭터·무기·UI 원화 | `game-art-reference` | 필요 시 이미지 생성·편집 |
| 웹 UI 설계 | `frontend-design` | 완성 후 `kill-ai-slop` |
| 브라우저 동작 검증 | `webapp-testing` | 실제 실행 근거 보존 |
| 문서·대사·소개문 | `humanizer` | 사실 확정 뒤 문체만 정리 |
| 이전 대화·인수인계 | `project-memory-continuity` | 저장소 현재 상태와 대조 |

스킬은 전부 호출하는 목록이 아니다. 작업 신호에 맞는 주 스킬 1개와 검증·후처리 스킬만 조합한다.

## Library 구조

프로젝트 폴더 `게임 기획자&프로그래밍 지향 게임 개발 공부`는 다음 용도로만 사용한다.

- `00-START`: 전체 구조와 시작 허브
- `10-INBOX-QA`: 아직 저장소 기준 문서로 흡수하지 않은 QA·기획 원문
- `20-ART-REFERENCE`: 이미지 원본·생성안·비교 자료
- `80-REFERENCE`: 외부 자료 목록과 읽을거리
- `90-ARCHIVE-HANDOFF`: 과거 ZIP·패치·로그·전달문

Library 자료를 구현 근거로 썼다면, 결론과 검증 결과를 저장소의 현재 문서에 반영한다. 원문은 삭제하지 않는다.

## 작업 종료 기록

- 바뀐 코드와 테스트가 있으면 실제 실행 결과를 남긴다.
- 프로젝트의 현재 판단이 달라졌으면 `docs/PROJECT_STATE.md`의 맨 위에 짧게 갱신한다.
- 세부 QA·아트 작업은 해당 `*-current.md`에 이어 쓴다.
- 완료·미완료·다음 1~3개를 분리한다.
- 새 전달 ZIP은 꼭 필요한 경우에만 만들고, 만든다면 Library 보관 구역에 둔다.
