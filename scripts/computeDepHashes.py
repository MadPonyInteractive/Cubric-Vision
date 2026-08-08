"""
scripts/computeDepHashes.py — Bootstrap SHA256 hashes for dependencies.

Usage:
    python scripts/computeDepHashes.py           # compute and write missing hashes
    python scripts/computeDepHashes.py --sizes   # MEASURE every dep's true byte size
    python scripts/computeDepHashes.py --dry-run # preview only (either mode)

--sizes (MPI-482): every `size:` string was hand-typed and none was ever measured, yet
every disk/volume decision in the app derives from it (footprint.js, the smoke runner's
volume preflight, `modelJob.totalBytes` via `_parseSizeToBytes` on BOTH engine paths,
and the disk-full pre-checks). This pass HEADs every dep, writes `bytes:` - the measured
integer, the value of record - and REGENERATES `size` from it. Nothing reads `bytes`
yet; the consumers above all read `size`, which is why regenerating it is what actually
corrects them. Idempotent: a second run writes nothing.

custom_nodes deps are NOT measurable here and are skipped: their `url` is a lockUrl()
call to a git repo, not a file, so there is no Content-Length to read. Those 14 `size`
strings stay hand-written.

HuggingFace deps: hashed from the remote (HEAD ETag fast-path, else stream download).
R2 deps (models.cubric.studio): R2's ETag is multipart-MD5 and useless for sha256,
so these are hashed from the LOCAL master copy under LOCAL_ROOT (default g:/cubricmodels,
override with CUBRIC_MODELS_ROOT) using each dep's `filename` as the relative path.

Stream-based: remote files never written to disk. Runs one file at a time.
"""

import sys
import os
import io
import re
import hashlib
import urllib.request
import urllib.error
from pathlib import Path

DRY_RUN = '--dry-run' in sys.argv
SIZES = '--sizes' in sys.argv

# Resolve deps path relative to this script's directory.
# NOTE: dependencies.js is a FACADE — it only spreads the four sibling files below,
# so its own `export const DEPS = {…}` block contains ZERO literal entries. Scanning
# it finds nothing and reports "All deps already have SHA256 hashes" — silently
# skipping every lora/asset/node dep. Scan the SPLIT SOURCE FILES instead. (MPI-316)
CONST_DIR = Path(__file__).resolve().parent.parent / 'js' / 'data' / 'modelConstants'
DEPS_PATHS = [
    CONST_DIR / 'modelDeps.js',
    CONST_DIR / 'assetDeps.js',
    CONST_DIR / 'loraDeps.js',
    CONST_DIR / 'nodesDeps.js',
]

# Local master copy of R2-hosted weights (R2 ETag is multipart-MD5, unusable for sha256).
LOCAL_ROOT = Path(os.environ.get('CUBRIC_MODELS_ROOT', 'g:/cubricmodels'))

class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Do not follow redirects



def read_js(path: Path) -> tuple:
    """Read a split dep file, returning (content_with_LF, original_newline).

    The four dep files do NOT agree: loraDeps.js is LF, the other three are CRLF
    (measured 2026-08-08). `Path.write_text` uses newline=None, which translates
    every '\n' to os.linesep - on Windows that rewrites all 604 lines of loraDeps.js
    as a side effect of touching one field. Normalise in, restore on the way out.
    """
    raw_text = io.open(path, encoding='utf-8', newline='').read()
    return raw_text.replace('\r\n', '\n'), ('\r\n' if '\r\n' in raw_text else '\n')


def write_js(path: Path, content: str, newline: str) -> None:
    io.open(path, 'w', encoding='utf-8', newline='').write(content.replace('\n', newline))


def format_size(n: int) -> str:
    r"""Human string for a byte count, in the exact shape every consumer parses:
    `^([\d.]+)\s*(GB|MB|KB|B)$`, 1024-based (footprint.sizeToGb,
    computeProgress.parseSizeToBytes and the two backend copies all use that).
    DERIVED from `bytes` - never typed.
    """
    for unit, mult in (('GB', 1024 ** 3), ('MB', 1024 ** 2), ('KB', 1024)):
        if n >= mult:
            return f'{n / mult:.2f}'.rstrip('0').rstrip('.') + unit
    return f'{n}B'


