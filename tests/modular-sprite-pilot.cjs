// 브라우저용 조립 함수를 로컬 Canvas에서 실행합니다. 플레이·애니메이션 검증은 아닙니다.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// 좌표가 다른 부품이나 장비 토글 회귀를 검출하고 실제 조립 화면을 저장합니다.
async function main() {
  const root = path.resolve(__dirname, '..');
  const directory = path.join(root, 'artifacts/draft-order-player-generator/public/art-review/magpie-modular-v1');
  const { drawMagpiePilot } = await import(pathToFileURL(path.join(directory, 'compose.mjs')));
  // 기존 Skia의 WebP 디코드 제한 때문에 검사 입력만 PNG로 재인코딩합니다.
  const decoded = fs.mkdtempSync(path.join(os.tmpdir(),'magpie-parts-'));
  let images;
  try {
    execFileSync('python3',['-c','from PIL import Image\nfrom pathlib import Path\nimport sys\nfor name in ("body","weapon","kit"):\n Image.open(Path(sys.argv[1])/(name+".webp")).save(Path(sys.argv[2])/(name+".png"))',directory,decoded]);
    images = Object.fromEntries(await Promise.all(['body','weapon','kit'].map(async name => [name, await loadImage(fs.readFileSync(path.join(decoded, name + '.png')))])));
  } finally { fs.rmSync(decoded,{recursive:true,force:true}); }
  for (const image of Object.values(images)) assert(image.width === 1254 && image.height === 1254);
  const canvas = createCanvas(1254,1254), context = canvas.getContext('2d');
  const alpha = (x,y) => context.getImageData(x,y,1,1).data[3];
  drawMagpiePilot(context,images);
  assert(alpha(675,90) > 200, '실제 총구가 보입니다');
  assert(alpha(450,1070) > 200 && alpha(790,1140) > 200, '두 발이 남습니다');
  assert(alpha(570,378) > 200 && alpha(775,553) > 200, '두 손목 접점이 비어 있지 않습니다');
  assert.equal(alpha(30,30),0, '배경은 실제 투명입니다');
  fs.mkdirSync(path.join(root,'validation'),{recursive:true});
  fs.writeFileSync(path.join(root,'validation/magpie-modular-assembled.png'),canvas.toBuffer('image/png'));
  const preview = createCanvas(1100,760), view = preview.getContext('2d');
  view.fillStyle = '#0e1113'; view.fillRect(0,0,1100,760);
  drawMagpiePilot(view,images,{x:10,y:30,size:710});
  view.fillStyle = '#d6dce0'; view.font = 'bold 28px sans-serif'; view.fillText('MAGPIE / ASSEMBLY 01',690,85);
  view.font = '16px sans-serif'; view.fillStyle = '#8a959b'; view.fillText('BODY + WEAPON / HANDS + KIT',690,120);
  drawMagpiePilot(view,images,{x:720,y:160,size:230,kit:false,weapon:false});
  drawMagpiePilot(view,images,{x:700,y:430,size:128});
  drawMagpiePilot(view,images,{x:890,y:480,size:64});
  view.fillText('128 px',733,590); view.fillText('64 px',895,590);
  view.fillText('STATIC POSE / NOT GAMEPLAY',690,690);
  fs.writeFileSync(path.join(root,'validation/magpie-modular-review.png'),preview.toBuffer('image/png'));
  context.clearRect(0,0,1254,1254);
  drawMagpiePilot(context,images,{weapon:false});
  assert.equal(alpha(675,90),0,'장비를 끄면 총구가 사라집니다');
  context.clearRect(0,0,1254,1254);
  drawMagpiePilot(context,images,{body:false,weapon:false,kit:false});
  assert(context.getImageData(0,0,1254,1254).data.every(value => value === 0),'모든 부품을 끄면 빈 캔버스입니다');
  const report = { scope:'Static modular assembly in local Skia, not browser/gameplay/animation',
    parts:3, nativeCanvas:[1254,1254], checks:['canvas registration','muzzle','two boots','wrist contact occupancy','alpha','weapon toggle','all hidden'],
    note:'Occupied wrist pixels are not anatomical certification. Visual review is still required.' };
  fs.writeFileSync(path.join(root,'validation/magpie-modular-review.json'),JSON.stringify(report,null,2)+'\n');
  console.log(report);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
