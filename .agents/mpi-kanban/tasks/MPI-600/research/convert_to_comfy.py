#!/usr/bin/env python3
"""
Convert .comfy_quant layers in a safetensors file from the old format:
  {"convrot": true, "convrot_groupsize": 256, "per_row": true}
to the native comfy format:
  {"format": "int8_tensorwise", "convrot": true, "convrot_groupsize": 256}
  
All other tensors and metadata are copied unchanged.

Usage: python convert_comfy_quant.py <input.safetensors> <output.safetensors>
"""

import sys
import json
import struct


def read_safetensors_header(path):
    with open(path, "rb") as f:
        header_size = struct.unpack("<Q", f.read(8))[0]
        header_json = f.read(header_size)
    return json.loads(header_json)


def convert_quant_json(old: dict) -> dict:
    """Convert old comfy_quant JSON blob to new format."""
    new = {"format": "int8_tensorwise"}
    for k, v in old.items():
        if k != "per_row":
            new[k] = v
    return new


def encode_to_u8_tensor(data: dict) -> bytes:
    """Encode a dict as compact JSON bytes (no trailing spaces/newlines)."""
    return json.dumps(data, separators=(",", ":")).encode("utf-8")


def convert_file(input_path: str, output_path: str):
    try:
        import torch
        from safetensors import safe_open
        from safetensors.torch import save_file
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Install with: pip install safetensors torch")
        sys.exit(1)

    header = read_safetensors_header(input_path)
    all_keys = [k for k in header if k != "__metadata__"]
    quant_keys = set(k for k in all_keys if k.endswith(".comfy_quant"))

    print(f"Total tensors   : {len(all_keys)}")
    print(f".comfy_quant    : {len(quant_keys)}")
    print()

    tensors = {}
    converted = 0
    skipped = 0

    with safe_open(input_path, framework="pt", device="cpu") as f:
        for key in all_keys:
            tensor = f.get_tensor(key)
            dtype_str = header[key].get("dtype", "unknown")

            if key in quant_keys and dtype_str == "U8":
                raw = bytes(tensor.numpy().tolist())
                text = raw.decode("utf-8", errors="replace")
                try:
                    old_data = json.loads(text)
                except json.JSONDecodeError:
                    print(f"  SKIP (not valid JSON): {key}")
                    tensors[key] = tensor
                    skipped += 1
                    continue

                if "format" in old_data:
                    print(f"  SKIP (already has 'format'): {key}")
                    tensors[key] = tensor
                    skipped += 1
                    continue

                new_data = convert_quant_json(old_data)
                new_bytes = encode_to_u8_tensor(new_data)
                new_tensor = torch.tensor(list(new_bytes), dtype=torch.uint8)

                print(f"  CONVERT: {key}")
                print(f"    old ({len(raw)}B): {json.dumps(old_data, separators=(',', ':'))}")
                print(f"    new ({len(new_bytes)}B): {json.dumps(new_data, separators=(',', ':'))}")

                tensors[key] = new_tensor
                converted += 1
            else:
                tensors[key] = tensor

    print()
    print(f"Converted : {converted}")
    print(f"Skipped   : {skipped}")

    # Preserve __metadata__ if present
    metadata = header.get("__metadata__", {})
    save_file(tensors, output_path, metadata=metadata if metadata else None)
    print(f"\nSaved to  : {output_path}")


if __name__ == "__main__":
    import argparse
    import tempfile
    import os

    parser = argparse.ArgumentParser(description="Convert .comfy_quant layers to new format.")
    parser.add_argument("input", help="Input safetensors file")
    parser.add_argument("output", nargs="?", help="Output safetensors file")
    parser.add_argument("--inplace", action="store_true", help="Overwrite the input file")
    args = parser.parse_args()

    if args.inplace:
        tmp = tempfile.mktemp(suffix=".safetensors", dir=os.path.dirname(os.path.abspath(args.input)))
        try:
            convert_file(args.input, tmp)
            os.replace(tmp, args.input)
            print(f"Updated in place: {args.input}")
        except Exception:
            if os.path.exists(tmp):
                os.remove(tmp)
            raise
    elif args.output:
        convert_file(args.input, args.output)
    else:
        parser.error("Provide an output path or use --inplace")
