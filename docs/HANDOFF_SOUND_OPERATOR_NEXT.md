# 다음 채팅 인수인계 — 2026-09-12
프로젝트: ChoW0n/fps-Pro-Team-Manager
현재 목표: 총성 품질·고증 개선, 가젯 탑뷰 정합, 부대 고증에 맞는 캐릭터 스프라이트 제작 및 검수 후 적용.

## 사용자 최신 지시
- ElevenLabs 플러그인을 직접 선택했다. 효과음 생성과 기존 음원 등 여러 방법을 검토할 것.
- 최종 캐릭터는 각 오퍼레이터의 실제 부대 설정에 맞는 복장이어야 한다.
- 첨부 OPERATOR_SPRITE_HANDOFF(1).zip의 상세 Markdown을 숙지하고 이상한 결과를 적용하지 말 것.
- 사용자 요청으로 작업을 멈추고 새 채팅으로 인수인계한다. 추가 확인을 반복 요청하지 말 것.
- 공개 배포·별도 API 과금·가속 옵션 사용은 승인 범위로 확대하지 말 것.

## Git 상태
- main 확인 SHA: 88eedfe357a7016d23c3a1ecd5b12e21031491a8. PR #6, #7 병합 완료.
- 최신 작업의 로컬 커밋: 567bb0b (이 인수인계 브랜치의 변경과 대응).
- 이 브랜치는 작업 보존용이다. 최신 사운드/가젯 수정은 main 미병합, Replit 미반영.
- 이전 main 반영을 요청했던 Replit은 마지막 확인 당시 busy였다. 성공 여부는 새로 확인할 것.
- Replit ID: 218e75d1-0d6e-4ac7-a142-10735950f1e2.

## 이번에 구현한 것
- matchAudio.ts: 저음 사각파 하강 oscillator를 제거하고 노이즈 기반 순간음과 기계음 꼬리로 대체. 기존 weaponHandling 탄종·무기군, MP5SD/AS Val 소음기 구분.
- TacticalRoundLive.tsx: 발사자 weaponName 전달, 거리 감쇠·좌우 배치, 미공개 적 사건 차단, 배속/정지/밀린 사건 재생 차단.
- 이는 임시 합성음이다. 실제 총기 녹음, 음향 고증, 청음 품질 완료로 말하지 말 것. 사용자는 ElevenLabs 등의 더 좋은 경로를 요청했다.
- tactical-device-states-v4.png: 4×3 장비 상태 시트, 탑뷰 재제작. 첫 생성물 체크무늬 배경 불합격 후 실제 RGBA 및 외곽 alpha=0 확인.
- BroadcastCanvas.tsx: 새 v4 적용, 장비 22~30·투척물 14 월드 단위로 크기 축소, 접지 그림자, 벽 축 정렬.
- RealtimeGadget.facing 추가 및 설치 당시 방향 저장. 설치자가 돌아서도 장비가 따라 회전하지 않는다.
- tests/render-broadcast-canvas.cjs: 이펙트 이미지를 operators 폴더에서 잘못 읽던 경로 수정. 이전 테스트는 대체 도형만 검사했을 수 있다.
- docs/OPERATOR_SPRITE_GUIDE.md: 첨부 ZIP의 원문 반영.

## 캐릭터 시제품: 아직 경기 적용 금지
경로: artifacts/draft-order-player-generator/public/art-review/operator-topdown-v1/
- prototype.png: 동일 올리브 캐릭터 대기·앉기·엎드리기 빈손 시제품. RGBA. 총기·가젯·로프 없음.
- index.html: 원본/무기 임시 합성 토글, P90/HK416/C14, 0~360도 회전 비교.
- 생성물은 균등 셀이나 동일 피벗이 아니다. 비교 화면의 영역/피벗은 시제품 추정치이며 완성 소켓 데이터가 아니다.
- 미해결: 대기와 앉기의 실루엣 차이 부족, 주손/보조손/견착점 불일치, 부대별 고증 확인 안 됨.
- 이동·투척·설치·레펠 미제작. 전 오퍼레이터 기본 에셋으로 적용하지 않았다.
- 현재 경기 기본은 minimalOperator.ts의 코드 실루엣이며 팔 생략 상태다. 최신 전달서는 팔 생략이 아니라 자연스러운 빈손 완성 포즈를 요구한다.

