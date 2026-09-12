/** 작은 연무 텍스처를 한 번 만들며 경기 난수와 GPU 필터를 사용하지 않습니다. */
export function createSmokeTexture(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  const base = ctx.createRadialGradient(96, 96, 0, 96, 96, 96);
  base.addColorStop(0, '#B9C3C6');
  base.addColorStop(.65, '#A6B2B8F0');
  base.addColorStop(1, '#A6B2B800');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 192, 192);
  for (let i = 0; i < 24; i++) {
    const angle = i * 2.399963, orbit = 58 * Math.sqrt((i + .5) / 24);
    const x = 96 + Math.cos(angle) * orbit, y = 96 + Math.sin(angle) * orbit;
    const puff = ctx.createRadialGradient(x, y, 0, x, y, 22 + i % 5 * 3);
    puff.addColorStop(0, i % 3 === 0 ? '#EBEEE94D' : '#4E626D38');
    puff.addColorStop(1, '#85949B00');
    ctx.fillStyle = puff;
    ctx.fillRect(0, 0, 192, 192);
  }
  // 가장자리 입자도 함께 흐려 원형 클리핑 테두리가 드러나지 않게 합니다.
  ctx.globalCompositeOperation = 'destination-in';
  const edge = ctx.createRadialGradient(96, 96, 60, 96, 96, 96);
  edge.addColorStop(0, '#FFFFFFFF');
  edge.addColorStop(1, '#FFFFFF00');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 192, 192);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/** 판정 반경을 줄이지 않고 실제 유효 기간에만 느린 연무 회전을 표시합니다. */
export function paintSmoke(ctx: CanvasRenderingContext2D, texture: HTMLCanvasElement,
  x: number, y: number, radius: number, age: number, duration: number, reducedMotion = false): void {
  if (age < 0 || age >= duration || radius <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(texture, -radius, -radius, radius * 2, radius * 2);
  if (!reducedMotion) ctx.rotate(age * .055);
  ctx.globalAlpha *= .38;
  ctx.drawImage(texture, -radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}
