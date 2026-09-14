"""승인된 통합 오퍼레이터 원본에서 투명 런타임 PNG를 재현한다."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art-source/operators/integrated-v1"
OUTPUT = ROOT / "artifacts/draft-order-player-generator/public/operators"


def background_residual(rgb: np.ndarray) -> np.ndarray:
    """가장자리의 완만한 청회색 배경을 2차 평면으로 추정한다."""
    height, width, _ = rgb.shape
    yy, xx = np.mgrid[-1:1:complex(height), -1:1:complex(width)]
    border = (np.abs(xx) > 0.72) | (np.abs(yy) > 0.72)
    sample = np.flatnonzero(border.ravel())[::16]
    basis = np.stack(
        [
            np.ones(height * width),
            xx.ravel(),
            yy.ravel(),
            xx.ravel() ** 2,
            xx.ravel() * yy.ravel(),
            yy.ravel() ** 2,
        ],
        axis=1,
    )
    coefficients = np.linalg.lstsq(
        basis[sample], rgb.reshape(-1, 3)[sample], rcond=None
    )[0]
    predicted = (basis @ coefficients).reshape(height, width, 3)
    return np.linalg.norm(rgb - predicted, axis=2)


def convert(path: Path) -> dict[str, object]:
    source = Image.open(path).convert("RGB")
    rgb = np.asarray(source, dtype=np.float32)
    residual = background_residual(rgb)

    # 선화의 미세한 틈은 닫되, 가장 큰 연결 성분만 남겨 배경 잡음을 제거한다.
    seed = residual >= 4.0
    closed = ndimage.binary_closing(seed, structure=np.ones((7, 7), dtype=bool))
    labels, _ = ndimage.label(closed)
    sizes = np.bincount(labels.ravel())
    subject = int(np.argmax(sizes[1:]) + 1)
    foreground = ndimage.binary_fill_holes(labels == subject)

    yy, xx = np.where(foreground)
    margin = 24
    left, right = max(0, xx.min() - margin), min(source.width, xx.max() + 1 + margin)
    top, bottom = max(0, yy.min() - margin), min(source.height, yy.max() + 1 + margin)
    foreground = foreground[top:bottom, left:right]

    rgba = np.asarray(source.crop((left, top, right, bottom)).convert("RGBA")).copy()
    alpha = Image.fromarray((foreground * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(1.15)
    )
    rgba[:, :, 3] = np.asarray(alpha)
    result = Image.fromarray(rgba)
    target_height = 256
    target_width = round(result.width * target_height / result.height)
    result = result.resize((target_width, target_height), Image.Resampling.LANCZOS)

    destination = OUTPUT / f"{path.stem}-integrated-v1.png"
    temporary = destination.with_suffix(".tmp.png")
    result.save(temporary, optimize=True)
    temporary.replace(destination)

    distance = ndimage.distance_transform_edt(foreground)
    helmet_zone = distance.copy()
    helmet_zone[:, round(foreground.shape[1] * 0.62):] = 0
    pivot_y, pivot_x = np.unravel_index(np.argmax(helmet_zone), helmet_zone.shape)
    right_band = foreground[:, max(0, foreground.shape[1] - 12):]
    muzzle_rows = np.where(right_band)[0]
    muzzle_y = int(np.median(muzzle_rows)) if len(muzzle_rows) else pivot_y
    scale_x = target_width / foreground.shape[1]
    scale_y = target_height / foreground.shape[0]
    return {
        "file": destination.name,
        "width": target_width,
        "height": target_height,
        "pivot": [round(pivot_x * scale_x), round(pivot_y * scale_y)],
        "muzzle": [target_width - 2, round(muzzle_y * scale_y)],
    }


def write_contact_sheet(records: list[dict[str, object]]) -> None:
    """실제 투명 결과를 밝은/어두운 배경에서 한 장으로 검수한다."""
    backgrounds = [(235, 239, 244), (20, 27, 35)]
    sheet = Image.new("RGB", (1000, 1560), backgrounds[0])
    for section, background in enumerate(backgrounds):
        top = section * 780
        tile = Image.new("RGB", (1000, 780), background)
        for index, record in enumerate(records):
            sprite = Image.open(OUTPUT / str(record["file"])).convert("RGBA")
            sprite.thumbnail((230, 200), Image.Resampling.LANCZOS)
            x = 10 + (index % 4) * 245 + (230 - sprite.width) // 2
            y = 12 + (index // 4) * 255
            tile.paste(sprite, (x, y), sprite)
        sheet.paste(tile, (0, top))
    destination = ROOT / "validation/operator-integrated-runtime.png"
    temporary = destination.with_suffix(".tmp.png")
    sheet.save(temporary, optimize=True)
    temporary.replace(destination)


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = [convert(source_path) for source_path in sorted(SOURCE.glob("*.png"))]
    write_contact_sheet(records)
    for record in records:
        print(record)
