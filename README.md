# ComfyUI-H3-MaterialHub

[![CI](https://github.com/zdwl001/ComfyUI-H3-MaterialHub/actions/workflows/ci.yml/badge.svg)](https://github.com/zdwl001/ComfyUI-H3-MaterialHub/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![ComfyUI custom node](https://img.shields.io/badge/ComfyUI-custom%20node-8A2BE2)](https://github.com/comfyanonymous/ComfyUI)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-3776AB)](https://www.python.org/)

**简体中文** | [English](README.en.md)

**MiniMax H3 参考素材中心**：把 9 张参考图 + 3 个参考视频 + 3 个参考音频**全部收进一个节点上传**，素材零连线。

针对官方本地模型节点 `MiniMaxH3ReferenceToVideo`（`comfy_extras/nodes_minimax_h3.py`）。
官方那 4 组 growable 素材口（`ref_images` / `ref_videos` / `ref_video_audios` / `ref_audios`）
每个素材一根线，素材一多就要拖一堆 `LoadImage` / `LoadVideo` / `LoadAudio` 并逐根连线，
连错位了结果就跑偏。本节点只解决"素材怎么进来"，**"素材怎么算"一行没改**。

---

## 目录

- [特性](#特性)
- [只改入口，不改算法](#只改入口不改算法)
- [安装](#安装)
- [界面](#界面)
- [编号规则（与官方一致，已实测核对）](#编号规则与官方一致已实测核对)
- [接线（素材零连线，只剩 6 根）](#接线素材零连线只剩-6-根)
- [输入参数](#输入参数)
- [几个会踩的坑](#几个会踩的坑)
- [排查](#排查)
- [核对依据（源码级）](#核对依据源码级)
- [素材会不会丢？](#素材会不会丢)
- [与另一套 H3 节点的区别](#与另一套-h3-节点的区别)
- [开发与贡献](#开发与贡献)
- [许可证](#许可证)

---

## 特性

- **一个节点装下全部素材**：9 图 + 3 视频 + 3 音频，上传/拖拽即用，素材零连线。
- **与官方逐位一致**：不重写任何编码逻辑，直接调用官方 `MiniMaxH3ReferenceToVideo.execute()`。
- **编号实时可见**：每个格子显示 `<Picture i>` / `<Video k>` / `<Audio j>`，底部给出当前总览。
- **删除自动重排**：删掉中间素材后，后面素材自动前移，提示词编号同步更新。
- **从 input 目录直接选**：复用 `ComfyUI/input` 里已有文件，免重复上传。
- **状态随工作流保存**：素材清单存在节点 `refs` widget 里，打开旧工作流会自动恢复。
- **零新增依赖**：只用 ComfyUI 自带的官方节点与 loader。

---

## 只改入口，不改算法

上传的文件由官方 loader 读成官方期望的类型，按官方槽位名组装成字典，
再**原样调用官方 `MiniMaxH3ReferenceToVideo.execute()`**：

```python
official.execute(
    clip, prompt, width, height, length, ref_image_size,
    vae=vae, audio_vae=audio_vae,
    ref_images=..., ref_videos=..., ref_video_audios=..., ref_audios=...,
)
```

所以下面这些**与官方逐位一致**，不存在"魔改版"：

- conditioning 的构建、`minimax_refs` 载荷
- `ref_image_size` 的 `match` / `max` 缩放策略（官方原样计算，官方原样按 2048 短边）
- 参考视频裁到 `17k+5` 帧、采样到 2fps 给 Qwen、音轨编码
- `<Picture i>` / `<Video k>` / `<Audio j>` 的编号与呈现顺序
- 官方自己的报错（例如参考视频不足 5 帧时抛 `MiniMax H3 reference videos need at least 5 frames`）

本节点**故意没有**加这些校验（官方本地节点没有，那是云端 API 节点 `MinimaxHailuo03ReferenceNode` 的规则）：
"至少要有 1 张图或 1 个视频"、"参考视频总时长 < 15 秒"、"图片最小 256×256"。

---

## 安装

### 要求

- ComfyUI 版本包含官方 MiniMax H3 节点（`comfy_extras/nodes_minimax_h3.py`）
- Python 3.10+
- **零新增依赖**

### 方式一：手动复制（通用）

1. 把整个 `ComfyUI-H3-MaterialHub` 文件夹（含 `web/`）复制到 `ComfyUI/custom_nodes/`
2. 重启 ComfyUI
3. 节点菜单搜 `H3 素材中心`（分类 `model/conditioning/minimax`）

### 方式二：git clone

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/zdwl001/ComfyUI-H3-MaterialHub.git
```

然后重启 ComfyUI。

### 方式三：ComfyUI Manager

若本节点已被 ComfyUI Manager / Registry 收录，可在 Manager 中搜索
`H3 Material Hub` 或 `ComfyUI-H3-MaterialHub` 一键安装。未被收录时请用方式一。

---

## 界面

```
┌ H3 素材中心｜Reference Hub ───────────────┐
│ P1      P2      P3                        │  ← 9 个图片位（3 列，自动加行）
│ [缩略图] [缩略图] [＋图片]                  │     左上角显示 <Picture i>
│ V1      V2      V3                        │  ← 3 个视频位（首帧预览）
│ [预览]  [＋视频] [＋视频]                   │     底边有「带音轨」开关
│ A1      A2      A3                        │  ← 3 个独立音频位
│ [🎵]    [＋音频] [＋音频]                   │
│ [📁 从 input 目录添加]  当前：图片 <Picture 1..3> 视频 <Video 1> 音频 <Audio 1..2> │
└───────────────────────────────────────────┘
   ↑ prompt / width / height / length / ref_image_size / ref_video_fps / refs 在其上下
```

**操作**

| 动作 | 效果 |
|---|---|
| 点空格位 | 弹文件选择，选中即上传并落位 |
| 直接把文件拖进某个区 | 拖到哪个区就是哪种类型（图/视频/音频） |
| 点图片位 / 视频位 | 弹大图 / 播放预览 |
| 点音频位 | 试听 / 停止 |
| `✕`（悬停出现） | 删除；**后面的素材自动前移，编号重排** |
| 视频位底部「带音轨」 | 是否把这个视频的音轨作为参考音频送入（默认开） |
| 📁 从 input 目录添加 | 从 `ComfyUI/input` 已有文件里点选，免重复上传 |
| 悬停任意格子左上角 | 显示它在提示词里的编号 |

上传会写到 `ComfyUI/input`（文件名自动改成 ASCII 安全名，规避中文名导致的 400），
所以这些素材随后也能被官方 `LoadImage` / `LoadVideo` / `LoadAudio` 直接选到。

---

## 编号规则（与官方一致，已实测核对）

| 标签 | 来自 | 编号 |
|---|---|---|
| `<Picture i>` | 图片位 | 按位次 1..N |
| `<Video k>` | 视频位 | 按位次 1..k |
| `<Audio j>` | 视频音轨 + 独立音频 | **视频音轨在前**（按视频位次），**独立音频在后**，共用一个号段 |

例：3 图 + 2 个带音轨视频 + 1 个独立音频

```
<Picture 1> <Picture 2> <Picture 3>  ← 3 张图
<Video 1>  = 第 1 个视频位          <Audio 1> = 第 1 个视频位的音轨
<Video 2>  = 第 2 个视频位          <Audio 2> = 第 2 个视频位的音轨
                                    <Audio 3> = 第 1 个独立音频位
```

面板底部那行"当前：…"就是照这个算的，提示词直接照着写。

> **`<Audio j>` 共用一个号段**这一点最容易写错：不是"音轨算一套、独立音频另算一套"，
> 而是接着往下排。这也是官方 `execute()` 里"先 append 音轨、再 append 视频"的循环顺序决定的。

---

## 接线（素材零连线，只剩 6 根）

```
CLIPLoader        → clip
VAELoader(视频)   → vae
VAELoader(音频)   → audio_vae
positive          → BasicGuider.conditioning
latent            → SamplerCustomAdvanced.latent_image
（width / height / length 可接 ResolutionSelector 等原语）
```

素材**一根线都不用连**。换素材只改节点里的格子，图不用重连。

---

## 输入参数

`clip` / `vae` / `audio_vae` / `prompt` / `width` / `height` / `length` / `ref_image_size`
**与官方节点同名、同默认值、同取值范围**（`width/height` 默认 1344/768、step 32；
`length` 默认 124、step 17、范围 5–3600）。

本节点特有：

| 参数 | 说明 |
|---|---|
| `refs` | 素材清单 JSON，由面板自动维护。一般不用手改；**前端没加载时手工粘 JSON 一样能跑**（例如 `{"images":[{"file":"a.png"}],"videos":[{"file":"v.mp4","audio":true}],"audios":[{"file":"m.mp3"}]}`，数组顺序即编号顺序） |
| `ref_video_fps` | `source`（默认）= 原样使用解码出的帧，等同官方工作流里直接接 `LoadVideo`；`24` = 素材不是 24fps 时按最近帧重采样到 24fps（官方接口契约写的是"Reference video frames at 24 fps"，但它自己不做重采样） |

---

## 几个会踩的坑

- **视频本身没有音轨，但「带音轨」开着** → 官方就不会产生这一项 `<Audio j>`，**它后面独立音频的编号会整体前移一位**，提示词指错素材。节点会打一条 WARNING 明确告诉你前移了；请同步改提示词，或把该视频的「带音轨」关掉。
- **参考视频不足 5 帧** → 官方直接抛错（这是官方行为，本节点不拦）。官方建议素材 2–15 秒、24fps。
- **参考视频比生成长度还长** → 官方会裁到生成长度（`length` 帧）。
- **`ref_image_size=max`** → 官方 2048 短边，身份更准但**慢数倍**（参考 token 每步都参与），默认 `match`。
- **`length` 不是秒** → 是 24fps 帧数，124 ≈ 5 秒，需要落在 17k+5 上（官方 step 17 已经保证）。
- **素材加载失败会直接报错停下**，不会静默跳过 —— 因为跳过会让后面的编号前移，生成出"能跑但指错素材"的结果。

---

## 排查

| 现象 | 处理 |
|---|---|
| 只有 `refs` 文本框，没有素材网格 | 确认 `__init__.py` 里有 `WEB_DIRECTORY = "./web"`、`web/h3_ref_hub.js` 存在、重启过 ComfyUI、浏览器 Ctrl+F5 |
| 上传 400 | 面板已用 ASCII 安全文件名；仍失败就用「📁 从 input 目录添加」，或把文件手动放进 `ComfyUI/input` |
| 报"需要 ComfyUI 内置的官方 MiniMax H3 节点" | ComfyUI 版本太旧，升级到含 `comfy_extras/nodes_minimax_h3.py` 的版本 |
| 预览失败但能跑 | 只是 `view` 取图失败（子目录/权限），不影响后端加载 |

---

## 核对依据（源码级）

实现前逐条核对过官方源码，本节点与之一致：

1. **槽位名是 0-based**：`comfy_api/latest/_io.py` 中
   `TemplatePrefix.names = [f"{prefix}{i}" for i in range(max)]`，
   故 `ref_image_` + `max=9` → `ref_image_0 … ref_image_8`。
   （`docs.comfy.org` 写的 `ref_image_1 … ref_image_9` 指的是**提示词序号**，不是槽位名。）
2. **编号由字典插入顺序决定**，与键名无关：官方是 `for img in (ref_images or {}).values()`，
   所以本节点严格按位次顺序插入。
3. **视频音轨靠同后缀配对**：官方是
   `ref_video_audios.get("ref_video_audio_" + name.rsplit("_", 1)[-1])`，
   故第 i 个视频的音轨键必须是 `ref_video_audio_{i}`。
4. **`<Audio j>` 音轨在前、独立音频在后，共用号段**：官方先遍历 `ref_videos`
   （带音轨的先 append audio 再 append video），再遍历 `ref_audios`。
5. 参考图只取批内第一张（官方 `_resize(img[:1], ...)`）、参考视频每帧 `_resize` 到
   `adapt_canvas` 尺寸并裁到 `17k+5`、Qwen 侧按 2fps 采样 —— 全部留在官方实现里。

编号规则另外用官方循环结构写了 7 个用例（含满配 9+3+3、无音轨视频、空素材）
逐一比对"同一素材在官方实现与面板显示里拿到的编号是否相同"，全部一致。

---

## 素材会不会丢？

**不会**，这一点专门核对过前端源码：

- 素材状态存在节点自己的 `refs` widget 里，随工作流一起保存。
  前端只在 `widget.serialize === false` 时才跳过序列化
  （`ComfyUI_frontend/src/lib/litegraph/src/LGraphNode.ts:191`），
  **`hidden` 只影响渲染、不影响保存**；读回时还是按 widget **名字**还原（同文件 `:1228`）。
  所以被面板"藏起来"的 `refs` 照样存、照样读。
- 素材面板本身声明了 `serialize: false`，**不进入** `widgets_values` 的位置数组，
  不会把 `prompt` / `width` / `height` 等控件的位置错位。
- 面板在 `onConfigure` 之后重新读一次 `refs` 并重绘，所以打开旧工作流素材会自己回来。

另外，素材文件本身躺在 `ComfyUI/input` 里，不随工作流删除 —— 只要文件还在，工作流就能复现。

---

## 与另一套 H3 节点的区别

ComfyUI 里并存两套 MiniMax H3 节点，别混了：

| | **本地模型版**（本节点对接的） | 云端 API 版 |
|---|---|---|
| 节点 | `MiniMaxH3ReferenceToVideo` | `MinimaxHailuo03ReferenceNode` |
| 来源 | `comfy_extras/nodes_minimax_h3.py` | `comfy_api_nodes/nodes_minimax.py` |
| 提示词标签 | `<Picture i>` / `<Video k>` / `<Audio j>` | `Image 1` / `Video 1` / `Audio 1` |
| 出片 | 本地显卡采样 | MiniMax 服务器，按量计费 |

本节点**只对接左边那一套**。

---

## 开发与贡献

- 代码风格：Python 用 [Ruff](https://docs.astral.sh/ruff/)（配置见 `pyproject.toml`），前端为原生 JS。
- 本地检查：

  ```bash
  uvx ruff check .
  uvx ruff format --check .
  node --check web/h3_ref_hub.js
  ```

- 提交前请在真实 ComfyUI 中验证节点加载、素材上传、编号显示与工作流保存/恢复。
- 详细流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 许可证

本项目采用 [MIT License](LICENSE)。
