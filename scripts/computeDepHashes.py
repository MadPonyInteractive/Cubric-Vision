"""
scripts/computeDepHashes.py — Bootstrap SHA256 hashes for dependencies.

Usage:
    python scripts/computeDepHashes.py          # compute and write hashes
    python scripts/computeDepHashes.py --dry-run # preview only

HuggingFace deps: hashed from the remote (HEAD ETag fast-path, else stream download).
R2 deps (models.cubric.studio): R2's ETag is multipart-MD5 and useless for sha256,
so these are hashed from the LOCAL master copy under LOCAL_ROOT (default g:/cubricmodels,
override with CUBRIC_MODELS_ROOT) using each dep's `filename` as the relative path.

Stream-based: remote files never written to disk. Runs one file at a time.
"""

import sys
import os
import re
import hashlib
import urllib.request
import urllib.error
from pathlib import Path

DRY_RUN = '--dry-run' in sys.argv

# Resolve deps path relative to this script's directory
SCRIPT_DIR = Path(__file__).resolve().parent.parent
DEPS_PATH = SCRIPT_DIR / 'js' / 'data' / 'modelConstants' / 'dependencies.js'

# Local master copy of R2-hosted weights (R2 ETag is multipart-MD5, unusable for sha256).
LOCAL_ROOT = Path(os.environ.get('CUBRIC_MODELS_ROOT', 'g:/cubricmodels'))

class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Do not follow redirects



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


def main() -> None:
    content = DEPS_PATH.read_text(encoding='utf-8')

    # Extract DEPS from the JS file — find the export block and eval it minimally.
    # We look for the export const DEPS = { ... } block.
    match = re.search(r'export\s+const\s+DEPS\s*=\s*\{', content)
    if not match:
        print('Could not find "export const DEPS =" in dependencies.js')
        sys.exit(1)

    # Find matching closing brace by counting nesting level
    start = match.end() - 1  # position of '{'
    depth = 0
    end = start
    for i, ch in enumerate(content[start:], start):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i
                break

    deps_block = content[start:end + 1]

    # Parse each top-level entry: 'id': { ... }
    # We'll process each HuggingFace dep that lacks a sha256.
    entries = re.finditer(r"'([^']+)':\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}", deps_block, re.DOTALL)
    targets = []
    for entry_match in entries:
        dep_id = entry_match.group(1)
        entry_body = entry_match.group(2)

        url_m = re.search(r"url:\s*'([^']+)'", entry_body)
        sha_m = re.search(r"sha256:\s*('[^']*'|null)", entry_body)
        size_m = re.search(r"size:\s*'([^']+)'", entry_body)
        file_m = re.search(r"filename:\s*'([^']+)'", entry_body)

        if not url_m:
            continue

        url = url_m.group(1)
        if 'huggingface.co' in url:
            source = 'hf'
        elif 'models.cubric.studio' in url:
            source = 'r2'
        else:
            continue

        sha_value = sha_m.group(1) if sha_m else None
        if sha_value and sha_value != 'null':
            continue  # already has a hash

        size = size_m.group(1) if size_m else 'unknown'
        targets.append({'id': dep_id, 'url': url, 'size': size, 'source': source,
                        'filename': file_m.group(1) if file_m else None})

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

    # Apply all patches to a single copy of the file and write once.
    final_content = content
    for res in results:
        if not res['success']:
            continue

        dep_id = res['id']
        h = res['hash']

        # Find this entry's sha256: null line within the file content.
        # Anchor by the entry id so we replace the right one.
        # Pattern: 'id': ... sha256: null (spanning lines)
        pattern = re.compile(
            rf"('{re.escape(dep_id)}'.*?sha256:\s*)null",
            re.DOTALL
        )
        m = pattern.search(final_content)
        if not m:
            print(f'  ⚠ Could not locate sha256: null for {dep_id}')
            continue

        new_content = final_content[:m.start()] + m.group(1) + f"'{h}'" + final_content[m.end():]
        final_content = new_content

    DEPS_PATH.write_text(final_content, encoding='utf-8')
    written = sum(1 for r in results if r['success'])
    print(f'\nDone. {written}/{len(targets)} hashes written.')


if __name__ == '__main__':
    main()
