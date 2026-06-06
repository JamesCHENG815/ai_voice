'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ContextSegment } from '@/app/api/translate/route'

interface Segment {
  id: string
  english: string
  chinese: string
  isStreaming: boolean
  timestamp: number
}

type Status = 'idle' | 'listening' | 'processing' | 'error'
type Mode = 'mic' | 'system'

const BAR_COUNT = 36
const CONTEXT_WINDOW = 5
const CONTAINER_SIZE = 200
const MIC_SIZE_IDLE = 120
const MIC_SIZE_ACTIVE = 64
const CORNER_GAP = 20

const LANGUAGES = [
  { code: 'en-US', label: 'English',  name: 'English'              },
  { code: 'zh-CN', label: '中文',     name: 'Chinese (Simplified)' },
  { code: 'ja-JP', label: '日本語',   name: 'Japanese'             },
  { code: 'ko-KR', label: '한국어',   name: 'Korean'               },
  { code: 'es-ES', label: 'Español',  name: 'Spanish'              },
  { code: 'fr-FR', label: 'Français', name: 'French'               },
  { code: 'de-DE', label: 'Deutsch',  name: 'German'               },
] as const
type LangCode = typeof LANGUAGES[number]['code']

// Returns the index after the last sentence-ending punctuation in text
function lastSentenceBoundary(text: string): number {
  let last = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if ('。！？…'.includes(ch)) { last = i + 1 }
    else if ('.!?'.includes(ch) && (i + 1 >= text.length || text[i + 1] === ' ' || text[i + 1] === '\n')) { last = i + 1 }
  }
  return last
}

