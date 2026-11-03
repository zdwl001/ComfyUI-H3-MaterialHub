"""
ComfyUI-H3-MaterialHub — MiniMax H3 参考素材中心
=================================================

解决什么
--------
官方 ``MiniMaxH3ReferenceToVideo``（本地模型版，comfy_extras/nodes_minimax_h3.py）
的素材口是 4 组 growable 输入，每个素材一个插槽、一根线：

    ref_images        ref_image_0 .. ref_image_8     (max=9)
    ref_videos        ref_video_0 .. ref_video_2     (max=3)
    ref_video_audios  ref_video_audio_0 .. _2        (max=3)
    ref_audios        ref_audio_0 .. ref_audio_2     (max=3)

素材一多就要拖一堆 LoadImage / LoadVideo / LoadAudio 并逐根连线，既麻烦又容易连错位
（连错位 = 提示词里的 <Picture 3> 指向了别的图，生成结果直接跑偏）。

本节点把 **全部素材收进一个节点内上传**：9 个图片位 + 3 个视频位 + 3 个音频位，
点一下上传、或把文件拖进去即可，素材零连线。

只改"怎么进来"，不改"怎么算"
------------------------------
素材进入之后的一切，**逐行沿用官方实现**：本节点不做任何自己版本的编码，
而是把上传的文件用官方 loader 读成官方期望的类型，按官方槽位名组装成字典，
再原样调用官方 ``MiniMaxH3ReferenceToVideo.execute()``：

    clip / prompt / width / height / length / ref_image_size / vae / audio_vae
    ref_images / ref_videos / ref_video_audios / ref_audios

因此 conditioning、``minimax_refs``、参考图缩放策略、视频裁到 17k+5 帧、
``<Picture i>`` / ``<Video k>`` / ``<Audio j>`` 的编号与呈现顺序、
以及官方自己的报错文案，全部与官方节点逐位一致。

官方依据（已逐条核对源码）
--------------------------
1. 槽位名是 **0-based**：``comfy_api/latest/_io.py`` 里
   ``TemplatePrefix.names = [f"{prefix}{i}" for i in range(max)]``，
   故 ``ref_image_`` + max=9 → ``ref_image_0`` … ``ref_image_8``。
   （docs.comfy.org 写的 ``ref_image_1 … ref_image_9`` 指的是**提示词里的序号**，
   不是槽位名——两者不是一回事。）
2. 编号由**字典插入顺序**决定，与键名无关：官方 execute 里是
   ``for img in (ref_images or {}).values()``，所以本节点按位次顺序插入。
3. 视频音轨必须**同后缀配对**：官方是
   ``ref_video_audios.get("ref_video_audio_" + name.rsplit("_", 1)[-1])``，
   故第 i 个视频的音轨键必须是 ``ref_video_audio_{i}``。
4. ``<Audio j>`` 共用一个号段，且**视频音轨在前**、独立音频在后：
   官方先遍历 ref_videos（每个带音轨的视频先 append 一个 audio 项再 append 视频项），
   再遍历 ref_audios。
5. 官方对素材**没有**"至少一个图片或视频"之类的额外校验（那是云端 API 节点
   MinimaxHailuo03ReferenceNode 的规则，不是本地节点）。本节点同样不加，
   只保留官方自己的校验（如参考视频不足 5 帧时由官方抛错）。

输入/输出与官方节点一致（素材除外）
----------------------------------
``clip / vae / audio_vae / prompt / width / height / length / ref_image_size``
的名称、默认值、取值范围全部照抄官方 schema；额外的 ``refs`` 是素材状态
（由前端维护的 JSON，无前端时可手工粘），``ref_video_fps`` 是素材准备选项。

零新增依赖、零 GPU 专有代码：只调官方节点与官方 loader。
"""

import json
import logging

from comfy_api.latest import ComfyExtension, io

__version__ = "1.0.0"

log = logging.getLogger(__name__)

FPS = 24

# 与官方 autogrow 的 max 对齐（见官方 schema）
MAX_IMAGES = 9
MAX_VIDEOS = 3
MAX_VIDEO_AUDIOS = 3
MAX_AUDIOS = 3

_DEFAULT_MAX_RESOLUTION = 16384


