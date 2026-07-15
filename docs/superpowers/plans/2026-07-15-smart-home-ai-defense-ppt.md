# Smart Home AI 国赛答辩 PPT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成一套 16:9、16 页、可编辑、带演讲备注并经过逐页视觉检查的 Smart Home AI 国赛答辩 PowerPoint。

**Architecture:** 在仓库外建立演示文稿工作区，运行当前项目并采集真实响应式界面截图，使用图像生成模型制作封面与硬件结构示意，再通过 `@oai/artifact-tool` 的纯 JavaScript ES module 从零构建 PPTX。最终文件写入项目 `outputs/`，中间代码、截图、渲染页和 QA 记录保留在外部工作区。

**Tech Stack:** Vue 3 应用、Node.js、Codex in-app Browser、Image Gen、`@oai/artifact-tool`、PowerPoint `.pptx`、幻灯片渲染与溢出检查工具。

---

## 文件结构

- Create: `docs/superpowers/plans/2026-07-15-smart-home-ai-defense-ppt.md` — 本执行计划。
- Create: `E:/Project/smart-home-ai/outputs/Smart-Home-AI-国赛答辩.pptx` — 最终可编辑答辩文件。
- Create: `$WORKSPACE/tmp/source-notes.txt` — 项目事实、截图来源与图像生成提示词记录。
- Create: `$WORKSPACE/tmp/asset-manifest.json` — 16 页所需资产清单和文件状态。
- Create: `$WORKSPACE/tmp/validate-assets.mjs` — 截图与生成视觉的资产契约检查。
- Create: `$WORKSPACE/tmp/build-smart-home-ai-defense.mjs` — 使用 artifact-tool 构建 16 页演示文稿。
- Create: `$WORKSPACE/tmp/assets/*.png` — 控制台截图、响应式截图和生成视觉。
- Create: `$WORKSPACE/tmp/preview/slide-*.png` — 最终逐页渲染图。
- Create: `$WORKSPACE/tmp/layout/slide-*.json` — 每页布局检查数据。
- Create: `$WORKSPACE/tmp/qa/qa-ledger.txt` — 逐页视觉检查及修复记录。

其中 `$WORKSPACE` 必须在执行时通过 Node 的 `os.tmpdir()` 计算：

```powershell
$tempRoot = & 'C:\Users\JIANGXQ\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' -p "require('node:os').tmpdir()"
$WORKSPACE = Join-Path $tempRoot 'codex-presentations\manual-20260715-smart-home-ai-defense'
```

### Task 1: 初始化演示工作区与资产契约

**Files:**
- Create: `$WORKSPACE/tmp/source-notes.txt`
- Create: `$WORKSPACE/tmp/asset-manifest.json`
- Create: `$WORKSPACE/tmp/validate-assets.mjs`

- [ ] **Step 1: 创建外部工作区目录**

Run:

```powershell
$dirs = @(
  "$WORKSPACE\tmp",
  "$WORKSPACE\tmp\assets",
  "$WORKSPACE\tmp\slides",
  "$WORKSPACE\tmp\preview",
  "$WORKSPACE\tmp\layout",
  "$WORKSPACE\tmp\qa"
)
New-Item -ItemType Directory -Force -Path $dirs | Out-Null
```

Expected: 六个目录存在，仓库中除 `outputs/` 最终文件外不产生制作中间件。

- [ ] **Step 2: 初始化 artifact-tool 运行环境**

Run:

```powershell
& 'C:\Users\JIANGXQ\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' `
  'C:\Users\JIANGXQ\.codex\plugins\cache\openai-primary-runtime\presentations\26.709.11516\skills\presentations\container_tools\setup_artifact_tool_workspace.mjs' `
  --workspace "$WORKSPACE\tmp"
```

Expected: `$WORKSPACE/tmp/node_modules/@oai/artifact-tool` 可解析。

- [ ] **Step 3: 写入资产清单**

`asset-manifest.json` 必须列出以下文件：

```json
{
  "required": [
    "cover-hero.png",
    "hardware-prototype-diagram.png",
    "login-desktop.png",
    "overview-desktop.png",
    "devices-desktop.png",
    "assistant-desktop.png",
    "ir-learning-desktop.png",
    "models-desktop.png",
    "settings-desktop.png",
    "overview-tablet.png",
    "overview-mobile.png",
    "assistant-mobile.png"
  ]
}
```

