# 외부 아트 출처

## Animated Top Down Survivor Player

- 제작자: **Riley Gombart (rileygombart)**
- 원본: https://opengameart.org/content/animated-top-down-survivor-player
- 라이선스: [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
- 내려받은 원본: `Survivor Spine.zip`, `Top_Down_Survivor_2.zip`
- 원본 해시: `art-source/survivor/sources.json`; Spine 원본 ZIP은 같은 폴더에 보존.
- 사용 위치: `public/operators/survivor/`, `SurvivorParts` 렌더러. 앱 하단 **아트 출처**에서 배포용 고지를 연다.
- 변경: 발 PNG를 아틀라스로 패킹. 신체 파츠의 배치·회전·표시 크기를 게임 장착점에 맞춰 변경. 기존 총기/방패와 결합하고 앉기·장전·투척·설치 및 식별 표식을 구성했다.
- Spine 프로젝트 바이너리는 이력 보존이며 런타임에서 실행하지 않는다. 별도 Spine 런타임·편집기·유료 서비스 의존성 없음.
- 원작자의 후원이나 보증을 의미하지 않는다. 위 CC BY 조건은 해당 원본 및 그 파생 아트에 적용한다.

재현: 원본 페이지의 두 ZIP을 내려받은 뒤 `python scripts/import-survivor.py --spine <Spine-ZIP> --frames <프레임-ZIP>` 실행. Python/Pillow는 제작 도구이며 앱 실행 의존성이 아니다.

검증용 reference-rifle.png / reference-pistol.png는 같은 저작자의 원본 idle 0번 프레임이며 원본 CC BY 3.0 표기를 따른다. 원본/게임 비교 이미지에서 왼쪽은 원본, 오른쪽은 수정된 게임 조립이다.
