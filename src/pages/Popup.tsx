import { useEffect, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Loader2, Copy, Check } from 'lucide-react'
import { savePromptScore, getActiveSession } from '@/lib/supabase'

interface AnalysisResult {
  prompt: string
  score: number
  feedback: string
  improvedPrompt: string
  refinedScore: number
}

export function Popup() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const hasAnalyzedRef = useRef(false)

  useEffect(() => {
    // Trigger animation
    requestAnimationFrame(() => {
      setIsVisible(true)
    })

    // Start the analysis (guard against StrictMode double-mount)
    if (!hasAnalyzedRef.current) {
      hasAnalyzedRef.current = true
      analyzeScreen()
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

  const analyzeScreen = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const startTime = Date.now()
      const response = await window.electronAPI?.analyzePrompt()

      // Ensure loading spinner shows for at least 2.5s to avoid UI flash
      const elapsed = Date.now() - startTime
      if (elapsed < 2500) {
        await new Promise(resolve => setTimeout(resolve, 2500 - elapsed))
      }

      if (!response) {
        setError('Could not connect to analysis service')
        return
      }

      if (!response.success) {
        setError(response.error || 'Analysis failed')
        return
      }

      if (response.data) {
        const userScore = response.data.score
        const refinedScore = response.data.refinedScore || userScore

        setResult({
          prompt: response.data.prompt,
          score: userScore,
          feedback: response.data.feedback,
          improvedPrompt: response.data.improvedPrompt || '',
          refinedScore: refinedScore
        })

        // Save scores to Supabase (only if we got valid scores)
        if (userScore > 0) {
          savePromptScore(userScore, refinedScore).catch(err => {
            console.error('Failed to save score to Supabase:', err)
          })

          // Also save to active session for prompt history
          const promptData = response.data
          getActiveSession().then(async ({ data: session, error: sessionError }) => {
            console.log('Active session:', session, 'Error:', sessionError)
            console.log('localStorage sessions:', localStorage.getItem('vector_prompt_sessions'))

            let sessionToUse = session

            // If no session, create one directly
            if (!sessionToUse?.id) {
              console.log('No session found, creating one...')
              const newId = crypto.randomUUID()
              const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              const newSession = {
                id: newId,
                user_id: 'local',
                name: `Session - ${today}`,
                created_at: new Date().toISOString()
              }

              // Save directly to localStorage
              const existingSessions = JSON.parse(localStorage.getItem('vector_prompt_sessions') || '[]')
              existingSessions.unshift(newSession)
              localStorage.setItem('vector_prompt_sessions', JSON.stringify(existingSessions))
              localStorage.setItem('vector_active_session_id', newId)
              sessionToUse = newSession
              console.log('Created new session:', newSession)
            }

            if (sessionToUse?.id && promptData) {
              console.log('Saving prompt to session:', sessionToUse.id)

              // Save prompt directly to localStorage
              const newPrompt = {
                id: crypto.randomUUID(),
                session_id: sessionToUse.id,
                original_prompt: promptData.prompt || '',
                improved_prompt: promptData.improvedPrompt || '',
                user_score: Math.round(userScore),
                refined_score: Math.round(refinedScore),
                feedback: promptData.feedback || '',
                created_at: new Date().toISOString()
              }

              const existingPrompts = JSON.parse(localStorage.getItem('vector_session_prompts') || '[]')
              existingPrompts.push(newPrompt)
              localStorage.setItem('vector_session_prompts', JSON.stringify(existingPrompts))
              console.log('Prompt saved successfully:', newPrompt)
            } else {
              console.error('No session or no prompt data', { sessionToUse, promptData })
            }
          }).catch(err => {
            console.error('Failed to get active session:', err)
          })
        }
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

  const handleCopyImproved = async () => {
    if (!result?.improvedPrompt) return

    try {
      await window.electronAPI?.writeClipboard(result.improvedPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400'
    if (score >= 60) return 'text-yellow-400'
    if (score >= 40) return 'text-orange-400'
    return 'text-red-400'
  }

  const getScoreBarColor = (score: number) => {
    if (score >= 80) return 'bg-green-400'
    if (score >= 60) return 'bg-yellow-400'
    if (score >= 40) return 'bg-orange-400'
    return 'bg-red-400'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent'
    if (score >= 60) return 'Good'
    if (score >= 40) return 'Needs Work'
    return 'Poor'
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
          <span className="text-sm font-medium text-white">Prompt Analysis</span>
          <button
            onClick={handleClose}
            className="text-white/50 hover:text-white transition-colors text-xs"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            ESC to close
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-white/60" />
              <div className="text-sm text-white/70">Analyzing...</div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <div className="text-red-400 text-sm font-medium">Analysis Failed</div>
              <div className="text-xs text-white/50 text-center px-4">{error}</div>
              <button
                onClick={analyzeScreen}
                className="mt-2 px-4 py-2 text-sm text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : result ? (
            <>
              {/* Score Display */}
              <div className="flex items-center gap-4">
                <div className={cn("text-4xl font-bold tabular-nums", getScoreColor(result.score))}>
                  {result.score}
                </div>
                <div className="flex-1">
                  <div className="text-sm text-white font-medium">{getScoreLabel(result.score)}</div>
                  <div className="text-xs text-white/50 mt-0.5">Quality Score</div>
                  <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full transition-all duration-500 rounded-full", getScoreBarColor(result.score))}
                      style={{ width: `${result.score}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Feedback */}
              <div className="space-y-1">
                <div className="text-xs text-white/50">Feedback</div>
                <div className="p-2.5 bg-white/5 rounded-lg">
                  <p className="text-xs text-white/80 leading-relaxed">
                    {result.feedback}
                  </p>
                </div>
              </div>

              {/* Improved Prompt */}
              {result.improvedPrompt && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-white/50">Improved Prompt</div>
                    <button
                      onClick={handleCopyImproved}
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
                  <div className="p-2.5 bg-white/5 rounded-lg border border-white/10 max-h-[100px] overflow-y-auto">
                    <p className="text-xs text-white/90 whitespace-pre-wrap leading-relaxed">
                      {result.improvedPrompt}
                    </p>
                  </div>
                </div>
              )}

              {/* Original Detected Prompt (collapsed) */}
              <details className="group">
                <summary className="text-xs text-white/40 cursor-pointer hover:text-white/60 transition-colors">
                  View original prompt
                </summary>
                <div className="mt-1.5 p-2.5 bg-white/5 rounded-lg max-h-[60px] overflow-y-auto">
                  <p className="text-xs text-white/50 whitespace-pre-wrap break-all">
                    {result.prompt || 'No prompt detected'}
                  </p>
                </div>
              </details>
            </>
          ) : null}

          {/* Quick Actions */}
          {!isLoading && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleClose}
                className="flex-1 px-3 py-2 text-sm bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-white"
              >
                Close
              </button>
              <button
                onClick={analyzeScreen}
                className="flex-1 px-3 py-2 text-sm bg-white text-black hover:bg-white/90 rounded-lg transition-colors font-medium"
              >
                Analyze Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
