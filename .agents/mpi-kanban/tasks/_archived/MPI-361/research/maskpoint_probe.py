"""MPI-361 Phase A probe: does Impact 'mask-points' segment a click on an
object the YOLO detectors have no class for (denim shorts)?

Chain under test:
    dot PNG -> MpiLoadImageFromPath(channel=red) -> MASK
            -> MaskToSEGS(combined=False, drop_size=1)
            -> SAMDetectorCombined(sam_vit_b, detection_hint='mask-points', threshold)
            -> MaskToImage -> SaveImage
"""
import json, time, urllib.request, urllib.parse, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__)).replace('\\', '/')
SRV = 'http://127.0.0.1:8188'
PHOTO = f'{HERE}/t.png'          # 928x1136 hiker + dog
W, H = 928, 1136

# Click points in ORIGINAL pixel space. r>=6 -> bbox width 12 >= 10 -> positive.
POINTS = [(458, 572)]            # centre of the denim shorts
DOT_R = 8


def make_dot_mask(path, points, r):
    im = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(im)
    for (x, y) in points:
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255))
    im.save(path)
    return path


def build(dot_path, threshold):
    return {
        "1": {"class_type": "MpiLoadImageFromPath",
              "inputs": {"string": PHOTO, "channel": "red", "block_if_empty": True}},
        "2": {"class_type": "MpiLoadImageFromPath",
              "inputs": {"string": dot_path, "channel": "red", "block_if_empty": True}},
        "3": {"class_type": "MaskToSEGS",
              "inputs": {"mask": ["2", 1], "combined": False, "crop_factor": 3.0,
                         "bbox_fill": False, "drop_size": 1, "contour_fill": False}},
        "4": {"class_type": "SAMLoader",
              "inputs": {"model_name": "sam_vit_b_01ec64.pth", "device_mode": "AUTO"}},
        "5": {"class_type": "SAMDetectorCombined",
              "inputs": {"sam_model": ["4", 0], "segs": ["3", 0], "image": ["1", 0],
                         "detection_hint": "mask-points", "dilation": 0,
                         "threshold": threshold, "bbox_expansion": 0,
                         "mask_hint_threshold": 0.7, "mask_hint_use_negative": "False"}},
        "6": {"class_type": "MaskToImage", "inputs": {"mask": ["5", 0]}},
        "7": {"class_type": "SaveImage",
              "inputs": {"images": ["6", 0], "filename_prefix": f"mpi361_thr{threshold}"}},
    }


def post(path, payload):
    req = urllib.request.Request(SRV + path, data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read())


def run(threshold, dot_path):
    r = post('/prompt', {"prompt": build(dot_path, threshold), "client_id": "mpi361"})
    pid = r['prompt_id']
    for _ in range(240):
        time.sleep(1)
        h = json.loads(urllib.request.urlopen(f'{SRV}/history/{pid}').read())
        if pid in h:
            e = h[pid]
            st = e.get('status', {})
            if st.get('status_str') == 'error':
                return None, st
            for out in (e.get('outputs') or {}).values():
                for im in (out.get('images') or []):
                    return im, None
            return None, st
    return None, 'timeout'


if __name__ == '__main__':
    dot = make_dot_mask(f'{HERE}/dots.png', POINTS, DOT_R)
    for thr in (float(a) for a in (sys.argv[1:] or ['0.93', '0.5'])):
        im, err = run(thr, dot)
        if err:
            print(f'thr={thr} ERROR {json.dumps(err)[:900]}')
            continue
        q = urllib.parse.urlencode({'filename': im['filename'],
                                    'subfolder': im.get('subfolder', ''),
                                    'type': im.get('type', 'output')})
        out = f'{HERE}/res_{thr}.png'
        urllib.request.urlretrieve(f'{SRV}/view?{q}', out)
        m = Image.open(out).convert('L')
        px = sum(1 for p in m.getdata() if p > 127)
        print(f'thr={thr} -> {im["filename"]}  white px={px} ({px/(W*H)*100:.2f}% of frame)')