def remote_size(url: str, depth: int = 0) -> int:
    """True byte count from a HEAD.

    HuggingFace answers a `resolve/` URL with a 302 to its CDN, and that 302's own
    Content-Length is the redirect BODY (~1 KB) - reading it is how a 20 GB
    transformer measures 1072 bytes. The real number is X-Linked-Size on that same
    302, the header the sha256 fast-path above already reads X-Linked-ETag from.
    R2 answers 200 with a truthful Content-Length.
    """
    if depth > 4:
        raise ValueError('too many redirects')
    req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'CubricStudio/1.0'})
    opener = urllib.request.build_opener(NoRedirectHandler())
    try:
        with opener.open(req) as response:
            headers, status = response.headers, response.status
    except urllib.error.HTTPError as exc:
        headers, status = exc.headers, exc.code

    linked = headers.get('X-Linked-Size')
    if linked:
        return int(linked)
    if status in (301, 302, 303, 307, 308):
        location = headers.get('Location')
        if not location:
            raise ValueError(f'HTTP {status} redirect with no Location')
        return remote_size(location, depth + 1)
    if status >= 400:
        raise ValueError(f'HTTP {status}')
    length = headers.get('Content-Length')
    if length is None:
        raise ValueError(f'HTTP {status} carried no Content-Length')
    return int(length)


def match_brace(content: str, i: int) -> int:
    """Index of the `}` matching the `{` at content[i], skipping strings and comments."""
    depth = 0
    n = len(content)
    while i < n:
        ch = content[i]
        if ch in '\'"`':
            quote = ch
            i += 1
            while i < n and content[i] != quote:
                i += 2 if content[i] == '\\' else 1
        elif ch == '/' and content[i + 1:i + 2] == '/':
            while i < n and content[i] != '\n':
                i += 1
        elif ch == '/' and content[i + 1:i + 2] == '*':
            i = content.find('*/', i + 2)
            if i < 0:
                return -1
            i += 1
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def iter_entries(content: str):
    """Yield (dep_id, body, body_start, body_end) for each top-level entry in a
    split dep file. Offsets are into `content`, so a caller can splice one entry
    without a whole-file regex that could stray into its neighbour.

    Entry bodies are BRACE-COUNTED, not regex-matched. The regex this replaced,
    `'([^']+)':\\s*\\{([^}]+(?:\\{[^}]*\\}[^}]*)*)\\}`, ended the body at the first
    nested object's closing brace: `sdxl-realistic` stopped 264 chars in, inside its
    `credit: { ... }` block and BEFORE its `url:` line, so the dep read as url-less and
    was skipped in silence. Nine deps - the seven CivitAI merges plus chroma1-hd-flash
    and -hyper - were invisible to the sha256 pass too, for as long as it has existed.
    """
    match = re.search(r'export\s+const\s+\w+\s*=\s*\{', content)
    if not match:
        return
    block_end = match_brace(content, match.end() - 1)
    if block_end < 0:
        return

    pos = match.end()
    for m in re.finditer(r"^\s*'([^']+)':\s*\{", content[:block_end], re.M):
        if m.start() < pos:
            continue  # inside the entry we just yielded (a nested quoted key)
        brace = m.end() - 1
        close = match_brace(content, brace)
        if close < 0:
            continue
        yield m.group(1), content[brace + 1:close], brace + 1, close
        pos = close


def entry_url(body: str):
    """The dep's OWN download url, line-anchored.

    A bare `re.search(r"url:")` also matches the `url:` inside a `credit: { ... }`
    block, which sits on one line and comes FIRST in the seven merge entries that
    carry one - so the scan read a civitai.com credit link as the download url and
    then dropped the dep as neither hf nor r2. Anchoring to line start cannot see it.
    """
    m = re.search(r"^\s*url:\s*'([^']+)'", body, re.M)
    return m.group(1) if m else None



