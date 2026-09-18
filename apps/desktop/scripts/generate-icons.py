#!/usr/bin/env python3
"""Generate apps/desktop/build/icon.png + multi-size icon.ico from the XYAI logo."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_CANDIDATES = [
    ROOT / "src" / "renderer" / "assets" / "logo.png",
    ROOT / "brand" / "xyai-logo.png",
]
SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def main() -> None:
    src = next((p for p in SRC_CANDIDATES if p.is_file()), None)
    if src is None:
        raise SystemExit("missing XYAI logo PNG")
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    side = max(w, h)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - w) // 2, (side - h) // 2), im)
    icon512 = sq.resize((512, 512), Image.Resampling.LANCZOS)
    brand = ROOT / "brand"
    build = ROOT / "build"
    brand.mkdir(parents=True, exist_ok=True)
    build.mkdir(parents=True, exist_ok=True)
    icon512.save(brand / "xyai-logo.png", "PNG")
    icon512.save(build / "icon.png", "PNG")
    icon512.save(build / "icon.ico", format="ICO", sizes=SIZES)
    icon512.save(brand / "icon.ico", format="ICO", sizes=SIZES)
    print("wrote", build / "icon.png", build / "icon.ico")


if __name__ == "__main__":
    main()
