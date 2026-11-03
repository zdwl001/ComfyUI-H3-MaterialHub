# ComfyUI-H3-MaterialHub

[![CI](https://github.com/zdwl001/ComfyUI-H3-MaterialHub/actions/workflows/ci.yml/badge.svg)](https://github.com/zdwl001/ComfyUI-H3-MaterialHub/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![ComfyUI custom node](https://img.shields.io/badge/ComfyUI-custom%20node-8A2BE2)](https://github.com/comfyanonymous/ComfyUI)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-3776AB)](https://www.python.org/)

[简体中文](README.md) | **English**

A **reference material hub for MiniMax H3** in ComfyUI: upload **9 reference images + 3 reference videos + 3 reference audios inside a single node** — zero material wiring.

Built for the official local node `MiniMaxH3ReferenceToVideo` (`comfy_extras/nodes_minimax_h3.py`).
The official node exposes four growable material inputs (`ref_images` / `ref_videos` /
`ref_video_audios` / `ref_audios`). Every material needs its own loader and link, so a full set
means dragging in a pile of `LoadImage` / `LoadVideo` / `LoadAudio` nodes and wiring them one by one —
easy to mis-wire, and a mis-wire silently points `<Picture 3>` at the wrong image.
This plugin only changes **how materials get in**, never **how they are processed**.

---

## Features

- **All materials in one node**: 9 image slots + 3 video slots + 3 audio slots, upload or drag-and-drop.
- **Bit-for-bit official behavior**: no reimplementation — it calls the official
  `MiniMaxH3ReferenceToVideo.execute()` directly.
- **Live numbering**: every slot shows its prompt tag (`<Picture i>` / `<Video k>` / `<Audio j>`).
- **Automatic renumbering**: deleting a material shifts later ones and updates the tags.
- **Pick from `ComfyUI/input`**: reuse files already on disk instead of uploading again.
- **Saved with the workflow**: the material list lives in the node's `refs` widget.
- **Zero extra dependencies**: only stock ComfyUI nodes and loaders are used.

---

## How it works

Uploaded files are read by the official loaders into the exact types the official node expects,
assembled into dictionaries using the official slot names, and passed unchanged to the official
`MiniMaxH3ReferenceToVideo.execute()`:

```python
official.execute(
    clip, prompt, width, height, length, ref_image_size,
    vae=vae, audio_vae=audio_vae,
    ref_images=..., ref_videos=..., ref_video_audios=..., ref_audios=...,
)
```

Everything below is therefore identical to the official node:

- conditioning construction and the `minimax_refs` payload
- `ref_image_size` `match` / `max` scaling (including the official 2048 short-side path)
- video cropping to `17k+5` frames, 2 fps sampling for Qwen, audio track encoding
- the numbering and presentation order of `<Picture i>` / `<Video k>` / `<Audio j>`
- official error messages (for example, fewer than 5 reference-video frames)

The plugin intentionally does **not** add the cloud-API node's extra validations
("at least one image or video", "reference videos < 15 s", "images ≥ 256×256") —
the official local node does not have them.

---

## Requirements

- A ComfyUI build that includes the official MiniMax H3 node
  (`comfy_extras/nodes_minimax_h3.py`)
- Python 3.10+
- No extra Python packages

---

## Installation

1. Copy the whole `ComfyUI-H3-MaterialHub` folder (including `web/`) into
   `ComfyUI/custom_nodes/`.
2. Restart ComfyUI.
3. Search for `H3 素材中心` / `H3 Reference Hub` in the node menu
   (category `model/conditioning/minimax`).

Or clone it:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/zdwl001/ComfyUI-H3-MaterialHub.git
```

---

## Usage

```
┌ H3 素材中心｜Reference Hub ───────────────┐
│ P1      P2      P3                        │  ← 9 image slots (3 columns, rows grow)
│ [thumb] [thumb] [＋image]                  │     tag <Picture i> in the corner
│ V1      V2      V3                        │  ← 3 video slots (first-frame preview)
│ [prev]  [＋video] [＋video]                 │     "include audio" toggle at the bottom
│ A1      A2      A3                        │  ← 3 standalone audio slots
│ [🎵]    [＋audio] [＋audio]                 │
│ [📁 Add from input]  Current: images <Picture 1..3>  video <Video 1>  audio <Audio 1..2> │
└───────────────────────────────────────────┘
```

| Action | Result |
|---|---|
| Click an empty slot | Open a file picker; the selected file is uploaded and placed |
| Drag files onto a section | The section decides the type (image / video / audio) |
| Click an image or video slot | Open a large preview / play the video |
| Click an audio slot | Preview / stop the audio |
| `✕` (on hover) | Delete; later materials shift forward and are renumbered |
| Video "include audio" toggle | Send this video's audio track as reference audio (on by default) |
| 📁 Add from input | Pick an existing file from `ComfyUI/input` without re-uploading |

Uploaded files go to `ComfyUI/input` with an ASCII-safe filename (to avoid HTTP 400 errors
caused by non-ASCII names), so they remain selectable by the official
`LoadImage` / `LoadVideo` / `LoadAudio` nodes.

---

## Prompt tag rules (matching the official node)

| Tag | Source | Numbering |
|---|---|---|
| `<Picture i>` | Image slots | By position, 1..N |
| `<Video k>` | Video slots | By position, 1..k |
| `<Audio j>` | Video audio tracks + standalone audio | **Video tracks first** (by video position), then **standalone audio** — one shared sequence |

Example: 3 images + 2 videos with audio + 1 standalone audio

```
<Picture 1> <Picture 2> <Picture 3>  ← 3 images
<Video 1>  = video slot 1            <Audio 1> = audio of video slot 1
<Video 2>  = video slot 2            <Audio 2> = audio of video slot 2
                                     <Audio 3> = standalone audio slot 1
```

> The shared `<Audio j>` sequence is the easiest thing to get wrong: audio tracks and standalone
> audio do **not** have separate numbering. This follows the official loop, which appends audio
> tracks while walking videos and then walks `ref_audios`.

---

## Wiring (no material links, only 6 connections)

```
CLIPLoader        → clip
VAELoader(video)  → vae
VAELoader(audio)  → audio_vae
positive          → BasicGuider.conditioning
latent            → SamplerCustomAdvanced.latent_image
(width / height / length may come from primitives such as ResolutionSelector)
```

No material ever needs a link. Swapping materials only changes slots in the node.

---

## Inputs

`clip` / `vae` / `audio_vae` / `prompt` / `width` / `height` / `length` / `ref_image_size`
use the same names, defaults and ranges as the official node.
`width` / `height` default to 1344 / 768 with step 32; `length` defaults to 124 with step 17
and range 5–3600.

Plugin-specific inputs:

| Input | Description |
|---|---|
| `refs` | Material list JSON, maintained by the panel. You normally never edit it. **Without the frontend you can paste JSON manually** — e.g. `{"images":[{"file":"a.png"}],"videos":[{"file":"v.mp4","audio":true}],"audios":[{"file":"m.mp3"}]}`. Array order defines the numbering. |
| `ref_video_fps` | `source` (default) uses decoded frames as-is, like wiring `LoadVideo` directly. `24` resamples non-24 fps clips to 24 fps by nearest frame. The official API contract says "Reference video frames at 24 fps", but the node does not resample itself. |

---

## Gotchas

- **A video has no audio track but "include audio" is on** → the official node produces no
  `<Audio j>` entry for it, so every later standalone audio shifts one number forward.
  The plugin logs a WARNING; update the prompt or turn the toggle off.
- **Fewer than 5 reference-video frames** → the official node raises an error. The plugin does not
  suppress it. The official recommendation is 2–15 seconds at 24 fps.
- **A reference video longer than the output** → the official node crops it to `length` frames.
- **`ref_image_size=max`** → official 2048 short side; better identity fidelity but several times
  slower because reference tokens participate in every step. Default is `match`.
- **`length` is frames, not seconds** → at 24 fps, 124 ≈ 5 seconds, and it must land on `17k+5`
  (the official step 17 already guarantees this).
- **A failed material load stops execution** instead of being skipped — skipping would shift later
  numbering and produce a run that silently references the wrong material.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Only a `refs` text box, no material grid | Check `WEB_DIRECTORY = "./web"` in `__init__.py`, confirm `web/h3_ref_hub.js` exists, restart ComfyUI, then hard-refresh the browser (Ctrl+F5) |
| Upload returns 400 | The panel already uses ASCII-safe names. Try "Add from input", or place the file in `ComfyUI/input` manually |
| Error about the official MiniMax H3 node | Your ComfyUI build is too old; update to a version containing `comfy_extras/nodes_minimax_h3.py` |
| Preview fails but generation works | The `view` endpoint failed (subfolder/permission); backend loading is unaffected |

---

## Compatibility: two different H3 node families

| | **Local model** (this plugin) | **Cloud API** |
|---|---|---|
| Node | `MiniMaxH3ReferenceToVideo` | `MinimaxHailuo03ReferenceNode` |
| Source | `comfy_extras/nodes_minimax_h3.py` | `comfy_api_nodes/nodes_minimax.py` |
| Prompt tags | `<Picture i>` / `<Video k>` / `<Audio j>` | `Image 1` / `Video 1` / `Audio 1` |
| Output | Local GPU sampling | MiniMax servers, pay per use |

This plugin targets **only the local node on the left**.

---

## Development

```bash
uvx ruff check .
uvx ruff format --check .
node --check web/h3_ref_hub.js
```

Please test changes in a real ComfyUI installation: node loading, uploads, tag rendering,
and workflow save/restore. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE)
