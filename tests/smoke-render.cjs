// 실제 Canvas 연무의 수명·경계·결정성을 검사합니다. 브라우저 성능 검사는 아닙니다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { createCanvas } = require('@napi-rs/canvas');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, file);
global.document = { createElement: () => createCanvas(1, 1) };
const { createSmokeTexture, paintSmoke } = require('../artifacts/draft-order-player-generator/src/components/smokeEffect.ts');
const texture = createSmokeTexture();
// 같은 경기 시각은 같은 픽셀을 만들며 판정 밖과 만료 이후에는 그리지 않습니다.
function render(age, reducedMotion = false) {
  const canvas = createCanvas(256, 256), ctx = canvas.getContext('2d');
  paintSmoke(ctx, texture, 128, 128, 95, age, 10, reducedMotion);
  assert.equal(ctx.globalAlpha, 1);
  const pixels = ctx.getImageData(0, 0, 256, 256).data;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    if (Math.hypot(x - 128, y - 128) > 97) assert.equal(pixels[(y * 256 + x) * 4 + 3], 0);
  }
  return { canvas, pixels };
}
assert(render(-.1).pixels.every(value => value === 0));
assert(render(10).pixels.every(value => value === 0));
assert(render(0).pixels[(128 * 256 + 128) * 4 + 3] > 200);
assert.deepEqual(render(3).pixels, render(3).pixels);
assert.notDeepEqual(render(3).pixels, render(5).pixels);
assert.deepEqual(render(3, true).pixels, render(5, true).pixels);
assert(render(10, true).pixels.every(value => value === 0));
if (process.env.DRAFT_SMOKE_IMAGE) fs.writeFileSync(process.env.DRAFT_SMOKE_IMAGE, render(3).canvas.toBuffer('image/png'));
console.log('PASS smoke: lifetime, full initial radius, bounds, deterministic motion, context restoration');
