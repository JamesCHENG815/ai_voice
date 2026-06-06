# 聆译 — AI 同声传译助手

> 七牛云 × XEngineer 暑期训练营第 3 期 · 题目二

实时语音识别 + AI 翻译，支持 7 种语言互译，流式字幕输出，可选语音朗读。

## Demo 视频

> 🎬 **[点击观看演示视频]()**  
> *(视频上传后更新链接)*

## 功能特性

- 🎤 **麦克风模式** — 捕获麦克风输入，Groq Whisper 实时识别，Claude 流式翻译为字幕
- 🖥️ **系统音频模式** — 通过 `getDisplayMedia` 捕获屏幕/标签页音频，适合翻译会议、视频
- 🌐 **7 种语言互译** — 中文、英文、日语、韩语、西班牙语、法语、德语任意互译
- ⚡ **流式字幕输出** — 翻译结果逐字流出，低延迟实时展示
- 🔄 **上下文感知纠错** — 携带前 5 条历史上下文，自动修正前序错误译文
- 🔊 **语音播报（TTS）** — 译文逐句朗读，开口说话时自动暂停，避免干扰识别
- 🎧 **回声抑制** — 硬件层 Echo Cancellation + 软件门控，防止麦克风拾取扬声器声音
- 📄 **导出 PDF** — 一键导出完整双语对照记录

## 技术栈

| 模块 | 技术 |
|------|------|
| 前端框架 | Next.js (App Router) + React |
| 样式 | Tailwind CSS v4 |
| 语言 | TypeScript |
| AI 翻译 | Anthropic Claude API · `claude-opus-4-8` · SSE 流式输出 |
| 语音识别 | Groq Whisper (`whisper-large-v3-turbo`) |
| 音频采集 | `MediaDevices.getUserMedia` / `getDisplayMedia` + Web Audio API |
| 语音合成 | Web Speech Synthesis API（浏览器原生） |

## 快速启动

### 前置条件

- Node.js 20.9+
- Anthropic API Key
- Groq API Key

### 安装与运行

```bash
git clone <仓库地址>
cd ai_voice

npm install

# 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local，填入两个 API Key

npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 环境变量

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

## 项目结构

```
app/
├── api/
│   ├── transcribe/
│   │   └── route.ts      # Groq Whisper 语音识别接口
│   └── translate/
│       └── route.ts      # Claude 流式翻译接口 (SSE)
├── components/
│   └── interpreter.tsx   # 主界面组件
├── layout.tsx
├── page.tsx
└── globals.css
```

## 使用说明

1. 落地页选择输入模式（麦克风 / 系统音频）
2. 选择源语言和目标语言
3. 按需开启或关闭语音播报
4. 点击「开始聆译」，允许相应权限后开始说话
5. 字幕实时出现，开启语音播报时会自动朗读译文

> **提示**：开启语音播报时建议佩戴耳机，避免扬声器声音被麦克风拾取。

### 系统音频模式

在弹窗中选择要共享的标签页或窗口，并**勾选「共享系统音频」**，播放内容后即可自动捕获翻译。

## 核心实现

### 流式翻译

`/api/translate` 调用 Claude 流式 API，以 SSE 格式实时推送翻译片段，前端逐块读取并更新字幕，句子结束时即触发 TTS 朗读，无需等待全文完成。

### 上下文纠错

每次翻译请求携带最近 5 条原文 + 译文作为上下文。Claude 在翻译新内容时若发现前序译文有误，会在输出末尾附加 `CORRECTION:N:修正内容`，前端解析后自动更新历史字幕。

### 回声抑制

麦克风采集启用 `echoCancellation / noiseSuppression / autoGainControl`；软件层通过 `SpeechSynthesisUtterance` 的 `onstart/onend` 事件维护 TTS 状态，检测到用户说话时立刻取消播报，确保识别不被播报内容干扰。

## License

MIT
