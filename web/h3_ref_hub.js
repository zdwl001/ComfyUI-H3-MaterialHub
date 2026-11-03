/* ComfyUI-H3-MaterialHub — 前端素材上传面板
 *
 * 给 H3MaterialHub 节点铺一套上传网格：9 图片位 + 3 视频位 + 3 音频位。
 * 点一下上传、或把文件拖进来即可；每个格子实时显示它在提示词里的编号
 * （<Picture i> / <Video k> / <Audio j>），编号规则与官方节点逐条对齐：
 *
 *   - <Picture i>  图片位按位次 1..N
 *   - <Video k>    视频位按位次 1..k
 *   - <Audio j>    视频音轨在前（按视频位次），独立音频在后，共用一个号段
 *
 * 素材状态写进节点自己的 refs widget（JSON），保存工作流时一起存，后端读的就是它。
 * 后端不依赖本文件：前端没加载时，refs 框里手工粘 JSON 一样能跑。
 */
import { app } from "../../scripts/app.js";

const NODE_CLASS = "H3MaterialHub";
const MAX_IMG = 9;
const MAX_VID = 3;
const MAX_AUD = 3;

// 面板尺寸（像素）
const IMG_SLOT_H = 92;
const VID_SLOT_H = 92;
const VID_EMPTY_H = 46;
const AUD_SLOT_H = 46;
const GAP = 6;
const DEFAULT_IMG_SLOTS = 3; // 至少显示 3 个图片位
const MIN_EMPTY_SLOTS = 2;   // 永远多留 2 个空格位，方便直接拖进去
const FILL_MAX = 600;        // 节点拉高时面板最多额外吃多少高度

console.log("[H3Hub] 素材面板扩展已加载");

