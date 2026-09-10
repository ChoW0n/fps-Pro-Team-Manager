# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## 작업 규칙

- 요청받지 않은 기능, 파일, 설정을 만들지 않는다. 나중에 필요할 것 같다는 이유로 미리 만드는 것을 금지한다.
- 구현이 하나뿐인 인터페이스, 제품이 하나뿐인 팩토리, 바뀌지 않는 값을 위한 설정 파일을 만들지 않는다.
- 같은 로직을 두 번 구현하지 않는다. 새 코드를 쓰기 전에 이미 있는 함수나 클래스를 먼저 찾아본다.
- 새 라이브러리를 추가하기 전에 표준 기능이나 이미 설치된 것으로 해결되는지 먼저 확인한다. 몇 줄로 되는 일에 라이브러리를 추가하지 않는다.
- 파일 수를 최소로 유지한다. 다만 이 프로젝트는 유니티(C#) 복습이 목적이므로 데이터 클래스와 로직 클래스의 책임 분리는 유지한다. 이 둘이 충돌하면 책임 분리를 우선한다.
- 영리한 코드보다 지루하고 읽기 쉬운 코드를 택한다.
- 의도적으로 단순하게 처리해서 한계가 생기는 부분에는 한글 주석으로 그 한계와 나중에 개선할 방향을 적어 둔다.
- 모든 코드에 한글 주석을 작성하고 클래스, 생성자, 메서드마다 짧은 설명을 붙인다.
- 필요한 패키지나 도구가 없으면 먼저 설치를 시도한다. 실제로 설치를 시도했다가 실패한 경우에만 사유와 함께 보고하고 멈춘다.
- 지정된 스택과 설계를 임의로 바꾸지 않는다.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
