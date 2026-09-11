# COLLIER 원화와 행동 시트 제작 이력

생성 방식: 내장 이미지 생성 도구. 유료 외부 이미지 API를 사용하지 않았습니다.
후처리: 사용자가 승인한 코드 기반 배경 제거·색 번짐 제거·크롭·몸 중심 정렬·균일 축소·WebP 압축입니다. 손·총기·관절 형상을 코드로 다시 그리지 않았습니다.

- `downed-v3-keyed.png`: 기존 단일 고해상도 측와위 원본입니다. 이미 제작한 파일을 다운 정지에 재사용하며, 한 자세씩 개별 생성하는 것을 기본 제작 방식으로 삼지 않습니다.
- `downed-crawl-v1-keyed.png`: 한 행동(다운 이동)의 4프레임을 한 번의 생성 요청으로 제작한 원본입니다.
- `downed-crawl-v1-anchors.json`: 원본 시트의 프레임별 몸 중심·총구 좌표입니다. 단위는 원본 이미지 픽셀입니다.
- 생성된 4프레임은 원시 2×2 격자를 일부 넘습니다. 투명 연결 영역으로 인물을 분리한 후 같은 몸 중심에 정렬하므로 손을 자르거나 옆 인물의 발을 가져오지 않습니다.
- 측정된 다운 이동 원본 영역: 748×290, 693×324, 705×302, 694×305px. 시트 전체 1448×1086px를 개별 프레임 해상도로 보고하지 않습니다.
- 주무기는 기존 COLLIER 설정의 MP5SD 계열 외형을 따릅니다. 제조사 도면과 모든 부품·제식 장비를 대조한 고증 완료본은 아닙니다.
- 정지 원화 1종과 다운 이동 4프레임만 연결합니다. 다른 인물, 건강한 포복, 다운 전환·소생·사망 전체 팩은 아직 완료하지 않았습니다.

## 재생과 확인

실제 `downed.mode === 'crawl'`, 생존, 이동 속도가 있을 때만 경기 시각으로 4프레임을 재생합니다. 개인 시야·발사 원점·물리·난수는 변경하지 않습니다. 정지 지혈과 이미지 디코딩 대기에는 다운 정지 원화를 사용합니다. 두 관전 렌더러가 같은 자료를 읽습니다.

새 행동은 기본 4~6프레임/시트입니다. 원본 프레임 장축 최소 512px, 실제 관절·파지·연속성 검수, 원화 확대 금지가 기준입니다. 이 자동 기준은 육안 검수나 실제 브라우저 플레이를 대신하지 않습니다.

## 원문 프롬프트 — 단일 정지 원화(이전 제작물 재사용)

Use case: stylized-concept.
Asset type: ONE high-resolution production character sprite for DRAFT ORDER, not a sprite sheet.
Input image 1: reference for COLLIER's identity, black equipment, cloth, gloves and MP5SD only. Do NOT copy the standing pose or portrait camera.
Primary request: render exactly ONE complete human in ONE downed, side-lying pose. COLLIER is incapacitated but conscious, lying on his left side with head toward the RIGHT edge and boots toward the LEFT edge. Torso, pelvis and legs all lie horizontally on the same floor plane. Knees gently bent, anatomically connected hips. Left forearm rests on the floor, supporting his upper body only slightly. His right hand securely wraps the pistol grip of his MP5SD; index finger straight outside the trigger guard. The gun lies supported across his upper chest and left forearm, muzzle pointing right and away from his body; a visible two-point sling retains it against his vest. No firing.
Camera: orthographic view from directly ABOVE, exactly perpendicular to the floor, true top-down 90 degrees. Show the top and side of helmet and clothing as dictated by the side-lying pose, not a standing torso grafted onto horizontal legs.
Weapon: coherent straight MP5SD silhouette matching reference, short tubular receiver, narrow curved magazine, ribbed rubber SD fore-end around the integral suppressor, extended twin-rail stock. Clear contact between the gloved palm, grip, gun and supporting forearm. One gun, one pair of arms, one pair of legs. No detached weapon or floating hand.
Appearance: realistic premium 3D game render with fine black ripstop, matte helmet, goggles, fabric face covering, compact black plate carrier and pouches, subdued cyan identification patch. Natural proportions, readable fabric folds, no cartoon outlines.
Framing: landscape 1536 by 1024 or larger native output; the single figure fills 88–92 percent of image width with every boot, finger and muzzle safely inside. Maximize native detail on this ONE pose. No contact sheet, no duplicate, no other objects or people.
Background: genuinely transparent alpha channel, clean cutout with no floor or cast shadow. If a solid backdrop is required use a perfectly uniform vivid magenta #ff00ff, never a painted checkerboard.
Avoid: grids, multi-pose layout, labels, text, floor, medical gore, motion blur, muzzle flash, distorted gun, upright torso, flat cutout legs.

