"""MPI-607: measure speaker IDENTITY similarity with Chatterbox's own x-vector encoder.

"Is this the same voice?" is not a matter of opinion here -- Chatterbox decides it with a
CAMPPlus speaker encoder, and clones from the x-vector that encoder produces. So cosine
similarity in THAT space is exactly the question: would Chatterbox treat these two clips
as the same speaker?

Weights are the s3gen checkpoint the node already downloaded; only the `speaker_encoder`
submodule is loaded, no generation happens.

Rough reading of the scale (CAMPPlus x-vectors, cosine):
  > 0.80  same speaker, confidently
  0.65-0.80  probably same speaker, some drift
  0.50-0.65  ambiguous
  < 0.50  different speakers

Run from the BENCH python (it has torch + the pack on disk):
  G:/ComfyUi/python_embeded/python.exe speaker_similarity.py <dir-of-wavs> [more dirs]
"""
import glob
import os
import sys

CHATTERBOX = r"G:\ComfyUi\ComfyUI\custom_nodes\ComfyUI_Fill-ChatterBox\local_chatterbox"
S3GEN_CKPT = r"G:\ComfyUi\ComfyUI\models\chatterbox\chatterbox\s3gen.safetensors"

sys.path.insert(0, CHATTERBOX)

import librosa  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402
from safetensors.torch import load_file  # noqa: E402

from chatterbox.models.s3gen.xvector import CAMPPlus  # noqa: E402

SR = 16000  # CAMPPlus operates on 16k


def load_encoder():
    enc = CAMPPlus(feat_dim=80, embedding_size=192)
    state = load_file(S3GEN_CKPT)
    # keys arrive prefixed `speaker_encoder.` inside the s3gen checkpoint
    sub = {k[len("speaker_encoder."):]: v
           for k, v in state.items() if k.startswith("speaker_encoder.")}
    if not sub:
        raise SystemExit("no speaker_encoder.* keys in the s3gen checkpoint")
    missing, unexpected = enc.load_state_dict(sub, strict=False)
    if missing:
        print(f"  (missing {len(missing)} keys, e.g. {missing[:3]})")
    enc.eval()
    return enc


@torch.no_grad()
def embed(enc, path):
    wav, _ = librosa.load(path, sr=SR, mono=True)
    t = torch.from_numpy(wav).float().unsqueeze(0)
    vec = enc.inference(t).squeeze()
    return torch.nn.functional.normalize(vec, dim=-1).numpy()


def main():
    paths = []
    for arg in sys.argv[1:]:
        paths.extend(sorted(glob.glob(os.path.join(arg, "*.wav"))))
        paths.extend(sorted(glob.glob(os.path.join(arg, "*.flac"))))
    if not paths:
        raise SystemExit("no audio found")

    enc = load_encoder()
    names, vecs = [], []
    for p in paths:
        names.append(os.path.basename(p).rsplit(".", 1)[0])
        vecs.append(embed(enc, p))
    M = np.array(vecs)
    sim = M @ M.T

    w = max(len(n) for n in names) + 1
    print("\n" + " " * w + "".join(f"{i:>7}" for i in range(len(names))))
    for i, n in enumerate(names):
        row = "".join(f"{sim[i, j]:7.2f}" for j in range(len(names)))
        print(f"{n:<{w}}{row}   [{i}]")

    print("\nPairs, most similar first:")
    pairs = [(sim[i, j], names[i], names[j])
             for i in range(len(names)) for j in range(i + 1, len(names))]
    for s, a, b in sorted(pairs, reverse=True):
        verdict = ("SAME" if s > 0.80 else "same-ish" if s > 0.65
                   else "ambiguous" if s > 0.50 else "DIFFERENT")
        print(f"  {s:5.2f}  {verdict:10} {a}  vs  {b}")


if __name__ == "__main__":
    main()