- [ ] **Step 4: 写入资产检查脚本并验证初始失败**

`validate-assets.mjs` 读取 `asset-manifest.json`，检查 `$WORKSPACE/tmp/assets` 中每个文件是否存在且大于 10 KB；缺失时打印文件名并设置 `process.exitCode = 1`。

Run:

```powershell
& node "$WORKSPACE\tmp\validate-assets.mjs"
```

Expected: FAIL，并列出全部尚未采集的资产，证明资产契约生效。

### Task 2: 运行项目并采集真实控制台截图

**Files:**
- Create: `$WORKSPACE/tmp/assets/login-desktop.png`
- Create: `$WORKSPACE/tmp/assets/overview-desktop.png`
- Create: `$WORKSPACE/tmp/assets/devices-desktop.png`
- Create: `$WORKSPACE/tmp/assets/assistant-desktop.png`
- Create: `$WORKSPACE/tmp/assets/ir-learning-desktop.png`
- Create: `$WORKSPACE/tmp/assets/models-desktop.png`
- Create: `$WORKSPACE/tmp/assets/settings-desktop.png`
- Create: `$WORKSPACE/tmp/assets/overview-tablet.png`
- Create: `$WORKSPACE/tmp/assets/overview-mobile.png`
- Create: `$WORKSPACE/tmp/assets/assistant-mobile.png`

- [ ] **Step 1: 验证项目并构建前端**

Run:

```powershell
npm run check
```

Expected: 后端检查、Node 测试和 Vue production build 全部通过。测试通过数量与构建输出写入 `source-notes.txt`。

- [ ] **Step 2: 启动隔离的截图实例**

在隐藏窗口中启动服务，使用端口 `5055`、演示模式、固定截图用登录账号和复制到工作区的 SQLite 数据库；不修改仓库 `.env` 和用户现有数据库。

Run:

```powershell
$env:PORT='5055'
$env:APP_MODE='demo'
$env:APP_AUTH_USERNAME='codex-demo'
$env:APP_AUTH_PASSWORD='CodexDemo2026!'
$env:APP_SESSION_SECRET='codex-demo-session-secret-20260715'
$env:DATABASE_PATH="$WORKSPACE\tmp\smart-home-demo.db"
Start-Process -FilePath 'node' -ArgumentList 'backend/server.js' `
  -WorkingDirectory 'E:\Project\smart-home-ai' -WindowStyle Hidden
```

Expected: `http://localhost:5055/api/health` 返回 `ok: true`。

- [ ] **Step 3: 连接 in-app Browser 并登录**

使用 Browser skill 的 `browser-client` 初始化流程，读取完整浏览器文档，然后打开 `http://localhost:5055`。在登录页输入固定截图账号，登录后确认概览页加载成功。

Expected: 登录页与概览页均无错误提示，控制台导航可访问。

- [ ] **Step 4: 采集桌面端截图**

将视口设置为 1440×900，依次访问登录、概览、设备管理、AI 助手、红外学习、模型配置和系统设置页面。等待异步状态稳定后截图，保存为资产清单中的桌面端文件。

Expected: 截图包含真实项目 UI，不包含浏览器地址栏、调试浮层或敏感 API Key。

- [ ] **Step 5: 采集平板和手机端截图**

平板视口使用 1024×768，手机视口使用 390×844。至少采集概览页的平板与手机布局，以及 AI 助手手机布局。

Expected: 导航、状态区、设备区和对话输入在窄屏下无横向溢出；截图清楚展示响应式变化。

- [ ] **Step 6: 检查截图质量**

逐张确认页面完整、文字清晰、没有空白加载态；必要时重新截图。将页面路径、视口和采集时间写入 `source-notes.txt`。

### Task 3: 生成封面视觉和硬件原型结构示意

**Files:**
- Create: `$WORKSPACE/tmp/assets/cover-hero.png`
- Create: `$WORKSPACE/tmp/assets/hardware-prototype-diagram.png`
- Modify: `$WORKSPACE/tmp/source-notes.txt`

- [ ] **Step 1: 生成封面视觉**

使用 built-in Image Gen，分类为 `stylized-concept`，提示词为：

