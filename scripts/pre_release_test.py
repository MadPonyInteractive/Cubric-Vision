#!/usr/bin/env python
"""
scripts/pre_release_test.py — Pre-release workflow validation.

Reads all operations from operation_registry.json and model workflows from models.js,
then submits each to a running ComfyUI instance with low-resolution injection.
Compares output hashes against baselines in docs/workflows/baselines.json.

Usage:
    python scripts/pre_release_test.py                  # all tests, low res
    python scripts/pre_release_test.py --full-quality   # skip resolution injection
    python scripts/pre_release_test.py --op t2i         # filter by operation
    python scripts/pre_release_test.py --model sdxl-realistic
    python scripts/pre_release_test.py --save-baselines # save NEW after run
    python scripts/pre_release_test.py --host 127.0.0.1 --port 8188
"""

import sys
import os
import re
import json
import argparse
import hashlib
import time
from pathlib import Path
from collections import namedtuple
from datetime import datetime

# Add scripts/ to path so we can import comfy_client
sys.path.insert(0, str(Path(__file__).parent))

from comfy_client import ComfyClient, ComfyClientError

# ── Constants ──────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / 'operation_registry.json'
MODELS_JS_PATH = REPO_ROOT / 'js' / 'data' / 'modelConstants' / 'models.js'
UNIVERSAL_WF_JS_PATH = REPO_ROOT / 'js' / 'data' / 'modelConstants' / 'universal_workflows.js'
WORKFLOWS_DIR = REPO_ROOT / 'comfy_workflows'
BASELINES_PATH = REPO_ROOT / 'docs' / 'workflows' / 'baselines.json'
FIXTURES_DIR = REPO_ROOT / 'tests' / 'fixtures'
OUTPUTS_DIR = REPO_ROOT / 'test-outputs'

LOW_RES_IMAGE = {'width': 288, 'height': 288}
LOW_RES_VIDEO = {'width': 256, 'height': 144, 'num_frames': 2}

TestCase = namedtuple('TestCase', ['op', 'model_id', 'workflow_file', 'media_type', 'is_universal'])
TestResult = namedtuple('TestResult', ['case', 'status', 'hash_value', 'duration_s', 'error'])

# ── Argument Parsing ───────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description='Pre-release workflow validation suite'
    )
    parser.add_argument('--host', default='127.0.0.1', help='ComfyUI host')
    parser.add_argument('--port', type=int, default=8188, help='ComfyUI port')
    parser.add_argument('--op', help='Filter by operation (e.g., t2i)')
    parser.add_argument('--model', help='Filter by model (e.g., sdxl-realistic)')
    parser.add_argument('--full-quality', action='store_true', help='Skip resolution injection')
    parser.add_argument('--save-baselines', action='store_true', help='Offer to save NEW baselines after run')
    return parser.parse_args()

# ── File Parsing ───────────────────────────────────────────────────────────

def load_registry():
    """Load operation_registry.json. Returns dict of operations."""
    with open(REGISTRY_PATH) as f:
        data = json.load(f)
    # Strip _comment if present
    return {k: v for k, v in data.items() if k != '_comment'}

