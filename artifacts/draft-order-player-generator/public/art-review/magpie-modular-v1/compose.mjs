// 같은 좌표계의 실제 부품을 겹칩니다. 관절이나 무기 형태를 변형하지 않습니다.
export function drawMagpiePilot(context, images, { x = 0, y = 0, size = 1254, angle = 0, body = true, weapon = true, kit = true } = {}) {
  context.save();
  context.translate(x + size / 2, y + size / 2);
  context.rotate(angle);
  const visible = { body, weapon, kit };
  for (const name of ['body', 'weapon', 'kit']) {
    if (visible[name]) context.drawImage(images[name], -size / 2, -size / 2, size, size);
  }
  context.restore();
}