const CSS = `
.h3hub-root { font-size: 12px; user-select: none;
  display: flex !important; flex-direction: column !important;
  justify-content: flex-start !important; align-items: stretch !important;
  height: 100% !important; width: 100% !important;
  margin: 0 !important; padding: 0 !important; overflow: hidden; }
.h3hub-root * { box-sizing: border-box; }
.h3hub-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: ${GAP}px;
  flex: 1 1 0; min-height: 0; grid-auto-rows: minmax(0, 1fr); }
.h3hub-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: ${GAP}px;
  margin-top: ${GAP}px; flex: 0 0 auto; min-height: 0; grid-auto-rows: minmax(0, 1fr); }
.h3hub-slot { position: relative; height: 100%; min-height: 38px;
  border: 1px dashed #555; border-radius: 6px; cursor: pointer;
  background: #1d1d1f; overflow: hidden; }
.h3hub-slot:hover { border-color: #e07030; }
.h3hub-slot.h3hub-drop { border-color: #e07030; background: #2a2018; }
.h3hub-slot img, .h3hub-slot video { width: 100%; height: 100%; object-fit: cover;
  display: block; pointer-events: none; }
.h3hub-slot.h3hub-empty { display: flex; align-items: center; justify-content: center;
  color: #777; font-size: 11px; }
.h3hub-tag { position: absolute; top: 3px; left: 3px; background: rgba(0,0,0,.72);
  border-radius: 3px; padding: 0 5px; font-size: 10px; z-index: 3; white-space: nowrap; }
.h3hub-name { position: absolute; left: 3px; right: 3px; bottom: 3px; z-index: 3;
  font-size: 9px; background: rgba(0,0,0,.65); padding: 0 4px; border-radius: 3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.h3hub-del { position: absolute; top: 3px; right: 3px; width: 16px; height: 16px;
  line-height: 14px; text-align: center; background: rgba(120,30,30,.85);
  border-radius: 3px; cursor: pointer; font-size: 11px; z-index: 4; display: none; }
.h3hub-slot:hover .h3hub-del { display: block; }
.h3hub-aud { width: 100%; height: 100%; display: flex; align-items: center; gap: 6px;
  padding: 0 8px; color: #ccc; }
.h3hub-aud-ic { font-size: 16px; flex: none; }
.h3hub-aud-nm { font-size: 10px; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }
/* 视频音轨开关 */
.h3hub-aud-toggle { position: absolute; bottom: 3px; left: 3px; right: 3px; z-index: 4;
  font-size: 9px; background: rgba(0,0,0,.7); border-radius: 3px; padding: 1px 4px;
  display: flex; align-items: center; gap: 3px; cursor: pointer; color: #bbb; }
.h3hub-aud-toggle input { margin: 0; cursor: pointer; }
.h3hub-err { position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; color: #e0a030; font-size: 11px;
  background: rgba(60,40,10,.4); z-index: 2; }
.h3hub-loading { position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; color: #999; font-size: 11px;
  background: rgba(0,0,0,.35); z-index: 2; }
.h3hub-foot { display: flex; gap: 8px; align-items: center; padding: 6px 2px 0; flex: 0 0 auto; }
.h3hub-foot button { background: var(--button-hover, #444); color: var(--text-color, #eee);
  border: 1px solid var(--button-border, #555); border-radius: 4px; padding: 3px 10px;
  cursor: pointer; font-size: 12px; }
.h3hub-foot button:hover { filter: brightness(1.2); }
.h3hub-hint { opacity: .6; font-size: 11px; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }
/* 三种素材的底色，一眼区分 */
.h3hub-grid .h3hub-slot { background: #1b2029; border-color: #3a4757; }
.h3hub-grid .h3hub-slot.h3hub-empty { color: #7f8b9c; }
.h3hub-grid .h3hub-tag { background: rgba(38,62,96,.9); }
.h3hub-row .h3hub-slot { background: #211c2b; border-color: #4a3f5e; }
.h3hub-row .h3hub-slot.h3hub-empty { color: #9a8bac; }
.h3hub-row .h3hub-tag { background: rgba(72,50,100,.9); }
.h3hub-row-aud .h3hub-slot { background: #19231d; border-color: #3a5545; }
.h3hub-row-aud .h3hub-slot.h3hub-empty { color: #86a392; }
.h3hub-row-aud .h3hub-tag { background: rgba(40,80,55,.9); }
/* 预览弹窗 / toast */
.h3hub-ov { position: fixed; inset: 0; background: rgba(0,0,0,.85); z-index: 100000;
  display: flex; align-items: center; justify-content: center; }
.h3hub-ov-box { background: #1a1a1a; border: 1px solid #555; border-radius: 10px;
  padding: 12px; max-width: 90vw; max-height: 92vh; display: flex;
  flex-direction: column; gap: 8px; }
.h3hub-ov-title { color: #ddd; font-size: 13px; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 82vw; }
.h3hub-ov-content { display: flex; flex-direction: column; align-items: center;
  justify-content: center; }
.h3hub-ov-content img { max-width: 82vw; max-height: 72vh; object-fit: contain; border-radius: 4px; }
.h3hub-ov-content video { max-width: 82vw; max-height: 72vh; border-radius: 4px; background: #000; }
.h3hub-ov-content audio { width: 420px; max-width: 72vw; margin-top: 14px; }
.h3hub-ov-close { align-self: flex-end; padding: 4px 14px; background: #444;
  border: 1px solid #666; border-radius: 4px; color: #ddd; cursor: pointer; font-size: 12px; }
.h3hub-toast { position: fixed; bottom: 34px; left: 50%; transform: translateX(-50%);
  background: #333; border: 1px solid #666; border-radius: 6px; padding: 9px 20px;
  color: #ddd; font-size: 13px; z-index: 100001; box-shadow: 0 4px 16px rgba(0,0,0,.5); }
.h3hub-toast.ok { border-color: #4a7a4a; background: #26362a; }
.h3hub-toast.err { border-color: #7a4a4a; background: #3a2626; }
`;

const styleEl = document.createElement("style");
styleEl.textContent = CSS;
document.head.appendChild(styleEl);

