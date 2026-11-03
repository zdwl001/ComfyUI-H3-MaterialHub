# Contributing

Thanks for your interest in ComfyUI-H3-MaterialHub! This document explains how to report issues,
set up a development environment, and submit changes.

## Reporting bugs

Please include:

- ComfyUI version / commit, and how it was installed (portable, desktop, manual)
- OS, Python version, GPU and PyTorch version
- The exact node and model versions used
- ComfyUI console output (especially the `H3 素材中心` lines) and browser console errors
- A minimal workflow JSON or screenshots if the problem is visual

For upload or preview issues, also state whether the file is in `ComfyUI/input` and whether
"Add from input" works.

## Development setup

No extra runtime dependencies are required. The node uses only ComfyUI's bundled modules.

```bash
# Optional: install the linter
uvx ruff --version

# Lint and format
uvx ruff check .
uvx ruff format --check .

# Syntax-check the frontend
node --check web/h3_ref_hub.js
```

To test manually:

1. Copy/symlink this folder into `ComfyUI/custom_nodes/`.
2. Restart ComfyUI and confirm the node appears under `model/conditioning/minimax`.
3. Add the node and verify:
   - the material grid renders (not just the `refs` text box);
   - image / video / audio upload works, and files land in `ComfyUI/input`;
   - each slot shows the expected `<Picture i>` / `<Video k>` / `<Audio j>` tag;
   - deleting a middle material renumbers the rest;
   - a workflow containing materials saves, reloads, and restores the grid.
4. Run a small generation with at least one image, one video (with and without audio),
   and one standalone audio.

## Project layout

```
ComfyUI-H3-MaterialHub/
├── __init__.py          # backend node: schema, refs parsing, official loaders, official execute
├── web/
│   └── h3_ref_hub.js    # frontend upload grid and prompt-tag display
├── README.md            # Chinese documentation
├── README.en.md         # English documentation
├── pyproject.toml       # project metadata + Ruff config + ComfyUI Registry fields
└── .github/workflows/   # CI: Ruff + JS syntax check
```

## Design constraints

- **Do not change the computation path.** The node must keep calling the official
  `MiniMaxH3ReferenceToVideo.execute()` and the official loaders. Material handling is the only
  responsibility of this plugin.
- **Keep numbering identical to the official loop.** `<Audio j>` is a single shared sequence:
  video audio tracks first, then standalone audio.
- **Do not silently skip a failed material.** Skipping shifts later numbering and produces
  plausible-but-wrong prompts.
- **Keep `refs` backward compatible.** It is stored in existing workflows; accept plain strings,
  dictionaries, and missing keys where possible.

## Pull requests

- Keep changes focused and explain the motivation.
- Update both READMEs when user-facing behavior changes.
- Add a CHANGELOG entry under `Unreleased`.
- Run the checks above and describe the manual verification you performed.
- By contributing, you agree that your contribution is licensed under the MIT License.