```text
Use case: stylized-concept
Asset type: 16:9 national innovation competition presentation cover visual
Primary request: a refined editorial technology illustration showing a small smart gateway giving traditional infrared home appliances AI connectivity
Scene/backdrop: warm off-white studio space with an air conditioner, television and fan arranged as quiet silhouettes
Subject: a compact deep-teal smart gateway in the foreground, subtle infrared waves and network connections linking the appliances
Style/medium: premium editorial 3D illustration, realistic materials but clearly conceptual
Composition/framing: landscape, main gateway on the right half, generous clean negative space on the left for Chinese title
Lighting/mood: soft natural studio light, confident and credible
Color palette: warm ivory, deep teal, burnt orange, mint accent
Constraints: no words, no logos, no people, no watermark, no futuristic hologram clutter
```

Expected: 左侧留白足够放标题，右侧主体清晰，风格与 B“编辑型科技”方向一致。

- [ ] **Step 2: 生成硬件结构示意**

使用 built-in Image Gen，分类为 `scientific-educational`，提示词为：

```text
Use case: scientific-educational
Asset type: presentation hardware prototype structure illustration
Primary request: a clean exploded-view illustration of an ESP32-S3 smart infrared gateway prototype
Subject: ESP32-S3 development board connected to an infrared transmitter, infrared receiver, DHT22 temperature-humidity sensor and a small OLED display
Style/medium: precise editorial product illustration, semi-realistic components, easy to label in PowerPoint
Composition/framing: landscape, components separated with generous spacing, ESP32-S3 centered, no crossing wires
Lighting/mood: clean technical studio light
Color palette: deep teal circuit board, warm ivory background, burnt orange and mint cable accents
Constraints: no text, no labels, no logo, no enclosure, no person, no watermark; depict a prototype structure rather than a finished commercial product
```

Expected: 五类硬件能被清楚辨认，留出 PowerPoint 原生标注空间。

- [ ] **Step 3: 将最终图像复制到工作区并记录来源**

从 Codex 生成图像目录复制选定结果到上述两个目标文件，保持原始 PNG；在 `source-notes.txt` 记录完整提示词并注明“AI 生成概念视觉/原型结构示意”。

- [ ] **Step 4: 运行资产检查**

Run:

```powershell
& node "$WORKSPACE\tmp\validate-assets.mjs"
```

Expected: PASS，全部 12 个资产存在且大于 10 KB。

### Task 4: 编写 16 页可编辑演示文稿

**Files:**
- Create: `$WORKSPACE/tmp/build-smart-home-ai-defense.mjs`
- Create: `E:/Project/smart-home-ai/outputs/Smart-Home-AI-国赛答辩.pptx`

- [ ] **Step 1: 建立主题与通用组件**

在 `build-smart-home-ai-defense.mjs` 中使用：

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const presentation = Presentation.create({
  slideSize: { width: 1280, height: 720 },
});

const C = {
  canvas: '#F4F0E8',
  ink: '#19252D',
  teal: '#163D4C',
  orange: '#E4542F',
  mint: '#8CE2CF',
  muted: '#65737B',
  white: '#FFFFFF',
  line: '#C8C4BA'
};
```

定义 `addTitle(slide, title, kicker)`, `addFooter(slide, page, section)`, `addImageFrame(slide, asset, position)`, `addSpeakerNotes(slide, text)` 和 `writeBlob(file, blob)`。标题字号不低于 35pt，正文不低于 16pt，封面标题不低于 50pt。

- [ ] **Step 2: 实现主讲第 1—4 页**

按设计说明实现：封面、痛点、产品方案、六道约束控制闭环。第 4 页连接线先创建，再创建流程节点，确保箭头位于节点后方且不穿过文本。

- [ ] **Step 3: 实现主讲第 5—8 页**

按设计说明实现：安全 AI 决策、设备类型自适应、语音交互和公网远程控制。使用真实截图作为主视觉，原生形状仅承担标题、标注、箭头和简化流程。

- [ ] **Step 4: 实现主讲第 9—11 页**

按设计说明实现：硬件原型、验证结果、应用价值与产品化方向。第 9 页必须显示“原型结构示意”；第 10 页只使用可核验事实，不显示虚构成功率。

- [ ] **Step 5: 实现备查第 12—16 页**

按设计说明实现：响应式截图、运维功能、公网安全、SQLite 与测试、硬件复现证据。使用浅色分隔标记将备查页与主讲页区分，但保持同一视觉系统。

- [ ] **Step 6: 写入演讲备注**

第 1—11 页写入总计约 6 分钟的中文讲稿；第 12—16 页备注写成评委追问的回答要点。演讲时间只进入备注，不显示在画面上。

- [ ] **Step 7: 导出预览、布局数据与 PPTX**

脚本应逐页导出 PNG 和 layout JSON，再导出 montage 与最终 PPTX：

```js
for (const [index, slide] of presentation.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, '0')}`;
  await writeBlob(path.join(previewDir, `${stem}.png`),
    await presentation.export({ slide, format: 'png', scale: 1 }));
  const layout = await slide.export({ format: 'layout' });
  await fs.writeFile(path.join(layoutDir, `${stem}.json`), await layout.text());
}

const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(finalPptx);
```