/* ------------------------------------------------------------------ 小工具 */

function viewUrl(item) {
  const parts = String(item.file || "").split("/");
  const filename = parts.pop();
  const subfolder = parts.join("/");
  let url = "view?filename=" + encodeURIComponent(filename) + "&type=input";
  if (subfolder) url += "&subfolder=" + encodeURIComponent(subfolder);
  return url;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function toast(msg, type, ms) {
  try {
    const el = document.createElement("div");
    el.className = "h3hub-toast" + (type ? " " + type : "");
    el.textContent = msg;
    document.body.appendChild(el);
    const life = ms || 2400;
    setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; }, life - 300);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, life);
  } catch (e) { /* 忽略 */ }
}

function closeOverlay(ov, content) {
  try {
    const m = content && content.querySelector("video,audio");
    if (m) m.pause();
  } catch (e) { /* 忽略 */ }
  if (ov.parentNode) ov.parentNode.removeChild(ov);
}

function showPreview(kind, item) {
  const ov = document.createElement("div");
  ov.className = "h3hub-ov";
  const box = document.createElement("div");
  box.className = "h3hub-ov-box";

  const title = document.createElement("div");
  title.className = "h3hub-ov-title";
  title.textContent = (kind === "image" ? "图片" : kind === "video" ? "视频" : "音频")
    + "：" + (item.label || item.file);
  box.appendChild(title);

  const content = document.createElement("div");
  content.className = "h3hub-ov-content";
  const url = viewUrl(item);
  if (kind === "image") {
    const img = document.createElement("img");
    img.src = url;
    content.appendChild(img);
  } else if (kind === "video") {
    const v = document.createElement("video");
    v.src = url; v.controls = true; v.autoplay = true; v.playsInline = true;
    content.appendChild(v);
  } else {
    const a = document.createElement("audio");
    a.src = url; a.controls = true; a.autoplay = true;
    content.appendChild(a);
  }
  box.appendChild(content);

  const close = document.createElement("button");
  close.className = "h3hub-ov-close";
  close.textContent = "✕ 关闭";
  close.onclick = () => closeOverlay(ov, content);
  box.appendChild(close);

  ov.appendChild(box);
  ov.onclick = (e) => { if (e.target === ov) closeOverlay(ov, content); };
  document.body.appendChild(ov);
}

/* ------------------------------------------------------------------ 状态 */

function emptyState() { return { images: [], videos: [], audios: [] }; }

function parseState(text) {
  if (!text) return emptyState();
  try {
    const d = JSON.parse(text);
    if (d && typeof d === "object") {
      return {
        images: Array.isArray(d.images) ? d.images.slice(0, MAX_IMG) : [],
        videos: Array.isArray(d.videos) ? d.videos.slice(0, MAX_VID) : [],
        audios: Array.isArray(d.audios) ? d.audios.slice(0, MAX_AUD) : [],
      };
    }
  } catch (e) {
    console.warn("[H3Hub] refs JSON 解析失败，按空素材处理：", e);
  }
  return emptyState();
}

function videoHasAudio(v) { return v.audio !== false; }

/** 编号规则（与官方一致）：音轨在前（按视频位次），独立音频在后，共用号段。 */
function computeTags(state) {
  const t = { images: [], videos: [], audios: [], videoAudio: [] };
  state.images.forEach((_, i) => { t.images[i] = "<Picture " + (i + 1) + ">"; });
  let j = 1;
  state.videos.forEach((v, i) => {
    t.videos[i] = "<Video " + (i + 1) + ">";
    if (videoHasAudio(v)) t.videoAudio[i] = "<Audio " + (j++) + ">";
  });
  state.audios.forEach((_, i) => { t.audios[i] = "<Audio " + (j++) + ">"; });
  return t;
}

/* ------------------------------------------------------------------ 上传 */