# --------------------------------------------------------------------------
# 官方节点 / 官方 loader 的延迟导入
# --------------------------------------------------------------------------
# 不在顶层 import：ComfyUI 扫描插件时会直接执行本 __init__.py，此阶段
# comfy_extras / comfy_aimdo 等运行时依赖可能尚未就绪，官方 H3 节点内部还会
# 顶层 import comfy_aimdo.control，一旦在扫描阶段触发就会让整个插件加载崩溃。
# 全部推迟到首次 execute()，插件加载阶段零外部依赖。
_OFFICIAL = None


def _official():
    global _OFFICIAL
    if _OFFICIAL is None:
        try:
            from comfy_extras.nodes_minimax_h3 import MiniMaxH3ReferenceToVideo
        except Exception as e:
            raise RuntimeError(
                "H3 素材中心需要 ComfyUI 内置的官方 MiniMax H3 节点 "
                "(comfy_extras.nodes_minimax_h3.MiniMaxH3ReferenceToVideo)。"
                "请把 ComfyUI 更新到包含 MiniMax H3 支持的版本。导入错误: " + repr(e)
            ) from e
        try:
            from comfy_extras.nodes_audio import LoadAudio
            from comfy_extras.nodes_video import GetVideoComponents, LoadVideo
            from nodes import LoadImage
        except Exception as e:
            raise RuntimeError(
                "H3 素材中心需要 ComfyUI 内置的 LoadImage / LoadVideo / "
                "GetVideoComponents / LoadAudio 节点。导入错误: " + repr(e)
            ) from e
        _OFFICIAL = {
            "r2v": MiniMaxH3ReferenceToVideo,
            "LoadImage": LoadImage,
            "LoadVideo": LoadVideo,
            "GetVideoComponents": GetVideoComponents,
            "LoadAudio": LoadAudio,
        }
    return _OFFICIAL


def _result(out):
    """把 io.NodeOutput / tuple / 裸值 统一取成 tuple。"""
    r = getattr(out, "result", None)
    if r is not None:
        return r if isinstance(r, tuple) else (r,)
    if isinstance(out, (tuple, list)):
        return tuple(out)
    return (out,)


def _max_resolution():
    try:
        import nodes

        return nodes.MAX_RESOLUTION
    except Exception:
        # Optional runtime import; fall back to ComfyUI's default upper bound.
        return _DEFAULT_MAX_RESOLUTION


# --------------------------------------------------------------------------
# 素材状态解析
# --------------------------------------------------------------------------
def _item_file(entry):
    """素材项 -> 文件名；兼容纯字符串写法。"""
    if isinstance(entry, str):
        return entry or None
    if isinstance(entry, dict):
        f = entry.get("file")
        return f if isinstance(f, str) and f else None
    return None


def _bucket(state, key, limit):
    out = []
    for entry in state.get(key) or []:
        f = _item_file(entry)
        if f:
            out.append(entry if isinstance(entry, dict) else {"file": f})
    if len(out) > limit:
        log.warning(
            "H3 素材中心：%s 收到 %d 项，超过官方上限 %d，多余部分已忽略。",
            key,
            len(out),
            limit,
        )
        out = out[:limit]
    return out


def _parse_refs(text):
    """refs JSON -> {"images": [...], "videos": [...], "audios": [...]}，数组顺序即编号顺序。"""
    state = {"images": [], "videos": [], "audios": []}
    if not text:
        return state
    try:
        data = json.loads(text)
    except Exception as e:
        raise ValueError(f"H3 素材中心：refs 不是合法 JSON，无法解析素材清单。{e}") from e
    if not isinstance(data, dict):
        raise TypeError(f"H3 素材中心：refs 应该是一个 JSON 对象，实际是 {type(data).__name__}。")
    return {
        "images": _bucket(data, "images", MAX_IMAGES),
        "videos": _bucket(data, "videos", MAX_VIDEOS),
        "audios": _bucket(data, "audios", MAX_AUDIOS),
    }


# --------------------------------------------------------------------------
# 素材加载（一律走官方 loader，读成官方期望的类型）
# --------------------------------------------------------------------------
def _load_image(name, slot):
    """官方 LoadImage -> IMAGE。官方 execute 内部会自己取 [:1]，这里原样传整批。"""
    LoadImage = _official()["LoadImage"]
    try:
        image, _mask = LoadImage().load_image(name)
    except Exception as e:
        raise RuntimeError(
            f"H3 素材中心：第 {slot} 个参考图加载失败 '{name}'。"
            f"请确认该文件还在 ComfyUI/input 里。原因: {e!r}"
        ) from e
    return image


