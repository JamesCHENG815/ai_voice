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
  level, isRecording, status, onClick,
}: {
  level: number; isRecording: boolean; status: Status; onClick: () => void
}) {
  const isProcessing = status === 'processing'
  const accent   = isProcessing ? '217,119,6'  : '37,99,235'
  const btnBg    = isProcessing ? '#d97706'    : 'linear-gradient(145deg,#3b82f6,#6d28d9)'
  const micSize  = isRecording ? MIC_SIZE_ACTIVE : MIC_SIZE_IDLE

  return (
    <div style={{ width: CONTAINER_SIZE, height: CONTAINER_SIZE, position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

      {/* Idle breathing ring */}
      <div className="animate-idle-pulse" style={{
        position: 'absolute', width: 170, height: 170, borderRadius: '50%',
        border: '1.5px solid rgba(99,102,241,0.45)',
        background: 'rgba(99,102,241,0.07)',
        opacity: isRecording ? 0 : 1,
        transition: 'opacity 400ms ease-out',
        pointerEvents: 'none',
      }} />

      {/* Audio ring 3 */}
      <div style={{
        position: 'absolute', width: 190, height: 190, borderRadius: '50%',
        background: `rgba(${accent},${isRecording ? 0.03 + level * 0.05 : 0})`,
        border: `1.5px solid rgba(${accent},${isRecording ? 0.07 + level * 0.14 : 0})`,
        transform: `scale(${isRecording ? 1 + level * 0.15 : 0.6})`,
        opacity: isRecording ? 1 : 0,
        transition: 'transform 120ms ease-out, opacity 450ms ease-out',
      }} />

      {/* Audio ring 2 */}
      <div style={{
        position: 'absolute', width: 140, height: 140, borderRadius: '50%',
        background: `rgba(${accent},${isRecording ? 0.06 + level * 0.10 : 0})`,
        border: `1.5px solid rgba(${accent},${isRecording ? 0.12 + level * 0.24 : 0})`,
        transform: `scale(${isRecording ? 1 + level * 0.11 : 0.6})`,
        opacity: isRecording ? 1 : 0,
        transition: 'transform 80ms ease-out, opacity 450ms ease-out',
      }} />

      {/* Audio ring 1 */}
      <div style={{
        position: 'absolute', width: 100, height: 100, borderRadius: '50%',
        background: `rgba(${accent},${isRecording ? 0.09 + level * 0.14 : 0})`,
        border: `1.5px solid rgba(${accent},${isRecording ? 0.20 + level * 0.34 : 0})`,
        transform: `scale(${isRecording ? 1 + level * 0.08 : 0.6})`,
        opacity: isRecording ? 1 : 0,
        transition: 'transform 55ms ease-out, opacity 450ms ease-out',
      }} />

      {/* Button */}
      <button onClick={onClick} title={isRecording ? '点击停止' : '点击开始'}
        style={{
          position: 'relative', zIndex: 10,
          width: micSize, height: micSize, borderRadius: '50%',
          background: isRecording
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
        {isRecording ? <MicIcon size={26} color="#ffffff"/> : <GradientMicIcon size={46}/>}
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function Interpreter() {
  const [mode, setMode]               = useState<Mode>('mic')
  const [isOnPage, setIsOnPage]       = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [segments, setSegments]       = useState<Segment[]>([])
  const [interim, setInterim]         = useState('')
  const [status, setStatus]           = useState<Status>('idle')
  const [errMsg, setErrMsg]           = useState('')
  const [bars, setBars]               = useState<number[]>(new Array(BAR_COUNT).fill(0))
  const [hasSR, setHasSR]             = useState(true)

  const recogRef     = useRef<any>(null)
  const audioCtxRef  = useRef<AudioContext | null>(null)
  const sysStreamRef = useRef<MediaStream | null>(null)
  const rafRef       = useRef<number>(0)
  const segsRef      = useRef<Segment[]>([])
  const recordingRef = useRef(false)
  const bottomRef    = useRef<HTMLDivElement>(null)

  const audioLevel = bars.reduce((a, b) => a + b, 0) / bars.length

  useEffect(() => { segsRef.current = segments }, [segments])
  useEffect(() => { recordingRef.current = isRecording }, [isRecording])

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
        body: JSON.stringify({ text, context: ctx }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6))
            if (msg.type === 'delta') { acc += msg.text; setSegments(p => p.map(s => s.id === segId ? { ...s, chinese: acc } : s)) }
          } catch {}
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
    const r = new SR(); r.lang = 'en-US'; r.continuous = true; r.interimResults = true
    r.onresult = (e: any) => {
      let itr = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) { const t = e.results[i][0].transcript.trim(); if (t.length > 1) { translate(t); setInterim('') } }
        else { itr += e.results[i][0].transcript }
      }
      setInterim(itr)
    }
    r.onerror = (e: any) => { if (e.error === 'no-speech' || e.error === 'aborted') return; setStatus('error'); setErrMsg(`识别错误: ${e.error}`) }
    r.onend = () => { if (recordingRef.current) { try { r.start() } catch {} } }
    return r
  }

  function enterPage() { setIsOnPage(true); setErrMsg(''); setStatus('idle') }

  async function startRecording() {
    setErrMsg('')
    if (mode === 'mic') {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        startAudio(s); const r = makeRecog(); if (r) { recogRef.current = r; r.start() }
        setIsRecording(true); setStatus('listening')
      } catch { setStatus('error'); setErrMsg('无法访问麦克风，请检查权限') }
    } else {
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({
          video: true, audio: { echoCancellation: false, noiseSuppression: false } as MediaTrackConstraints,
        })
        const aTracks = s.getAudioTracks()
        if (!aTracks.length) { s.getTracks().forEach(t => t.stop()); setStatus('error'); setErrMsg('未检测到系统音频，请勾选「共享音频」'); return }
        sysStreamRef.current = s; startAudio(new MediaStream(aTracks))
        aTracks.forEach(t => { t.onended = () => { if (recordingRef.current) stopRecording() } })
        s.getVideoTracks().forEach(t => t.stop()); const r = makeRecog(); if (r) { recogRef.current = r; r.start() }
        setIsRecording(true); setStatus('listening')
      } catch (err) {
        if ((err as Error).name !== 'NotAllowedError') { setStatus('error'); setErrMsg('无法获取系统音频') } else setStatus('idle')
      }
    }
  }

  function stopRecording() {
    setIsRecording(false); setStatus('idle'); setInterim('')
    recogRef.current?.abort(); recogRef.current = null
    sysStreamRef.current?.getTracks().forEach(t => t.stop()); sysStreamRef.current = null
    stopAudio()
  }

  function toggleMic() { if (isRecording) stopRecording(); else startRecording() }

  const latest  = segments[segments.length - 1]
  const history = segments.slice(0, -1)

  const statusColor: Record<Status, string> = {
    idle: 'rgba(255,255,255,0.25)', listening: '#4ade80', processing: '#fbbf24', error: '#f87171',
  }
  const statusLabel: Record<Status, string> = {
    idle: '', listening: '监听中…', processing: '翻译中…', error: errMsg,
  }

  const half = CONTAINER_SIZE / 2
  const micTransform = isRecording
    ? `translate(calc(100vw - ${CONTAINER_SIZE + CORNER_GAP}px), calc(100vh - ${CONTAINER_SIZE + CORNER_GAP}px))`
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

          <main className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
            <div className="text-center">
              <h1 className="font-bold mb-2 animate-gradient-shift" style={{
                fontSize: 60, letterSpacing: '-0.04em', lineHeight: 1,
                background: 'linear-gradient(135deg, #60a5fa, #a78bfa, #f472b6, #22d3ee, #60a5fa)',
                backgroundSize: '300% 300%',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>聆译</h1>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, letterSpacing: '0.06em' }}>
                您忠实的 AI 同声传译助手
              </p>
            </div>

            {/* Mode cards */}
            <div className="flex gap-4">
              {(['mic', 'system'] as Mode[]).map(m => {
                const sel = mode === m
                return (
                  // Outer div = gradient "border"; inner div = card content
                  <div key={m}
                    className={sel ? 'animate-gradient-shift' : ''}
                    onClick={() => setMode(m)}
                    style={{
                      width: 168, height: 148, borderRadius: 18,
                      padding: 1.5,
                      cursor: 'pointer',
                      background: sel
                        ? 'linear-gradient(135deg, #93c5fd, #ddd6fe, #f9a8d4, #67e8f9, #93c5fd)'
                        : 'rgba(255,255,255,0.10)',
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

            <button onClick={enterPage} disabled={!hasSR}
              className="animate-gradient-shift flex items-center justify-center gap-2.5 font-semibold text-sm transition-shadow duration-150 disabled:opacity-40"
              style={{
                width: 352, height: 48, borderRadius: 24,
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

            {!hasSR && <p style={{ color: '#f87171', fontSize: 14 }}>请使用 Chrome 或 Edge 浏览器</p>}
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

        <header className="flex-none flex items-center justify-between px-6 py-3" style={headerStyle}>
          <div className="flex items-center gap-3">
            <Logo size={18} />
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: 300 }}>|</span>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>您忠实的 AI 同声传译助手</span>
          </div>
          <div className="flex items-center gap-3">
            {status !== 'idle' && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{
                background: 'rgba(255,255,255,0.07)',
                color: statusColor[status],
                border: `1px solid ${statusColor[status]}40`,
              }}>
                {statusLabel[status]}
              </span>
            )}
            {segments.length > 0 && (
              <button onClick={() => { setSegments([]); segsRef.current = [] }}
                className="text-xs transition-colors px-3 py-1.5 rounded-lg"
                style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.75)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.35)' }}>
                清除
              </button>
            )}
            <button onClick={() => { stopRecording(); setIsOnPage(false); setSegments([]); segsRef.current = [] }}
              className="text-xs transition-colors px-3 py-1.5 rounded-lg"
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
            <div style={{ width: CONTAINER_SIZE, height: CONTAINER_SIZE }} />
            <div style={{ textAlign: 'center' }}>
              <p className="animate-shimmer-text font-medium" style={{
                fontSize: 15, letterSpacing: '0.04em',
                background: 'linear-gradient(90deg, #60a5fa 0%, #a78bfa 40%, #22d3ee 70%, #60a5fa 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>点击麦克风开始</p>
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 6, letterSpacing: '0.02em' }}>
                实时英语同声传译
              </p>
            </div>
          </div>

          {/* Subtitles */}
          <div className="h-full overflow-y-auto" style={{
            opacity: isRecording || segments.length > 0 ? 1 : 0,
            transition: 'opacity 400ms ease-out',
            paddingBottom: `${CONTAINER_SIZE + CORNER_GAP + 24}px`,
            paddingRight: `${CONTAINER_SIZE + CORNER_GAP + 24}px`,
          }}>
            {segments.length === 0 && !interim ? (
              <div className="h-full flex items-center justify-center">
                <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: 14 }}>说话后字幕将出现在这里…</p>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-5">
                {history.map((seg, idx) => {
                  const age = history.length - idx
                  const opacity = Math.max(0.15, 0.6 - age * 0.07)
                  return (
                    <div key={seg.id} style={{ opacity }}>
                      <p className="font-mono mb-1 line-clamp-1" style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>{seg.english}</p>
                      <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.72)', lineHeight: 1.4 }}>{seg.chinese}</p>
                    </div>
                  )
                })}
                {latest && (
                  <div className="animate-fade-up">
                    <p className="font-mono mb-2 line-clamp-2" style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{latest.english}</p>
                    <p className="font-medium" style={{
                      fontSize: 'clamp(20px, 2.8vw, 30px)',
                      lineHeight: 1.35,
                      color: latest.isStreaming ? '#93c5fd' : '#f1f5f9',
                      transition: 'color 0.3s',
                    }}>
                      {latest.chinese}
                      {latest.isStreaming && (
                        <span className="animate-blink inline-block ml-1 align-middle"
                          style={{ width: 2, height: '0.85em', background: '#60a5fa', borderRadius: 1 }} />
                      )}
                    </p>
                  </div>
                )}
                {interim && (
                  <p className="italic font-mono" style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>"{interim}…"</p>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating mic */}
      <div style={{
        position: 'fixed', top: 0, left: 0, zIndex: 50,
        width: CONTAINER_SIZE, height: CONTAINER_SIZE,
        transform: micTransform,
        transition: 'transform 550ms cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: 'none',
      }}>
        <div style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}>
          <MicVisualizer level={audioLevel} isRecording={isRecording} status={status} onClick={toggleMic} />
        </div>
      </div>
    </>
  )
}
