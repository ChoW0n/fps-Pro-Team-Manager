"""기존 키 제거기로 부품을 입고합니다. 관절·총기를 재작성하거나 부품별 크기를 바꾸지 않습니다."""
import hashlib
import importlib.util
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
SOURCE = Path(__file__).resolve().parent
OUTPUT = ROOT / 'artifacts/draft-order-player-generator/public/art-review/magpie-modular-v1'


def main():
    """동일한 원본 좌표를 유지해 배경 제거와 무손실 압축만 수행합니다."""
    spec = importlib.util.spec_from_file_location('sprite', ROOT / 'scripts/prepare-operator-sprite.py')
    sprite = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sprite)
    rows = []
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name in ('body', 'weapon', 'kit'):
        source = SOURCE / f'{name}-keyed.png'
        image = sprite.remove_magenta(Image.open(source).convert('RGBA'))
        assert image.size == (1254, 1254), '부품별 캔버스 크기가 바뀌면 접점이 어긋납니다'
        alpha = image.getchannel('A')
        bounds = alpha.point(lambda value: 255 if value > 32 else 0).getbbox()
        assert bounds and max(bounds[2] - bounds[0], bounds[3] - bounds[1]) >= 512
        assert alpha.histogram()[0] > image.width * image.height * .2
        output = OUTPUT / f'{name}.webp'
        image.save(output, 'WEBP', lossless=True, method=6, exact=True)
        rows.append({'part': name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                     'canvas': list(image.size), 'subjectBounds': list(bounds),
                     'bytes': output.stat().st_size, 'upscaled': False, 'geometryEdited': False})
    report = {'scope': 'MAGPIE static aimed-pose assembly pilot; not animation or gameplay validation',
              'layers': rows, 'nativeFacing': 'up', 'drawOrder': ['body', 'weapon', 'kit'],
              'registration': 'Same canvas, no per-part offsets, rotation or scaling',
              'limitations': ['Weapon and hands are one contact layer, not independently rigged.',
                              'Headgear and carrier are one kit layer in this pilot.',
                              'Exact weapon variant details and unit-issued kit are not certified.']}
    (OUTPUT / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
