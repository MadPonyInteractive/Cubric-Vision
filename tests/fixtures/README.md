# Test Fixtures

This directory contains sample images and videos used by pre-release tests.

## Files

- `image_288x288.png` — Solid-color image, 288×288, used for i2i, edit, detail, upscale operations
- `mask_288x288.png` — White mask image, 288×288, used for mask-required operations (detail, change, remove)
- `frames/frame_001.png` — 32×32 placeholder, frame 1 for interpolate operation
- `frames/frame_002.png` — 32×32 placeholder, frame 2 for interpolate operation
- `video_144p.mp4` — 1-second video, 256×144, 24fps, minimal bitrate, used for video operations

## Creating Fixtures

If the binary fixture files are missing, generate them with:
```bash
# Install Pillow if needed
pip install Pillow

python3 << 'EOF'
from PIL import Image

# Create 288x288 solid gray image
Image.new('RGB', (288, 288), color=(100, 100, 100)).save('image_288x288.png')

# Create 288x288 white mask
Image.new('RGB', (288, 288), color=(255, 255, 255)).save('mask_288x288.png')

# Create 32x32 frame images
Image.new('RGB', (32, 32), color=(50, 50, 150)).save('frames/frame_001.png')
Image.new('RGB', (32, 32), color=(150, 50, 50)).save('frames/frame_002.png')
EOF

# For video, use ffmpeg:
ffmpeg -f lavfi -i color=c=gray:s=256x144:d=1 -f lavfi -i anullsrc=r=24000:cl=mono -c:v libx264 -crf 28 -c:a aac -t 1 video_144p.mp4
```

## Size Constraints

- PNG files should be < 50KB each
- MP4 file should be < 200KB
- All files are generated at test time; these are checked into git for reproducibility
