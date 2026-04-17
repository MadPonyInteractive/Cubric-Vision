"""
scripts/comfy_client.py — Synchronous ComfyUI HTTP client.

Thin wrapper around ComfyUI REST API. Supports queuing workflows, polling for
completion, and downloading outputs. Stdlib-only (no external dependencies).

Usage:
    client = ComfyClient(host='127.0.0.1', port=8188)
    if not client.is_alive():
        raise RuntimeError('ComfyUI not running')
    prompt_id = client.queue_prompt(workflow_dict)
    history = client.poll_until_done(prompt_id, timeout_s=300)
    outputs = client.get_outputs(history)
    for output in outputs:
        client.download_output(output, dest_path='test_output.png')
"""

import sys
import uuid
import time
import json
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path


class ComfyClientError(Exception):
    """Raised when ComfyUI API call fails."""
    pass


class ComfyClient:
    """Synchronous ComfyUI HTTP client."""

    def __init__(self, host='127.0.0.1', port=8188):
        """Initialize client. Does not connect; connection on first API call."""
        self.base_url = f'http://{host}:{port}'
        self.client_id = str(uuid.uuid4())

    def is_alive(self) -> bool:
        """Check if ComfyUI is responding. Returns True if alive, False otherwise."""
        try:
            url = f'{self.base_url}/system_stats'
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status == 200
        except Exception:
            return False

    def queue_prompt(self, workflow: dict) -> str:
        """
        Queue a workflow for execution.

        Args:
            workflow: Workflow dict (standard ComfyUI format)

        Returns:
            prompt_id: UUID identifying this queued workflow

        Raises:
            ComfyClientError: If queue fails
        """
        try:
            url = f'{self.base_url}/prompt'
            payload = {
                'client_id': self.client_id,
                'prompt': workflow,
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                if 'prompt_id' not in result:
                    raise ComfyClientError(f'No prompt_id in response: {result}')
                return result['prompt_id']
        except urllib.error.URLError as e:
            raise ComfyClientError(f'Failed to queue prompt: {e}')
        except json.JSONDecodeError as e:
            raise ComfyClientError(f'Invalid JSON response: {e}')

    def get_history(self, prompt_id: str) -> dict:
        """
        Fetch history for a queued/completed prompt.

        Args:
            prompt_id: Prompt ID returned by queue_prompt

        Returns:
            history_entry: Dict with execution status and outputs

        Raises:
            ComfyClientError: If API call fails
        """
        try:
            url = f'{self.base_url}/history/{prompt_id}'
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                if prompt_id not in result:
                    return {}  # Not yet in history (still queued or completed)
                return result[prompt_id]
        except urllib.error.URLError as e:
            raise ComfyClientError(f'Failed to fetch history: {e}')
        except json.JSONDecodeError as e:
            raise ComfyClientError(f'Invalid JSON in history response: {e}')

    def poll_until_done(self, prompt_id: str, timeout_s=300, poll_interval_s=2) -> dict:
        """
        Poll until workflow completes or times out.

        Args:
            prompt_id: Prompt ID to poll
            timeout_s: Max seconds to wait
            poll_interval_s: Seconds between polls

        Returns:
            history_entry: Full history entry with outputs (if successful)

        Raises:
            ComfyClientError: If execution fails or times out
        """
        start_time = time.time()
        while True:
            elapsed = time.time() - start_time
            if elapsed > timeout_s:
                raise ComfyClientError(f'Workflow {prompt_id} timed out after {timeout_s}s')

            history = self.get_history(prompt_id)
            if not history:
                # Still queued
                time.sleep(poll_interval_s)
                continue

            # Check execution status
            if 'outputs' in history:
                # Execution succeeded
                return history

            if 'status' in history and 'status_str' in history['status']:
                status_str = history['status']['status_str'].lower()
                if 'error' in status_str or 'fail' in status_str:
                    raise ComfyClientError(f'Workflow {prompt_id} failed: {history["status"]}')

            time.sleep(poll_interval_s)

    def get_outputs(self, history_entry: dict) -> list:
        """
        Extract output file info from a completed history entry.

        Args:
            history_entry: History dict from poll_until_done

        Returns:
            List of dicts: { 'filename': str, 'subfolder': str, 'type': str }

        Raises:
            ComfyClientError: If no outputs found
        """
        if 'outputs' not in history_entry:
            raise ComfyClientError('No outputs in history entry')

        outputs = []
        for node_id, node_output in history_entry['outputs'].items():
            # Each node_output can have images, videos, text, etc.
            if isinstance(node_output, dict):
                for key, value in node_output.items():
                    if key == 'images' and isinstance(value, list):
                        for img in value:
                            outputs.append({
                                'filename': img.get('filename'),
                                'subfolder': img.get('subfolder', ''),
                                'type': 'output',
                            })
                    elif key == 'videos' and isinstance(value, list):
                        for vid in value:
                            outputs.append({
                                'filename': vid.get('filename'),
                                'subfolder': vid.get('subfolder', ''),
                                'type': 'output',
                            })

        if not outputs:
            raise ComfyClientError('No image or video outputs found in history')

        return outputs

    def download_output(self, output_info: dict, dest_path: str) -> str:
        """
        Download a single output file from ComfyUI.

        Args:
            output_info: Dict with 'filename', 'subfolder', 'type'
            dest_path: Local file path to write to

        Returns:
            dest_path (same as input)

        Raises:
            ComfyClientError: If download fails
        """
        try:
            filename = output_info.get('filename')
            subfolder = output_info.get('subfolder', '')
            output_type = output_info.get('type', 'output')

            if not filename:
                raise ComfyClientError('No filename in output_info')

            # Build ComfyUI /view URL
            params = {
                'filename': filename,
                'subfolder': subfolder,
                'type': output_type,
            }
            query_string = urllib.parse.urlencode(params)
            url = f'{self.base_url}/view?{query_string}'

            # Download
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=60) as resp:
                content = resp.read()

            # Write to destination
            Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
            with open(dest_path, 'wb') as f:
                f.write(content)

            return dest_path

        except urllib.error.URLError as e:
            raise ComfyClientError(f'Failed to download {filename}: {e}')
        except OSError as e:
            raise ComfyClientError(f'Failed to write output to {dest_path}: {e}')


if __name__ == '__main__':
    # Quick smoke test
    client = ComfyClient()
    if client.is_alive():
        print('ComfyUI is alive')
    else:
        print('ComfyUI is not responding')
