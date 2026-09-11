"""승인된 오프라인 배경 제거·정렬·압축만 수행합니다. 자세·손·총기를 그리지 않습니다."""
import argparse
from collections import deque
import hashlib
import json
import math
from pathlib import Path

from PIL import Image


def remove_magenta(image):
    """마젠타를 쓰지 않는 원화의 키 배경과 가장자리 색 번짐을 제거합니다."""
    pixels = []
    for red, green, blue, alpha in zip(*(channel.tobytes() for channel in image.split())):
        spill = max(0, min(red, blue) - green)
        coverage = 255 - spill
        if coverage < 10 or (min(red, blue) > 180 and spill > 100):
            pixels.append((0, 0, 0, 0))
        elif spill:
            value = min(255, round(green * 255 / coverage))
            # 생성 배경의 미세한 색 편차가 검은 장비 가장자리에 파랑·빨강 테두리로 남지 않게 합니다.
            red = value if spill > 20 else round(max(0, red - spill) * 255 / coverage)
            blue = value if spill > 20 else round(max(0, blue - spill) * 255 / coverage)
            pixels.append((red, value, blue, round(alpha * coverage / 255)))
        else:
            pixels.append((red, green, blue, alpha))
    result = Image.new('RGBA', image.size)
    result.putdata(pixels)
    return result


def connected_frames(alpha):
    """투명 여백으로 분리된 몸체를 찾아 인접 셀의 손·발을 잘라내지 않습니다."""
    width, height = alpha.size
    occupied = bytearray(value > 16 for value in alpha.tobytes())
    minimum = max(16, sum(occupied) * .02)
    components = []
    for start in range(len(occupied)):
        if not occupied[start]:
            continue
        occupied[start] = 0
        pending, pixels = deque([start]), []
        left, top, right, bottom = width, height, 0, 0
        while pending:
            current = pending.popleft()
            pixels.append(current)
            x, y = current % width, current // width
            left, top, right, bottom = min(left, x), min(top, y), max(right, x + 1), max(bottom, y + 1)
            neighbors = []
            if x: neighbors.append(current - 1)
            if x + 1 < width: neighbors.append(current + 1)
            if y: neighbors.append(current - width)
            if y + 1 < height: neighbors.append(current + width)
            for neighbor in neighbors:
                if occupied[neighbor]:
                    occupied[neighbor] = 0
                    pending.append(neighbor)
        if len(pixels) >= minimum:
            components.append({'pixels': pixels, 'bounds': [left, top, right, bottom]})
    return components


def prepare(source, output, metadata, pivot, muzzle, world_width, key_magenta=False):
    """기존 정지 원화만 입고합니다. 연속 모션은 prepare_sheet에서 함께 처리합니다."""
    if len({source.resolve(), output.resolve(), metadata.resolve()}) != 3:
        raise ValueError('원본과 출력 경로는 서로 달라야 합니다')
    if not 0 < world_width <= 200:
        raise ValueError('월드 크기를 명시적으로 확인해 주세요')
    Image.open(source).verify()
    image = Image.open(source).convert('RGBA')
    if key_magenta:
        image = remove_magenta(image)
    alpha = image.getchannel('A')
    histogram = alpha.histogram()
    if histogram[0] < image.width * image.height * .05:
        raise ValueError('실제 투명 배경이 필요합니다. 불투명 체크무늬는 입고하지 않습니다')
    bounds = alpha.point(lambda value: 255 if value > 32 else 0).getbbox()
    if bounds is None:
        raise ValueError('빈 원화입니다')
    subject_size = [bounds[2] - bounds[0], bounds[3] - bounds[1]]
    if max(subject_size) < 512:
        raise ValueError('프레임 원본 긴 변이 512px 미만입니다. 작은 프레임 확대는 금지합니다')
    components = connected_frames(alpha)
    if len(components) != 1:
        raise ValueError('여러 프레임은 행동 시트 입고로 처리해 주세요')
    left, top = max(0, bounds[0] - 8), max(0, bounds[1] - 8)
    right, bottom = min(image.width, bounds[2] + 8), min(image.height, bounds[3] + 8)
    cropped = image.crop((left, top, right, bottom))
    ratio = min(1, 1024 / max(cropped.size))
    size = tuple(round(edge * ratio) for edge in cropped.size)
    runtime = cropped.resize(size, Image.Resampling.LANCZOS)

    # 원화 픽셀의 기준점을 크롭·균일 축소와 동일하게 변환합니다.
    anchors = [[round((x - left) * ratio, 3), round((y - top) * ratio, 3)] for x, y in (pivot, muzzle)]
    if any(not (0 <= x < size[0] and 0 <= y < size[1]) for x, y in anchors):
        raise ValueError('피벗 또는 총구가 프레임 밖입니다')
    output.parent.mkdir(parents=True, exist_ok=True)
    metadata.parent.mkdir(parents=True, exist_ok=True)
    runtime.save(output, 'WEBP', quality=94, method=6, exact=True)
    record = {
        'source': {'file': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                   'size': list(image.size), 'subjectBounds': list(bounds), 'subjectSize': subject_size,
                   'substantialComponents': len(components), 'key': 'magenta' if key_magenta else 'alpha'},
        'processing': {'crop': [left, top, right, bottom], 'ratio': ratio, 'upscaled': False,
                       'bytes': output.stat().st_size, 'geometryEdited': False},
        'visual': {'sprite': output.name, 'width': size[0], 'height': size[1],
                   'pivot': anchors[0], 'muzzle': anchors[1], 'scale': world_width / size[0]},
        'review': 'Single pose only. Pixel/alpha checks do not certify anatomy, weapon accuracy or animation.',
    }
    metadata.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return record


