# 현재 경기 구조 — Archify

[인터랙티브 구조도](runtime.html) · [편집 가능한 명세](runtime.architecture.json) · [생성 검증 영수증](runtime.receipt.json)

Archify 원본: https://github.com/tt-a1i/archify/tree/a07fa1d5b2a10cbea110c5a2be2817397a301cdc

외부 패키지를 게임 의존성에 추가하지 않고 해당 버전의 Node 렌더러를 실행했다. 구조도는 현재 경기 경로를 요약하며 모든 클래스·호출을 나열하는 자동 분석 결과는 아니다.

## 코드 근거

경로는 `artifacts/draft-order-player-generator/src/` 기준이다.

| 도표 구성 | 실제 근거 |
|---|---|
| 감독의 경기 준비 | `components/OperatorPreparation.tsx`, `components/TacticalMatch.tsx` |
| 경기 진행 화면 | `components/TacticalMatch.tsx`, `components/TacticalRoundLive.tsx` |
| 전술 시뮬레이션 | `domain/realtime/TacticalRealtimeSimulation.ts` |
| 오퍼레이터와 맵 | `domain/Operator.ts`, `domain/tacticalMaps.ts` |
| 관전 상태와 사건 | `RealtimeTick`, `RealtimeSnapshot`, `RealtimeEvent`; `TacticalRoundLive.receiveTick` |
| Canvas 중계 | `components/BroadcastCanvas.tsx` |
| 캐릭터 조립 | `components/modularOperator.ts`, `survivorParts.ts`, `weaponParts.ts`, `shieldParts.ts` |
| 전투 음향 | `components/matchAudio.ts`, `TacticalRoundLive` 사건 소비 |

브라우저 Worker가 있으면 `tactical.worker.ts`에서 계산하며, 없는 환경은 `roundPlayback.ts`로 실행한다. 구조도에서 진행 화면→시뮬레이션 연결은 이 실행 경로를 요약했다. 데이터베이스 아이콘의 “오퍼레이터와 맵”은 정적 코드 데이터이며 외부 DB 서비스를 뜻하지 않는다.

## 검증과 한계

- `validate architecture ... --quality showcase --json`: 9/9, 오류 0, 경고 0.
- `deliver architecture ... runtime.html --quality showcase --json`: 성공, 명세와 HTML SHA-256은 영수증에 기록.
- 프로젝트 AGENTS.md의 Codex 브라우저 검증 금지에 따라 `visual-check`와 브라우저 viewport 검사는 실행하지 않았다. 자동 구조 검사와 실제 화면 검수를 구분한다.
- 도표 내용은 한국어이며 Archify 고정 UI 및 HTML 언어는 영어 기본값이다.
- 이 구조도는 영향도 자동 추론이나 병합 안전성 보증이 아니다.

## 재생성

지정 커밋의 Archify 패키지를 준비한 뒤 그 패키지 디렉터리에서 실행한다.

```sh
ARCHIFY_UPDATE_CHECK_DISABLED=1 node bin/archify.mjs validate architecture "$PROJECT/docs/architecture/runtime.architecture.json" --quality showcase --json
node bin/archify.mjs deliver architecture "$PROJECT/docs/architecture/runtime.architecture.json" "$PROJECT/docs/architecture/runtime.html" --quality showcase --json
```

다음 작업의 순서는 [NEXT_WORK.md](../NEXT_WORK.md), 프로젝트 현황은 [PROJECT_STATE.md](../PROJECT_STATE.md)가 정본이다.