Expected: 16 张预览图、16 个 layout JSON 和最终 `.pptx` 均生成成功。

### Task 5: 内容、布局与视觉 QA

**Files:**
- Modify: `$WORKSPACE/tmp/build-smart-home-ai-defense.mjs`
- Create: `$WORKSPACE/tmp/qa/qa-ledger.txt`
- Modify: `E:/Project/smart-home-ai/outputs/Smart-Home-AI-国赛答辩.pptx`

- [ ] **Step 1: 运行构建脚本**

Run:

```powershell
& node "$WORKSPACE\tmp\build-smart-home-ai-defense.mjs"
```

Expected: 命令退出码为 0，生成 16 页 PPTX。

- [ ] **Step 2: 运行画布溢出检查**

Run:

```powershell
& 'C:\Users\JIANGXQ\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  'C:\Users\JIANGXQ\.codex\plugins\cache\openai-primary-runtime\presentations\26.709.11516\skills\presentations\container_tools\slides_test.py' `
  'E:\Project\smart-home-ai\outputs\Smart-Home-AI-国赛答辩.pptx'
```

Expected: 无画布外溢元素。

- [ ] **Step 3: 检查整套节奏**

查看 montage，检查封面—问题—方案—创新—工程—验证—价值的叙事节奏，以及第 12 页开始的备查分区是否清楚。

Expected: 版式轮廓有变化，不连续重复同一双栏或卡片网格。

- [ ] **Step 4: 逐页全尺寸视觉检查**

逐一打开 16 张 PNG，记录并修复：标题换行、正文过密、截图裁切、图片拉伸、文字遮挡、对齐误差、颜色对比不足和非预期重叠。每次修复后重新运行构建与溢出检查。

Expected: `qa-ledger.txt` 对 16 页均有 PASS 或修复记录，所有非预期重叠清零。

- [ ] **Step 5: 核对技术事实**

对照 `README.md`、`CLAUDE.md`、`docs/VOICE.md`、`docs/REMOTE_ACCESS.md`、`docs/ESP32_NETWORK.md`、历史竞赛报告和 V3 硬件验证记录，检查设备通信、语音链路、认证方式、COOLIX 码值、GPIO 和测试表述。

Expected: 所有技术陈述可追溯，无未经验证的市场数字或硬件能力。

### Task 6: 最终验证与交付

**Files:**
- Verify: `E:/Project/smart-home-ai/outputs/Smart-Home-AI-国赛答辩.pptx`

- [ ] **Step 1: 验证最终文件属性**

Run:

```powershell
Get-Item 'E:\Project\smart-home-ai\outputs\Smart-Home-AI-国赛答辩.pptx' |
  Select-Object FullName,Length,LastWriteTime
```

Expected: 文件存在、大小合理且更新时间为本次制作时间。

- [ ] **Step 2: 最终复跑构建和溢出检查**

Run: 重复 Task 5 Step 1 和 Step 2。

Expected: 两个命令均退出码 0，没有未处理警告。

- [ ] **Step 3: 检查仓库状态**

Run:

```powershell
git status --short
```

Expected: 保留用户原有 `.workbuddy/`；制作过程不提交外部工作区或 `.superpowers/` 视觉伴侣临时文件；最终 PPT 位于已忽略的 `outputs/`。

- [ ] **Step 4: 交付最终文件**

最终回复只提供一条指向 PPTX 的可点击链接，并简要说明包含 11 页主讲、5 页备查、真实响应式截图、语音与公网控制、硬件结构示意和演讲备注。
