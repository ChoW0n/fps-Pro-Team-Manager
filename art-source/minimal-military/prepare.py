"""이미지 생성 원본에서 배경 제거·셀 자르기·128px 축소만 수행합니다. 인체를 다시 그리지 않습니다."""
from pathlib import Path
import json
from scipy.ndimage import label
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).parent
OUT = ROOT / 'artifacts/draft-order-player-generator/public/operators'

def prepare():
    """공유 피벗을 가진 독립 PNG 파츠를 저장합니다."""
    body = Image.open(SOURCE / 'body-source.png').convert('RGBA')
    pixels = np.array(body)
    # 투명 요청에 불구하고 생성된 회색 체크 배경은 외곽에 연결된 중립색만 제거합니다.
    rgb = pixels[:, :, :3].astype(int)
    background = ((rgb.max(2)-rgb.min(2)<12) & (rgb.min(2)>65)).astype('uint8')
    labels, _ = label(background)
    outside = set(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])) - {0}
    pixels[np.isin(labels, list(outside)), 3] = 0
    body = Image.fromarray(pixels)
    heads = Image.open(SOURCE / 'heads-source.png').convert('RGBA')
    records = []
    for kind, sheet, rows in [('body', body, 1), ('head', heads, 2)]:
        for row in range(rows):
            for col, view in enumerate(['front', 'back', 'side']):
                w, h = sheet.width / 3, sheet.height / rows
                cell = sheet.crop((round(col*w), round(row*h), round((col+1)*w), round((row+1)*h)))
                # 희미한 투명색 여백만 제거하며 원화의 종횡비를 유지합니다.
                mask = cell.getchannel('A').point(lambda value: 255 if value > 80 else 0)
                bounds = mask.getbbox()
                cell = cell.crop(bounds)
                cell.thumbnail((112, 112), Image.Resampling.LANCZOS)
                frame = Image.new('RGBA', (128,128))
                frame.alpha_composite(cell, ((128-cell.width)//2, 120-cell.height))
                name = f'minimal-{kind}-{row}-{view}.png'
                frame.save(OUT / name, optimize=True)
                records.append({'file':name, 'size':[128,128], 'anchor':[64,120], 'sourceBounds':bounds})
    (SOURCE / 'parts.json').write_text(json.dumps({'parts':records,'processing':'background removal, crop, aspect-preserving downscale; no anatomical redraw'},ensure_ascii=False,indent=2)+'\n')

if __name__ == '__main__':
    prepare()