def parse_models_js():
    """Parse models.js using regex to extract MODELS array. Returns list of model dicts."""
    with open(MODELS_JS_PATH) as f:
        content = f.read()

    # Find MODELS = [ ... ]
    match = re.search(r'export\s+const\s+MODELS\s*=\s*\[', content)
    if not match:
        raise RuntimeError('Could not find "export const MODELS" in models.js')

    start = match.start()
    depth = 0
    end = match.end() - 1
    for i, ch in enumerate(content[start:], start):
        if ch == '[':
            depth += 1
        elif ch == ']':
            depth -= 1
            if depth == 0:
                end = i
                break

    models_block = content[start:end + 1]

    # Parse each model object: { id: ..., mediaType: ..., supportedOps: [...], workflows: {...} }
    models = []
    for model_match in re.finditer(r'\{\s*id:\s*[\'"]([^\'"]+)[\'"]', models_block):
        model_id = model_match.group(1)
        model_start = model_match.start()
        # Find the closing brace for this model
        depth = 0
        for i, ch in enumerate(models_block[model_start:], model_start):
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    model_obj_str = models_block[model_start:i + 1]
                    break

        # Extract mediaType
        media_match = re.search(r"mediaType:\s*['\"]([^'\"]+)['\"]", model_obj_str)
        media_type = media_match.group(1) if media_match else 'image'

        # Extract supportedOps
        ops_match = re.search(r"supportedOps:\s*\[(.*?)\]", model_obj_str, re.DOTALL)
        ops_str = ops_match.group(1) if ops_match else ''
        supported_ops = [m.group(1) for m in re.finditer(r"['\"]([^'\"]+)['\"]", ops_str)]

        # Extract workflows {}
        wf_match = re.search(r"workflows:\s*\{(.*?)\}", model_obj_str, re.DOTALL)
        wf_str = wf_match.group(1) if wf_match else ''
        workflows = {}
        for wf_item in re.finditer(r"(['\"]([^'\"]+)['\"]):\s*['\"]([^'\"]+)['\"]", wf_str):
            op_key = wf_item.group(2)
            filename = wf_item.group(3)
            workflows[op_key] = filename

        models.append({
            'id': model_id,
            'mediaType': media_type,
            'supportedOps': supported_ops,
            'workflows': workflows,
        })

    return models

def parse_universal_workflows_js():
    """Parse universal_workflows.js. Returns dict: { op_key: { workflow: ..., ... } }"""
    with open(UNIVERSAL_WF_JS_PATH) as f:
        content = f.read()

    # Find UNIVERSAL_WORKFLOWS = { ... }
    match = re.search(r'export\s+const\s+UNIVERSAL_WORKFLOWS\s*=\s*\{', content)
    if not match:
        return {}  # File might not exist or be structured differently

    start = match.start()
    depth = 0
    end = match.end() - 1
    for i, ch in enumerate(content[start:], start):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i
                break

    uw_block = content[start:end + 1]

    # Parse each: op_key: { workflow: '...', dependencies: [...] }
    uw_dict = {}
    for entry_match in re.finditer(r"(['\"]([^'\"]+)['\"]):\s*\{", uw_block):
        op_key = entry_match.group(2)
        entry_start = entry_match.start()
        # Find closing brace
        depth = 0
        for i, ch in enumerate(uw_block[entry_start:], entry_start):
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    entry_obj_str = uw_block[entry_start:i + 1]
                    break

        # Extract workflow filename
        wf_match = re.search(r"workflow:\s*['\"]([^'\"]+)['\"]", entry_obj_str)
        workflow_file = wf_match.group(1) if wf_match else None
        if workflow_file:
            uw_dict[op_key] = {'workflow': workflow_file}

    return uw_dict

# ── Test Matrix Building ───────────────────────────────────────────────────

def build_test_matrix(registry, models, universal_wf):
    """Build list of TestCase tuples from models and universal ops."""
    cases = []

    # Model-tied operations
    for model in models:
        for op in model['supportedOps']:
            if op in model['workflows']:
                cases.append(TestCase(
                    op=op,
                    model_id=model['id'],
                    workflow_file=model['workflows'][op],
                    media_type=model['mediaType'],
                    is_universal=False,
                ))

    # Universal operations
    for op_key, uw_info in universal_wf.items():
        if op_key in registry:
            cases.append(TestCase(
                op=op_key,
                model_id='universal',
                workflow_file=uw_info['workflow'],
                media_type=registry[op_key].get('media_type', 'image'),  # fallback
                is_universal=True,
            ))

    return cases

# ── Workflow Injection ─────────────────────────────────────────────────────

