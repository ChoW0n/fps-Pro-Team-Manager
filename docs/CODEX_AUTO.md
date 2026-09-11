# Codex 작업별 자동 모델 라우팅

기준일: 2026-09-11. 작성 요청: chow0n.

## 현재 상태

**실행기 발견·프로토콜 보강·오프라인 28개 테스트 완료 / 서버 인증 실패로 실제 모델 전환 미검증.**

Work에 `/opt/codex/bin/codex`가 설치되어 있었다. PATH에 없어 이전에는 `CODEX_NOT_INSTALLED`로 보였다. 실행기 버전은 `codex-cli 0.154.0-alpha.3`이다. 경로 지정 후 기존 `--check`는 성공했지만, 서버 계정 조회는 HTTP 401로 실패했다. 로컬 인증 정보와 모델 목록을 실사용 가능한 계정 인증으로 오인하지 않도록 검사 범위를 수정했다. 계정 토큰을 추출하거나 별도 API 키 과금으로 우회하지 않았다.

GitHub 연결은 저장소 읽기·쓰기 기능이다. Codex 추론 실행기나 모델 전환기가 아니다. 이 코드는 **Codex 실행기가 있고 ChatGPT로 로그인된 환경**에서 작업별 모델을 선택하는 별도 진입점이다. 현재 ChatGPT 대화, Codex 웹의 모델 선택기, 이미 진행 중인 부모 에이전트의 모델을 바꾸지는 않는다. 저장소에 파일을 추가한 것만으로 모든 서비스에서 활성화되지 않는다.

## 사용

기존 Node 22 이상과 Codex 실행기를 사용한다. 새 npm 라이브러리는 추가하지 않는다. 사용자의 기기에 설치할 것을 전제로 하지 않으며, 기존 로그인된 Codex 작업 환경에서 실행한다. 실행기가 없거나 로그인이 없으면 실행을 중단한다.