async function uploadFile(file) {
  const orig = file.name || "file";
  const dot = orig.lastIndexOf(".");
  const ext = dot >= 0 ? orig.slice(dot).replace(/[^.\w]/g, "") : "";
  // ASCII 安全名：规避中文文件名/网关子路径导致的 400
  const safe = "h3hub_" + Date.now().toString(36) + "_"
    + Math.floor(Math.random() * 1e6).toString(36) + ext;
  const fd = new FormData();
  fd.append("image", file, safe);
  fd.append("subfolder", "");
  fd.append("type", "input");
  const resp = await fetch("upload/image", { method: "POST", body: fd });
  if (!resp.ok) {
    let body = "";
    try { body = (await resp.text()).slice(0, 160); } catch (e) { /* 忽略 */ }
    throw new Error("上传失败 HTTP " + resp.status + (body ? "：" + body : ""));
  }
  const j = await resp.json();
  return { file: j.name, label: orig };
}

/* ------------------------------------------------------------------ 主构建 */

function buildUI(node) {
  if (node.__h3hubBuilt) return;
  node.__h3hubBuilt = true;

  const refsWidget = node.widgets && node.widgets.find((w) => w.name === "refs");
  if (!refsWidget) {
    console.warn("[H3Hub] 找不到 refs widget，素材面板未挂载");
    return;
  }
  let state = parseState(refsWidget.value);

  /* refs 由面板代替，藏掉它本身 */
  function hideWidget(w) {
    w.hidden = true;
    w.options = w.options || {};
    w.options.hidden = true;
    w.computeSize = () => [0, -4];
    const el = w.element || w.inputEl;
    if (el && el.style) el.style.display = "none";
  }
  hideWidget(refsWidget);

  /* ---------- DOM 结构 ---------- */
  const root = document.createElement("div");
  root.className = "h3hub-root";

  const imgGrid = document.createElement("div");
  imgGrid.className = "h3hub-grid";
  const vidRow = document.createElement("div");
  vidRow.className = "h3hub-row";
  const audRow = document.createElement("div");
  audRow.className = "h3hub-row h3hub-row-aud";
  const foot = document.createElement("div");
  foot.className = "h3hub-foot";
  const btnDir = document.createElement("button");
  btnDir.textContent = "📁 从 input 目录添加";
  btnDir.title = "从 ComfyUI/input 里已有的文件选，免重复上传";
  const hint = document.createElement("span");
  hint.className = "h3hub-hint";
  foot.append(btnDir, hint);

  root.append(imgGrid, vidRow, audRow, foot);

  /* 隐藏的三个 file input（按类型分别 accept） */
  function makePicker(accept, kind) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.multiple = true;
    inp.accept = accept;
    inp.style.display = "none";
    inp.addEventListener("change", async () => {
      const files = [...inp.files];
      inp.value = "";
      if (!files.length) return;
      let ok = 0, fail = 0;
      for (const f of files) {
        try {
          const up = await uploadFile(f);
          if (addMaterial(kind, up.file, up.label)) ok++;
        } catch (e) {
          fail++;
          toast("✕ " + f.name + " 上传失败：" + (e.message || e), "err", 3600);
        }
      }
      if (fail === 0) toast("✓ 已添加 " + ok + " 个素材", "ok");
      else toast("完成：成功 " + ok + "，失败 " + fail, fail < ok ? "ok" : "err", 3200);
    });
    root.appendChild(inp);
    return inp;
  }
  const pickImg = makePicker("image/*", "image");
  const pickVid = makePicker("video/*,.mp4,.mov,.webm,.mkv", "video");
  const pickAud = makePicker("audio/*,.mp3,.wav,.ogg,.m4a,.flac,.mp4", "audio");
  const pickers = { image: pickImg, video: pickVid, audio: pickAud };

  /* ---------- 增删 ---------- */
  const BUCKET = { image: "images", video: "videos", audio: "audios" };
  const LIMIT = { image: MAX_IMG, video: MAX_VID, audio: MAX_AUD };
  const CN = { image: "图片", video: "视频", audio: "音频" };

  function addMaterial(kind, file, label) {
    const key = BUCKET[kind];
    if (state[key].length >= LIMIT[kind]) {
      toast(CN[kind] + "位已满（官方上限 " + LIMIT[kind] + " 个），未添加 " + (label || file), "err", 3200);
      return false;
    }
    const item = { file, label: label || file };
    if (kind === "video") item.audio = true; // 视频音轨默认带上（官方支持同号配对）
    state[key].push(item);
    render();
    persist();
    return true;
  }

  function removeMaterial(kind, index) {
    state[BUCKET[kind]].splice(index, 1);
    render();
    persist();
  }

  /* ---------- 目录选择 ---------- */
  const dirCache = { list: null };
  async function fetchInputFiles() {
    if (dirCache.list) return dirCache.list;
    const out = new Set();
    // 借官方 loader 的 combo 选项拿到 input 目录清单
    for (const [nodeType, field] of [["LoadImage", "image"], ["LoadAudio", "audio"], ["LoadVideo", "file"]]) {
      try {
        const r = await fetch("object_info/" + nodeType);
        if (!r.ok) continue;
        const d = await r.json();
        const raw = d && d[nodeType] && d[nodeType].input && d[nodeType].input.required
          && d[nodeType].input.required[field];
        const arr = Array.isArray(raw) ? (Array.isArray(raw[0]) ? raw[0] : raw) : null;
        if (Array.isArray(arr)) arr.forEach((n) => out.add(n));
      } catch (e) { /* 忽略 */ }
    }
    dirCache.list = [...out].sort();
    return dirCache.list;
  }

  function guessKind(name) {
    const n = String(name || "").toLowerCase();
    if (/\.(mp3|wav|ogg|m4a|flac|aac)$/.test(n)) return "audio";
    if (/\.(mp4|mov|webm|mkv|avi)$/.test(n)) return "video";
    return "image";
  }

  function openDirPicker(defaultKind) {
    const ov = document.createElement("div");
    ov.className = "h3hub-ov";
    const box = document.createElement("div");
    box.className = "h3hub-ov-box";
    box.style.width = "520px";
    box.style.alignItems = "stretch";

    const head = document.createElement("div");
    head.className = "h3hub-ov-title";
    head.textContent = "从 ComfyUI/input 选择素材（免重复上传）";
    box.appendChild(head);

    const typeRow = document.createElement("div");
    typeRow.style.cssText = "display:flex;gap:14px;align-items:center;flex-wrap:wrap;color:#ccc;";
    typeRow.appendChild(document.createTextNode("添加为："));
    const radios = [];
    [["image", "参考图片"], ["video", "参考视频"], ["audio", "参考音频"]].forEach(([v, lbl]) => {
      const lab = document.createElement("label");
      lab.style.cssText = "display:flex;align-items:center;gap:4px;cursor:pointer;";
      const rb = document.createElement("input");
      rb.type = "radio"; rb.name = "h3hub_pick"; rb.value = v; rb.checked = v === defaultKind;
      lab.append(rb, document.createTextNode(lbl));
      typeRow.appendChild(lab);
      radios.push(rb);
    });
    box.appendChild(typeRow);

    const search = document.createElement("input");
    search.placeholder = "输入关键字过滤…";
    search.style.cssText = "padding:4px 8px;background:#1b1b1b;border:1px solid #444;"
      + "color:#ddd;border-radius:4px;";
    box.appendChild(search);

    const list = document.createElement("div");
    list.style.cssText = "overflow:auto;max-height:46vh;border:1px solid #444;"
      + "border-radius:4px;min-height:140px;color:#ddd;";
    box.appendChild(list);

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:10px;align-items:center;";
    const btnUpload = document.createElement("button");
    btnUpload.textContent = "⬆ 上传新文件";
    btnUpload.style.cssText = "padding:3px 12px;background:#33473a;border:1px solid #4a7a5a;"
      + "border-radius:4px;color:#ddd;cursor:pointer;font-size:12px;";
    btnUpload.onclick = () => { pickers[currentKind()].click(); };
    const btnClose = document.createElement("button");
    btnClose.textContent = "关闭";
    btnClose.className = "h3hub-ov-close";
    btnClose.style.marginLeft = "auto";
    btnClose.onclick = () => closeOverlay(ov, null);
    btnRow.append(btnUpload, btnClose);
    box.appendChild(btnRow);

    ov.appendChild(box);
    ov.onclick = (e) => { if (e.target === ov) closeOverlay(ov, null); };
    document.body.appendChild(ov);

    const currentKind = () => (radios.find((r) => r.checked) || {}).value || "image";
    const matches = (name, kind) => {
      const k = guessKind(name);
      if (kind === "audio") return k === "audio" || k === "video"; // LoadAudio 也能从视频里取音轨
      return k === kind;
    };

    fetchInputFiles().then((all) => {
      const draw = () => {
        const q = search.value.toLowerCase();
        const kind = currentKind();
        list.innerHTML = "";
        const hits = all.filter((n) => matches(n, kind) && (!q || n.toLowerCase().includes(q))).slice(0, 600);
        if (!hits.length) {
          list.innerHTML = '<div style="padding:10px;opacity:.5">没有匹配的文件（可点"上传新文件"）</div>';
          return;
        }
        for (const n of hits) {
          const row = document.createElement("div");
          row.textContent = n;
          row.style.cssText = "padding:4px 8px;cursor:pointer;white-space:nowrap;"
            + "overflow:hidden;text-overflow:ellipsis;";
          row.onmouseenter = () => { row.style.background = "#333"; };
          row.onmouseleave = () => { row.style.background = ""; };
          row.onclick = () => {
            addMaterial(kind, n, n);
            closeOverlay(ov, null);
          };
          list.appendChild(row);
        }
      };
      search.oninput = draw;
      radios.forEach((rb) => { rb.onchange = draw; });
      draw();
    });
  }

  /* ---------- 拖拽 ---------- */
  function wireDrop(el, kind) {
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("h3hub-drop"); });
    el.addEventListener("dragleave", () => el.classList.remove("h3hub-drop"));
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      el.classList.remove("h3hub-drop");
      const files = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter((f) => f.size > 0);
      for (const f of files) {
        try {
          const up = await uploadFile(f);
          addMaterial(kind, up.file, up.label);
        } catch (err) {
          toast("✕ " + f.name + " 上传失败：" + (err.message || err), "err", 3600);
        }
      }
    });
  }
  wireDrop(imgGrid, "image");
  wireDrop(vidRow, "video");
  wireDrop(audRow, "audio");

  /* ---------- 渲染 ---------- */
  let playing = null;
  function stopAudio() { if (playing) { playing.pause(); playing = null; } }
  function toggleAudio(item) {
    if (playing && playing.__h3hubFile === item.file) { stopAudio(); return; }
    stopAudio();
    const a = new Audio(viewUrl(item));
    a.__h3hubFile = item.file;
    a.onended = () => { if (playing === a) playing = null; };
    a.play().catch(() => { playing = null; });
    playing = a;
  }

  function visibleImgSlots() {
    return Math.min(MAX_IMG, Math.max(DEFAULT_IMG_SLOTS, state.images.length + MIN_EMPTY_SLOTS));
  }

  function makeSlot(kind, index, item, tag) {
    const slot = document.createElement("div");
    slot.className = "h3hub-slot" + (item ? "" : " h3hub-empty");

    const tagEl = document.createElement("span");
    tagEl.className = "h3hub-tag";
    tagEl.textContent = tag || "—";
    slot.appendChild(tagEl);

    if (!item) {
      const ph = document.createElement("span");
      ph.textContent = "＋ " + CN[kind];
      slot.appendChild(ph);
    } else if (kind === "image") {
      const img = document.createElement("img");
      img.src = viewUrl(item);
      img.onerror = () => {
        img.style.display = "none";
        const err = document.createElement("div");
        err.className = "h3hub-err";
        err.textContent = "⚠ 预览失败";
        err.title = img.src;
        slot.appendChild(err);
      };
      slot.appendChild(img);
      const nm = document.createElement("div");
      nm.className = "h3hub-name";
      nm.textContent = item.label || item.file;
      nm.title = item.file;
      slot.appendChild(nm);
    } else if (kind === "video") {
      const v = document.createElement("video");
      v.src = viewUrl(item);
      v.muted = true; v.playsInline = true; v.preload = "metadata";
      const ld = document.createElement("div");
      ld.className = "h3hub-loading";
      ld.textContent = "加载预览…";
      v.onloadeddata = () => { if (ld.parentNode) ld.remove(); };
      v.onerror = () => {
        v.style.display = "none";
        if (ld.parentNode) ld.remove();
        const err = document.createElement("div");
        err.className = "h3hub-err";
        err.textContent = "⚠ 预览失败";
        err.title = v.src;
        slot.appendChild(err);
      };
      slot.append(v, ld);
      const nm = document.createElement("div");
      nm.className = "h3hub-name";
      nm.textContent = item.label || item.file;
      nm.title = item.file;
      nm.style.bottom = "20px";
      slot.appendChild(nm);
      // 音轨开关：默认开。视频本身没有音轨时请关掉，
      // 否则后面独立音频的 <Audio j> 编号会前移一位。
      const lab = document.createElement("label");
      lab.className = "h3hub-aud-toggle";
      lab.title = "把这个视频的音轨作为参考音频送入（官方 ref_video_audio_N）。"
        + "视频本身没有音轨时请关掉，否则后面独立音频的编号会前移。";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = videoHasAudio(item);
      cb.onclick = (e) => {
        e.stopPropagation();
        item.audio = cb.checked;
        render();
        persist();
      };
      lab.append(cb, document.createTextNode("带音轨"));
      lab.onclick = (e) => e.stopPropagation();
      slot.appendChild(lab);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "h3hub-aud";
      wrap.innerHTML = '<span class="h3hub-aud-ic">🎵</span>'
        + '<span class="h3hub-aud-nm">' + esc(item.label || item.file) + "</span>";
      slot.appendChild(wrap);
      const nm = document.createElement("div");
      nm.className = "h3hub-name";
      nm.textContent = item.label || item.file;
      nm.title = item.file;
      slot.appendChild(nm);
    }

    const del = document.createElement("div");
    del.className = "h3hub-del";
    del.textContent = "✕";
    del.title = "删除（后面的素材自动前移，编号重排）";
    del.onclick = (e) => { e.stopPropagation(); removeMaterial(kind, index); };
    slot.appendChild(del);

    slot.onclick = () => {
      if (!item) { openDirPickerShortcut(kind); return; }
      if (kind === "audio") { toggleAudio(item); return; }
      showPreview(kind, item);
    };
    return slot;
  }

  // 点空格位：直接弹文件选择（最快路径）
  function openDirPickerShortcut(kind) { pickers[kind].click(); }

  function render() {
    const tags = computeTags(state);

    imgGrid.innerHTML = "";
    const nImg = visibleImgSlots();
    for (let i = 0; i < nImg; i++) {
      imgGrid.appendChild(makeSlot("image", i, state.images[i] || null, tags.images[i]));
    }

    vidRow.innerHTML = "";
    vidRow.style.height = (state.videos.length > 0 ? VID_SLOT_H : VID_EMPTY_H) + "px";
    for (let i = 0; i < MAX_VID; i++) {
      vidRow.appendChild(makeSlot("video", i, state.videos[i] || null, tags.videos[i]));
    }

    audRow.innerHTML = "";
    audRow.style.height = AUD_SLOT_H + "px";
    for (let i = 0; i < MAX_AUD; i++) {
      audRow.appendChild(makeSlot("audio", i, state.audios[i] || null, tags.audios[i]));
    }

    // 底部实时编号总览 —— 直接照着写提示词
    const parts = [];
    if (state.images.length) parts.push("图 <Picture 1.." + state.images.length + ">");
    if (state.videos.length) parts.push("视频 <Video 1.." + state.videos.length + ">");
    const nAudio = state.videos.filter(videoHasAudio).length + state.audios.length;
    if (nAudio) parts.push("音频 <Audio 1.." + nAudio + ">");
    hint.textContent = parts.length ? "当前：" + parts.join("　") : "还没有素材：点格子或拖文件进来";

    node.setDirtyCanvas(true, true);
  }

  function persist() {
    const json = JSON.stringify(state);
    refsWidget.value = json;
    refsWidget.serializeValue = () => json;
    node.setDirtyCanvas(false);
  }

  /* ---------- 面板高度：交给 litegraph 的 min/max 机制，不覆盖 computeSize ---------- */
  function naturalPanelH() {
    const rows = Math.ceil(visibleImgSlots() / 3);
    const vidH = state.videos.length > 0 ? VID_SLOT_H : VID_EMPTY_H;
    return rows * IMG_SLOT_H + Math.max(0, rows - 1) * GAP
      + (GAP + vidH) + (GAP + AUD_SLOT_H) + 28;
  }

  let domWidget = null;
  try {
    domWidget = node.addDOMWidget("h3hub_ui", "div", root, {
      getValue: () => "",
      setValue: () => {},
      margin: 4,
      serialize: false,
      getMinHeight: () => naturalPanelH(),
      getMaxHeight: () => naturalPanelH() + FILL_MAX,
    });
    if (domWidget) domWidget.serialize = false;
  } catch (e) {
    console.warn("[H3Hub] addDOMWidget 失败，素材面板未挂载", e);
    return;
  }

  // 面板固定排在所有输入控件之后
  try {
    const ws = node.widgets;
    if (ws && domWidget) {
      const idx = ws.indexOf(domWidget);
      if (idx >= 0) ws.splice(idx, 1);
      ws.push(domWidget);
    }
  } catch (e) { /* 忽略 */ }

  /* ---------- 事件隔离：在面板里操作不要拖动/缩放节点 ---------- */
  const stop = (e) => e.stopPropagation();
  ["pointerdown", "pointermove", "pointerup", "click", "dblclick", "contextmenu",
    "touchstart", "touchmove", "touchend", "keydown", "keyup"].forEach((ev) => {
    root.addEventListener(ev, stop, { capture: false });
  });
  root.addEventListener("wheel", (e) => e.stopPropagation(), { passive: false });

  btnDir.onclick = () => openDirPicker("image");

  /* ---------- 载入工作流时同步一次 ---------- */
  const syncFromWidget = () => {
    state = parseState(refsWidget.value);
    render();
  };
  const prevOnConfigure = node.onConfigure;
  node.onConfigure = function () {
    const r = prevOnConfigure ? prevOnConfigure.apply(this, arguments) : undefined;
    setTimeout(syncFromWidget, 0);
    return r;
  };

  const prevOnRemoved = node.onRemoved;
  node.onRemoved = function () {
    stopAudio();
    if (prevOnRemoved) prevOnRemoved.apply(this, arguments);
  };

  setTimeout(() => {
    try {
      if (node.size && node.size[0] < 520) node.size[0] = 520;
      node.setDirtyCanvas(true, true);
    } catch (e) { /* 忽略 */ }
    syncFromWidget();
  }, 60);

  render();
  console.log("[H3Hub] 素材面板挂载完成 #" + node.id);
}

app.registerExtension({
  name: "H3MaterialHub.MaterialPanel",
  nodeCreated(node) {
    if (!node) return;
    if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;
    try {
      buildUI(node);
    } catch (e) {
      console.error("[H3Hub] 面板构建异常", e);
    }
  },
});