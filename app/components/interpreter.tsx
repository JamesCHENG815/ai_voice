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

// Container always 200×200; mic button size animates inside it
const CONTAINER_SIZE = 200
const MIC_SIZE_IDLE = 120
const MIC_SIZE_ACTIVE = 64
const CORNER_GAP = 20

// ── Icons ─────────────────────────────────────────────────────────────────
function MicIcon({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="8" y1="22" x2="16" y2="22"/>
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
    <span className="font-bold tracking-tight select-none" style={{
      fontSize: size,
      background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 60%, #06b6d4 100%)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      letterSpacing: '-0.03em',
    }}>聆译</span>
  )
}

// ── Gradient mic icon (for idle state) ───────────────────────────────────
function GradientMicIcon({ size = 44 }: { size?: number }) {
  const id = 'mic-g'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={id} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#60a5fa" />
          <stop offset="50%"  stopColor="#818cf8" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"
        stroke={`url(#${id})`} strokeWidth="1.7"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"
        stroke={`url(#${id})`} strokeWidth="1.7"/>
      <line x1="12" y1="19" x2="12" y2="22" stroke={`url(#${id})`} strokeWidth="1.7"/>
      <line x1="8"  y1="22" x2="16" y2="22" stroke={`url(#${id})`} strokeWidth="1.7"/>
    </svg>
  )
}

