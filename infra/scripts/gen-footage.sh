#!/usr/bin/env bash
# gen-footage — deterministic offline footage library. Renders 8 aesthetic
# 8s clips with ffmpeg's lavfi sources (no downloads: mandelbrot/gradients/
# life/cellauto + blur/hue filters), ready to be imported into the local
# media library by infra/scripts/import-footage.mjs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/.data/footage-gen"
mkdir -p "$OUT"

FF="$(node -p "process.env.FF || require('@ffmpeg-installer/linux-x64').path" 2>/dev/null || true)"
[ -x "$FF" ] || FF="$(find "$ROOT/node_modules/.pnpm" -path '*@ffmpeg-installer/linux-x64/ffmpeg' | head -1)"
[ -x "$FF" ] || { echo "✖ ffmpeg not found (run pnpm install first)" >&2; exit 1; }
chmod +x "$FF" || true
echo "▸ ffmpeg: $FF"

enc() { # enc <out> <lavfi-input> <vf>
  local out="$1" src="$2" vf="$3"
  if [ -f "$OUT/$out" ]; then echo "  ✓ $out (cached)"; return; fi
  "$FF" -y -f lavfi -i "$src" -vf "$vf" -t 8 -r 30 -c:v libx264 -pix_fmt yuv420p \
    -preset veryfast -crf 22 -movflags +faststart "$OUT/$out" -loglevel error
  echo "  ✓ $out"
}

echo "▸ rendering footage clips…"
enc perfume-gold.mp4 "color=c=0x140c03:s=1280x720:r=30" "noise=alls=28:allf=t,gblur=sigma=24,hue=H=2*PI*t/26,eq=saturation=1.4"
enc summer-waves.mp4 "testsrc2=s=1280x720:r=30" "gblur=sigma=18,hue=H=PI*t/10,eq=brightness=0.03:saturation=1.3"
enc smoke-oud.mp4 "color=c=0x0a0a0c:s=1280x720:r=30" "noise=alls=18:allf=t,gblur=sigma=30,hue=H=PI*t/18,eq=saturation=0.8"
enc sparkle-bokeh.mp4 "life=s=640x360:rate=30:mold=10:ratio=0.08:death_color=0x001024:life_color=0xffd27f" "scale=1280:720,gblur=sigma=2.5"
enc flower-bloom.mp4 "life=s=640x360:rate=30:mold=12:ratio=0.12:death_color=0x14060f:life_color=0xff8fb3" "scale=1280:720,gblur=sigma=2,hue=H=PI*t/30"
enc water-ripple.mp4 "cellauto=s=320x180:rate=30:rule=110" "scale=1280:720:flags=bilinear,gblur=sigma=9,hue=H=PI/3,eq=saturation=1.2"
enc night-city.mp4 "cellauto=s=320x180:rate=30:rule=30" "scale=1280:720:flags=bilinear,gblur=sigma=14,eq=saturation=1.6:brightness=-0.05"
enc space-galaxy.mp4 "mandelbrot=s=1280x720:rate=30:outer=0x1b2a4a:inner=0x000000" "eq=saturation=1.2"

echo "✓ footage clips in $OUT"