def inject_test_resolution(workflow, media_type, full_quality=False):
    """Inject low-resolution parameters into a workflow. Returns modified copy."""
    if full_quality:
        return workflow.copy()

    wf = json.loads(json.dumps(workflow))  # Deep copy

    # Find nodes by _meta.title and inject resolution
    for node_id, node_data in wf.items():
        if not isinstance(node_data, dict) or '_meta' not in node_data:
            continue

        title = node_data.get('_meta', {}).get('title', '')
        if not title:
            continue

        title_lower = title.lower()

        # Image workflow injection
        if media_type == 'image':
            if title_lower == 'width':
                if 'inputs' in node_data:
                    node_data['inputs']['value'] = LOW_RES_IMAGE['width']
            elif title_lower == 'height':
                if 'inputs' in node_data:
                    node_data['inputs']['value'] = LOW_RES_IMAGE['height']
            elif title_lower in ('batch_size', 'batchsize'):
                if 'inputs' in node_data:
                    node_data['inputs']['value'] = 1

        # Video workflow injection
        elif media_type == 'video':
            if title_lower == 'width':
                if 'inputs' in node_data:
                    node_data['inputs']['value'] = LOW_RES_VIDEO['width']
            elif title_lower == 'height':
                if 'inputs' in node_data:
                    node_data['inputs']['value'] = LOW_RES_VIDEO['height']
            elif title_lower in ('frames', 'num_frames', 'numframes'):
                if 'inputs' in node_data:
                    node_data['inputs']['value'] = LOW_RES_VIDEO['num_frames']

    # Fallback: if no Width/Height nodes found, look for EmptyLatentImage class nodes
    has_injected = any(
        '_meta' in node and node['_meta'].get('title', '').lower() in ('width', 'height')
        for node in wf.values()
    )
    if not has_injected:
        for node_id, node_data in wf.items():
            if not isinstance(node_data, dict):
                continue
            class_type = node_data.get('class_type', '')
            if 'EmptyLatent' in class_type and 'inputs' in node_data:
                if media_type == 'image':
                    node_data['inputs']['width'] = LOW_RES_IMAGE['width']
                    node_data['inputs']['height'] = LOW_RES_IMAGE['height']
                elif media_type == 'video':
                    node_data['inputs']['width'] = LOW_RES_VIDEO['width']
                    node_data['inputs']['height'] = LOW_RES_VIDEO['height']

    return wf

# ── File Hashing ───────────────────────────────────────────────────────────

def hash_file(path):
    """Return 'sha256:<hexdigest>' for a file."""
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return f'sha256:{h.hexdigest()}'

# ── Testing ────────────────────────────────────────────────────────────────

def run_test(case, client, full_quality=False):
    """Run a single test. Returns TestResult."""
    start_time = time.time()
    try:
        # Load workflow
        workflow_path = WORKFLOWS_DIR / case.workflow_file
        if not workflow_path.exists():
            return TestResult(case, 'FAIL', None, 0, f'Workflow not found: {workflow_path}')

        with open(workflow_path) as f:
            workflow = json.load(f)

        # Inject resolution
        workflow = inject_test_resolution(workflow, case.media_type, full_quality)

        # Queue
        prompt_id = client.queue_prompt(workflow)

        # Poll
        history = client.poll_until_done(prompt_id, timeout_s=300)

        # Get outputs
        outputs = client.get_outputs(history)
        if not outputs:
            return TestResult(case, 'FAIL', None, time.time() - start_time, 'No outputs returned')

        # Download first output
        output = outputs[0]
        test_key = f"{case.op}_{case.model_id}"
        ext = 'mp4' if case.media_type == 'video' else 'png'
        dest_path = OUTPUTS_DIR / f"{test_key}_test.{ext}"
        client.download_output(output, str(dest_path))

        # Hash
        file_hash = hash_file(dest_path)

        return TestResult(case, 'OK', file_hash, time.time() - start_time, None)

    except ComfyClientError as e:
        return TestResult(case, 'FAIL', None, time.time() - start_time, str(e))
    except Exception as e:
        return TestResult(case, 'FAIL', None, time.time() - start_time, f'{type(e).__name__}: {e}')

# ── Baseline Comparison ────────────────────────────────────────────────────

def load_baselines():
    """Load baselines.json. Returns dict or {}."""
    if not BASELINES_PATH.exists():
        return {}
    with open(BASELINES_PATH) as f:
        return json.load(f)

def compare_baseline(result, baselines):
    """Return 'PASS', 'FAIL', or 'NEW' based on baseline comparison."""
    if result.status != 'OK':
        return 'FAIL'

    baseline_key = f"{result.case.op}:{result.case.model_id}"
    if baseline_key not in baselines:
        return 'NEW'

    baseline_entry = baselines[baseline_key]
    baseline_hash = baseline_entry.get('hash')
    if result.hash_value == baseline_hash:
        return 'PASS'
    else:
        return 'FAIL'

