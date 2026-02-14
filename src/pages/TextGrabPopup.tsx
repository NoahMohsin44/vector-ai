import { useEffect, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Loader2, Copy, Check, Type } from 'lucide-react'

export function TextGrabPopup() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const hasExtractedRef = useRef(false)

  useEffect(() => {
    requestAnimationFrame(() => {
      setIsVisible(true)
    })

    if (!hasExtractedRef.current) {
      hasExtractedRef.current = true
      extractText()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const extractText = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await window.electronAPI?.extractText()

      if (!response) {
        setError('Could not connect to extraction service')
        return
      }

      if (!response.success) {
        setError(response.error || 'Text extraction failed')
        return
      }

      if (response.data) {
        setExtractedText(response.data.text)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(() => {
      window.electronAPI?.closePopup()
    }, 150)
  }

  const handleCopyText = async () => {
    if (!extractedText) return

    try {
      await window.electronAPI?.writeClipboard(extractedText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="w-screen h-screen bg-[#0a0a0a] overflow-hidden">
      <div
        className={cn(
          "w-full h-full bg-[#0a0a0a] border border-white/10 shadow-2xl overflow-hidden transition-all duration-150 rounded-lg flex flex-col",
          isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        {/* Header - Draggable */}
        <div
          className="px-4 py-3 border-b border-white/10 flex items-center justify-between cursor-move shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <span className="text-sm font-medium text-white flex items-center gap-2">
            <Type className="w-4 h-4" />
            Text Grab
          </span>
          <button
            onClick={handleClose}
            className="text-white/50 hover:text-white transition-colors text-xs"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            ESC to close
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-white/60" />
              <div className="text-sm text-white/70">Extracting text...</div>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center py-6 gap-3">
              <div className="text-red-400 text-sm font-medium">Extraction Failed</div>
              <div className="text-xs text-white/50 text-center px-4">{error}</div>
              <button
                onClick={extractText}
                className="mt-2 px-4 py-2 text-sm text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : extractedText ? (
            <div className="flex-1 overflow-hidden flex flex-col p-4 gap-3">
              <div className="flex items-center justify-between shrink-0">
                <div className="text-xs text-white/50">Extracted Text</div>
                <button
                  onClick={handleCopyText}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors",
                    copied
                      ? "bg-green-500/20 text-green-400"
                      : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                  )}
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 bg-white/5 rounded-lg border border-white/10">
                <pre className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap font-mono">
                  {extractedText}
                </pre>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleClose}
                  className="flex-1 px-3 py-2 text-sm bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-white"
                >
                  Close
                </button>
                <button
                  onClick={handleCopyText}
                  className="flex-1 px-3 py-2 text-sm bg-white text-black hover:bg-white/90 rounded-lg transition-colors font-medium"
                >
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
