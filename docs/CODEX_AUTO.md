# Codex 작업별 자동 모델 라우팅

기준일: 2026-09-11. 작성 요청: chow0n.

## 현재 상태

**코드 구현 및 오프라인 테스트 완료 / 계정 연결 및 실제 모델 전환 검증 미완료.**

18개 테스트는 모의 응답과 로컬 자식 프로세스를 사용했다. 실제 모델을 호출한 테스트가 아니다. 작업 환경에서 `--check`도 실제 실행했지만 `CODEX_NOT_INSTALLED`로 종료되었다. 계정 토큰을 추출하거나 별도 API 키 과금으로 우회하지 않았다.

GitHub 연결은 저장소 읽기·쓰기 기능이다. Codex 추론 실행기나 모델 전환기가 아니다. 이 코드는 **Codex 실행기가 있고 ChatGPT로 로그인된 환경**에서 작업별 모델을 선택하는 별도 진입점이다. 현재 ChatGPT 대화, Codex 웹의 모델 선택기, 이미 진행 중인 부모 에이전트의 모델을 바꾸지는 않는다. 저장소에 파일을 추가한 것만으로 모든 서비스에서 활성화되지 않는다.

## 사용

기존 Node 22 이상과 Codex 실행기를 사용한다. 새 npm 라이브러리는 추가하지 않는다. 사용자의 기기에 설치할 것을 전제로 하지 않으며, 기존 로그인된 Codex 작업 환경에서 실행한다. 실행기가 없거나 로그인이 없으면 실행을 중단한다.

```sh
# 실행기·ChatGPT 로그인·모델 목록만 확인. 모델 생성 요청은 하지 않는다.
node scripts/codex-auto.mjs --check

# 간단한 세 작업으로 실제 클라이언트 런타임 설정과 응답 완료를 검증.
# 플랜의 일반 사용량을 소모한다. 유료 속도 가속은 요청하지 않는다.
node scripts/codex-auto.mjs --verify --audit /tmp/draft-order-model-audit.jsonl

# 작업 내용에 따라 자동 선택. 복합 작업은 부모 에이전트가 완결된 하위 작업으로 나눈다.
node scripts/codex-auto.mjs "버튼 라벨의 오탈자를 수정하고 변경 부분을 확인하세요"

# 위험도가 알려져 있을 때 지정 가능. 목표 파일에 완료 조건과 제약을 함께 적는다.
node scripts/codex-auto.mjs --level DEEP --file /tmp/task-goal.txt

# 실제 모델이나 크레딧을 쓰지 않는 테스트.
node --test scripts/codex-auto.test.mjs
```

## 실행 흐름

`계정 확인 → model/list → 작업 분류 → 모델·지원 추론 강도 선택 → thread/start → 반환된 모델·강도·서비스 등급 검증 → turn/start → 완료된 턴 기록 확인`

모델 ID를 임의로 만들지 않고 실행기가 반환한 목록에서 고른다. 기본 선호는 FAST: Luna/mini 계열, NORMAL: Terra/Sol 계열, DEEP: Astra/Sol 계열이다. 제공되지 않는 모델은 후보에서 빠진다. 다른 모델도 런타임 기본 모델 또는 목록 후보로 사용 가능하다. 이 순서는 실측 최적화 결과가 아니라 조정 가능한 초기 정책이다. 모델 목록에 나타나는 것과 실제 호출 권한은 같다고 단정하지 않으며, 호출이 거절되면 오류로 종료한다.

자동 분류는 한국어·영어 키워드 기반의 보수적인 초기 구현이다. 맥락 전체를 이해하는 완벽한 난이도 판별기가 아니다. 알 수 없는 작업은 NORMAL, 데이터 손상·인증·핵심 구조 위험은 DEEP을 우선한다. 단순 문구 작업이더라도 영향이 크면 부모 에이전트가 DEEP을 지정한다.

