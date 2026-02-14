import { useEffect, useState, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'

type Phase = 'connecting' | 'recording' | 'transcribing' | 'error'

// Bright monochrome spectrum bars
function Spectrum({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    if (!analyser || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const freqData = new Uint8Array(analyser.frequencyBinCount)

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(freqData)

      const dpr = window.devicePixelRatio || 1
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)

      const bars = 20
      const gap = 1.5
      const bw = (w - (bars - 1) * gap) / bars
      const cy = h / 2

      for (let i = 0; i < bars; i++) {
        const di = Math.floor((i + 1) * (analyser.frequencyBinCount * 0.5 / bars))
        const v = freqData[di] / 255
        const bh = Math.max(1.5, v * h * 0.85)
        const x = i * (bw + gap)
        const alpha = 0.5 + v * 0.5
        ctx.fillStyle = `rgba(255,255,255,${alpha})`
        ctx.beginPath()
        ctx.roundRect(x, cy - bh / 2, bw, bh, bw / 2)
        ctx.fill()
      }
    }
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [analyser])

  return <canvas ref={canvasRef} className="w-full h-full" />
}

export function SpeechPopup() {
  const [phase, setPhase] = useState<Phase>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [statusText, setStatusText] = useState('')
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const stoppedRef = useRef(false)

  const handleClose = useCallback(() => {
    setTimeout(() => window.electronAPI?.closePopup(), 50)
  }, [])

  const stopAndTranscribe = useCallback(async () => {
    if (stoppedRef.current) return
    stoppedRef.current = true
    console.log('[Speech] stopAndTranscribe called')

    // Stop recorder
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve()
        rec.stop()
      })
    }

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    console.log('[Speech] Blob created, size:', blob.size, 'chunks:', chunksRef.current.length)

    // Stop mic + audio context
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
    setAnalyserNode(null)

    setPhase('transcribing')
    setStatusText('Processing...')

    // Safety timeout
    const safetyTimer = setTimeout(() => {
      console.error('[Speech] Timed out after 60s')
      handleClose()
    }, 60000)

    try {
      if (blob.size < 100) throw new Error('No audio captured')

      // Decode webm → PCM
      console.log('[Speech] Decoding audio...')
      const decodeCtx = new AudioContext()
      const arrayBuf = await blob.arrayBuffer()
      const audioBuf = await decodeCtx.decodeAudioData(arrayBuf)
      const mono = audioBuf.getChannelData(0)
      const sampleRate = audioBuf.sampleRate
      console.log('[Speech] Decoded: sampleRate=', sampleRate, 'samples=', mono.length, 'duration=', (mono.length / sampleRate).toFixed(1), 's')
      decodeCtx.close()

      setStatusText('Transcribing...')

      // Send PCM to main process for Whisper transcription
      const pcmBuffer = mono.buffer.slice(mono.byteOffset, mono.byteOffset + mono.byteLength)
      console.log('[Speech] Sending', pcmBuffer.byteLength, 'bytes to main process...')
      const result = await window.electronAPI?.transcribeSpeech(pcmBuffer, sampleRate)
      console.log('[Speech] Got result:', JSON.stringify(result)?.substring(0, 200))

      if (!result?.success || !result.text) {
        throw new Error(result?.error || 'No speech detected')
      }

      clearTimeout(safetyTimer)
      console.log('[Speech] Calling typeSpeechResult with:', result.text.substring(0, 50))
      await window.electronAPI?.typeSpeechResult(result.text)
      // Safety net: main process closes the popup, but if the IPC response
      // makes it back before the window is torn down, close from here too.
      handleClose()
    } catch (err) {
      clearTimeout(safetyTimer)
      console.error('[Speech] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed')
      setPhase('error')
      setTimeout(() => handleClose(), 2500)
    }
  }, [handleClose])

  // Main effect: start recording with proper abort handling for StrictMode
  useEffect(() => {
    let cancelled = false
    stoppedRef.current = false
    chunksRef.current = []

    console.log('[Speech] Effect running, setting up recording...')

    const init = async () => {
      try {
        console.log('[Speech] Requesting microphone access...')

        let stream: MediaStream
        const savedMic = await window.electronAPI?.getSelectedMic()

        if (savedMic) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: { exact: savedMic }, echoCancellation: true, noiseSuppression: true }
            })
          } catch (micErr) {
            console.warn('[Speech] Saved mic failed, trying default:', micErr)
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true }
            })
          }
        } else {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true }
          })
        }

        if (cancelled) {
          console.log('[Speech] Cancelled during getUserMedia, cleaning up')
          stream.getTracks().forEach(t => t.stop())
          return
        }

        console.log('[Speech] Got mic stream, tracks:', stream.getAudioTracks().length)
        streamRef.current = stream

        const audioCtx = new AudioContext()
        await audioCtx.resume()
        audioCtxRef.current = audioCtx
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 128
        analyser.smoothingTimeConstant = 0.75
        source.connect(analyser)
        setAnalyserNode(analyser)

        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
        recorderRef.current = recorder
        chunksRef.current = []
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        recorder.start(200)

        setPhase('recording')
        console.log('[Speech] Recording started, waiting for stop signal...')
      } catch (err) {
        if (cancelled) return
        console.error('[Speech] Mic error:', err)
        setError(err instanceof Error ? err.message : 'Microphone access failed')
        setPhase('error')
        setTimeout(() => window.electronAPI?.closePopup(), 2500)
      }
    }
    init()

    // Poll main process every 150ms to check if we should stop recording
    const pollInterval = setInterval(async () => {
      if (stoppedRef.current || cancelled) return
      try {
        const shouldStop = await window.electronAPI?.shouldStopSpeech()
        if (shouldStop) {
          console.log('[Speech] Poll detected stop signal, calling stopAndTranscribe')
          stopAndTranscribe()
        }
      } catch (_) { /* ignore */ }
    }, 150)

    // Progress updates from main process (model download)
    window.electronAPI?.onSpeechProgress((message: string) => {
      setStatusText(message)
    })

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') window.electronAPI?.closePopup() }
    window.addEventListener('keydown', onKey)

    return () => {
      cancelled = true
      clearInterval(pollInterval)
      window.removeEventListener('keydown', onKey)
      window.electronAPI?.removeSpeechProgressListener()
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      audioCtxRef.current?.close()
      audioCtxRef.current = null
    }
  }, [])

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#0a0a0a]">
      <div className="w-full h-full bg-[#0a0a0a] flex items-center px-2.5 gap-2">
        {/* Connecting to mic */}
        {phase === 'connecting' && (
          <div className="flex-1 flex items-center justify-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-white/40 animate-pulse" />
            <div className="w-1 h-1 rounded-full bg-white/40 animate-pulse" style={{ animationDelay: '150ms' }} />
            <div className="w-1 h-1 rounded-full bg-white/40 animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
        )}

        {/* Recording: spectrum */}
        {phase === 'recording' && (
          <div className="flex-1 h-4 min-w-0">
            <Spectrum analyser={analyserNode} />
          </div>
        )}

        {/* Transcribing: spinner + status */}
        {phase === 'transcribing' && (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-white/50 shrink-0" />
            <span className="text-[9px] text-white/50 truncate">{statusText}</span>
          </>
        )}

        {/* Error */}
        {phase === 'error' && (
          <span className="text-[10px] text-red-400 truncate w-full text-center">{error}</span>
        )}
      </div>
    </div>
  )
}