```sh
# PATH 밖의 기존 실행기를 사용할 때만 경로를 지정한다. 새 설치나 인증 복사가 아니다.
export CODEX_BIN=/opt/codex/bin/codex

# 실행기·로컬 ChatGPT 인증·서버 계정 응답·라우팅 가능한 목록을 확인한다.
# 성공해도 모델 생성·전환 검증을 뜻하지 않는다.
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

`account/read → account/rateLimits/read → model/list → 작업 분류 → 모델·지원 추론 강도 선택 → thread/start → 모델·강도·서비스 등급 검증 → turn/start → 실행 중 변경 감시 → 시작/완료 턴 ID 및 저장 기록 대조`

모델 ID를 임의로 만들지 않고 실행기가 반환한 목록에서 고른다. 기본 선호는 FAST: Luna/mini 계열, NORMAL: Terra/Sol 계열, DEEP: Astra/Sol 계열이다. 제공되지 않는 모델은 후보에서 빠진다. 다른 모델도 런타임 기본 모델 또는 목록 후보로 사용 가능하다. 이 순서는 실측 최적화 결과가 아니라 조정 가능한 초기 정책이다. 모델 목록에 나타나는 것과 실제 호출 권한은 같다고 단정하지 않으며, 호출이 거절되면 오류로 종료한다.

자동 분류는 한국어·영어 키워드 기반의 보수적인 초기 구현이다. 맥락 전체를 이해하는 완벽한 난이도 판별기가 아니다. 알 수 없는 작업은 NORMAL, 데이터 손상·인증·핵심 구조 위험은 DEEP을 우선한다. 단순 문구 작업이더라도 영향이 크면 부모 에이전트가 DEEP을 지정한다.

전환은 작업 경계에서 수행한다. 하나의 실행 중인 턴 안에서 모델을 몰래 바꾸지 않는다. 복합 작업에는 관련된 현재 사실·완료 조건·변경 금지 사항을 전달한다. 새 스레드가 이전 대화를 자동으로 기억한다고 가정하지 않는다. 하위 작업은 `DRAFT_ORDER_ROUTED=1`을 받으며 라우터를 재귀 실행하지 않는다.

## 비용·권한

- ChatGPT 로그인만 허용한다. 별도 API 키·다른 공급자 과금으로 우회하지 않는다.
- `service_tier=default`, `features.fast_mode=false`, 턴별 `serviceTierForTurn=default`를 명시한다. 반환 등급은 정확히 `default`만 허용한다. `null`을 표준 등급으로 추정하지 않는다. 생성 전 검사뿐 아니라 실행 중 설정 변경 알림에서도 가속·미확인 등급을 거부한다.
- `allowProviderModelFallback=false`를 요청하고 `model/rerouted` 알림을 거부한다. 새 버전의 실험적 필드·알림을 받기 위해 초기화에서 `experimentalApi=true`를 선언한다. 자동 대체된 모델을 원래 선택 모델로 기록하지 않는다.
- 하위 에이전트 기능을 이 실행에서 끈다. 다른 서비스 등급을 물려받는 추가 실행을 만들지 않는다.
- 일반 작업은 workspace-write 샌드박스, 검증 작업은 read-only 샌드박스를 요청한다. 추가 권한 요청은 자동 승인하지 않고, 샌드박스 외부 접근을 허용하는 모드를 사용하지 않는다.
- 실패나 시간 초과를 무한 재시도하지 않는다. 가능한 경우 중단 요청을 보내고 실행기를 종료한다. 크레딧 구매, 자동 충전, 플랜 변경은 수행하지 않는다.
- 이는 이 진입점을 통해 시작한 실행의 정책이다. 기존 앱 설정이나 별도로 실행한 세션까지 변경/강제한 것은 아니다. 원격 서비스의 최종 청구 내역을 이 코드가 보증하지 않는다.

## 표시와 증거

표시는 런타임 검증 후 `Codex/반환된 모델 ID/작업 강도` 한 줄이다. 같은 프로세스에서 같은 상태를 반복 표시하지 않는다. 모델의 자기소개, 답변 품질·속도, 미리 적어둔 이름을 근거로 쓰지 않는다.

`--audit`를 지정하면 요청 본문·코드·이메일·토큰 없이 모델, 추론 설정, 서비스 등급, 스레드/턴 ID, 완료 상태, 응답 일치 여부, 완료 시간만 로컬 JSONL에 기록한다. 실패 시에는 실패 상태와 RPC 메서드·오류 코드·HTTP 상태만 기록한다. 이 파일은 공개 저장소에 올리지 않는다.

`evidence=codex-client-runtime`은 공식 클라이언트가 반환한 실행 설정과 완료 기록을 확인했다는 뜻이다. `metadataScope=thread-settings-and-turn-completion`을 함께 기록한다. 모델·강도·등급은 스레드 실행 설정, ID·완료는 실제 턴 기록이다. 이 버전의 `Turn`에는 모델·추론 강도·서비스 등급 필드가 없으며 `Thread.model`과 `Thread.reasoningEffort`도 턴별 실행 원격측정값은 아니다. 상류 추론 서버의 실제 처리 모델·청구 등급을 독립적으로 확인했다고 주장하지 않는다. `--verify`에서는 두 개 이상 서로 다른 모델과 각 작업의 완료 응답이 확인되어야 `modelSwitchVerified=true`가 된다. 모두 같은 모델이면 전환 검증 실패다.

## 2026-09-11 실제 환경 검증

작업 기준 main: `f9d3d390e5a3db79f8ce766d293a6925d277c0e7`. 이 커밋에서 분리한 작업 트리로 진행했으며 변경 대상은 라우터·테스트·이 문서·AGENTS.md뿐이다.

| 항목 | 실제 관찰 | 판정 |
|---|---|---|
| 기존 실행기 | `/opt/codex/bin/codex --version`: `0.154.0-alpha.3` | 확인 |
| 로컬 인증 조회 | `account/read`: `account.type=chatgpt` | 로컬 정보만 확인 |
| 런타임 모델 목록 | `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.3-codex-spark` | 호출 권한·실행 증거 아님 |
| 서버 계정 조회 | `account/rateLimits/read`: RPC `-32603`, HTTP `401 Unauthorized` | 인증 실패 |
| 기존 생성 경로 | `thread/start` 30초 제한 초과; 60초 진단에서도 응답 없음 | 스레드/턴 ID 확보 실패 |
| 수정 후 `--check` | `CODEX_RPC_FAILED: account/rateLimits/read (-32603, HTTP 401)`, 종료 1 | 미통과 |
| 수정 후 `--verify --audit …` | 같은 서버 인증 오류, 종료 1 | 미통과·모델 호출 없음 |
| FAST / NORMAL / DEEP | 실제 완료 작업 각각 0개 | 모두 미검증 |
| 서로 다른 모델 전환 | 완료 모델 0개 | 미검증 |
| 비용 정책 | 가속 옵션·별도 API 키·외부 유료 서비스 미사용; `turn/start` 미전송 | 생성 실행의 청구 검증과는 별개 |
| 오프라인 테스트 | `node --test scripts/codex-auto.test.mjs`: 28/28 통과 | 모의 검증 |
| 클라우드 브라우저 | Codex 페이지에 로그인 링크 표시, 로그인된 작업 UI 없음 | 기존 계정 세션 확인 불가 |

서버 오류의 비밀정보 없는 핵심 문구는 “Could not parse your authentication token. Please try signing in again.”이다. 기존 `--check`의 `authenticated=true`는 서버 인증 성공의 근거가 아니었다. 수정 후에는 같은 상태를 성공으로 출력하지 않는다.

스레드 생성 지연은 별도로 남아 있다. 선택적 MCP를 비활성화한 진단과 앱·플러그인 비활성화/임시 스레드 진단에서도 30초 제한을 넘었다. 이를 특정 MCP나 HTTP 401 때문이라고 단정할 근거는 없다. 이 진단 설정은 제품 코드에 반영하지 않았다. 네트워크 정책·관리형 실행 설정은 완화하지 않았다.

실제 실패 감사 기록(토큰·이메일·요청 본문 없음):

```json
{"at":"2026-09-11T11:45:43.628Z","status":"failed","modelSwitchVerified":false,"method":"account/rateLimits/read","rpcCode":-32603,"httpStatus":401}
```

28개 테스트에는 기존 18개와 서버 인증 실패, null 등급, 시작/완료 ID 불일치, 저장 모델 변경, 실행 중 재라우팅·등급 변경, 오류 비밀정보 제거, CLI 전체 모의 실행을 포함한다. 마지막 통합 테스트는 FAST/NORMAL/DEEP 모두 완료되어도 같은 모델이면 종료 코드 1인지 확인한다. 실제 모델 호출을 대체하지 않는다.

## 남은 연결과 완료 기준

1. **이 실행기에서 사용할 수 있는 ChatGPT OAuth 인증**이 필요하다. Work 대화가 로그인되어 있다는 사실을 CLI 인증 전달로 간주하지 않는다. 공식 로그인 흐름을 사용하며 앱 쿠키·토큰을 추출하지 않는다. 브라우저 로그인만으로 CLI까지 연결됐다고 판정하지 않는다.
2. 서버 계정 조회가 성공한 후 `--check`를 통과시킨다. 이 필수 진단 API를 지원하지 않는 실행 환경도 현재는 검증 불가로 중단한다. HTTP 401만으로 계정의 구독 플랜이나 모든 제품의 사용 가능 여부를 단정하지 않는다.
3. 인증 복구 후에도 `thread/start`가 멈추면 관리형 실행 환경의 스레드 생성 연결을 진단한다. 권한 확대나 무한 대기로 해결하지 않는다.
4. `--verify`를 한 번 실행하여 3단계 완료와 최소 2개 모델을 확인한다. 실패 시 성공 판정을 낮추지 않는다. 스레드 설정 증거와 상류 서버의 턴별 처리 메타데이터가 다르다는 한계도 유지한다.

현재 요청의 완료 조건 중 실제 `--check` 성공, 실제 `--verify`, 3단계 실행, 2개 이상 모델 전환은 충족하지 못했다. 속도·품질 최적화 역시 실측하지 않았다.

## 공식 인터페이스 대조

설치된 실행기의 `app-server generate-ts --experimental`로 스키마를 생성하여 `ThreadStartParams`, `ThreadStartResponse`, `TurnStartParams`, `Turn`, `Thread`, `ThreadSettingsUpdatedNotification`, `ModelReroutedNotification`을 확인했다. 생성 스키마 전체나 인증 자료는 저장소에 추가하지 않았다.

- [Codex App Server](https://developers.openai.com/codex/app-server): 초기화, 모델 목록, 스레드/턴, 인증 인터페이스.
- [Codex 인증](https://developers.openai.com/codex/auth): ChatGPT 로그인과 API 키 인증의 구분.

프로토콜이나 실행기 버전이 다르면 검증할 수 없는 응답을 성공으로 추정하지 않는다.