// ── Mic visualizer ────────────────────────────────────────────────────────
// Always 200×200 container. Mic button and rings transition inside it.
function MicVisualizer({
  level, isRecording, status, onClick,
}: {
  level: number; isRecording: boolean; status: Status; onClick: () => void
}) {
  const isProcessing = status === 'processing'
  const accent = isProcessing ? '217,119,6' : '37,99,235'
  const bg     = isProcessing ? '#d97706'   : 'linear-gradient(145deg,#3b82f6,#6d28d9)'
  const micSize = isRecording ? MIC_SIZE_ACTIVE : MIC_SIZE_IDLE

  return (
    <div style={{ width: CONTAINER_SIZE, height: CONTAINER_SIZE, position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

      {/* Idle decorative ring — breathes slowly, hidden when recording */}
      <div className="animate-idle-pulse" style={{
        position: 'absolute',
        width: 168, height: 168,
        borderRadius: '50%',
        border: '1.5px solid rgba(99,102,241,0.35)',
        background: 'rgba(99,102,241,0.04)',
        opacity: isRecording ? 0 : 1,
        transition: 'opacity 400ms ease-out',
        pointerEvents: 'none',
      }} />

      {/* Audio-reactive Ring 3 — outermost (190px) */}
      <div style={{
        position: 'absolute',
        width: 190, height: 190,
        borderRadius: '50%',
        background: `rgba(${accent},${isRecording ? 0.03 + level * 0.05 : 0})`,
        border: `1.5px solid rgba(${accent},${isRecording ? 0.07 + level * 0.13 : 0})`,
        transform: `scale(${isRecording ? 1 + level * 0.14 : 0.6})`,
        opacity: isRecording ? 1 : 0,
        transition: 'transform 120ms ease-out, opacity 450ms ease-out, background 120ms',
      }} />

      {/* Audio-reactive Ring 2 — middle (140px) */}
      <div style={{
        position: 'absolute',
        width: 140, height: 140,
        borderRadius: '50%',
        background: `rgba(${accent},${isRecording ? 0.06 + level * 0.09 : 0})`,
        border: `1.5px solid rgba(${accent},${isRecording ? 0.12 + level * 0.22 : 0})`,
        transform: `scale(${isRecording ? 1 + level * 0.11 : 0.6})`,
        opacity: isRecording ? 1 : 0,
        transition: 'transform 80ms ease-out, opacity 450ms ease-out, background 80ms',
      }} />

      {/* Audio-reactive Ring 1 — inner (100px) */}
      <div style={{
        position: 'absolute',
        width: 100, height: 100,
        borderRadius: '50%',
        background: `rgba(${accent},${isRecording ? 0.09 + level * 0.13 : 0})`,
        border: `1.5px solid rgba(${accent},${isRecording ? 0.18 + level * 0.32 : 0})`,
        transform: `scale(${isRecording ? 1 + level * 0.08 : 0.6})`,
        opacity: isRecording ? 1 : 0,
        transition: 'transform 55ms ease-out, opacity 450ms ease-out, background 55ms',
      }} />

      {/* Mic button */}
      <button
        onClick={onClick}
        title={isRecording ? '点击停止' : '点击开始'}
        style={{
          position: 'relative', zIndex: 10,
          width: micSize, height: micSize,
          borderRadius: '50%',
          background: isRecording ? bg : 'linear-gradient(145deg, #eef2ff 0%, #faf5ff 50%, #eff6ff 100%)',
          border: isRecording ? 'none' : '1.5px solid rgba(139,92,246,0.15)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isRecording
            ? `0 0 0 6px rgba(${accent},0.10), 0 8px 32px rgba(${accent},${0.20 + level * 0.18})`
            : '0 4px 24px rgba(99,102,241,0.18), 0 1px 4px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
          transform: `scale(${isRecording ? 1 + level * 0.06 : 1})`,
          outline: 'none',
          transition: [
            'width 500ms cubic-bezier(0.4,0,0.2,1)',
            'height 500ms cubic-bezier(0.4,0,0.2,1)',
            'background 350ms',
            'box-shadow 100ms ease-out',
            'transform 80ms ease-out',
          ].join(', '),
        }}
      >
        {isRecording
          ? <MicIcon size={26} color="#ffffff" />
          : <GradientMicIcon size={46} />
        }
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

  // ── Audio engine ──────────────────────────────────────────────
  function startAudio(stream: MediaStream) {
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.8
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
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    setBars(new Array(BAR_COUNT).fill(0))
  }

  // ── Translation ───────────────────────────────────────────────
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

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6))
            if (msg.type === 'delta') {
              acc += msg.text
              setSegments(p => p.map(s => s.id === segId ? { ...s, chinese: acc } : s))
            }
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
          const m = cl.trim().match(/^CORRECTION:(\d+):(.+)$/)
          if (!m) continue
          const idx = parseInt(m[1], 10) - 1
          if (idx >= 0 && idx < done.length) {
            const tid = done[idx].id
            up = up.map(s => s.id === tid ? { ...s, chinese: m[2].trim() } : s)
          }
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

  // ── Recognition ───────────────────────────────────────────────
  function makeRecog() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return null
    const r = new SR(); r.lang = 'en-US'; r.continuous = true; r.interimResults = true
    r.onresult = (e: any) => {
      let itr = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const t = e.results[i][0].transcript.trim()
          if (t.length > 1) { translate(t); setInterim('') }
        } else { itr += e.results[i][0].transcript }
      }
      setInterim(itr)
    }
    r.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      setStatus('error'); setErrMsg(`识别错误: ${e.error}`)
    }
    r.onend = () => { if (recordingRef.current) { try { r.start() } catch {} } }
    return r
  }

  // ── Session control ───────────────────────────────────────────
  function enterPage() {
    setIsOnPage(true)
    setErrMsg('')
    setStatus('idle')
  }

  async function startRecording() {
    setErrMsg('')
    if (mode === 'mic') {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        startAudio(s)
        const r = makeRecog(); if (r) { recogRef.current = r; r.start() }
        setIsRecording(true); setStatus('listening')
      } catch {
        setStatus('error'); setErrMsg('无法访问麦克风，请检查权限')
      }
    } else {
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false } as MediaTrackConstraints,
        })
        const aTracks = s.getAudioTracks()
        if (!aTracks.length) {
          s.getTracks().forEach(t => t.stop())
          setStatus('error'); setErrMsg('未检测到系统音频，请勾选「共享音频」'); return
        }
        sysStreamRef.current = s
        startAudio(new MediaStream(aTracks))
        aTracks.forEach(t => { t.onended = () => { if (recordingRef.current) stopRecording() } })
        s.getVideoTracks().forEach(t => t.stop())
        const r = makeRecog(); if (r) { recogRef.current = r; r.start() }
        setIsRecording(true); setStatus('listening')
      } catch (err) {
        if ((err as Error).name !== 'NotAllowedError') {
          setStatus('error'); setErrMsg('无法获取系统音频')
        } else {
          setStatus('idle')
        }
      }
    }
  }

  function stopRecording() {
    setIsRecording(false); setStatus('idle'); setInterim('')
    recogRef.current?.abort(); recogRef.current = null
    sysStreamRef.current?.getTracks().forEach(t => t.stop()); sysStreamRef.current = null
    stopAudio()
  }

  function toggleMic() {
    if (isRecording) stopRecording(); else startRecording()
  }

  const latest  = segments[segments.length - 1]
  const history = segments.slice(0, -1)

  const statusColor: Record<Status, string> = {
    idle: '#cbd5e1', listening: '#16a34a', processing: '#d97706', error: '#dc2626',
  }
  const statusLabel: Record<Status, string> = {
    idle: '', listening: '监听中…', processing: '翻译中…', error: errMsg,
  }

  // ── Mic position transforms ───────────────────────────────────
  // Container is always CONTAINER_SIZE × CONTAINER_SIZE.
  // Not recording: fixed to center of page (offset slightly for header ~48px).
  // Recording: fixed to bottom-right corner.
  const half = CONTAINER_SIZE / 2
  const micTransform = isRecording
    ? `translate(calc(100vw - ${CONTAINER_SIZE + CORNER_GAP}px), calc(100vh - ${CONTAINER_SIZE + CORNER_GAP}px))`
    : `translate(calc(50vw - ${half}px), calc(50vh - ${half - 24}px))`

  // ════════════════════════════════════════════════════════════════
  // LANDING
  // ════════════════════════════════════════════════════════════════
  if (!isOnPage) {
    return (
      <div className="h-screen bg-white flex flex-col">
        <header className="flex-none flex items-center gap-3 px-6 py-4"
          style={{ borderBottom: '1px solid #f3f4f6' }}>
          <Logo size={20} />
          <span className="text-gray-300" style={{ fontSize: 13, fontWeight: 300 }}>|</span>
          <span className="text-gray-400 text-xs">您忠实的 AI 同声传译助手</span>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
          <div className="text-center">
            <h1 className="font-bold mb-2" style={{
              fontSize: 52, letterSpacing: '-0.04em', lineHeight: 1,
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 55%, #06b6d4 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>聆译</h1>
            <p className="text-gray-400 text-sm tracking-wide">您忠实的 AI 同声传译助手</p>
          </div>

          <div className="flex gap-4">
            {(['mic', 'system'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className="flex flex-col items-center justify-center gap-3 transition-all duration-150"
                style={{
                  width: 168, height: 148, borderRadius: 16,
                  border: `2px solid ${mode === m ? '#3b82f6' : '#e5e7eb'}`,
                  background: mode === m ? '#eff6ff' : '#fff',
                  color: mode === m ? '#2563eb' : '#6b7280',
                }}
              >
                {m === 'mic' ? <MicIcon size={30} /> : <MonitorIcon size={30} />}
                <div className="text-center">
                  <p className="font-semibold text-sm">{m === 'mic' ? '麦克风' : '系统音频'}</p>
                  <p className="text-xs opacity-60 mt-0.5">{m === 'mic' ? '实时语音识别' : '捕获屏幕声音'}</p>
                </div>
              </button>
            ))}
          </div>

          <button onClick={enterPage} disabled={!hasSR}
            className="flex items-center justify-center gap-2.5 font-semibold text-sm text-white
              transition-colors duration-150 disabled:opacity-40"
            style={{ width: 352, height: 48, borderRadius: 24, background: '#2563eb' }}
            onMouseEnter={e => { if (hasSR) (e.currentTarget as HTMLButtonElement).style.background = '#1d4ed8' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2563eb' }}
          >
            <PlayIcon /> 进入翻译
          </button>

          {!hasSR && <p className="text-red-500 text-sm -mt-4">请使用 Chrome 或 Edge 浏览器</p>}
          {mode === 'system' && (
            <p className="text-gray-400 text-xs text-center max-w-xs -mt-4">
              启动后请在弹窗中勾选「共享系统音频」选项
            </p>
          )}
          {errMsg && <p className="text-red-500 text-sm -mt-4">{errMsg}</p>}
        </main>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  // ACTIVE PAGE
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="h-screen bg-white flex flex-col">

      {/* Header */}
      <header className="flex-none flex items-center justify-between px-6 py-3"
        style={{ borderBottom: '1px solid #f3f4f6' }}>
        <div className="flex items-center gap-3">
          <Logo size={18} />
          <span className="text-gray-300" style={{ fontSize: 12, fontWeight: 300 }}>|</span>
          <span className="text-gray-400 text-xs">您忠实的 AI 同声传译助手</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Status chip */}
          {status !== 'idle' && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{
              background: status === 'error' ? '#fef2f2' : status === 'processing' ? '#fffbeb' : '#f0fdf4',
              color: statusColor[status],
            }}>
              {statusLabel[status]}
            </span>
          )}
          {segments.length > 0 && (
            <button onClick={() => { setSegments([]); segsRef.current = [] }}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors
                px-3 py-1.5 rounded-lg hover:bg-gray-50">
              清除
            </button>
          )}
          <button
            onClick={() => { stopRecording(); setIsOnPage(false); setSegments([]); segsRef.current = [] }}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors
              px-3 py-1.5 rounded-lg hover:bg-gray-50">
            返回
          </button>
        </div>
      </header>

      {/* Page body */}
      <div className="flex-1 relative overflow-hidden">

        {/* When not recording: centered hint text */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16,
          opacity: isRecording ? 0 : 1,
          transition: 'opacity 300ms ease-out',
          pointerEvents: 'none',
        }}>
          {/* Ghost space — match full container so text clears the outer ring */}
          <div style={{ width: CONTAINER_SIZE, height: CONTAINER_SIZE }} />
          <div style={{ textAlign: 'center' }}>
            <p className="animate-shimmer-text font-medium" style={{
              fontSize: 15,
              background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 40%, #06b6d4 70%, #3b82f6 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '0.04em',
            }}>点击麦克风开始</p>
            <p style={{ color: '#cbd5e1', fontSize: 12, marginTop: 6, letterSpacing: '0.02em' }}>
              实时英语同声传译
            </p>
          </div>
        </div>

        {/* Subtitles — fade in when recording starts */}
        <div className="h-full overflow-y-auto" style={{
          opacity: isRecording || segments.length > 0 ? 1 : 0,
          transition: 'opacity 400ms ease-out',
          // bottom-right padding so subtitles don't hide behind corner mic
          paddingBottom: `${CONTAINER_SIZE + CORNER_GAP + 24}px`,
          paddingRight: `${CONTAINER_SIZE + CORNER_GAP + 24}px`,
        }}>
          {segments.length === 0 && !interim ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm" style={{ color: '#d1d5db' }}>说话后字幕将出现在这里…</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-5">
              {history.map((seg, idx) => {
                const age = history.length - idx
                const opacity = Math.max(0.2, 0.7 - age * 0.07)
                return (
                  <div key={seg.id} style={{ opacity }}>
                    <p className="text-[11px] text-gray-400 font-mono mb-1 line-clamp-1">{seg.english}</p>
                    <p className="text-lg text-gray-700 leading-snug">{seg.chinese}</p>
                  </div>
                )
              })}
              {latest && (
                <div className="animate-fade-up">
                  <p className="text-xs text-gray-400 font-mono mb-2 line-clamp-2">{latest.english}</p>
                  <p className="font-medium leading-snug" style={{
                    fontSize: 'clamp(20px, 2.8vw, 30px)',
                    color: latest.isStreaming ? '#2563eb' : '#111827',
                    transition: 'color 0.3s',
                  }}>
                    {latest.chinese}
                    {latest.isStreaming && (
                      <span className="animate-blink inline-block ml-1 align-middle"
                        style={{ width: 2, height: '0.85em', background: '#2563eb', borderRadius: 1 }} />
                    )}
                  </p>
                </div>
              )}
              {interim && (
                <p className="text-xs text-gray-400 italic font-mono">"{interim}…"</p>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* ── Floating mic — animates between center and corner ── */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0,
        width: CONTAINER_SIZE,
        height: CONTAINER_SIZE,
        transform: micTransform,
        transition: 'transform 550ms cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 50,
        pointerEvents: 'none',
      }}>
        {/* Wrapper restores pointer events just for the inner area */}
        <div style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}>
          <MicVisualizer
            level={audioLevel}
            isRecording={isRecording}
            status={status}
            onClick={toggleMic}
          />
        </div>
      </div>
    </div>
  )
}