def prepare_sheet(source, output, metadata, anchors, action, world_width, key_magenta=False):
    """한 행동의 4~6프레임을 한 번에 분리·정렬하여 하나의 투명 시트로 저장합니다."""
    if len(anchors) not in (4, 6) or not action:
        raise ValueError('행동명과 4개 또는 6개의 프레임 원점이 필요합니다')
    if len({source.resolve(), output.resolve(), metadata.resolve()}) != 3:
        raise ValueError('원본과 출력 경로는 서로 달라야 합니다')
    if not 0 < world_width <= 200:
        raise ValueError('월드 크기를 명시적으로 확인해 주세요')
    Image.open(source).verify()
    image = Image.open(source).convert('RGBA')
    if key_magenta:
        image = remove_magenta(image)
    alpha = image.getchannel('A')
    if alpha.histogram()[0] < image.width * image.height * .05:
        raise ValueError('실제 투명 배경이 필요합니다')
    frames = connected_frames(alpha)
    if len(frames) != len(anchors):
        raise ValueError(f'몸체 {len(frames)}개: 프레임 수 불일치 또는 인물끼리 붙어 있습니다')
    frames.sort(key=lambda frame: ((frame['bounds'][1] + frame['bounds'][3]) / 2 >= image.height / 2, frame['bounds'][0]))
    for frame, anchor in zip(frames, anchors):
        left, top, right, bottom = frame['bounds']
        if max(right - left, bottom - top) < 512:
            raise ValueError('프레임 원본 긴 변이 512px 미만입니다. 프레임 수를 줄이거나 원본을 개선해 주세요')
        for x, y in (anchor['pivot'], anchor['muzzle']):
            if not (left <= x < right and top <= y < bottom):
                raise ValueError('기준점이 해당 프레임 밖입니다')
    left_span = max(anchor['pivot'][0] - frame['bounds'][0] for frame, anchor in zip(frames, anchors)) + 8
    top_span = max(anchor['pivot'][1] - frame['bounds'][1] for frame, anchor in zip(frames, anchors)) + 8
    source_width = left_span + max(frame['bounds'][2] - anchor['pivot'][0] for frame, anchor in zip(frames, anchors)) + 8
    source_height = top_span + max(frame['bounds'][3] - anchor['pivot'][1] for frame, anchor in zip(frames, anchors)) + 8
    ratio = min(1, 512 / max(source_width, source_height))
    width, height = math.ceil(source_width * ratio), math.ceil(source_height * ratio)
    columns = len(frames) // 2
    atlas = Image.new('RGBA', (width * columns, height * 2))
    visuals, source_frames = [], []
    original_alpha = alpha.tobytes()
    for index, (frame, anchor) in enumerate(zip(frames, anchors)):
        left, top, right, bottom = frame['bounds']
        mask = bytearray(image.width * image.height)
        for pixel in frame['pixels']:
            mask[pixel] = original_alpha[pixel]
        body = image.crop((left, top, right, bottom))
        body.putalpha(Image.frombytes('L', image.size, bytes(mask)).crop((left, top, right, bottom)))
        body = body.resize((round(body.width * ratio), round(body.height * ratio)), Image.Resampling.LANCZOS)
        cell_x, cell_y = index % columns * width, index // columns * height
        atlas.alpha_composite(body, (cell_x + round((left - anchor['pivot'][0] + left_span) * ratio),
                                    cell_y + round((top - anchor['pivot'][1] + top_span) * ratio)))
        visuals.append({'sprite': output.name, 'width': width, 'height': height,
                        'sheetWidth': atlas.width, 'sheetHeight': atlas.height,
                        'region': [cell_x, cell_y, width, height],
                        'pivot': [round(left_span * ratio, 3), round(top_span * ratio, 3)],
                        'muzzle': [round((anchor['muzzle'][0] - anchor['pivot'][0] + left_span) * ratio, 3),
                                   round((anchor['muzzle'][1] - anchor['pivot'][1] + top_span) * ratio, 3)],
                        'scale': world_width / width})
        source_frames.append({'bounds': frame['bounds'], 'subjectSize': [right - left, bottom - top],
                              'pivot': anchor['pivot'], 'muzzle': anchor['muzzle']})
    output.parent.mkdir(parents=True, exist_ok=True)
    metadata.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output, 'WEBP', quality=94, method=6, exact=True)
    record = {'action': action, 'source': {'file': source.name, 'size': list(image.size),
              'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'frames': source_frames},
              'processing': {'ratio': ratio, 'upscaled': False, 'geometryEdited': False, 'bytes': output.stat().st_size},
              'frames': visuals,
              'review': 'One action per sheet. Pixel checks do not replace grip, anatomy or motion review.'}
    metadata.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return record


def main():
    """명시한 행동 시트를 일괄 처리하며 게임을 시작할 때는 실행하지 않습니다."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('metadata', type=Path)
    parser.add_argument('--pivot', nargs=2, type=float)
    parser.add_argument('--muzzle', nargs=2, type=float)
    parser.add_argument('--frame-anchors', type=Path)
    parser.add_argument('--action')
    parser.add_argument('--world-width', type=float, required=True)
    parser.add_argument('--key-magenta', action='store_true')
    args = parser.parse_args()
    if args.frame_anchors:
        record = prepare_sheet(args.source, args.output, args.metadata,
                               json.loads(args.frame_anchors.read_text(encoding='utf-8')), args.action,
                               args.world_width, args.key_magenta)
    elif args.pivot and args.muzzle:
        record = prepare(args.source, args.output, args.metadata, args.pivot, args.muzzle,
                         args.world_width, args.key_magenta)
    else:
        parser.error('행동 시트의 --frame-anchors 또는 기존 정지 원화의 --pivot/--muzzle이 필요합니다')
    print(json.dumps(record, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
