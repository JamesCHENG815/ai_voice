# 聆译 — AI 同声传译助手

> 七牛云 × XEngineer 暑期训练营第 3 期 · 题目二

实时语音识别 + AI 翻译，支持 7 种语言互译，流式字幕输出，可选语音朗读。

## Demo 视频

> 🎬 **[点击观看演示视频](https://www.bilibili.com/video/BV1EEEJ6qEWu/)**

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 🎤 麦克风模式 | 捕获麦克风输入，实时识别并翻译 |
| 🖥️ 系统音频模式 | 通过 `getDisplayMedia` 捕获标签页/窗口音频，适合翻译会议、视频 |
| 🌐 7 种语言互译 | 中文、英文、日语、韩语、西班牙语、法语、德语任意互译 |
| ⚡ 流式字幕 | 翻译结果逐字流出，低延迟实时展示 |
| 🔄 上下文纠错 | 携带最近 5 条历史上下文，自动修正前序错误译文 |
| 🔊 语音播报（TTS） | 译文逐句朗读；开口说话时自动暂停，避免干扰识别 |
| 🎧 回声抑制 | 硬件层 AEC + 软件门控，防止麦克风拾取扬声器声音 |
| 🚫 幻觉过滤 | 自动过滤 Whisper 常见幻觉短语（含中文视频水印类文本） |
| 📄 导出 PDF | 一键导出完整双语对照记录 |

---

## 技术栈

| 模块 | 技术 |
|------|------|
| 前端框架 | Next.js 16 (App Router) + React 19 |
| 样式 | Tailwind CSS v4 |
| 语言 | TypeScript |
| 语音识别 (STT) | Groq API · `whisper-large-v3` |
| AI 翻译 | Groq API · `llama-3.3-70b-versatile` · SSE 流式输出 |
| 音频采集 | `MediaDevices.getUserMedia` / `getDisplayMedia` + Web Audio API |
| 语音合成 (TTS) | Web Speech Synthesis API（浏览器原生） |

---

## 快速启动

### 前置条件

- Node.js 20.9+
- Groq API Key（同时用于 STT 和翻译）

### 安装与运行

```bash
git clone <仓库地址>
cd ai_voice

npm install

# 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local，填入 API Key

npm run dev
```

访问 [https://localhost:3000](https://localhost:3000)

> **注意**：dev 模式使用 `--experimental-https`，麦克风权限需要 HTTPS，首次访问浏览器会提示证书不受信任，点击「继续访问」即可。

### 环境变量

```env
GROQ_API_KEY=your_groq_api_key_here
```

### 局域网访问（手机测试）

```bash
# 在 next.config.ts 的 allowedDevOrigins 中添加你的局域网 IP 段
# 手机访问 https://<电脑IP>:3000
```

---

## 项目结构

```
app/
├── api/
│   ├── transcribe/route.ts   # Groq Whisper STT 接口
│   └── translate/route.ts    # Groq LLM 流式翻译接口 (SSE)
├── components/
│   └── interpreter.tsx       # 主界面组件（落地页 + 翻译页）
├── layout.tsx
├── page.tsx
└── globals.css
```

---

## 使用说明

1. 落地页选择输入模式（**麦克风** / **系统音频**）
2. 选择源语言和目标语言
3. 按需开启或关闭**语音播报**
4. 点击「开始聆译」，允许相应权限后开始说话
5. 字幕实时出现，开启语音播报时自动朗读译文

> **提示**：开启语音播报时建议佩戴耳机，避免扬声器声音被麦克风拾取。

### 系统音频模式

在浏览器弹窗中选择要共享的标签页或窗口，**勾选「共享系统音频」**，播放内容后即自动捕获翻译。

---

## 核心实现

### 语音识别（STT）

使用 Groq `whisper-large-v3`，每 5 秒切一个音频块送往 API。每次请求携带上一块的识别结果作为 `prompt`，为 Whisper 提供跨块上下文，减少漏字和断词错误。识别结果经过幻觉过滤器（空白、单字符、英文常见幻觉短语、中文视频水印短语），过滤后才进入翻译流程。

### 断句与翻译

识别文本先缓冲到 `textBuffer`，检测到中英文句子结束标点（`。！？…` / `.!?`）时立即截取整句送翻；若 1.5 秒内无新词到达则强制冲刷剩余内容，确保每句话说完即翻。

### 流式翻译

`/api/translate` 调用 Groq LLM 流式 API，以 SSE 格式实时推送翻译片段，前端逐块更新字幕。携带最近 5 条上下文，模型可在译新内容时通过 `CORRECTION:N:修正内容` 语法自动纠正前序错误。

### 回声抑制

麦克风采集开启 `echoCancellation / noiseSuppression / autoGainControl`；软件层通过 `SpeechSynthesisUtterance` 的 `onstart/onend` 维护 TTS 播放状态，检测到用户说话时立刻取消播报，防止识别内容被扬声器声音污染。

---

## License

MIT
