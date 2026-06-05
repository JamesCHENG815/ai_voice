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

// ── Icons ─────────────────────────────────────────────────────────────────
function MicIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  )
}

// ── Audio bars ─────────────────────────────────────────────────────────────
function AudioBars({ bars, active }: { bars: number[]; active: boolean }) {
  return (
    <div className="flex items-center gap-[2px]" style={{ height: 28 }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: 2.5,
          height: `${Math.max(2, h * 28)}px`,
          borderRadius: 2,
          background: active ? `rgba(37,99,235,${0.35 + h * 0.65})` : '#e5e7eb',
          transition: 'height 70ms ease-out',
        }} />
      ))}
    </div>
  )
}

// ── Status dot ────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: Status }) {
  const colors: Record<Status, string> = {
    idle: '#d1d5db', listening: '#16a34a', processing: '#d97706', error: '#dc2626',
  }
  return (
    <span className={status === 'listening' || status === 'processing' ? 'animate-pulse' : ''}
      style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: colors[status], flexShrink: 0 }} />
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function Interpreter() {
  const [mode, setMode]         = useState<Mode>('mic')
  const [isActive, setIsActive] = useState(false)
  const [segments, setSegments] = useState<Segment[]>([])
  const [interim, setInterim]   = useState('')
  const [status, setStatus]     = useState<Status>('idle')
  const [errMsg, setErrMsg]     = useState('')
  const [bars, setBars]         = useState<number[]>(new Array(BAR_COUNT).fill(0))
  const [hasSR, setHasSR]       = useState(true)

  const recogRef    = useRef<any>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sysStreamRef= useRef<MediaStream | null>(null)
  const rafRef      = useRef<number>(0)
  const segsRef     = useRef<Segment[]>([])
  const activeRef   = useRef(false)
  const bottomRef   = useRef<HTMLDivElement>(null)

  useEffect(() => { segsRef.current = segments }, [segments])
  useEffect(() => { activeRef.current = isActive }, [isActive])

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

  // ── Audio engine ────────────────────────────────────────────
  function startAudio(stream: MediaStream) {
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.78
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

  // ── Translation ─────────────────────────────────────────────
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      const allLines = acc.split('\n')
      const corrLines = allLines.filter(l => /^CORRECTION:\d+:/.test(l.trim()))
      const mainText = allLines.filter(l => !/^CORRECTION:\d+:/.test(l.trim())).join('\n').trim()

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
    if (activeRef.current) setStatus('listening')
  }, [])

  // ── Recognition ─────────────────────────────────────────────
  function makeRecog() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return null
    const r = new SR(); r.lang = 'en-US'; r.continuous = true; r.interimResults = true
    r.onresult = (e: any) => {
      let itr = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) { const t = e.results[i][0].transcript.trim(); if (t.length > 1) { translate(t); setInterim('') } }
        else itr += e.results[i][0].transcript
      }
      setInterim(itr)
    }
    r.onerror = (e: any) => { if (e.error === 'no-speech' || e.error === 'aborted') return; setStatus('error'); setErrMsg(`识别错误: ${e.error}`) }
    r.onend = () => { if (activeRef.current) { try { r.start() } catch {} } }
    return r
  }

  // ── Session ──────────────────────────────────────────────────
  async function start() {
    setIsActive(true); setErrMsg(''); setStatus('listening')
    if (mode === 'mic') {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        startAudio(s)
        const r = makeRecog(); if (r) { recogRef.current = r; r.start() }
      } catch { setStatus('error'); setErrMsg('无法访问麦克风，请检查权限'); setIsActive(false) }
    } else {
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({
          video: true, audio: { echoCancellation: false, noiseSuppression: false } as MediaTrackConstraints,
        })
        const aTracks = s.getAudioTracks()
        if (!aTracks.length) { s.getTracks().forEach(t => t.stop()); setStatus('error'); setErrMsg('未检测到系统音频，请勾选「共享音频」'); setIsActive(false); return }
        sysStreamRef.current = s
        startAudio(new MediaStream(aTracks))
        aTracks.forEach(t => { t.onended = () => { if (activeRef.current) stop() } })
        s.getVideoTracks().forEach(t => t.stop())
        const r = makeRecog(); if (r) { recogRef.current = r; r.start() }
      } catch (err) {
        if ((err as Error).name !== 'NotAllowedError') { setStatus('error'); setErrMsg('无法获取系统音频') }
        else setStatus('idle')
        setIsActive(false)
      }
    }
  }

  function stop() {
    setIsActive(false); setStatus('idle'); setInterim('')
    recogRef.current?.abort(); recogRef.current = null
    sysStreamRef.current?.getTracks().forEach(t => t.stop()); sysStreamRef.current = null
    stopAudio()
  }

  const latest  = segments[segments.length - 1]
  const history = segments.slice(0, -1)
  const showIdle = !isActive && segments.length === 0

  // ── Render: idle landing ─────────────────────────────────────
  if (showIdle) {
    return (
      <div className="h-screen bg-white flex flex-col">
        {/* Header */}
        <header className="flex-none flex items-center px-6 py-4" style={{ borderBottom: '1px solid #f3f4f6' }}>
          <span className="font-semibold text-gray-900 text-sm tracking-tight">聆译</span>
        </header>

        {/* Centered body */}
        <main className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
          {/* Title */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-1.5">聆译</h1>
            <p className="text-gray-400 text-sm">AI 实时英语同声传译</p>
          </div>

          {/* Mode cards */}
          <div className="flex gap-4">
            {/* Mic */}
            <button
              onClick={() => setMode('mic')}
              className="group flex flex-col items-center justify-center gap-3 transition-all duration-150"
              style={{
                width: 168, height: 148,
                borderRadius: 16,
                border: `2px solid ${mode === 'mic' ? '#3b82f6' : '#e5e7eb'}`,
                background: mode === 'mic' ? '#eff6ff' : '#fff',
                color: mode === 'mic' ? '#2563eb' : '#6b7280',
              }}
            >
              <MicIcon size={32} />
              <div className="text-center">
                <p className="font-semibold text-sm">麦克风</p>
                <p className="text-xs opacity-60 mt-0.5">实时语音识别</p>
              </div>
            </button>

            {/* System audio */}
            <button
              onClick={() => setMode('system')}
              className="group flex flex-col items-center justify-center gap-3 transition-all duration-150"
              style={{
                width: 168, height: 148,
                borderRadius: 16,
                border: `2px solid ${mode === 'system' ? '#3b82f6' : '#e5e7eb'}`,
                background: mode === 'system' ? '#eff6ff' : '#fff',
                color: mode === 'system' ? '#2563eb' : '#6b7280',
              }}
            >
              <MonitorIcon size={32} />
              <div className="text-center">
                <p className="font-semibold text-sm">系统音频</p>
                <p className="text-xs opacity-60 mt-0.5">捕获屏幕声音</p>
              </div>
            </button>
          </div>

          {/* Start button */}
          <button
            onClick={start}
            disabled={!hasSR}
            className="flex items-center justify-center gap-2.5 font-semibold text-sm text-white transition-all duration-150 disabled:opacity-40"
            style={{ width: 352, height: 48, borderRadius: 24, background: '#2563eb' }}
            onMouseEnter={e => { if (hasSR) (e.currentTarget as HTMLButtonElement).style.background = '#1d4ed8' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2563eb' }}
          >
            <PlayIcon />
            开始翻译
          </button>

          {!hasSR && (
            <p className="text-red-500 text-sm -mt-4">请使用 Chrome 或 Edge 浏览器</p>
          )}

          {mode === 'system' && (
            <p className="text-gray-400 text-xs text-center max-w-xs -mt-4">
              启动后请在弹窗中勾选「共享系统音频」选项
            </p>
          )}

          {errMsg && (
            <p className="text-red-500 text-sm -mt-4">{errMsg}</p>
          )}
        </main>
      </div>
    )
  }

  // ── Render: active / has segments ────────────────────────────
  return (
    <div className="h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="flex-none flex items-center justify-between px-6 py-3"
        style={{ borderBottom: '1px solid #f3f4f6' }}>
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="font-semibold text-gray-900 text-sm">聆译</span>
          <span className="text-xs text-gray-400 hidden sm:block">
            {status === 'listening' ? '监听中…' : status === 'processing' ? '翻译中…' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {segments.length > 0 && !isActive && (
            <button onClick={() => { setSegments([]); segsRef.current = [] }}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-50">
              清除记录
            </button>
          )}
          {!isActive && (
            <button onClick={start}
              className="px-4 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
              style={{ background: '#2563eb' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1d4ed8' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2563eb' }}>
              重新开始
            </button>
          )}
          {isActive && (
            <button onClick={stop}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
              style={{ background: '#dc2626' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#b91c1c' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#dc2626' }}>
              <StopIcon /> 停止
            </button>
          )}
        </div>
      </header>

      {/* Subtitle scroll area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
          {/* History (faded) */}
          {history.map((seg, idx) => {
            const age = history.length - idx
            const opacity = Math.max(0.18, 0.65 - age * 0.06)
            return (
              <div key={seg.id} style={{ opacity }}>
                <p className="text-xs text-gray-400 font-mono mb-1 line-clamp-1">{seg.english}</p>
                <p className="text-xl text-gray-700 leading-snug">{seg.chinese}</p>
              </div>
            )
          })}

          {/* Current segment */}
          {latest && (
            <div className="animate-fade-up">
              <p className="text-xs text-gray-400 font-mono mb-2 line-clamp-2">{latest.english}</p>
              <p className="leading-snug font-medium"
                style={{
                  fontSize: 'clamp(22px, 3vw, 32px)',
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

          {/* Interim text */}
          {interim && (
            <p className="text-sm text-gray-400 italic font-mono">{interim}…</p>
          )}

          {errMsg && (
            <p className="text-sm text-red-500">{errMsg}</p>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex-none flex items-center justify-between px-6 py-3"
        style={{ borderTop: '1px solid #f3f4f6' }}>
        <AudioBars bars={bars} active={isActive} />
        <span className="text-xs text-gray-300">{segments.length} 条字幕</span>
      </div>
    </div>
  )
}