def _load_audio(name, slot):
    """官方 LoadAudio -> {"waveform", "sample_rate"}。"""
    LoadAudio = _official()["LoadAudio"]
    try:
        return _result(LoadAudio.execute(name))[0]
    except Exception as e:
        raise RuntimeError(
            f"H3 素材中心：第 {slot} 个参考音频加载失败 '{name}'。"
            f"请确认该文件还在 ComfyUI/input 里。原因: {e!r}"
        ) from e


def _load_video(name, slot):
    """官方 LoadVideo -> VIDEO，再用官方 GetVideoComponents 拆成 (帧 IMAGE, 音轨 AUDIO, fps)。"""
    o = _official()
    try:
        video = _result(o["LoadVideo"].execute(name))[0]
        parts = _result(o["GetVideoComponents"].execute(video))
    except Exception as e:
        raise RuntimeError(
            f"H3 素材中心：第 {slot} 个参考视频加载失败 '{name}'。"
            f"请确认该文件还在 ComfyUI/input 里。原因: {e!r}"
        ) from e
    frames, audio, fps = parts[0], parts[1], parts[2]
    return frames, audio, float(fps)


def _resample_to_24(frames, src_fps, name, slot):
    """按最近帧重采样到 24fps —— 官方要求参考视频帧率为 24fps。

    官方节点的接口契约是"Reference video frames at 24 fps"，但它自己不重采样；
    这里只是把素材换算到该契约上，模型侧的取舍逻辑一根线都没动。
    """
    if not src_fps or src_fps <= 0 or abs(src_fps - FPS) < 1e-3:
        return frames
    import torch

    n_src = frames.shape[0]
    n_dst = max(1, round(n_src * FPS / src_fps))
    idx = torch.round(torch.arange(n_dst, dtype=torch.float64) * (src_fps / FPS)).to(torch.long)
    idx = idx.clamp_(0, n_src - 1)
    log.info(
        "H3 素材中心：第 %s 个参考视频 '%s' 从 %.3ffps 重采样到 %dfps：%d 帧 -> %d 帧。",
        slot,
        name,
        src_fps,
        FPS,
        n_src,
        n_dst,
    )
    return frames[idx]