def save_baselines(results, baselines, app_version, comfy_version):
    """Save NEW results to baselines.json. Prompt user first."""
    new_results = [r for r in results if compare_baseline(r, baselines) == 'NEW']
    if not new_results:
        print('No NEW baselines to save.')
        return

    print(f'\n{len(new_results)} NEW results:')
    for r in new_results:
        print(f'  {r.case.op}:{r.case.model_id}')

    response = input('\nSave new baselines? [y/N] ').strip().lower()
    if response != 'y':
        return

    # Update baselines
    for r in new_results:
        baseline_key = f"{r.case.op}:{r.case.model_id}"
        resolution_str = '288x288' if r.case.media_type == 'image' else '256x144x2f'
        baselines[baseline_key] = {
            'hash': r.hash_value,
            'appVersion': app_version,
            'comfyVersion': comfy_version,
            'lastValidated': datetime.utcnow().isoformat() + 'Z',
            'resolution': resolution_str,
        }
        if r.case.is_universal:
            baselines[baseline_key]['universal'] = True

    # Write
    BASELINES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(BASELINES_PATH, 'w') as f:
        json.dump(baselines, f, indent=2)

    print(f'Saved {len(new_results)} baselines to {BASELINES_PATH}')

# ── Main ───────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    # Load registry and build test matrix
    try:
        registry = load_registry()
        models = parse_models_js()
        universal_wf = parse_universal_workflows_js()
        cases = build_test_matrix(registry, models, universal_wf)
    except Exception as e:
        print(f'ERROR: Failed to build test matrix: {e}', file=sys.stderr)
        return 1

    # Validate case count vs registry count
    registry_count = len(registry)
    parsed_count = len([c for c in cases if c.op in registry])
    if parsed_count != registry_count:
        print(f'WARNING: Registry has {registry_count} ops but parsed {parsed_count} test cases')

    # Filter by --op and --model
    if args.op:
        cases = [c for c in cases if c.op == args.op]
    if args.model:
        cases = [c for c in cases if c.model_id == args.model]

    if not cases:
        print('No test cases match filters.')
        return 1

    # Create output directory
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

    # Connect to ComfyUI
    client = ComfyClient(host=args.host, port=args.port)
    if not client.is_alive():
        print(f'ERROR: ComfyUI not responding at http://{args.host}:{args.port}', file=sys.stderr)
        return 1

    # Read app/comfy versions
    app_version_path = REPO_ROOT / 'js' / 'core' / 'appVersion.js'
    app_version = '0.0.1'
    comfy_version = '0.18.0'
    if app_version_path.exists():
        with open(app_version_path) as f:
            content = f.read()
            m = re.search(r"APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]", content)
            if m:
                app_version = m.group(1)
            m = re.search(r"COMFY_VERSION\s*=\s*['\"]([^'\"]+)['\"]", content)
            if m:
                comfy_version = m.group(1)

    # Run tests
    print('=== MpiAiSuite Pre-Release Test ===')
    print(f'App Version: {app_version} | ComfyUI: {comfy_version}')
    res_str = 'full' if args.full_quality else '288x288 (image) / 256x144x2f (video)'
    print(f'Resolution: {res_str}\n')

    baselines = load_baselines()
    results = []
    for i, case in enumerate(cases, 1):
        print(f'[{i:3d}/{len(cases)}] {case.op}:{case.model_id:<20} ...', end=' ', flush=True)
        result = run_test(case, client, args.full_quality)
        results.append(result)
        status_str = compare_baseline(result, baselines)
        elapsed = result.duration_s
        if result.error:
            status_str = 'FAIL'
        print(f'{status_str:6s} ({elapsed:.1f}s)')

    # Report
    passed = len([r for r in results if compare_baseline(r, baselines) == 'PASS'])
    failed = len([r for r in results if compare_baseline(r, baselines) == 'FAIL'])
    new = len([r for r in results if compare_baseline(r, baselines) == 'NEW'])

    print(f'\nRESULTS: {passed} PASS | {failed} FAIL | {new} NEW')
    print(f'Output files: {OUTPUTS_DIR}')

    # Save baselines if requested
    if args.save_baselines or (new > 0 and not args.op and not args.model):
        save_baselines(results, baselines, app_version, comfy_version)

    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