전환은 작업 경계에서 수행한다. 하나의 실행 중인 턴 안에서 모델을 몰래 바꾸지 않는다. 복합 작업에는 관련된 현재 사실·완료 조건·변경 금지 사항을 전달한다. 새 스레드가 이전 대화를 자동으로 기억한다고 가정하지 않는다. 하위 작업은 `DRAFT_ORDER_ROUTED=1`을 받으며 라우터를 재귀 실행하지 않는다.

## 비용·권한

- ChatGPT 로그인만 허용한다. 별도 API 키·다른 공급자 과금으로 우회하지 않는다.
- `service_tier=default`와 `features.fast_mode=false`를 명시한다. `priority`, `fast`, 알 수 없는 서비스 등급이 반환되거나 서비스 메타데이터가 누락되면 생성 전에 중단한다.
- 하위 에이전트 기능을 이 실행에서 끈다. 다른 서비스 등급을 물려받는 추가 실행을 만들지 않는다.
- 일반 작업은 workspace-write 샌드박스, 검증 작업은 read-only 샌드박스를 요청한다. 추가 권한 요청은 자동 승인하지 않고, 샌드박스 외부 접근을 허용하는 모드를 사용하지 않는다.
- 실패나 시간 초과를 무한 재시도하지 않는다. 가능한 경우 중단 요청을 보내고 실행기를 종료한다. 크레딧 구매, 자동 충전, 플랜 변경은 수행하지 않는다.
- 이는 이 진입점을 통해 시작한 실행의 정책이다. 기존 앱 설정이나 별도로 실행한 세션까지 변경/강제한 것은 아니다. 원격 서비스의 최종 청구 내역을 이 코드가 보증하지 않는다.

## 표시와 증거

표시는 런타임 검증 후 `Codex/반환된 모델 ID/작업 강도` 한 줄이다. 같은 프로세스에서 같은 상태를 반복 표시하지 않는다. 모델의 자기소개, 답변 품질·속도, 미리 적어둔 이름을 근거로 쓰지 않는다.

`--audit`를 지정하면 요청 본문·코드·이메일·토큰 없이 모델, 추론 설정, 서비스 등급, 스레드/턴 ID, 완료 시간만 로컬 JSONL에 기록한다. 이 파일은 공개 저장소에 올리지 않는다.

`evidence=codex-client-runtime`은 공식 클라이언트가 반환한 실행 설정과 완료 기록을 확인했다는 뜻이다. 서버 내부 모델 가중치에 대한 독립적인 증명은 아니다. `--verify`에서는 두 개 이상 서로 다른 모델과 각 작업의 완료 응답이 확인되어야 `modelSwitchVerified=true`가 된다. 모두 같은 모델이면 전환 검증 실패다.

## 검증 근거와 남은 연결

- `node --test scripts/codex-auto.test.mjs`: 18/18 통과, 모두 오프라인/모의 검증.
- `node scripts/codex-auto.mjs --check`: 실제 실행했으나 `CODEX_NOT_INSTALLED`, 종료 코드 1.
- 실제 계정의 `--verify`: 미실행. 로그인된 Codex 실행 환경이 연결되어야 가능하다.
- 표시 규칙만 추가하던 이전 방식에서 실제 JSON-RPC 실행 경로를 추가했다. 게임 코드와 저장 데이터는 변경하지 않았다.

공식 인터페이스 확인 자료:

- `https://developers.openai.com/codex/app-server`
- `https://developers.openai.com/codex/config-reference`
- `https://raw.githubusercontent.com/openai/codex/main/codex-rs/app-server-protocol/schema/typescript/v2/ThreadStartResponse.ts`
- `https://raw.githubusercontent.com/openai/codex/main/codex-rs/app-server-protocol/schema/typescript/v2/TurnStartParams.ts`

프로토콜이나 클라이언트 버전이 다르면 안전하게 오류로 중단할 수 있다. 모의 테스트 통과를 실제 계정에서의 호환성·성능 검증으로 확대해서 보고하지 않는다.