// ── Animated sci-fi background ────────────────────────────────────────────
function AnimatedBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return

    let W = 0, H = 0
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const N = 72
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.38,
      vy: (Math.random() - 0.5) * 0.38,
      r:  Math.random() * 1.6 + 0.4,
      hue: [210, 250, 185][Math.floor(Math.random() * 3)],
    }))

    const blobs = [
      { x: 0.22, y: 0.28, r: 0.50, c: '37,99,235',   vx:  0.000110, vy:  0.000075 },
      { x: 0.78, y: 0.62, r: 0.42, c: '109,40,217',  vx: -0.000095, vy:  0.000130 },
      { x: 0.50, y: 0.88, r: 0.38, c: '6,182,212',   vx:  0.000080, vy: -0.000100 },
      { x: 0.88, y: 0.18, r: 0.30, c: '99,102,241',  vx: -0.000060, vy:  0.000085 },
    ]

    const GRID = 72, MAX_CONN = 130
    let raf: number

    const draw = () => {
      ctx.clearRect(0, 0, W, H)

      // Grid
      ctx.strokeStyle = 'rgba(99,179,237,0.045)'; ctx.lineWidth = 1
      for (let x = 0; x <= W; x += GRID) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
      for (let y = 0; y <= H; y += GRID) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

      // Nebula
      blobs.forEach(b => {
        b.x += b.vx; b.y += b.vy
        if (b.x < -0.3 || b.x > 1.3) b.vx *= -1
        if (b.y < -0.3 || b.y > 1.3) b.vy *= -1
        const gx = b.x * W, gy = b.y * H, gr = b.r * Math.max(W, H)
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr)
        g.addColorStop(0, `rgba(${b.c},0.10)`); g.addColorStop(0.5, `rgba(${b.c},0.04)`); g.addColorStop(1, 'transparent')
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      })

      // Connections
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < MAX_CONN) {
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y)
            ctx.strokeStyle = `rgba(99,179,237,${(1 - d / MAX_CONN) * 0.22})`
            ctx.lineWidth = 0.6; ctx.stroke()
          }
        }
      }

      // Particles with glow
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4)
        glow.addColorStop(0, `hsla(${p.hue},85%,72%,0.6)`); glow.addColorStop(1, 'transparent')
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill()
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue},90%,80%,0.9)`; ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <canvas ref={ref} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────
function MicIcon({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="8"  y1="22" x2="16" y2="22"/>
    </svg>
  )
}

function MonitorIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  )
}

function Logo({ size = 18 }: { size?: number }) {
  return (
    <span className="font-bold tracking-tight select-none animate-gradient-shift" style={{
      fontSize: size,
      background: 'linear-gradient(135deg, #60a5fa, #a78bfa, #f472b6, #22d3ee, #60a5fa)',
      backgroundSize: '300% 300%',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      letterSpacing: '-0.03em',
    }}>聆译</span>
  )
}

// ── Gradient mic icon (idle state) ────────────────────────────────────────
function GradientMicIcon({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="mic-g" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#60a5fa"/>
          <stop offset="50%"  stopColor="#818cf8"/>
          <stop offset="100%" stopColor="#a78bfa"/>
        </linearGradient>
      </defs>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" stroke="url(#mic-g)" strokeWidth="1.7"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"                             stroke="url(#mic-g)" strokeWidth="1.7"/>
      <line x1="12" y1="19" x2="12" y2="22"                           stroke="url(#mic-g)" strokeWidth="1.7"/>
      <line x1="8"  y1="22" x2="16" y2="22"                           stroke="url(#mic-g)" strokeWidth="1.7"/>
    </svg>
  )
}

// ── Mic visualizer ────────────────────────────────────────────────────────
function MicVisualizer({
  level, isRecording, isConnecting, status, onClick, containerSize = CONTAINER_SIZE,
}: {
  level: number; isRecording: boolean; isConnecting: boolean; status: Status; onClick: () => void; containerSize?: number
}) {
  const isProcessing = status === 'processing'
  const accent   = isConnecting ? '99,102,241' : isProcessing ? '217,119,6'  : '37,99,235'
  const btnBg    = isConnecting ? 'linear-gradient(145deg,#4f46e5,#7c3aed)'
                 : isProcessing ? '#d97706' : 'linear-gradient(145deg,#3b82f6,#6d28d9)'
  const scale    = containerSize / CONTAINER_SIZE
  const micSize  = isRecording ? MIC_SIZE_ACTIVE : MIC_SIZE_IDLE

  return (
    <div style={{ width: containerSize, height: containerSize, position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

      {/* Idle breathing ring */}
      <div className="animate-idle-pulse" style={{
        position: 'absolute', width: Math.round(170 * scale), height: Math.round(170 * scale), borderRadius: '50%',
        border: '1.5px solid rgba(99,102,241,0.45)',
        background: 'rgba(99,102,241,0.07)',
        opacity: isRecording ? 0 : 1,
        transition: 'opacity 400ms ease-out',
        pointerEvents: 'none',
      }} />

      {/* Audio ring 3 */}
      <div style={{
        position: 'absolute', width: Math.round(190 * scale), height: Math.round(190 * scale), borderRadius: '50%',
        background: `rgba(${accent},${isRecording ? 0.03 + level * 0.05 : 0})`,
        border: `1.5px solid rgba(${accent},${isRecording ? 0.07 + level * 0.14 : 0})`,
        transform: `scale(${isRecording ? 1 + level * 0.15 : 0.6})`,
        opacity: isRecording ? 1 : 0,
        transition: 'transform 120ms ease-out, opacity 450ms ease-out',
      }} />

      {/* Audio ring 2 */}
      <div style={{
        position: 'absolute', width: Math.round(140 * scale), height: Math.round(140 * scale), borderRadius: '50%',
        background: `rgba(${accent},${isRecording ? 0.06 + level * 0.10 : 0})`,
        border: `1.5px solid rgba(${accent},${isRecording ? 0.12 + level * 0.24 : 0})`,
        transform: `scale(${isRecording ? 1 + level * 0.11 : 0.6})`,
        opacity: isRecording ? 1 : 0,
        transition: 'transform 80ms ease-out, opacity 450ms ease-out',
      }} />

      {/* Audio ring 1 */}
      <div style={{
        position: 'absolute', width: Math.round(100 * scale), height: Math.round(100 * scale), borderRadius: '50%',
        background: `rgba(${accent},${isRecording ? 0.09 + level * 0.14 : 0})`,
        border: `1.5px solid rgba(${accent},${isRecording ? 0.20 + level * 0.34 : 0})`,
        transform: `scale(${isRecording ? 1 + level * 0.08 : 0.6})`,
        opacity: isRecording ? 1 : 0,
        transition: 'transform 55ms ease-out, opacity 450ms ease-out',
      }} />

      {/* Button */}
      <button onClick={onClick} title={isConnecting ? '正在连接…' : isRecording ? '点击停止' : '点击开始'}
        style={{
          position: 'relative', zIndex: 10,
          width: Math.round(micSize * scale), height: Math.round(micSize * scale), borderRadius: '50%',
          background: isConnecting || isRecording
            ? btnBg
            : 'linear-gradient(145deg, rgba(37,99,235,0.18) 0%, rgba(109,40,217,0.14) 100%)',
          border: isRecording ? 'none' : '1.5px solid rgba(139,92,246,0.30)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isRecording
            ? `0 0 0 6px rgba(${accent},0.12), 0 8px 32px rgba(${accent},${0.22 + level * 0.20})`
            : '0 0 40px rgba(37,99,235,0.22), 0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
          transform: `scale(${isRecording ? 1 + level * 0.06 : 1})`,
          outline: 'none',
          transition: [
            'width 500ms cubic-bezier(0.4,0,0.2,1)',
            'height 500ms cubic-bezier(0.4,0,0.2,1)',
            'background 350ms', 'box-shadow 100ms ease-out', 'transform 80ms ease-out',
          ].join(', '),
        }}>
        {isRecording ? <MicIcon size={Math.round(26 * scale)} color="#ffffff"/> : <GradientMicIcon size={Math.round(46 * scale)}/>}
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function Interpreter() {
  const [mode, setMode]               = useState<Mode>('mic')
  const [sourceLang, setSourceLang]   = useState<LangCode>('en-US')
  const [targetLang, setTargetLang]   = useState<LangCode>('zh-CN')
  const [isMobile, setIsMobile]       = useState(false)
  const [isOnPage, setIsOnPage]         = useState(false)
  const [isRecording, setIsRecording]   = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [segments, setSegments]       = useState<Segment[]>([])
  const [interim, setInterim]         = useState('')
  const [status, setStatus]           = useState<Status>('idle')
  const [errMsg, setErrMsg]           = useState('')
  const [bars, setBars]               = useState<number[]>(new Array(BAR_COUNT).fill(0))
  const [hasSR, setHasSR]             = useState(true)
  const [ttsOn, setTtsOn]             = useState(true)
  const [copiedId, setCopiedId]       = useState<string | null>(null)

  const recogRef          = useRef<any>(null)
  const audioCtxRef       = useRef<AudioContext | null>(null)
  const analyserRef       = useRef<AnalyserNode | null>(null)
  const sysStreamRef      = useRef<MediaStream | null>(null)
  const whisperStreamRef  = useRef<MediaStream | null>(null)
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null)
  const whisperActiveRef  = useRef(false)
  const rafRef            = useRef<number>(0)
  const segsRef      = useRef<Segment[]>([])
  const recordingRef = useRef(false)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const ttsOnRef           = useRef(true)
  const speakRef           = useRef<(text: string, cancelFirst?: boolean) => void>(() => {})
  const sourceLangRef      = useRef<LangCode>('en-US')
  const targetLangRef      = useRef<LangCode>('zh-CN')
  const interimTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSentTextRef    = useRef<string>('')
  const isTtsSpeakingRef       = useRef(false)
  const textBufferRef          = useRef('')
  const whisperPromptRef       = useRef('')
  const silenceFlushTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ttsCancelIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  const audioLevel = bars.reduce((a, b) => a + b, 0) / bars.length

  useEffect(() => { segsRef.current = segments }, [segments])
  useEffect(() => { recordingRef.current = isRecording }, [isRecording])
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  useEffect(() => { ttsOnRef.current = ttsOn }, [ttsOn])
  useEffect(() => { sourceLangRef.current = sourceLang }, [sourceLang])
  useEffect(() => { targetLangRef.current = targetLang }, [targetLang])

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) setHasSR(false)
    return () => {
      cancelAnimationFrame(rafRef.current)
      audioCtxRef.current?.close()
      recogRef.current?.abort()
      sysStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop())
    }
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [segments])

  function startAudio(stream: MediaStream) {
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.8
    ctx.createMediaStreamSource(stream).connect(analyser)
    audioCtxRef.current = ctx
    analyserRef.current = analyser
    const data = new Uint8Array(analyser.frequencyBinCount)
    const step = Math.floor(data.length / BAR_COUNT)
    const tick = () => {
      analyser.getByteFrequencyData(data)
      setBars(Array.from({ length: BAR_COUNT }, (_, i) => data[i * step] / 255))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function stopAudio() {
    cancelAnimationFrame(rafRef.current)
    audioCtxRef.current?.close(); audioCtxRef.current = null
    analyserRef.current = null
    setBars(new Array(BAR_COUNT).fill(0))
  }

  const translate = useCallback(async (text: string) => {
    const segId = `${Date.now()}-${Math.random()}`
    const seg: Segment = { id: segId, english: text, chinese: '', isStreaming: true, timestamp: Date.now() }
    setSegments(prev => { const n = [...prev.slice(-19), seg]; segsRef.current = n; return n })
    setStatus('processing')

    const ctx: ContextSegment[] = segsRef.current
      .filter(s => !s.isStreaming && s.chinese).slice(-CONTEXT_WINDOW)
      .map((s, i) => ({ index: i, english: s.english, chinese: s.chinese }))

    try {
      const res = await fetch('/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, context: ctx, sourceLang: sourceLangRef.current, targetLang: targetLangRef.current }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = ''; let spokenLen = 0
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue
          let msg: any
          try { msg = JSON.parse(line.slice(6)) } catch { continue }
          if (msg.type === 'delta') {
            acc += msg.text
            setSegments(p => p.map(s => s.id === segId ? { ...s, chinese: acc } : s))
            // Speak each completed sentence immediately as it streams in
            const unspoken = acc.slice(spokenLen)
            const cutAt = lastSentenceBoundary(unspoken)
            if (cutAt > 0) {
              speakRef.current(unspoken.slice(0, cutAt), spokenLen === 0)
              spokenLen += cutAt
            }
          } else if (msg.type === 'error') { throw new Error(msg.message) }
        }
      }

      const allLines  = acc.split('\n')
      const corrLines = allLines.filter(l => /^CORRECTION:\d+:/.test(l.trim()))
      const mainText  = allLines.filter(l => !/^CORRECTION:\d+:/.test(l.trim())).join('\n').trim()

      setSegments(prev => {
        let up = prev.map(s => s.id === segId ? { ...s, chinese: mainText, isStreaming: false } : s)
        const done = up.filter(s => !s.isStreaming && s.id !== segId)
        for (const cl of corrLines) {
          const m = cl.trim().match(/^CORRECTION:(\d+):(.+)$/); if (!m) continue
          const idx = parseInt(m[1], 10) - 1
          if (idx >= 0 && idx < done.length) { const tid = done[idx].id; up = up.map(s => s.id === tid ? { ...s, chinese: m[2].trim() } : s) }
        }
        segsRef.current = up; return up
      })
      // Speak any remaining text after streaming ends
      const remaining = mainText.slice(spokenLen).trim()
      if (remaining) speakRef.current(remaining, spokenLen === 0)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSegments(p => p.map(s => s.id === segId ? { ...s, chinese: `[错误: ${msg}]`, isStreaming: false } : s))
      setStatus('error'); setErrMsg(msg); return
    }
    if (recordingRef.current) setStatus('listening')
  }, [])

  function makeRecog() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return null
    const r = new SR(); r.lang = sourceLangRef.current; r.continuous = true; r.interimResults = true
    r.onresult = (e: any) => {
      // Stop TTS the moment the user starts speaking so recognition stays clean
      if (isTtsSpeakingRef.current) {
        window.speechSynthesis.cancel()
        isTtsSpeakingRef.current = false
      }
      let itr = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const t = e.results[i][0].transcript.trim()
          if (t.length > 1) { translate(t); setInterim('') }
        } else {
          itr += e.results[i][0].transcript
        }
      }
      setInterim(itr)
    }
    r.onerror = (e: any) => {
      if (e.error === 'aborted') return
      if (e.error === 'no-speech') {
        // no-speech is normal silence; just restart — don't surface as fatal
        return
      }
      if (e.error === 'network') {
        setStatus('error')
        setErrMsg('语音识别网络错误 — Chrome 的 STT 需要连接 Google 服务器，国内请开 VPN 后重试')
        return
      }
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setStatus('error')
        setErrMsg('浏览器拒绝了麦克风或语音识别权限，请检查地址栏权限设置')
        return
      }
      setStatus('error'); setErrMsg(`语音识别错误: ${e.error}`)
    }
    r.onstart  = () => console.log('[STT] started')
    r.onend    = () => {
      console.log('[STT] ended, recordingRef=', recordingRef.current)
      if (recordingRef.current) { try { r.start() } catch {} }
    }
    return r
  }

  function enterPage() { setIsOnPage(true); setErrMsg(''); setStatus('idle') }

  // ── Whisper-based STT (for mobile / browsers without working SpeechRecognition) ──

  function getAudioLevel(): number {
    const analyser = analyserRef.current
    if (!analyser) return 0
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    return data.reduce((a, b) => a + b, 0) / data.length / 255
  }

  function captureSegment(stream: MediaStream) {
    if (!whisperActiveRef.current) return

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''

    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    mediaRecorderRef.current = mr
    const chunks: Blob[] = []

    mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    mr.onstop = async () => {
      // Immediately start next chunk so recording is continuous
      if (whisperActiveRef.current) captureSegment(stream)

      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' })
      // Skip near-silent blobs to avoid Whisper hallucinations
      if (blob.size < 4000) return

      try {
        const ext = (mr.mimeType || '').includes('mp4') ? 'm4a' : 'webm'
        const fd = new FormData()
        fd.append('audio', blob, `audio.${ext}`)
        fd.append('language', sourceLangRef.current.slice(0, 2))
        // Pass recent transcript as prompt so Whisper has cross-chunk context
        const prompt = (whisperPromptRef.current + ' ' + textBufferRef.current).trim().slice(-200)
        if (prompt) fd.append('prompt', prompt)
        const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
        const data = await res.json()
        const raw = (data.text ?? '').trim()

        const isHallucination = !raw || raw.length <= 1 ||
          /^(thank you\.?|thanks\.?|you\.?|bye\.?|\.+|。+)$/i.test(raw) ||
          /点赞|订阅|转发|打赏|明镜|字幕|支持.*栏目|感谢.*收看|感谢.*观看|请.*关注/.test(raw)
        if (isHallucination) {
          // Reset prompt context so the hallucination doesn't seed the next chunk
          whisperPromptRef.current = ''
          return
        }
        if (isTtsSpeakingRef.current) return

        whisperPromptRef.current = raw  // keep for next chunk's context

        // Accumulate into buffer
        textBufferRef.current += (textBufferRef.current ? ' ' : '') + raw

        // Translate every complete sentence found in the buffer immediately
        const boundary = lastSentenceBoundary(textBufferRef.current)
        if (boundary > 0) {
          const sentence = textBufferRef.current.slice(0, boundary).trim()
          textBufferRef.current = textBufferRef.current.slice(boundary).trim()
          if (silenceFlushTimerRef.current) { clearTimeout(silenceFlushTimerRef.current); silenceFlushTimerRef.current = null }
          translate(sentence)
        }

        // If incomplete sentence remains, flush it after 1.5 s of no new words
        if (textBufferRef.current) {
          if (silenceFlushTimerRef.current) clearTimeout(silenceFlushTimerRef.current)
          silenceFlushTimerRef.current = setTimeout(() => {
            const leftover = textBufferRef.current.trim()
            if (leftover) { textBufferRef.current = ''; translate(leftover) }
            silenceFlushTimerRef.current = null
          }, 1500)
        }
      } catch { /* ignore individual chunk errors */ }
    }

    mr.start(100)
    // 5-second chunks — gives Whisper enough context for high accuracy
    setTimeout(() => { if (mr.state === 'recording') mr.stop() }, 5000)
  }

  async function startWhisperRecording() {
    setErrMsg(''); setIsConnecting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      whisperStreamRef.current = stream
      startAudio(stream)
      whisperActiveRef.current = true
      recordingRef.current = true
      textBufferRef.current = ''
      // Watch for voice during TTS and cancel playback immediately
      ttsCancelIntervalRef.current = setInterval(() => {
        if (isTtsSpeakingRef.current && getAudioLevel() >= 0.03) {
          window.speechSynthesis.cancel()
          isTtsSpeakingRef.current = false
        }
      }, 100)
      setIsConnecting(false)
      setIsRecording(true)
      setStatus('listening')
      captureSegment(stream)
    } catch (err) {
      setIsConnecting(false)
      setStatus('error')
      setErrMsg((err as Error).name === 'NotAllowedError'
        ? '麦克风权限被拒绝，请在浏览器地址栏授权'
        : '无法访问麦克风：' + (err as Error).message)
    }
  }

  function stopWhisperRecording() {
    whisperActiveRef.current = false
    recordingRef.current = false
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    mediaRecorderRef.current = null
    whisperStreamRef.current?.getTracks().forEach(t => t.stop())
    whisperStreamRef.current = null
    sysStreamRef.current?.getTracks().forEach(t => t.stop())
    sysStreamRef.current = null
    if (ttsCancelIntervalRef.current) { clearInterval(ttsCancelIntervalRef.current); ttsCancelIntervalRef.current = null }
    if (silenceFlushTimerRef.current) { clearTimeout(silenceFlushTimerRef.current); silenceFlushTimerRef.current = null }
    textBufferRef.current = ''
    whisperPromptRef.current = ''
    stopAudio()
    window.speechSynthesis.cancel()
    setIsRecording(false)
    setStatus('idle')
    setInterim('')
  }

  async function startRecording() {
    if (useWhisper && mode === 'mic') { startWhisperRecording(); return }
    setErrMsg(''); setIsConnecting(true)
    if (mode === 'mic') {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        startAudio(s)
        const r = makeRecog()
        if (!r) {
          s.getTracks().forEach(t => t.stop()); stopAudio()
          setIsConnecting(false); setStatus('error')
          setErrMsg('浏览器不支持语音识别，请使用 Chrome 或 Edge')
          return
        }
        recogRef.current = r; r.start()
        setIsConnecting(false); setIsRecording(true); setStatus('listening')
      } catch (err) {
        setIsConnecting(false); setStatus('error')
        setErrMsg((err as Error).name === 'NotAllowedError'
          ? '麦克风权限被拒绝，请在浏览器地址栏旁点击锁形图标授权'
          : '无法访问麦克风：' + (err as Error).message)
      }
    } else {
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({
          video: true, audio: { echoCancellation: false, noiseSuppression: false } as MediaTrackConstraints,
        })
        const aTracks = s.getAudioTracks()
        if (!aTracks.length) {
          s.getTracks().forEach(t => t.stop())
          setIsConnecting(false); setStatus('error'); setErrMsg('未检测到系统音频，请在弹窗中勾选「共享系统音频」'); return
        }
        sysStreamRef.current = s
        const audioStream = new MediaStream(aTracks)
        startAudio(audioStream)
        aTracks.forEach(t => { t.onended = () => { if (recordingRef.current) stopRecording() } })
        s.getVideoTracks().forEach(t => t.stop())
        // Route system audio through Whisper just like mic mode
        whisperStreamRef.current = audioStream
        whisperActiveRef.current = true
        recordingRef.current = true
        textBufferRef.current = ''
        ttsCancelIntervalRef.current = setInterval(() => {
          if (isTtsSpeakingRef.current && getAudioLevel() >= 0.03) {
            window.speechSynthesis.cancel()
            isTtsSpeakingRef.current = false
          }
        }, 100)
        setIsConnecting(false); setIsRecording(true); setStatus('listening')
        captureSegment(audioStream)
      } catch (err) {
        setIsConnecting(false)
        if ((err as Error).name !== 'NotAllowedError') { setStatus('error'); setErrMsg('无法获取系统音频') } else setStatus('idle')
      }
    }
  }

  function stopRecording() {
    if (whisperActiveRef.current) { stopWhisperRecording(); return }
    setIsRecording(false); setStatus('idle'); setInterim('')
    if (interimTimerRef.current) { clearTimeout(interimTimerRef.current); interimTimerRef.current = null }
    lastSentTextRef.current = ''
    recogRef.current?.abort(); recogRef.current = null
    sysStreamRef.current?.getTracks().forEach(t => t.stop()); sysStreamRef.current = null
    stopAudio()
    window.speechSynthesis.cancel()
  }

  function toggleMic() { if (isConnecting) return; if (isRecording) stopRecording(); else startRecording() }

  function speak(text: string, cancelFirst = true) {
    if (!ttsOnRef.current || !text.trim() || typeof window === 'undefined') return
    if (cancelFirst) window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.trim())
    const lang = targetLangRef.current
    u.lang = lang
    u.rate = 1.15
    const voices = window.speechSynthesis.getVoices()
    const match = voices.find(v => v.lang.startsWith(lang.slice(0, 2)))
    if (match) u.voice = match
    u.onstart = () => { isTtsSpeakingRef.current = true }
    u.onend   = () => { setTimeout(() => { isTtsSpeakingRef.current = false }, 400) }
    u.onerror = () => { isTtsSpeakingRef.current = false }
    window.speechSynthesis.speak(u)
  }
  speakRef.current = speak

  function downloadPDF() {
    const win = window.open('', '_blank')
    if (!win) return
    const date = new Date().toLocaleString('zh-CN')
    const rows = segsRef.current.map((s, i) => `
      <div class="seg">
        <div class="label">第 ${i + 1} 段</div>
        <div class="en">EN: ${s.english}</div>
        <div class="zh">${s.chinese || '(翻译中…)'}</div>
      </div>`).join('')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>聆译记录 ${date}</title>
      <style>
        body{font-family:'PingFang SC','Microsoft YaHei',sans-serif;max-width:760px;margin:48px auto;padding:0 24px;color:#111827}
        h1{font-size:26px;color:#312e81;border-bottom:2px solid #e0e7ff;padding-bottom:10px;margin-bottom:4px}
        .meta{color:#6b7280;font-size:13px;margin-bottom:36px}
        .seg{margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #f3f4f6}
        .label{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px}
        .en{font-family:monospace;font-size:13px;color:#6b7280;margin-bottom:8px}
        .zh{font-size:18px;color:#1e1b4b;line-height:1.65}
      </style></head><body>
      <h1>聆译 — 同声传译记录</h1>
      <div class="meta">${date} · 共 ${segsRef.current.length} 段</div>
      ${rows}
      </body></html>`)
    win.document.close()
    win.print()
  }

  const latest  = segments[segments.length - 1]
  const history = segments.slice(0, -1)

  const statusColor: Record<Status, string> = {
    idle: 'rgba(255,255,255,0.25)', listening: '#4ade80', processing: '#fbbf24', error: '#f87171',
  }
  const statusLabel: Record<Status, string> = {
    idle: '', listening: '监听中…', processing: '翻译中…', error: errMsg,
  }

  const useWhisper = true
  const micSize = isMobile ? 140 : CONTAINER_SIZE
  const micGap  = isMobile ? 12  : CORNER_GAP
  const half    = micSize / 2
  const micTransform = isRecording
    ? `translate(calc(100vw - ${micSize + micGap}px), calc(100vh - ${micSize + micGap}px))`
    : `translate(calc(50vw - ${half}px), calc(50vh - ${half - 24}px))`

  // Shared header style
  const headerStyle: React.CSSProperties = {
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(3,7,18,0.72)',
    backdropFilter: 'blur(16px)',
  }

  // ════════════════════════════════════════════════════════════════
  // LANDING
  // ════════════════════════════════════════════════════════════════
  if (!isOnPage) {
    return (
      <>
        <AnimatedBackground />
        <div className="h-screen flex flex-col" style={{ position: 'relative', zIndex: 1 }}>
          <header className="flex-none flex items-center gap-3 px-6 py-4" style={headerStyle}>
            <Logo size={20} />
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13, fontWeight: 300 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12 }}>您忠实的 AI 同声传译助手</span>
          </header>

          <main className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-6">
            <div className="text-center">
              <h1 className="font-bold mb-2 animate-gradient-shift" style={{
                fontSize: 'clamp(36px, 12vw, 60px)', letterSpacing: '-0.04em', lineHeight: 1,
                background: 'linear-gradient(135deg, #60a5fa, #a78bfa, #f472b6, #22d3ee, #60a5fa)',
                backgroundSize: '300% 300%',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>聆译</h1>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, letterSpacing: '0.06em' }}>
                您忠实的 AI 同声传译助手
              </p>
              {ttsOn && (
                <p style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.28)',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/>
                    <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                  </svg>
                  佩戴耳机可避免回声，体验更佳
                </p>
              )}
            </div>

            {/* Mode cards */}
            <div className="flex gap-3 w-full" style={{ maxWidth: 360 }}>
              {(['mic', 'system'] as Mode[]).map(m => {
                const sel = mode === m
                return (
                  // Outer div = gradient "border"; inner div = card content
                  <div key={m}
                    className={sel ? 'animate-gradient-shift flex-1' : 'flex-1'}
                    onClick={() => setMode(m)}
                    style={{
                      height: 130, borderRadius: 18,
                      padding: 1.5,
                      cursor: 'pointer',
                      backgroundImage: sel
                        ? 'linear-gradient(135deg, #93c5fd, #ddd6fe, #f9a8d4, #67e8f9, #93c5fd)'
                        : 'none',
                      backgroundColor: sel ? 'transparent' : 'rgba(255,255,255,0.10)',
                      backgroundSize: '300% 300%',
                      boxShadow: sel
                        ? '0 0 20px rgba(196,181,253,0.70), 0 0 50px rgba(147,197,253,0.35), 0 0 90px rgba(99,102,241,0.20)'
                        : 'none',
                      transition: 'box-shadow 300ms',
                      flexShrink: 0,
                    }}>
                    <div className="flex flex-col items-center justify-center gap-3 w-full h-full transition-colors duration-200"
                      style={{
                        borderRadius: 16.5,
                        background: sel ? 'rgba(8,12,38,0.88)' : 'rgba(255,255,255,0.04)',
                      }}>
                      {m === 'mic'
                        ? <MicIcon size={30} color={sel ? '#a5b4fc' : 'rgba(255,255,255,0.35)'}/>
                        : <MonitorIcon size={30}/>}
                      <div className="text-center">
                        <p className="font-semibold text-sm"
                          style={{ color: sel ? '#c4b5fd' : 'rgba(255,255,255,0.65)' }}>
                          {m === 'mic' ? '麦克风' : '系统音频'}
                        </p>
                        <p className="text-xs mt-0.5"
                          style={{ color: sel ? 'rgba(196,181,253,0.55)' : 'rgba(255,255,255,0.28)' }}>
                          {m === 'mic' ? '实时语音识别' : '捕获屏幕声音'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Language pair selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select value={sourceLang} onChange={e => {
                  const val = e.target.value as LangCode
                  if (val === targetLang) setTargetLang(sourceLang)
                  setSourceLang(val)
                }}
                style={{
                  padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                  border: '1px solid rgba(251,191,36,0.40)', outline: 'none', cursor: 'pointer',
                  background: 'rgba(217,119,6,0.18)', color: '#fde68a',
                  appearance: 'none', WebkitAppearance: 'none', minWidth: 120,
                }}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code} style={{ background: '#1e1b4b', color: '#fff' }}>{l.label}</option>)}
              </select>

              <button onClick={() => { setSourceLang(targetLang); setTargetLang(sourceLang) }}
                style={{
                  width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
                  border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.55)', fontSize: 15, transition: 'all 200ms',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)' }}>
                ⇄
              </button>

              <select value={targetLang} onChange={e => setTargetLang(e.target.value as LangCode)}
                style={{
                  padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                  border: '1px solid rgba(129,140,248,0.40)', outline: 'none', cursor: 'pointer',
                  background: 'rgba(79,70,229,0.22)', color: '#c4b5fd',
                  appearance: 'none', WebkitAppearance: 'none', minWidth: 120,
                }}>
                {LANGUAGES.filter(l => l.code !== sourceLang).map(l => <option key={l.code} value={l.code} style={{ background: '#1e1b4b', color: '#fff' }}>{l.label}</option>)}
              </select>
            </div>

            {/* TTS preference toggle */}
            <button
              onClick={() => setTtsOn(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 20px', borderRadius: 24,
                cursor: 'pointer',
                background: ttsOn
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(16,185,129,0.10))'
                  : 'rgba(255,255,255,0.04)',
                border: `1.5px solid ${ttsOn ? 'rgba(134,239,172,0.40)' : 'rgba(255,255,255,0.10)'}`,
                color: ttsOn ? '#86efac' : 'rgba(255,255,255,0.32)',
                boxShadow: ttsOn ? '0 0 20px rgba(34,197,94,0.15)' : 'none',
                transition: 'all 280ms cubic-bezier(0.4,0,0.2,1)',
                outline: 'none',
                fontSize: 13, fontWeight: 500,
              }}>
              {ttsOn ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <line x1="23" y1="9" x2="17" y2="15"/>
                  <line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
              )}
              {/* Toggle track */}
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                width: 36, height: 20, borderRadius: 10,
                background: ttsOn ? 'rgba(134,239,172,0.35)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${ttsOn ? 'rgba(134,239,172,0.50)' : 'rgba(255,255,255,0.12)'}`,
                padding: '0 2px',
                transition: 'all 280ms',
                flexShrink: 0,
              }}>
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: ttsOn ? '#86efac' : 'rgba(255,255,255,0.28)',
                  transform: ttsOn ? 'translateX(16px)' : 'translateX(0)',
                  transition: 'transform 280ms cubic-bezier(0.4,0,0.2,1), background 280ms',
                  flexShrink: 0,
                }} />
              </span>
              <span>{ttsOn ? '翻译后自动朗读' : '仅显示文字'}</span>
            </button>

            <button onClick={enterPage} disabled={!hasSR}
              className="animate-gradient-shift flex items-center justify-center gap-2.5 font-semibold text-sm transition-shadow duration-150 disabled:opacity-40 w-full"
              style={{
                maxWidth: 352, height: 48, borderRadius: 24,
                background: 'linear-gradient(90deg, #93c5fd, #ddd6fe, #f9a8d4, #67e8f9, #93c5fd)',
                backgroundSize: '300% 300%',
                color: '#1e1b4b',
                boxShadow: '0 4px 28px rgba(147,197,253,0.40), 0 0 60px rgba(196,181,253,0.20)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 36px rgba(147,197,253,0.60), 0 0 80px rgba(196,181,253,0.30)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 28px rgba(147,197,253,0.40), 0 0 60px rgba(196,181,253,0.20)' }}
            >
              <PlayIcon /> 开始聆译
            </button>

            {!hasSR && (
              <p style={{ color: '#f87171', fontSize: 14, textAlign: 'center', maxWidth: 280 }}>
                当前浏览器不支持语音识别。
                iOS 请使用 Safari，Android 请使用 Chrome。
              </p>
            )}
            {mode === 'system' && (
              <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 12, textAlign: 'center', maxWidth: 280, marginTop: -16 }}>
                启动后请在弹窗中勾选「共享系统音频」选项
              </p>
            )}
            {errMsg && <p style={{ color: '#f87171', fontSize: 14 }}>{errMsg}</p>}
          </main>
        </div>
      </>
    )
  }

  // ════════════════════════════════════════════════════════════════
  // ACTIVE PAGE
  // ════════════════════════════════════════════════════════════════
  return (
    <>
      <AnimatedBackground />
      <div className="h-screen flex flex-col" style={{ position: 'relative', zIndex: 1 }}>

        <header className="flex-none flex items-center justify-between px-3 py-2 md:px-6 md:py-3" style={headerStyle}>
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span className="hidden md:inline" style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 300 }}>|</span>
            <span className="hidden md:inline" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>您忠实的 AI 同声传译助手</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(79,70,229,0.22)', color: '#a5b4fc', border: '1px solid rgba(129,140,248,0.25)', whiteSpace: 'nowrap' }}>
              {LANGUAGES.find(l => l.code === sourceLang)?.label} → {LANGUAGES.find(l => l.code === targetLang)?.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-3">
            {status !== 'idle' && (
              <>
                {/* Desktop: full badge with label */}
                <span className="hidden md:inline-flex text-xs font-medium px-2.5 py-1 rounded-full items-center gap-1" style={{
                  background: 'rgba(255,255,255,0.07)',
                  color: statusColor[status],
                  border: `1px solid ${statusColor[status]}40`,
                }}>
                  {statusLabel[status]}
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: statusColor[status] }} />
                </span>
                {/* Mobile: dot only */}
                <span className="md:hidden inline-block w-2 h-2 rounded-full" style={{ background: statusColor[status] }} />
              </>
            )}
            {segments.length > 0 && (
              <>
                {/* Desktop: text button */}
                <button onClick={downloadPDF}
                  className="hidden md:block text-xs transition-colors px-3 py-1.5 rounded-lg"
                  style={{ color: 'rgba(165,180,252,0.70)', background: 'rgba(79,70,229,0.15)', border: '1px solid rgba(129,140,248,0.25)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#a5b4fc'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.30)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(165,180,252,0.70)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(79,70,229,0.15)' }}>
                  导出 PDF
                </button>
                {/* Mobile: icon only */}
                <button onClick={downloadPDF}
                  className="md:hidden flex items-center justify-center rounded-lg transition-colors"
                  style={{ width: 32, height: 32, color: 'rgba(165,180,252,0.70)', background: 'rgba(79,70,229,0.15)', border: '1px solid rgba(129,140,248,0.25)' }}
                  title="导出 PDF">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="9" y1="13" x2="15" y2="13"/>
                    <line x1="9" y1="17" x2="15" y2="17"/>
                    <polyline points="9 9 10 9"/>
                  </svg>
                </button>
              </>
            )}
            {segments.length > 0 && (
              <button onClick={() => { setSegments([]); segsRef.current = [] }}
                className="hidden md:block text-xs transition-colors px-3 py-1.5 rounded-lg"
                style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.75)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.35)' }}>
                清除
              </button>
            )}
            <button onClick={() => { stopRecording(); setIsOnPage(false); setSegments([]); segsRef.current = [] }}
              className="text-xs transition-colors px-2 py-1.5 md:px-3 rounded-lg"
              style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.75)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.35)' }}>
              返回
            </button>
          </div>
        </header>

        <div className="flex-1 relative overflow-hidden">
          {/* Centered hint when not recording */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
            opacity: isRecording ? 0 : 1,
            transition: 'opacity 300ms ease-out',
            pointerEvents: 'none',
          }}>
            <div style={{ width: micSize, height: micSize }} />
            <div style={{ textAlign: 'center', maxWidth: 280, padding: '0 16px' }}>
              {isConnecting ? (
                <p className="animate-pulse font-medium" style={{ fontSize: 14, color: '#a5b4fc', letterSpacing: '0.04em' }}>
                  正在请求麦克风权限…
                </p>
              ) : status === 'error' ? (
                <p style={{ fontSize: 13, color: '#f87171', lineHeight: 1.6 }}>{errMsg}</p>
              ) : (
                <>
                  <p className="animate-shimmer-text font-medium" style={{
                    fontSize: 15, letterSpacing: '0.04em',
                    background: 'linear-gradient(90deg, #60a5fa 0%, #a78bfa 40%, #22d3ee 70%, #60a5fa 100%)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>点击麦克风开始</p>
                  <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 6, letterSpacing: '0.02em' }}>
                    实时英语同声传译
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Subtitles */}
          <div className="h-full overflow-y-auto" style={{
            opacity: isRecording || segments.length > 0 ? 1 : 0,
            transition: 'opacity 400ms ease-out',
            paddingBottom: `${micSize + micGap + 24}px`,
            paddingRight: isMobile ? '16px' : `${micSize + micGap + 24}px`,
          }}>
            {segments.length === 0 && !interim ? (
              <div className="h-full flex items-center justify-center">
                <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: 14 }}>说话后字幕将出现在这里…</p>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto px-3 md:px-6 py-4 md:py-6 flex flex-col gap-3 md:gap-4">

                {/* History segments */}
                {history.map((seg, idx) => {
                  const age = history.length - idx
                  const opacity = Math.max(0.12, 0.65 - age * 0.08)
                  return (
                    <div key={seg.id} style={{ opacity, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* English bubble — transparent */}
                      <div style={{
                        alignSelf: isMobile ? 'stretch' : 'flex-start',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.11)',
                        borderRadius: '16px 16px 16px 4px',
                        padding: '7px 14px',
                        maxWidth: isMobile ? '100%' : '90%',
                      }}>
                        <p className="font-mono line-clamp-2" style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                          {seg.english}
                        </p>
                      </div>
                      {/* Chinese bubble — blue-purple */}
                      {seg.chinese && (
                        <div style={{
                          alignSelf: isMobile ? 'stretch' : 'flex-start',
                          background: 'linear-gradient(135deg, rgba(79,70,229,0.40), rgba(37,99,235,0.28))',
                          border: '1px solid rgba(129,140,248,0.30)',
                          borderRadius: '4px 16px 16px 16px',
                          padding: '9px 16px',
                          maxWidth: isMobile ? '100%' : '90%',
                          boxShadow: '0 2px 16px rgba(79,70,229,0.18)',
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                        }}>
                          <p style={{ fontSize: isMobile ? 15 : 17, color: '#e0e7ff', lineHeight: 1.5, flex: 1 }}>{seg.chinese}</p>
                          <button onClick={() => { navigator.clipboard.writeText(seg.chinese); setCopiedId(seg.id); setTimeout(() => setCopiedId(null), 1500) }}
                            title="复制译文"
                            style={{ flexShrink: 0, marginTop: 2, padding: '2px 4px', background: 'none', border: 'none', cursor: 'pointer', color: copiedId === seg.id ? '#86efac' : 'rgba(255,255,255,0.35)', transition: 'color 0.2s' }}>
                            {copiedId === seg.id ? '✓' : '⎘'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Latest segment */}
                {latest && (
                  <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* English bubble */}
                    <div style={{
                      alignSelf: 'flex-start',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '16px 16px 16px 4px',
                      padding: '8px 16px',
                      maxWidth: '90%',
                    }}>
                      <p className="font-mono" style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                        {latest.english}
                      </p>
                    </div>
                    {/* Chinese bubble */}
                    <div style={{
                      alignSelf: 'flex-start',
                      background: latest.isStreaming
                        ? 'linear-gradient(135deg, rgba(99,102,241,0.45), rgba(37,99,235,0.35))'
                        : 'linear-gradient(135deg, rgba(79,70,229,0.50), rgba(37,99,235,0.38))',
                      border: `1px solid ${latest.isStreaming ? 'rgba(147,197,253,0.40)' : 'rgba(129,140,248,0.35)'}`,
                      borderRadius: '4px 16px 16px 16px',
                      padding: '12px 20px',
                      maxWidth: '90%',
                      boxShadow: latest.isStreaming
                        ? '0 4px 24px rgba(99,102,241,0.30)'
                        : '0 2px 16px rgba(79,70,229,0.22)',
                      minHeight: 46,
                      transition: 'background 0.3s, box-shadow 0.3s',
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                    }}>
                      <p className="font-medium" style={{
                        fontSize: 'clamp(18px, 2.4vw, 26px)',
                        lineHeight: 1.45,
                        color: latest.isStreaming ? '#bfdbfe' : '#e0e7ff',
                        transition: 'color 0.3s',
                        flex: 1,
                      }}>
                        {latest.chinese || (latest.isStreaming ? '' : '')}
                        {latest.isStreaming && (
                          <span className="animate-blink inline-block ml-1 align-middle"
                            style={{ width: 2, height: '0.85em', background: '#93c5fd', borderRadius: 1 }} />
                        )}
                      </p>
                      {!latest.isStreaming && latest.chinese && (
                        <button onClick={() => { navigator.clipboard.writeText(latest.chinese); setCopiedId(latest.id); setTimeout(() => setCopiedId(null), 1500) }}
                          title="复制译文"
                          style={{ flexShrink: 0, marginTop: 4, padding: '2px 4px', background: 'none', border: 'none', cursor: 'pointer', color: copiedId === latest.id ? '#86efac' : 'rgba(255,255,255,0.35)', transition: 'color 0.2s', fontSize: 16 }}>
                          {copiedId === latest.id ? '✓' : '⎘'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Interim (speech being recognized) */}
                {interim && (
                  <div style={{
                    alignSelf: 'flex-start',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px dashed rgba(255,255,255,0.15)',
                    borderRadius: '16px 16px 16px 4px',
                    padding: '7px 14px',
                  }}>
                    <p className="italic font-mono" style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>
                      {interim}…
                    </p>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating TTS toggle — above the mic, same width so it centers perfectly */}
      <div style={{
        position: 'fixed',
        bottom: micSize + micGap + 8,
        right: micGap,
        width: micSize,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'center',
        transition: 'opacity 550ms cubic-bezier(0.4,0,0.2,1), transform 550ms cubic-bezier(0.4,0,0.2,1)',
        opacity: isRecording ? 1 : 0,
        transform: isRecording ? 'translateY(0)' : 'translateY(10px)',
        pointerEvents: isRecording ? 'auto' : 'none',
      }}>
        <button
          onClick={() => { setTtsOn(p => { const next = !p; if (!next) window.speechSynthesis.cancel(); return next }) }}
          title={ttsOn ? '点击关闭语音播报' : '点击开启语音播报'}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: isMobile ? '8px 14px' : '10px 18px',
            borderRadius: 24,
            cursor: 'pointer',
            backdropFilter: 'blur(16px)',
            background: ttsOn
              ? 'linear-gradient(135deg, rgba(34,197,94,0.22), rgba(16,185,129,0.14))'
              : 'rgba(15,23,42,0.70)',
            border: `1.5px solid ${ttsOn ? 'rgba(134,239,172,0.45)' : 'rgba(255,255,255,0.10)'}`,
            color: ttsOn ? '#86efac' : 'rgba(255,255,255,0.32)',
            boxShadow: ttsOn ? '0 4px 24px rgba(34,197,94,0.22)' : '0 2px 12px rgba(0,0,0,0.30)',
            transition: 'all 280ms cubic-bezier(0.4,0,0.2,1)',
            fontSize: isMobile ? 12 : 13,
            fontWeight: 500,
            outline: 'none',
            whiteSpace: 'nowrap',
          }}>
          {ttsOn ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="23" y1="9" x2="17" y2="15"/>
              <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
          )}
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            width: 32, height: 18, borderRadius: 9,
            background: ttsOn ? 'rgba(134,239,172,0.35)' : 'rgba(255,255,255,0.10)',
            border: `1px solid ${ttsOn ? 'rgba(134,239,172,0.50)' : 'rgba(255,255,255,0.15)'}`,
            padding: '0 2px',
            transition: 'all 280ms',
            flexShrink: 0,
          }}>
            <span style={{
              width: 12, height: 12, borderRadius: '50%',
              background: ttsOn ? '#86efac' : 'rgba(255,255,255,0.30)',
              transform: ttsOn ? 'translateX(14px)' : 'translateX(0)',
              transition: 'transform 280ms cubic-bezier(0.4,0,0.2,1), background 280ms',
              flexShrink: 0,
            }} />
          </span>
          <span>{ttsOn ? '语音播报' : '播报关闭'}</span>
        </button>
      </div>

      {/* Floating mic */}
      <div style={{
        position: 'fixed', top: 0, left: 0, zIndex: 50,
        width: micSize, height: micSize,
        transform: micTransform,
        transition: 'transform 550ms cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: 'none',
      }}>
        <div style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}>
          <MicVisualizer level={audioLevel} isRecording={isRecording} isConnecting={isConnecting} status={status} onClick={toggleMic} containerSize={micSize} />
        </div>
      </div>

    </>
  )
}
