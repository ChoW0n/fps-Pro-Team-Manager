"""행동별 시트·프레임별 실제 픽셀 크기·무확대 후처리를 재실행해 검사합니다."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('prepare_sprite', ROOT / 'scripts/prepare-operator-sprite.py')
prepare_sprite = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare_sprite)


def must_reject(source, output, metadata, message):
    """잘못된 입고를 실제 실행해 출력 파일 작성 전에 거절하는지 확인합니다."""
    try:
        prepare_sprite.prepare(source, output, metadata, (500, 500), (700, 500), 61)
    except ValueError as error:
        assert message in str(error), str(error)
    else:
        raise AssertionError('불량 자산이 통과했습니다')
    assert not output.exists() and not metadata.exists()


def main():
    """실제 원화와 합성 검사 입력으로 해상도·시트·원점 계약을 검사합니다."""
    source = ROOT / 'art-source/operators/collier/downed-v3-keyed.png'
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix='draft-sprite-resolution-') as directory:
        folder = Path(directory)
        output, metadata = folder / 'runtime.webp', folder / 'runtime.json'
        # 검사용 도형은 생성 원화를 대체하지 않습니다.
        candidate = folder / 'candidate.png'
        small = Image.new('RGBA', (1500, 1500))
        ImageDraw.Draw(small).rectangle((650, 650, 850, 850), fill='black')
        small.save(candidate)
        must_reject(candidate, output, metadata, '512px')
        sheet = Image.new('RGBA', (1536, 1024))
        ImageDraw.Draw(sheet).rectangle((20, 20, 700, 900), fill='black')
        ImageDraw.Draw(sheet).rectangle((820, 20, 1500, 900), fill='black')
        sheet.save(candidate)
        must_reject(candidate, output, metadata, '행동 시트')
        Image.new('RGB', (1536, 1024), '#eeeeee').save(candidate)
        must_reject(candidate, output, metadata, '투명 배경')

        result = prepare_sprite.prepare(source, output, metadata, (980, 475), (1493, 673), 61, True)
        assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
        assert result['source']['subjectSize'] == [1490, 659]
        assert result['source']['substantialComponents'] == 1
        assert 0 < result['processing']['ratio'] <= 1 and not result['processing']['upscaled']
        visual = result['visual']
        assert visual['width'] == 1024 and visual['width'] * visual['scale'] == 61
        assert output.stat().st_size < 250_000
        alpha = Image.open(output).getchannel('A')
        assert alpha.getextrema() == (0, 255)
        assert alpha.getpixel((0, 0)) == 0 and alpha.getpixel((1023, 458)) == 0
        expected = json.loads((ROOT / 'artifacts/draft-order-player-generator/src/operators/collier-downed-v3.json').read_text())
        assert result['source'] == expected['source']
        assert result['visual']['pivot'] == expected['visual']['pivot']
        assert result['visual']['muzzle'] == expected['visual']['muzzle']
        sheet_source = ROOT / 'art-source/operators/collier/downed-crawl-v1-keyed.png'
        anchors = json.loads((ROOT / 'art-source/operators/collier/downed-crawl-v1-anchors.json').read_text())
        sheet_output, sheet_metadata = folder / 'sheet.webp', folder / 'sheet.json'
        sheet_record = prepare_sprite.prepare_sheet(sheet_source, sheet_output, sheet_metadata, anchors, 'downed-crawl', 61, True)
        assert len(sheet_record['frames']) == 4
        assert all(max(frame['subjectSize']) >= 512 for frame in sheet_record['source']['frames'])
        assert 0 < sheet_record['processing']['ratio'] <= 1
        assert sheet_output.stat().st_size < 250_000
        assert len({tuple(frame['pivot']) for frame in sheet_record['frames']}) == 1
        assert len({frame['scale'] for frame in sheet_record['frames']}) == 1
        saved = json.loads((ROOT / 'artifacts/draft-order-player-generator/src/operators/collier-downed-crawl-v1.json').read_text())
        assert saved['source'] == sheet_record['source']
        assert [frame['region'] for frame in saved['frames']] == [frame['region'] for frame in sheet_record['frames']]
        sheet_alpha = Image.open(sheet_output).getchannel('A')
        for frame in sheet_record['frames']:
            x, y, width, height = frame['region']
            assert sheet_alpha.getpixel((x, y)) == 0
            assert sheet_alpha.getpixel((x + width - 1, y + height - 1)) == 0
        # 자산 자체의 루프 검수용입니다. 실제 경기 녹화로 표시하지 않습니다.
        if os.environ.get('DRAFT_REVIEW_DIR'):
            review = Path(os.environ['DRAFT_REVIEW_DIR'])
            review.mkdir(parents=True, exist_ok=True)
            atlas, sequence = Image.open(sheet_output).convert('RGBA'), []
            for frame in sheet_record['frames']:
                x, y, width, height = frame['region']
                body = atlas.crop((x, y, x + width, y + height))
                background = Image.new('RGB', body.size, '#161a1d')
                background.paste(body, mask=body.getchannel('A'))
                sequence.append(background)
            sequence[0].save(review / 'collier-crawl-asset-review.gif', save_all=True,
                             append_images=sequence[1:], duration=250, loop=0, disposal=2)
        # 큰 시트여도 프레임의 인물 자체가 작으면 행동 시트 경로에서 거절합니다.
        tiny = Image.new('RGBA', (1536, 1024))
        draw = ImageDraw.Draw(tiny)
        for x, y in ((20, 20), (820, 20), (20, 600), (820, 600)):
            draw.rectangle((x, y, x + 200, y + 200), fill='black')
        tiny.save(candidate)
        try:
            prepare_sprite.prepare_sheet(candidate, folder / 'bad.webp', folder / 'bad.json', anchors, 'downed-crawl', 61)
        except ValueError as error:
            assert '512px' in str(error)
        else:
            raise AssertionError('작은 프레임이 시트 전체 크기만으로 통과했습니다')
    print('PASS original resolution, action sheet, no upscale, immutable source, alpha, consistent anchors/world size, runtime budget')


if __name__ == '__main__':
    main()