def hash_local_file(rel_path: str) -> str:
    """SHA256 a local file under LOCAL_ROOT (for R2 deps whose ETag is unusable)."""
    p = LOCAL_ROOT / rel_path
    if not p.is_file():
        raise FileNotFoundError(f'{p} not found — set CUBRIC_MODELS_ROOT or copy the file there')
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        while chunk := f.read(1024 * 1024):  # 1 MB chunks
            h.update(chunk)
    return h.hexdigest()


def compute_sha256(url: str) -> str:
    """Try HEAD request first for X-Linked-ETag, otherwise stream-download and compute SHA256."""
    try:
        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'CubricStudio/1.0'})
        opener = urllib.request.build_opener(NoRedirectHandler())
        try:
            with opener.open(req) as response:
                etag = response.getheader('X-Linked-ETag')
                if etag:
                    return etag.strip('"')
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308):
                etag = e.headers.get('X-Linked-ETag')
                if etag:
                    return etag.strip('"')
    except Exception as exc:
        print(f"  HEAD fast-path failed: {exc}")

    print("  Falling back to stream download...")
    req = urllib.request.Request(url, headers={'User-Agent': 'CubricStudio/1.0'})
    with urllib.request.urlopen(req) as response:
        h = hashlib.sha256()
        while chunk := response.read(1024 * 1024):  # 1 MB chunks
            h.update(chunk)
        return h.hexdigest()


def scan_deps(path: Path, want) -> list:
    """Collect file-backed deps from one split dep source file.

    `want` picks the pass: 'hash' keeps only deps whose sha256 is still null,
    'size' keeps every one of them.
    """
    if not path.is_file():
        print(f'  ! {path.name} not found - skipped')
        return []

    content, _ = read_js(path)
    found = []
    for dep_id, body, body_start, body_end in iter_entries(content):
        url = entry_url(body)
        if not url:
            continue

        if 'huggingface.co' in url:
            source = 'hf'
        elif 'models.cubric.studio' in url:
            source = 'r2'
        else:
            continue  # custom_nodes: a lockUrl() git repo, not a file

        sha_m = re.search(r"sha256:\s*('[^']*'|null)", body)
        size_m = re.search(r"size:\s*'([^']+)'", body)
        bytes_m = re.search(r'bytes:\s*(\d+)', body)
        file_m = re.search(r"filename:\s*'([^']+)'", body)

        if want == 'hash':
            sha_value = sha_m.group(1) if sha_m else None
            if sha_value and sha_value != 'null':
                continue  # already has a hash

        found.append({'id': dep_id, 'url': url, 'source': source, 'path': path,
                      'size': size_m.group(1) if size_m else 'unknown',
                      'bytes': int(bytes_m.group(1)) if bytes_m else None,
                      'span': (body_start, body_end),
                      'filename': file_m.group(1) if file_m else None})
    return found


def scan_file(path: Path) -> list:
    """Deps missing a sha256 (the original pass)."""
    return scan_deps(path, 'hash')


def patch_entry_size(body: str, n: int) -> str:
    """Rewrite one entry's `size:` from the measured bytes and park `bytes:` beside
    it. Re-running with the same measurement is a no-op, which is what proves the
    numbers are real rather than re-guessed."""
    m = re.search(r"^([ \t]*)size:\s*'[^']*',?[ \t]*$", body, re.M)
    if not m:
        raise ValueError('no size: line in entry')
    indent = m.group(1)
    # Drop an existing bytes: line first so a re-run replaces rather than stacks.
    body = re.sub(r'^[ \t]*bytes:\s*\d+,?[ \t]*\n', '', body, flags=re.M)
    m = re.search(r"^([ \t]*)size:\s*'[^']*',?[ \t]*$", body, re.M)
    return (body[:m.start()]
            + f"{indent}size: '{format_size(n)}',\n{indent}bytes: {n},"
            + body[m.end():])