## 원문 프롬프트 — 정지 원화 배경 수정

Edit target: the attached ONE high-resolution COLLIER downed sprite. Change ONLY the background. Replace every light checkerboard background pixel with perfectly uniform solid vivid magenta RGB(255,0,255), including the gap below the magazine and the arm. Preserve the exact single character pose, all anatomy, all equipment, weapon silhouette, hand contact, texture detail, lighting, size, position and existing image resolution of 1536×1024. No changes to the character at all. Do not paint checkerboard. Do not add shadows. One character only, no sheet, no resizing. Background extraction preparation; keep the original high-resolution pixels of the subject as faithfully as possible.

## 원문 프롬프트 — 행동별 4프레임 시트

Use case: stylized-concept. Production asset: ONE ACTION animation sheet for DRAFT ORDER.
Input image: COLLIER's reviewed identity, clothing, gun and downed anatomy reference. Preserve his black helmet, amber goggles, black mask, plate carrier, cyan upper-arm patch, MP5SD proportions and gloved right-hand grip.
Create exactly FOUR sequential frames of ONE action: an incapacitated but conscious COLLIER slowly dragging himself along the floor. All four frames show the same side-lying casualty, head and gun to the RIGHT and boots to the LEFT. He cannot shoot. Right hand retains the MP5SD against the chest on its taut two-point sling; left hand and forearm do the crawling. Torso, pelvis and both legs remain low on the SAME floor plane.
Layout: 2 columns × 2 rows, four equal landscape cells, chronological order left-to-right top-to-bottom. Output 2048×1536 if supported. Only FOUR characters in the entire image, not dozens. Each figure fills about 85% of its cell width. At least 5% clear margin around every body. Entire boots, fingers and muzzle included in each cell. Fixed camera, uniform physical scale and same pelvis anchor in every cell. No text, grid lines, numbers or other props.
Frame 1: left forearm reaching forward to the right, palm opening to find purchase; near knee bent to prepare a push.
Frame 2: left palm firmly planted, elbow starting to bend, body weight supported; near knee pushes while the other leg extends.
Frame 3: left elbow pulled closer to the ribcage as the body is drawn forward, shoulder and hip move together; pushing leg extends.
Frame 4: left forearm lifts minimally and reaches forward again to loop naturally into frame 1, knee recovering.
Do not draw the character translating across the cell; show the articulation at a fixed pelvis anchor. Clear distinct arm and knee phases, not four duplicated stills. Gentle realistic movement, no upright torso, no extreme twisted joints, no standing legs.
Weapon: ONE MP5SD per character, identical straight tubular receiver, slim curved magazine, ribbed SD fore-end and integral suppressor, twin-rail stock. Maintain the exact right-hand pistol-grip contact in all frames, finger outside trigger guard, sling and chest physically support the gun while the left arm moves. Never let the gun float, split, bend, turn into an AR rifle or leave his right hand.
Camera: consistent overhead orthographic view from directly above the floor; side-lying body exposes some face and chest naturally. No standing portrait camera. Detailed realistic premium 3D game sprite rendering, realistic cloth, hands and rigid equipment.
Background: completely uniform solid vivid MAGENTA #ff00ff, including all gaps between limbs. No checkerboard, gradients, floor, shadows, scenery, blood, muzzle flashes, other people or medical equipment. Background removal will be done once offline.