## 반드시 지킬 전달서 내용
- 엄정한 수직 탑뷰, 선화 기반 밀리터리, 총기와 같은 선·면 명암·저채도 올리브/탄/차콜.
- 인체·팔·빈손·복장 포함. 총기·가젯·로프·효과는 독립 합성.
- 팔 길이 왜곡, 관절 억지 연결, 몸통 관통, 팔 이중 표시 금지.
- 앉기/엎드리기/레펠은 별도 실루엣. 서 있는 그림을 찌그러뜨려 대체하지 않는다.
- 실부대 복장은 현재 Operator 설정부터 확인하고 공식/신뢰할 자료로 검증. 임의 지급품 단정 금지.
- 시제품 1명 → 소형/일반/장총 합성 → 실제 표시 크기 검수 → 포즈 확장 → 부대/개인 확장 순서.
- P90 화염 결합 레퍼런스는 제외. 비발사형 유지.
- 원본 29장은 기존에 DRAFT ORDER/20-ART-REFERENCE/WEAPON-SOURCE-ORIGINALS로 정리 완료.

## 실행 검증
- TypeScript noEmit: 통과.
- 프로덕션 Vite build: 통과.
- Canvas 렌더 16개 시나리오: 통과. 실제 카메라 표시 이미지 확인.
- tests/preparation-operation.cjs: 실제 20경기 포함 통과.
- tests/presentation-audio-browser.cjs 작성했지만 실행 미완료. Python Playwright 미설치 → 기존 Node Playwright 활용.
- Vite 0.0.0.0 실행은 uv_interface_addresses 오류. --host 127.0.0.1로 서버 시작 해결.
- Chromium 실행 파일 없음. 공식 CDN 다운로드 시간 초과로 중단. 실제 브라우저 청음/포즈 검증을 통과로 쓰지 말 것.

## ElevenLabs
- 사용자 선택 플러그인: app-6a8d784b60cc81919aeafbfaeda5fbcf.
- 읽은 스킬: e12/skills/sound-effects, e12/skills/creative-studio.
- 당시 ALL_TOOLS에서 eleven/sound_effect 검색 결과는 빈 목록. 플러그인 스킬만 읽은 상태이며 생성 도구 호출·음원 생성 없음.
- 새 채팅에서 도구 검색/연결 노출을 다시 확인. SDK 스킬은 API 키가 필요하므로 바로 키 결제 경로로 넘어가지 말 것.
- 생성 효과음은 실총 녹음과 구분. 총기별 단발/연사 꼬리/소음기/실내 잔향 검수. 실제 녹음 자산은 출처·사용권 확인.

## 다음 작업
1. AGENTS.md → KNOWLEDGE_MAP → OPERATOR_SPRITE_GUIDE를 우선 읽고 이 브랜치와 최신 main 차이 확인.
2. ElevenLabs 연결과 사용 가능한 음원 경로 확인, 실제 오디오 에셋 제작·교체·청음 검수.
3. Operator 설정에서 부대/복장 기준표 작성 후 공통 1명 포즈와 총기 접점부터 개선.
4. 브라우저 검증 후 검증된 변경만 main 병합, Replit 반영. 원격 성공 여부 실제 확인.

## 업로드 주의
exec_command 반환에 약 524288자 크기 제한이 있어 대용량 base64가 잘릴 수 있다.
파일을 90000바이트 단위(3의 배수)로 읽고 base64를 합쳐 업로드했다.
GitHub blob SHA가 로컬 Git blob SHA와 동일한지 모든 파일 확인 완료.
출력 잘림 문자열을 파일 내용으로 업로드하지 말 것.
