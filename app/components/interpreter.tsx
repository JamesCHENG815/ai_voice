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

const BAR_COUNT = 40
const CONTEXT_WINDOW = 5

// ── Frequency bar visualizer ──────────────────────────────────────────────
function AudioBars({ bars, active }: { bars: number[]; active: boolean }) {
  return (
    <div className="flex items-center gap-[2px]" style={{ height: 36 }}>
      {bars.map((h, i) => (
        <div
          key={i}
          className="rounded-full flex-none"
          style={{
            width: 2,
            height: `${Math.max(2, h * 36)}px`,
            background: active
              ? `rgba(96,165,250,${0.4 + h * 0.6})`
              : 'rgba(255,255,255,0.08)',
            transition: 'height 70ms ease-out, background 200ms',
          }}
        />
      ))}
    </div>
  )
}

// ── Pulsing live dot ──────────────────────────────────────────────────────
function LiveDot({ status }: { status: Status }) {
  const colors: Record<Status, string> = {
    idle:       '#52525b',
    listening:  '#34d399',
    processing: '#fbbf24',
    error:      '#f87171',
  }
  const glow: Record<Status, string> = {
    idle:       'none',
    listening:  '0 0 8px 2px rgba(52,211,153,.5)',
    processing: '0 0 8px 2px rgba(251,191,36,.5)',
    error:      '0 0 8px 2px rgba(248,113,113,.5)',
  }
  const pulse = status === 'listening' || status === 'processing'
  return (
    <span
      className={pulse ? 'animate-pulse' : ''}
      style={{
        display: 'inline-block',
        width: 8, height: 8,
        borderRadius: '50%',
        background: colors[status],
        boxShadow: glow[status],
        flexShrink: 0,
      }}
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function Interpreter() {
  const [mode, setMode]           = useState<Mode>('mic')
  const [isActive, setIsActive]   = useState(false)
  const [segments, setSegments]   = useState<Segment[]>([])
  const [interim, setInterim]     = useState('')
  const [status, setStatus]       = useState<Status>('idle')
  const [errMsg, setErrMsg]       = useState('')
  const [bars, setBars]           = useState<number[]>(new Array(BAR_COUNT).fill(0))
  const [hasSR, setHasSR]         = useState(true)

  const recogRef      = useRef<any>(null)
  const audioCtxRef   = useRef<AudioContext | null>(null)
  const analyserRef   = useRef<AnalyserNode | null>(null)
  const sysStreamRef  = useRef<MediaStream | null>(null)
  const rafRef        = useRef<number>(0)
  const segsRef       = useRef<Segment[]>([])
  const activeRef     = useRef(false)
  const bottomRef     = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments])

  // ── Audio engine ────────────────────────────────────────────
  function startAudio(stream: MediaStream) {
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.75
    ctx.createMediaStreamSource(stream).connect(analyser)

    const data = new Uint8Array(analyser.frequencyBinCount)
    audioCtxRef.current = ctx
    analyserRef.current = analyser

    const step = Math.floor(data.length / BAR_COUNT)
    function tick() {
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
      .filter(s => !s.isStreaming && s.chinese)
      .slice(-CONTEXT_WINDOW)
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

      // Parse optional corrections
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
        segsRef.current = up
        return up
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSegments(p => p.map(s => s.id === segId ? { ...s, chinese: `[错误: ${msg}]`, isStreaming: false } : s))
      setStatus('error')
      setErrMsg(msg)
      return
    }

    if (activeRef.current) setStatus('listening')
  }, [])

  // ── Speech recognition ──────────────────────────────────────
  function makeRecognition() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return null
    const r = new SR()
    r.lang = 'en-US'
    r.continuous = true
    r.interimResults = true

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
      setStatus('error'); setErrMsg(`语音识别: ${e.error}`)
    }
    r.onend = () => { if (activeRef.current) { try { r.start() } catch {} } }
    return r
  }

  // ── Session control ─────────────────────────────────────────
  async function start() {
    setIsActive(true); setErrMsg(''); setStatus('listening')

    if (mode === 'mic') {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        startAudio(s)
        const r = makeRecognition(); if (r) { recogRef.current = r; r.start() }
      } catch {
        setStatus('error'); setErrMsg('无法访问麦克风，请检查权限'); setIsActive(false)
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
          setStatus('error'); setErrMsg('未检测到系统音频，请勾选「共享音频」'); setIsActive(false)
          return
        }
        sysStreamRef.current = s
        startAudio(new MediaStream(aTracks))
        aTracks.forEach(t => { t.onended = () => { if (activeRef.current) stop() } })
        s.getVideoTracks().forEach(t => t.stop())
        const r = makeRecognition(); if (r) { recogRef.current = r; r.start() }
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

  // ── Derived values ──────────────────────────────────────────
  const latest = segments[segments.length - 1]
  const history = segments.slice(0, -1)

  // ── Render ──────────────────────────────────────────────────
  return (
    <div
      className="h-screen flex flex-col overflow-hidden select-none"
      style={{ background: 'linear-gradient(160deg,#07090f 0%,#0a0d18 60%,#080b14 100%)' }}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <header
        className="flex-none flex items-center gap-3 px-6 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
      >
        <LiveDot status={status} />
        <span className="font-semibold text-sm text-white/90 tracking-tight">聆译</span>
        <span className="text-xs text-white/25 hidden sm:block">英语 → 中文 · 实时同声传译</span>

        <div className="ml-auto flex items-center gap-2">
          {/* Mode toggle */}
          <div
            className="flex text-xs overflow-hidden"
            style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {(['mic', 'system'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { if (!isActive) setMode(m) }}
                disabled={isActive}
                className="px-3 py-1.5 transition-all duration-150 disabled:cursor-not-allowed"
                style={{
                  background: mode === m ? 'rgba(59,130,246,0.7)' : 'rgba(255,255,255,0.03)',
                  color: mode === m ? '#fff' : 'rgba(255,255,255,0.4)',
                }}
              >
                {m === 'mic' ? '🎤 麦克风' : '🖥️ 系统音频'}
              </button>
            ))}
          </div>

          {/* Start / Stop */}
          <button
            onClick={isActive ? stop : start}
            disabled={!hasSR}
            className="px-4 py-1.5 text-xs font-semibold transition-all duration-150 disabled:opacity-30"
            style={{
              borderRadius: 8,
              background: isActive ? 'rgba(239,68,68,0.75)' : 'rgba(59,130,246,0.75)',
              color: '#fff',
            }}
          >
            {isActive ? '■ 停止' : '▶ 开始翻译'}
          </button>

          {/* Clear */}
          {segments.length > 0 && !isActive && (
            <button
              onClick={() => { setSegments([]); segsRef.current = [] }}
              className="px-3 py-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
              style={{ borderRadius: 8 }}
            >
              清除
            </button>
          )}
        </div>
      </header>

      {/* ── Scrollable history ─────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6" style={{ scrollBehavior: 'smooth' }}>
        {history.length === 0 && !latest && !interim ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-white/15">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <div className="text-center text-sm leading-6">
              <p className="text-white/20 text-base font-medium">聆译</p>
              <p className="text-white/12 mt-1">选择输入模式，点击「开始翻译」</p>
              <p className="text-white/10">支持 Chrome / Edge 浏览器</p>
            </div>
            {!hasSR && (
              <p className="text-red-400/60 text-xs">当前浏览器不支持语音识别，请使用 Chrome 或 Edge</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {history.map((seg, idx) => {
              const age = history.length - idx
              const opacity = Math.max(0.12, 0.55 - age * 0.05)
              return (
                <div key={seg.id} style={{ opacity }}>
                  <p className="text-[11px] text-white/30 font-mono mb-0.5 line-clamp-1">
                    {seg.english}
                  </p>
                  <p className="text-xl text-white/80 leading-snug">{seg.chinese}</p>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Current subtitle strip ──────────────────────── */}
      <div
        className="flex-none"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)' }}
      >
        {/* Interim transcription */}
        {interim && (
          <p className="px-8 pt-3 text-xs text-white/30 font-mono italic truncate">
            {interim}…
          </p>
        )}

        {/* Main subtitle */}
        {latest && (
          <div className="px-8 pt-4 pb-2">
            <p className="text-xs text-white/35 font-mono mb-2 truncate">{latest.english}</p>
            <p
              className="font-medium leading-tight"
              style={{
                fontSize: 'clamp(24px, 3.5vw, 40px)',
                color: latest.isStreaming ? '#fcd34d' : '#ffffff',
                transition: 'color 0.3s',
                letterSpacing: '0.01em',
              }}
            >
              {latest.chinese || (latest.isStreaming ? '' : '')}
              {latest.isStreaming && (
                <span
                  className="inline-block ml-1 animate-blink"
                  style={{ width: 2, height: '0.9em', background: '#fcd34d', verticalAlign: 'middle', borderRadius: 1 }}
                />
              )}
            </p>
          </div>
        )}

        {/* Waveform + status */}
        <div className="px-8 py-3 flex items-center justify-between">
          <AudioBars bars={bars} active={isActive} />
          <div className="flex items-center gap-3 text-[11px]">
            {status === 'listening'  && <span style={{ color: 'rgba(52,211,153,0.7)' }}>监听中</span>}
            {status === 'processing' && <span style={{ color: 'rgba(251,191,36,0.7)' }}>翻译中</span>}
            {status === 'error'      && <span style={{ color: 'rgba(248,113,113,0.8)' }}>{errMsg}</span>}
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>{segments.length} 条字幕</span>
          </div>
        </div>
      </div>

      {/* System audio tip (shown only when that mode is selected but not active) */}
      {mode === 'system' && !isActive && (
        <div
          className="absolute bottom-24 left-4 right-4 text-xs leading-5 rounded-xl px-4 py-3"
          style={{
            background: 'rgba(30,58,138,0.55)',
            border: '1px solid rgba(96,165,250,0.2)',
            color: 'rgba(147,197,253,0.85)',
            backdropFilter: 'blur(10px)',
          }}
        >
          启动后在弹窗中选择要共享的标签页或窗口，并勾选
          <strong style={{ color: 'rgba(196,219,255,1)' }}>「共享系统音频」</strong>。
          语音识别仍通过麦克风进行 — 配合虚拟声卡（如 VB-Cable）可实现全自动识别。
        </div>
      )}
    </div>
  )
}
