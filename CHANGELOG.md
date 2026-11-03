# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-11-03

### Added

- `H3MaterialHub` node: 9 image slots, 3 video slots, and 3 standalone audio slots in one node.
- Frontend upload grid with click-to-upload, drag-and-drop, previews, and per-video audio toggles.
- Live `<Picture i>` / `<Video k>` / `<Audio j>` prompt tags matching the official numbering.
- Automatic renumbering when a material is removed.
- "Add from input" picker that reuses files already in `ComfyUI/input`.
- ASCII-safe upload filenames to avoid HTTP 400 errors from non-ASCII names.
- Optional `ref_video_fps=24` nearest-frame resampling.
- `refs` JSON state persisted with the workflow, with manual-JSON fallback when the frontend is absent.
- MIT license, bilingual documentation, Ruff configuration, and CI checks.