def run_sizes() -> None:
    """Measure every file-backed dep and write bytes: + a derived size:."""
    targets = []
    for p in DEPS_PATHS:
        targets.extend(scan_deps(p, 'size'))

    print(f'Measuring {len(targets)} file-backed deps '
          f'(custom_nodes are git repos and have no measurable Content-Length).\n')

    results = []
    for i, target in enumerate(targets, 1):
        print(f'[{i}/{len(targets)}] [{target["source"]}] {target["id"]} '
              f'(declared {target["size"]})')
        try:
            n = remote_size(target['url'])
        except Exception as exc:
            # R2 has a local master copy; fall back to it rather than lose the dep.
            local = LOCAL_ROOT / target['filename'] if target['filename'] else None
            if target['source'] == 'r2' and local and local.is_file():
                n = local.stat().st_size
                print(f'  HEAD failed ({exc}) - local stat: {n}')
            else:
                print(f'  Error: {exc}')
                results.append({**target, 'measured': None})
                continue
        drift = '' if not target['bytes'] else f' (was {target["bytes"]})'
        print(f'  {n} bytes -> {format_size(n)}{drift}')
        results.append({**target, 'measured': n})

    failed = [r for r in results if r['measured'] is None]
    ok = [r for r in results if r['measured'] is not None]
    total = sum(r['measured'] for r in ok)
    print(f'\nMeasured {len(ok)}/{len(targets)}. '
          f'True total: {total} bytes = {total / 1024 ** 3:.1f} GB.')
    if failed:
        print('FAILED: ' + ', '.join(r['id'] for r in failed))

    if DRY_RUN:
        print('\nDry run - no changes written.')
        return

    # Splice back-to-front per file so earlier spans stay valid.
    by_path = {}
    for res in ok:
        by_path.setdefault(res['path'], []).append(res)

    written = 0
    for path, patches in by_path.items():
        content, newline = read_js(path)
        for res in sorted(patches, key=lambda r: r['span'][0], reverse=True):
            start, end = res['span']
            body = content[start:end]
            new_body = patch_entry_size(body, res['measured'])
            if new_body == body:
                continue
            content = content[:start] + new_body + content[end:]
            written += 1
        write_js(path, content, newline)

    print(f'{written} entries rewritten ({len(ok) - written} already correct).')


def main() -> None:
    if SIZES:
        run_sizes()
        return

    targets = []
    for p in DEPS_PATHS:
        targets.extend(scan_file(p))

    if not targets:
        print('All deps already have SHA256 hashes.')
        return

    print(f'Found {len(targets)} deps missing SHA256.\n')

    # Compute all hashes first (one at a time)
    results = []
    for i, target in enumerate(targets, 1):
        label = target['filename'] if target['source'] == 'r2' else target['url']
        print(f'[{i}/{len(targets)}] [{target["source"]}] {label} ({target["size"]})')
        try:
            if target['source'] == 'r2':
                if not target['filename']:
                    raise ValueError('R2 dep has no filename field — cannot locate local file')
                h = hash_local_file(target['filename'])
            else:
                h = compute_sha256(target['url'])
            print(f'  Success: {h[:16]}...')
            results.append({**target, 'hash': h, 'success': True})
        except Exception as exc:
            print(f'  Error: {exc}')
            results.append({**target, 'hash': None, 'success': False})

    if DRY_RUN:
        print(f'\nDry run — no changes written.')
        return

    # Patch each dep in ITS OWN source file, then write each touched file once.
    by_path = {}
    for res in results:
        if res['success']:
            by_path.setdefault(res['path'], []).append(res)

    written = 0
    for path, patches in by_path.items():
        final_content = path.read_text(encoding='utf-8')
        for res in patches:
            dep_id = res['id']
            h = res['hash']

            # Anchor by the entry id so we replace the right one.
            pattern = re.compile(
                rf"('{re.escape(dep_id)}'.*?sha256:\s*)null",
                re.DOTALL
            )
            m = pattern.search(final_content)
            if not m:
                print(f'  ⚠ Could not locate sha256: null for {dep_id} in {path.name}')
                continue

            final_content = final_content[:m.start()] + m.group(1) + f"'{h}'" + final_content[m.end():]
            written += 1

        path.write_text(final_content, encoding='utf-8')

    print(f'\nDone. {written}/{len(targets)} hashes written.')


if __name__ == '__main__':
    main()
