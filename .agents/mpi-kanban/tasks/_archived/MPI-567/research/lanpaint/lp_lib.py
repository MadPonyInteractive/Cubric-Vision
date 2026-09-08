"""Shared bits for the LanPaint measurement: comfy client, box masks, seam metrics.

Metric definitions come from docs/playbooks/add-flow/blending-into-a-photo.md
Measuring the rectangle:
  fill      = changed pixels / area of the changed region's bbox
  ring_step = mean |diff| in a ~12px band just INSIDE that bbox edge; under ~2 is invisible
  bg_mean   = mean |diff| outside the region -> movement in the user's untouched photo
`border` coverage is deliberately NOT implemented: it reads 0.034 on the worst rectangle.
"""
import json, sys, time, urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from PIL import Image, ImageChops, ImageDraw

BENCH = "http://127.0.0.1:8188"
O = "D:/WORK/Images/Outputs"
LP = O + "/mpi567/lp"
RING = 12
CHANGE_T = 12  # same 12/255 the session-3 silhouette used


# --- comfy ------------------------------------------------------------------
def queue(graph, timeout=600):
    body = json.dumps({"prompt": graph}).encode("utf-8")
    req = urllib.request.Request(BENCH + "/prompt", data=body,
                                 headers={"Content-Type": "application/json"})
    pid = json.loads(urllib.request.urlopen(req, timeout=60).read())["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < timeout:
        time.sleep(2)
        h = json.loads(urllib.request.urlopen(BENCH + "/history/" + pid, timeout=30).read())
        if pid in h:
            rec = h[pid]
            st = rec.get("status", {})
            if st.get("status_str") == "error" or not st.get("completed", True):
                msgs = st.get("messages", [])
                raise RuntimeError("comfy error: " + json.dumps(msgs)[:2000])
            cached = []
            for m in st.get("messages", []):
                if m[0] == "execution_cached":
                    cached = m[1].get("nodes", [])
            files = []
            for out in rec.get("outputs", {}).values():
                for im in out.get("images", []):
                    files.append(im["filename"])
            return {"pid": pid, "secs": round(time.time() - t0, 1),
                    "files": files, "cached": cached}
    raise TimeoutError(pid)


# --- boxes ------------------------------------------------------------------
def changed_bbox(a_path, b_path, thresh=CHANGE_T):
    """bbox of where b differs from a, on luminance."""
    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")
    if b.size != a.size:
        b = b.resize(a.size, Image.LANCZOS)
    d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > thresh else 0)
    return d.getbbox(), a.size


def grow_box(box, size, out_frac, down_frac):
    """Grow a bbox outward by out_frac of its own w/h, and DOWN by down_frac extra.

    Down is separate because shadows fall on the ground: the room a shadow needs is
    almost never symmetric about the object.
    """
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    W, H = size
    dx, dy = int(w * out_frac), int(h * out_frac)
    x0 = max(0, x0 - dx); x1 = min(W, x1 + dx)
    y0 = max(0, y0 - dy); y1 = min(H, y1 + int(h * down_frac))
    return (x0, y0, x1, y1)


def write_mask(box, size, path):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rectangle(box, fill=255)
    m.convert("RGB").save(path)
    return path


# --- metrics ----------------------------------------------------------------
def _diff_L(a_path, b_path):
    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")
    if b.size != a.size:
        b = b.resize(a.size, Image.LANCZOS)
    return ImageChops.difference(a, b).convert("L")


def _mean(img, mask):
    """mean pixel value of img where mask is white. PIL's masked histogram, not a loop."""
    hist = img.histogram(mask)
    n = sum(hist)
    return (sum(i * c for i, c in enumerate(hist)) / n) if n else 0.0


def seam(photo, result, box=None):
    """box=None -> derive the changed region's own bbox (the doc's definition)."""
    d = _diff_L(photo, result)
    W, H = d.size
    binm = d.point(lambda v: 255 if v > CHANGE_T else 0)
    bb = box or binm.getbbox()
    if bb is None:
        return {"fill": 0.0, "ring": 0.0, "bg_mean": 0.0, "bbox": None}
    x0, y0, x1, y1 = bb
    area = max(1, (x1 - x0) * (y1 - y0))
    changed = sum(i * c for i, c in enumerate(binm.crop(bb).histogram())) / 255.0

    ring = Image.new("L", (W, H), 0)
    dr = ImageDraw.Draw(ring)
    dr.rectangle(bb, fill=255)
    dr.rectangle((x0 + RING, y0 + RING, max(x0 + RING, x1 - RING),
                  max(y0 + RING, y1 - RING)), fill=0)

    outside = Image.new("L", (W, H), 255)
    ImageDraw.Draw(outside).rectangle(bb, fill=0)

    return {"fill": round(changed / area, 3),
            "ring": round(_mean(d, ring), 2),
            "bg_mean": round(_mean(d, outside), 2),
            "bbox": bb}
