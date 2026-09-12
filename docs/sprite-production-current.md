# 현재 작업 프롬프트 — 2026-09-12 모바일·QA 후속

목표: 승인된 생성 총기를 유지하면서 약실 개방처럼 보이는 부분을 국소 수정하고, 모바일 캔버스 열화 원인을 제거한다. 구버전 Claude QA는 본문 확보 후 현재 코드와 대조한다.
완료 조건: DPR·화면 크기·회전별 실제 렌더러와 CSS 터치 좌표 검증, 원화 알파와 파지 기준점 보존, GitHub 안전 병합·푸시와 Replit Free 실행 확인. 실기기 검증과 로컬 검증을 구분한다.
제약: 거부된 코드 총기 재사용 금지. 기존 데이터·AI 정보 규칙·포트·작업 보존. 유료 옵션 금지. QA 본문 추측 금지. C# 전환은 언어 자체 병목의 근거가 있을 때만 한다.
현재 근거: 터치/짧은 화면 DPR 1 제한, 지도 0.5배 캐시, 총기 192px 고정 중간 이미지. 시뮬레이션은 Worker에서 실행된다. Claude 링크 일반 열람 실패로 본문 미확보.
다음 행동: 화면 픽셀 예산 내 고밀도 출력과 화면 크기 지도 캐시를 적용·검증한다. 총기는 원본 검수 후 국소 편집 프롬프트를 별도 기록한다.

## 공통 제작 프롬프트

실제 전술 FPS 매니저용 개별 총기 래스터 스프라이트. 완전한 측면, 개머리판 왼쪽·총구 오른쪽, 수평 총열. 투명 배경, 한 자루, 전체 외곽 여백. 제조사 형태를 읽을 수 있는 리시버/탄창/핸드가드/개머리판/조준장치. 정돈된 2~3단계 색면과 굵고 일정한 어두운 외곽선. 군용 폴리머·금속의 저채도 색상, 작은 면 분할·음각·결합부. 참고 총기 모드 시트 수준의 묘사 밀도. 손·인물·그림자·문자·로고·워터마크·배경 무늬·3D 광택·추상 도형화 금지. 축소해도 총종을 식별할 실루엣.

생성 모델 출력과 실제 알파·파일 경로는 결과를 받은 뒤 기록한다.

## 실제 제작·연결 결과

- 생성: 개별 PNG 12종. L119A2, MP5SD, HK416, X95, MPX, AS Val, HK417, PSG-1, P90, C14, K1A, ARX160. 생성 원본을 변경 없이 프로젝트의 public/operators/weapons에 복사했습니다.
- 제외: 첫 L119A2 명암 수정본 2장은 RGB 체크무늬여서 게임에 연결하지 않았습니다. 다른 원본 재생성 후 실제 알파를 검사했습니다.
- 원화 기준점: 무기별 총구·손잡이·지지 손·탄창 좌표를 지정하고 엔진 총구에 맞춰 조립합니다. 거부된 코드 총기 생성기는 제거했습니다.
- 투척: 위팔·아래팔 길이 고정, 팔꿈치 회전과 회복. 총기를 몸통 가까이 낮추며 파지 위치로 복귀합니다. 장전은 원본 탄창 위치로 손을 이동하고 가짜 코드 탄창을 덧그리지 않습니다.
- 검수: RGBA 12파일, 96방향·8경계 연속성, 18동작·101시점 팔 길이, 36군장 합성, 실제 Canvas 11장면, 타입/빌드. 미술 승인·실기기 플레이·세대별 완전 고증과 별도입니다.
- 후속: 실제 휴대폰 초기 로딩·관전, 별도 탄창/작업 도구 스프라이트, 세부 모델 원자료 검수.

## 총종별로 재작성한 프롬프트 조건

| 총기 | 공통 프롬프트에 추가한 대상 조건 |
|---|---|
| L119A2 | 카빈, 일체형 긴 핸드가드, AR 리시버, 조절식 개머리판, 작은 도트, 코요테 외장 |
| MP5SD | 고정 폴리머 개머리판, 곡선 9mm 탄창, 고무 주름 전방부, 일체형 소음기, 기계식 조준기 |
| HK416 | 검은 조절식 개머리판, 레일 핸드가드, 곡선 STANAG 탄창, 작은 도트 |
| X95 | 불펍 후방 탄창, 고유 폴리머 몸체·전방 손잡이울, 짧은 총열 |
| MPX | 좁은 9mm 탄창, 접이식 프레임 개머리판, 짧은 핸드가드, 작은 도트 |
| AS Val | 프레임 개머리판, 짧은 곡선 탄창, 긴 일체형 소음기, 낮은 기계식 조준기 |
| HK417 | 큰 리시버, 직선 박스 탄창, 긴 핸드가드, 링 마운트가 있는 배율 조준경 |
| PSG-1 | 칙패드 개머리판, 갈색 손바닥 받침 손잡이, 매끄러운 전방부, 긴 총열, 배율 조준경 |
| P90 | 상부 가로 탄창, 두 손 공간, 폴리머 몸체, 통합 광학 브리지, 하부 탄창 금지 |
| C14 | 볼트 손잡이, 코요테 정밀소총 개머리판, 칙레스트, 짧은 박스 탄창, 긴 총열·조준경 |
| K1A | 가는 인입식 개머리판, 짧고 가늘어지는 핸드가드, 기계식 조준기, STANAG 탄창 |
| ARX160 | 곡면 폴리머 리시버, 개머리판 접이 힌지, 통풍구, STANAG 탄창, 작은 도트 |

이 조건은 생성 지시이며 제조사 세부 모델의 사실 검증을 대신하지 않습니다.

## 생성에 사용한 공통 영문 프롬프트

One isolated production raster sprite for DRAFT ORDER. Perfect horizontal right-facing side profile: stock left, muzzle right. Realistic recognizable exterior firearm structure and proportions, illustrated tactical weapon mod quality. Bold continuous near-black outline, charcoal metal with 2–3 large flat gray highlight planes, low-saturation military polymer furniture. Purposeful receiver/controls/rail/magazine details at the quality of detailed RimWorld gun mods, never crude geometric icon shapes. Crisp cel shaded hand-drawn illustration, NO photographic textures, gradient noise, stippling or glossy 3D rendering. Exactly ONE whole gun, clear margins, large landscape image. Genuine transparent PNG alpha around it and through open trigger guard/stock spaces. No checkerboard, solid background, text, logo, watermark, hands, person, detached parts or shadow.

각 호출에는 위 표의 총종별 대상 문장을 덧붙였습니다. 기본 제공 이미지 생성 도구를 사용했으며 별도 API 키·유료 CLI는 사용하지 않았습니다.

## 국소 편집 프롬프트 — 이번 작업

대상 L119A2 / HK416 각 개별 원본. precise-object-edit. 현재 승인된 측면 게임 PNG를 그대로 유지하고 리시버의 열린 배출구 덮개만 닫힌 상태로 변경한다. 약실 내부가 드러나 보이지 않게 하되 리시버 전체를 새로 디자인하지 않는다. 총구, 개머리판, 탄창, 손잡이, 조준경, 색상, 외곽, 여백, 원본 크기와 투명 알파를 보존한다. 한 자루, 배경·체크무늬·그림자·텍스트 없음. 편집 결과의 알파/구도/기준점이 깨지면 연결하지 않는다. 다른 총종은 열린 덮개와 닫힌 노리쇠가 보이는 배출구를 혼동해 일괄 덮지 않는다.
