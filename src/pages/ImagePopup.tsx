import { useEffect, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Loader2, Copy, Check, Image, Send } from 'lucide-react'

interface ImageAnalysisResult {
  description: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Improved markdown parser for bold, italic, and combinations
function formatMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []

  lines.forEach((line, lineIndex) => {
    // Process the line for markdown patterns
    // Order matters: process longer patterns first
    const formatted = processLine(line, lineIndex)

    result.push(
      <span key={lineIndex}>
        {formatted}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    )
  })

  return result
}

function processLine(line: string, lineIndex: number): React.ReactNode[] {
  const result: React.ReactNode[] = []
  let remaining = line
  let partIndex = 0

  while (remaining.length > 0) {
    // Try to match patterns in order of specificity

    // Bold + Italic (***text*** or ___text___)
    const boldItalicMatch = remaining.match(/^(\*\*\*|___)(.+?)\1/)
    if (boldItalicMatch) {
      result.push(
        <strong key={`${lineIndex}-${partIndex}`} className="font-semibold italic text-white">
          {boldItalicMatch[2]}
        </strong>
      )
      remaining = remaining.slice(boldItalicMatch[0].length)
      partIndex++
      continue
    }

    // Bold (**text** or __text__)
    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/)
    if (boldMatch) {
      result.push(
        <strong key={`${lineIndex}-${partIndex}`} className="font-semibold text-white">
          {boldMatch[2]}
        </strong>
      )
      remaining = remaining.slice(boldMatch[0].length)
      partIndex++
      continue
    }

    // Italic (*text* or _text_) - but not inside words for underscores
    const italicMatch = remaining.match(/^(\*|_)(.+?)\1/)
    if (italicMatch) {
      result.push(
        <em key={`${lineIndex}-${partIndex}`} className="italic">
          {italicMatch[2]}
        </em>
      )
      remaining = remaining.slice(italicMatch[0].length)
      partIndex++
      continue
    }

    // No pattern matched, take one character and continue
    const nextSpecial = remaining.slice(1).search(/[\*_]/)
    if (nextSpecial === -1) {
      // No more special characters, take the rest
      result.push(remaining)
      break
    } else {
      // Take up to the next special character
      result.push(remaining.slice(0, nextSpecial + 1))
      remaining = remaining.slice(nextSpecial + 1)
      partIndex++
    }
  }

  return result
}

export function ImagePopup() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImageAnalysisResult | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatLoading, setIsChatLoading] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const hasAnalyzedRef = useRef(false)

  useEffect(() => {
    // Trigger animation
    requestAnimationFrame(() => {
      setIsVisible(true)
    })

    // Start the analysis (guard against StrictMode double-mount)
    if (!hasAnalyzedRef.current) {
      hasAnalyzedRef.current = true
      analyzeImage()
    }

    // Handle escape key to close
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [chatMessages])

  const analyzeImage = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await window.electronAPI?.analyzeImageWithSelection()

      if (!response) {
        setError('Could not connect to analysis service')
        return
      }

      if (!response.success) {
        setError(response.error || 'Analysis failed')
        return
      }

      if (response.data) {
        setResult({
          description: response.data.description
        })
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

  const handleCopyDescription = async () => {
    if (!result?.description) return

    try {
      await window.electronAPI?.writeClipboard(result.description)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleSendChat = async () => {
    if (!chatInput.trim() || isChatLoading || !result) return

    const userMessage = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsChatLoading(true)

    try {
      const response = await window.electronAPI?.refineImageDescription(
        result.description,
        userMessage,
        chatMessages
      )

      if (response?.success && response.data) {
        const newDescription = response.data.description
        setResult({ description: newDescription })
        setChatMessages(prev => [...prev, { role: 'assistant', content: 'Updated the description based on your feedback.' }])
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: response?.error || 'Failed to refine description.' }])
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'An error occurred.' }])
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendChat()
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
            <Image className="w-4 h-4" />
            Image Analysis
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
              <div className="text-sm text-white/70">Analyzing image...</div>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center py-6 gap-3">
              <div className="text-red-400 text-sm font-medium">Analysis Failed</div>
              <div className="text-xs text-white/50 text-center px-4">{error}</div>
              <button
                onClick={analyzeImage}
                className="mt-2 px-4 py-2 text-sm text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : result ? (
            <div className="flex-1 overflow-hidden flex flex-col p-4 gap-3">
              {/* Description Header */}
              <div className="flex items-center justify-between shrink-0">
                <div className="text-xs text-white/50">AI-Friendly Description</div>
                <button
                  onClick={handleCopyDescription}
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

              {/* Description Content */}
              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-3 bg-white/5 rounded-lg border border-white/10"
              >
                <div className="text-sm text-white/90 leading-relaxed">
                  {formatMarkdown(result.description)}
                </div>

                {/* Chat Messages */}
                {chatMessages.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "text-xs px-3 py-2 rounded-lg",
                          msg.role === 'user'
                            ? "bg-blue-500/20 text-blue-200 ml-8"
                            : "bg-white/5 text-white/70 mr-8"
                        )}
                      >
                        {msg.content}
                      </div>
                    ))}
                    {isChatLoading && (
                      <div className="flex items-center gap-2 text-white/50 text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Refining...
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="shrink-0 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask to refine the description..."
                  className="flex-1 px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                  disabled={isChatLoading}
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || isChatLoading}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleClose}
                  className="flex-1 px-3 py-2 text-sm bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-white"
                >
                  Close
                </button>
                <button
                  onClick={handleCopyDescription}
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