# --------------------------------------------------------------------------
# 节点
# --------------------------------------------------------------------------
class H3MaterialHub(io.ComfyNode):
    """MiniMax H3 参考素材中心：素材在节点内上传，零连线，其余全走官方实现。"""

    @classmethod
    def define_schema(cls):
        max_res = _max_resolution()
        return io.Schema(
            node_id="H3MaterialHub",
            display_name="H3 素材中心｜Reference Hub",
            search_aliases=["minimax h3 material", "h3 素材", "ref2va hub"],
            category="model/conditioning/minimax",
            description=(
                "MiniMax H3 参考素材中心：9 图片位 + 3 视频位 + 3 音频位全部在本节点内上传，"
                "素材零连线。上传后按官方槽位名组装并原样调用官方 "
                "MiniMaxH3ReferenceToVideo，标签 <Picture i> / <Video k> / <Audio j> "
                "与官方完全一致。"
            ),
            inputs=[
                # —— 以下 8 项与官方 schema 同名、同默认值、同范围 ——
                io.Clip.Input("clip"),
                io.Vae.Input(
                    "vae",
                    optional=True,
                    tooltip="视频 VAE。没有它时参考图/参考视频只影响文本编码器（官方行为）。",
                ),
                io.Vae.Input(
                    "audio_vae",
                    optional=True,
                    tooltip="音频 VAE。没有它时参考音频只影响文本编码器（官方行为）。",
                ),
                io.String.Input(
                    "prompt",
                    multiline=True,
                    dynamic_prompts=True,
                    tooltip=(
                        "提示词。按位次引用素材："
                        "<Picture i> / <Video k> / <Audio j>（均从 1 开始）。"
                    ),
                ),
                io.Int.Input("width", default=1344, min=32, max=max_res, step=32),
                io.Int.Input("height", default=768, min=32, max=max_res, step=32),
                io.Int.Input(
                    "length",
                    default=124,
                    min=5,
                    max=3600,
                    step=17,
                    tooltip="帧数（24fps），124 ≈ 5 秒，官方训练区间约 124-362。",
                ),
                io.Combo.Input(
                    "ref_image_size",
                    options=["match", "max"],
                    default="match",
                    tooltip="参考图尺寸策略（官方同名参数）：match=等比缩到生成面积；"
                    "max=2048 短边，身份更准但慢数倍。",
                ),
                # —— 本节点特有：素材状态 + 素材准备选项 ——
                io.String.Input(
                    "refs",
                    multiline=True,
                    default="{}",
                    tooltip="参考素材清单 JSON（由节点内的上传面板自动维护，一般不用手改）：\n"
                    '{"images":[{"file":"a.png"}],'
                    '"videos":[{"file":"v.mp4","audio":true}],'
                    '"audios":[{"file":"m.mp3"}]}\n'
                    "数组顺序 = <Picture i> / <Video k> / <Audio j> 的编号顺序。",
                ),
                io.Combo.Input(
                    "ref_video_fps",
                    options=["source", "24"],
                    default="source",
                    tooltip="参考视频帧率处理（官方要求参考视频为 24fps）：\n"
                    "source=原样使用解码出的帧（等同官方工作流里直接接 LoadVideo）；\n"
                    "24=素材不是 24fps 时按最近帧重采样到 24fps。",
                ),
            ],
            outputs=[
                io.Conditioning.Output(display_name="positive"),
                io.Latent.Output(),
            ],
        )

    # 可选输入放末尾给默认值，避免漏传时 TypeError。
    @classmethod
    def execute(
        cls,
        clip,
        prompt,
        width,
        height,
        length,
        ref_image_size="match",
        refs="{}",
        ref_video_fps="source",
        vae=None,
        audio_vae=None,
    ):
        official = _official()["r2v"]
        state = _parse_refs(refs)

        # 按位次顺序插入字典 —— 官方 execute 只认插入顺序（.values()），
        # 而视频音轨靠同后缀配对，所以键名与位次必须一致。
        ref_images = {}
        for i, item in enumerate(state["images"]):
            ref_images[f"ref_image_{i}"] = _load_image(item["file"], i + 1)

        ref_videos, ref_video_audios = {}, {}
        for i, item in enumerate(state["videos"]):
            frames, audio, src_fps = _load_video(item["file"], i + 1)
            if ref_video_fps == "24":
                frames = _resample_to_24(frames, src_fps, item["file"], i + 1)
            ref_videos[f"ref_video_{i}"] = frames
            # 官方按 ref_video_audio_{同后缀} 取音轨；item["audio"] 默认 True
            if item.get("audio", True):
                if audio is None:
                    # 危险：开关开着但文件里没有音轨，官方就不会产生这一项 <Audio j>，
                    # 它后面的独立音频编号会整体前移一位 —— 提示词会指错素材。
                    log.warning(
                        "H3 素材中心：第 %d 个参考视频 '%s' 勾了「带音轨」，但文件里没有音轨，"
                        "已跳过它的音轨。注意：它后面的独立音频 <Audio j> 编号会前移一位，"
                        "请同步调整提示词，或把该视频的「带音轨」关掉。",
                        i + 1,
                        item["file"],
                    )
                else:
                    ref_video_audios[f"ref_video_audio_{i}"] = audio

        ref_audios = {}
        for i, item in enumerate(state["audios"]):
            ref_audios[f"ref_audio_{i}"] = _load_audio(item["file"], i + 1)

        log.info(
            "H3 素材中心：图片 %d / 视频 %d（其中带音轨 %d）/ 独立音频 %d，"
            "交给官方 ReferenceToVideo。",
            len(ref_images),
            len(ref_videos),
            len(ref_video_audios),
            len(ref_audios),
        )

        out = official.execute(
            clip,
            prompt,
            width,
            height,
            length,
            ref_image_size,
            vae=vae,
            audio_vae=audio_vae,
            ref_images=ref_images or None,
            ref_videos=ref_videos or None,
            ref_video_audios=ref_video_audios or None,
            ref_audios=ref_audios or None,
        )
        return io.NodeOutput(*_result(out)[:2])


# --------------------------------------------------------------------------
# 注册
# --------------------------------------------------------------------------
WEB_DIRECTORY = "./web"


class H3MaterialHubExtension(ComfyExtension):
    async def get_node_list(self):
        return [H3MaterialHub]


async def comfy_entrypoint() -> H3MaterialHubExtension:
    return H3MaterialHubExtension()
