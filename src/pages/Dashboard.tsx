import { useState, useEffect } from 'react'
import { signOut, getPromptScores, getSessions, getSessionPrompts, createSession, deleteSession, generateSessionContext, PromptSession, SessionPrompt } from '@/lib/supabase'
import { Home, ClipboardList, MessageSquare, History, LogOut, Copy, Trash2, X, Key, Eye, EyeOff, Image, Plus, ChevronDown, ChevronRight, FileText, Sparkles, Loader2, Type, Layers, Zap, Mic, Download, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useClipboardHistory } from '@/hooks/useClipboardHistory'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface DashboardProps {
  userEmail: string
  fullName: string
  onSignOut: () => void
}

type Tab = 'home' | 'clipboard' | 'analyzers' | 'speech' | 'history' | 'vibe'
type AnalyzerTab = 'prompt' | 'image' | 'text'

// Empty initial data - will be populated from Supabase
const emptyPromptData: Array<{ prompt: number; userScore: number; refinedScore: number }> = []

const chartConfig = {
  userScore: {
    label: "Your Score",
    color: "hsl(0 80% 65%)",
  },
  refinedScore: {
    label: "Refined Score",
    color: "hsl(210 100% 75%)",
  },
}

export function Dashboard({ fullName, onSignOut }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [activeAnalyzerTab, setActiveAnalyzerTab] = useState<AnalyzerTab>('prompt')
  const { history, copyToClipboard, removeFromHistory, clearHistory } = useClipboardHistory()

  // Custom instructions state
  const [promptInstructionsText, setPromptInstructionsText] = useState('')
  const [promptInstructionsSaved, setPromptInstructionsSaved] = useState(false)
  const [imageInstructionsText, setImageInstructionsText] = useState('')
  const [imageInstructionsSaved, setImageInstructionsSaved] = useState(false)

  // Prompt analyzer state
  const [shortcut, setShortcut] = useState('')
  const [savedShortcut, setSavedShortcut] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [shortcutError, setShortcutError] = useState('')
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set())

  // Image analyzer state
  const [imageShortcut, setImageShortcut] = useState('')
  const [savedImageShortcut, setSavedImageShortcut] = useState<string | null>(null)
  const [isRecordingImage, setIsRecordingImage] = useState(false)
  const [imageShortcutError, setImageShortcutError] = useState('')
  const [pendingImageKeys, setPendingImageKeys] = useState<Set<string>>(new Set())

  // Text grab state
  const [textGrabShortcut, setTextGrabShortcut] = useState('')
  const [savedTextGrabShortcut, setSavedTextGrabShortcut] = useState<string | null>(null)
  const [isRecordingTextGrab, setIsRecordingTextGrab] = useState(false)
  const [textGrabShortcutError, setTextGrabShortcutError] = useState('')
  const [pendingTextGrabKeys, setPendingTextGrabKeys] = useState<Set<string>>(new Set())

  // Speech-to-text state
  const [speechShortcut, setSpeechShortcut] = useState('')
  const [savedSpeechShortcut, setSavedSpeechShortcut] = useState<string | null>(null)
  const [isRecordingSpeech, setIsRecordingSpeech] = useState(false)
  const [speechShortcutError, setSpeechShortcutError] = useState('')
  const [pendingSpeechKeys, setPendingSpeechKeys] = useState<Set<string>>(new Set())
  const [speechModel, setSpeechModel] = useState('tiny')
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedMic, setSelectedMic] = useState('')
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState('')

  // Master hotkey state
  const [masterShortcut, setMasterShortcut] = useState('')
  const [savedMasterShortcut, setSavedMasterShortcut] = useState<string | null>(null)
  const [isRecordingMaster, setIsRecordingMaster] = useState(false)
  const [masterShortcutError, setMasterShortcutError] = useState('')
  const [pendingMasterKeys, setPendingMasterKeys] = useState<Set<string>>(new Set())

  // Vibe Mode state
  const [vibeModeEnabled, setVibeModeEnabled] = useState(false)
  const [vibeSites, setVibeSites] = useState<string[]>([])
  const [newVibeSite, setNewVibeSite] = useState('')
  const [vibeLoading, setVibeLoading] = useState(false)
  const [vibeError, setVibeError] = useState('')

  // API key state
  const [apiKey, setApiKey] = useState('')
  const [savedApiKey, setSavedApiKey] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyError, setApiKeyError] = useState('')
  const [hasDefaultKey, setHasDefaultKey] = useState(true)

  // Scores data for chart
  const [promptData, setPromptData] = useState<Array<{ prompt: number; userScore: number; refinedScore: number }>>(emptyPromptData)

  // Prompt History state
  const [sessions, setSessions] = useState<PromptSession[]>([])
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [sessionPrompts, setSessionPrompts] = useState<Record<string, SessionPrompt[]>>({})
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [generatedContext, setGeneratedContext] = useState<string | null>(null)
  const [isGeneratingContext, setIsGeneratingContext] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const handleSignOut = async () => {
    await signOut()
    onSignOut()
  }

  const firstName = fullName.split(' ')[0] || 'there'

  const tabs = [
    { id: 'home' as Tab, label: 'Home', icon: Home },
    { id: 'clipboard' as Tab, label: 'Clipboard History', icon: ClipboardList },
    { id: 'analyzers' as Tab, label: 'Analyzers', icon: Layers },
    { id: 'speech' as Tab, label: 'Speech', icon: Mic },
    { id: 'history' as Tab, label: 'Prompt History', icon: History },
    { id: 'vibe' as Tab, label: 'Vibe Mode', icon: Shield },
  ]

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  // Load saved shortcut and API key on mount
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getCurrentShortcut().then((shortcut) => {
        if (shortcut) {
          setSavedShortcut(shortcut)
          setShortcut(shortcut)
        }
      })
      window.electronAPI.getCurrentImageShortcut?.().then((shortcut) => {
        if (shortcut) {
          setSavedImageShortcut(shortcut)
          setImageShortcut(shortcut)
        }
      })
      window.electronAPI.getCurrentTextGrabShortcut?.().then((shortcut) => {
        if (shortcut) {
          setSavedTextGrabShortcut(shortcut)
          setTextGrabShortcut(shortcut)
        }
      })
      window.electronAPI.getCurrentSpeechShortcut?.().then((shortcut) => {
        if (shortcut) {
          setSavedSpeechShortcut(shortcut)
          setSpeechShortcut(shortcut)
        }
      })
      window.electronAPI.getSpeechModel?.().then((model) => {
        if (model) setSpeechModel(model)
      })
      window.electronAPI.getSelectedMic?.().then((deviceId) => {
        if (deviceId) setSelectedMic(deviceId)
      })
      // Enumerate audio input devices
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        setAudioDevices(devices.filter(d => d.kind === 'audioinput'))
      })
      // Listen for model download progress
      window.electronAPI.onSpeechModelProgress?.((data) => {
        if (data.status === 'downloading' && data.progress != null) {
          setDownloadProgress(`Downloading... ${data.progress}%`)
        } else if (data.status === 'done') {
          setDownloadProgress('Downloaded!')
          setIsDownloadingModel(false)
        }
      })
      window.electronAPI.getCurrentMasterShortcut?.().then((shortcut) => {
        if (shortcut) {
          setSavedMasterShortcut(shortcut)
          setMasterShortcut(shortcut)
        }
      })
      window.electronAPI.getVibeSettings?.().then((settings) => {
        if (settings) {
          setVibeModeEnabled(settings.enabled)
          setVibeSites(settings.sites)
        }
      })
      window.electronAPI.getApiKey().then((key) => {
        if (key) {
          setApiKey(key)
          setSavedApiKey(true)
        }
      })
      window.electronAPI.hasDefaultKey().then((hasDefault) => {
        setHasDefaultKey(hasDefault)
      })
      window.electronAPI.getPromptInstructions?.().then((text) => {
        if (text) {
          setPromptInstructionsText(text)
          setPromptInstructionsSaved(true)
        }
      })
      window.electronAPI.getImageInstructions?.().then((text) => {
        if (text) {
          setImageInstructionsText(text)
          setImageInstructionsSaved(true)
        }
      })
    }

    // Load scores from Supabase for chart
    loadScoresFromSupabase()

    // Load sessions for prompt history (also syncs active session from localStorage)
    loadSessions()

    // Refresh scores and sessions when window gains focus (after using popup)
    const handleFocus = () => {
      loadScoresFromSupabase()
      loadSessions()
      refreshExpandedSessions()
    }
    window.addEventListener('focus', handleFocus)

    // Listen for localStorage changes (from popup window)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'vector_prompt_sessions' || e.key === 'vector_session_prompts') {
        loadSessions()
        refreshExpandedSessions()
      }
    }
    window.addEventListener('storage', handleStorage)

    // Poll for changes every 2 seconds when on history tab
    const pollInterval = setInterval(() => {
      loadSessions()
      refreshExpandedSessions()
    }, 2000)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('storage', handleStorage)
      clearInterval(pollInterval)
      window.electronAPI?.removeSpeechModelProgressListener()
    }
  }, [])

  const loadScoresFromSupabase = async () => {
    const { data: scores } = await getPromptScores()
    if (scores && scores.length > 0) {
      const formattedData = scores.map((score, index) => ({
        prompt: index + 1,
        userScore: score.user_score,
        refinedScore: score.refined_score
      }))
      setPromptData(formattedData)
    }
  }

  const loadSessions = async () => {
    const { data } = await getSessions()
    if (data) {
      setSessions(data)
      // Sync active session from localStorage (the source of truth)
      const storedActiveId = localStorage.getItem('vector_active_session_id')
      if (storedActiveId && data.some(s => s.id === storedActiveId)) {
        setActiveSessionId(storedActiveId)
      } else if (data.length > 0) {
        // No valid stored active session, default to first
        const firstId = data[0].id || null
        setActiveSessionId(firstId)
        if (firstId) localStorage.setItem('vector_active_session_id', firstId)
      }
    }
  }

  const loadSessionPrompts = async (sessionId: string) => {
    const { data } = await getSessionPrompts(sessionId)
    if (data) {
      setSessionPrompts(prev => ({ ...prev, [sessionId]: data }))
    }
  }

  const refreshExpandedSessions = async () => {
    // Refresh prompts for all expanded sessions
    for (const sessionId of expandedSessions) {
      const { data } = await getSessionPrompts(sessionId)
      if (data) {
        setSessionPrompts(prev => ({ ...prev, [sessionId]: data }))
      }
    }
  }

  const setSessionAsActive = (sessionId: string) => {
    setActiveSessionId(sessionId)
    // Store in localStorage so the popup knows which session to use
    localStorage.setItem('vector_active_session_id', sessionId)
  }

  const toggleSession = async (sessionId: string) => {
    const newExpanded = new Set(expandedSessions)
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId)
    } else {
      newExpanded.add(sessionId)
      // Load prompts if not already loaded
      if (!sessionPrompts[sessionId]) {
        await loadSessionPrompts(sessionId)
      }
    }
    setExpandedSessions(newExpanded)
  }

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) return
    const { data, error } = await createSession(newSessionName.trim())
    if (error) {
      console.error('Failed to create session:', error)
      alert(`Failed to create session: ${error.message}`)
      return
    }
    if (data) {
      setSessions(prev => [data, ...prev])
      setNewSessionName('')
      setIsCreatingSession(false)
      // Set new session as active
      if (data.id) {
        setSessionAsActive(data.id)
      }
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    const { error } = await deleteSession(sessionId)
    if (!error) {
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      setExpandedSessions(prev => {
        const newSet = new Set(prev)
        newSet.delete(sessionId)
        return newSet
      })
      setSessionPrompts(prev => {
        const newPrompts = { ...prev }
        delete newPrompts[sessionId]
        return newPrompts
      })
    }
  }

  const handleGenerateContext = async (sessionId: string) => {
    setIsGeneratingContext(sessionId)
    try {
      // Get session prompts and session info
      const { data: prompts } = await getSessionPrompts(sessionId)
      const session = sessions.find(s => s.id === sessionId)

      if (!prompts || prompts.length === 0) {
        setGeneratedContext('No prompts in this session yet.')
        setIsGeneratingContext(null)
        return
      }

      // Try AI-powered context generation via Electron
      if (window.electronAPI?.generateAIContext) {
        const result = await window.electronAPI.generateAIContext(
          session?.name || 'Unnamed Session',
          prompts.map(p => ({
            original_prompt: p.original_prompt,
            improved_prompt: p.improved_prompt,
            user_score: p.user_score,
            refined_score: p.refined_score,
            feedback: p.feedback,
            created_at: p.created_at
          }))
        )

        if (result.success && result.data) {
          setGeneratedContext(result.data)
          setIsGeneratingContext(null)
          return
        }
      }

      // Fallback to static context generation
      const { context, error } = await generateSessionContext(sessionId)
      if (!error) {
        setGeneratedContext(context)
      }
    } catch (err) {
      // Fallback to static context on any error
      const { context, error } = await generateSessionContext(sessionId)
      if (!error) {
        setGeneratedContext(context)
      }
    }
    setIsGeneratingContext(null)
  }

  const copyContext = async () => {
    if (generatedContext) {
      await window.electronAPI?.writeClipboard(generatedContext)
    }
  }

  // Build shortcut string from current key state
  const buildShortcutString = (e: React.KeyboardEvent, nonModifierKey?: string) => {
    const keys: string[] = []

    if (e.ctrlKey || e.getModifierState('Control')) keys.push('Ctrl')
    if (e.altKey || e.getModifierState('Alt')) keys.push('Alt')
    if (e.shiftKey || e.getModifierState('Shift')) keys.push('Shift')
    if (e.metaKey || e.getModifierState('Meta')) keys.push('Super')

    if (nonModifierKey) {
      keys.push(nonModifierKey)
    }

    return keys.join('+')
  }

  // Handle keyboard shortcut recording
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return
    e.preventDefault()
    e.stopPropagation()

    const key = e.key
    const code = e.code

    // Check if it's a modifier key
    const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(key)

    if (isModifier) {
      // Just update the display with current modifiers
      const currentCombo = buildShortcutString(e)
      if (currentCombo) {
        setShortcut(currentCombo + '+...')
      }
      setPendingKeys(new Set([...pendingKeys, key]))
    } else {
      // It's a regular key - finalize the shortcut
      let formattedKey = key

      // Handle special keys
      if (key === ' ') {
        formattedKey = 'Space'
      } else if (key.length === 1) {
        formattedKey = key.toUpperCase()
      } else if (code.startsWith('Key')) {
        formattedKey = code.replace('Key', '')
      } else if (code.startsWith('Digit')) {
        formattedKey = code.replace('Digit', '')
      }

      const finalShortcut = buildShortcutString(e, formattedKey)
      setShortcut(finalShortcut)
      setIsRecording(false)
      setPendingKeys(new Set())
    }
  }

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (!isRecording) return

    // If user releases all keys without pressing a non-modifier, clear the pending display
    const key = e.key
    const newPending = new Set(pendingKeys)
    newPending.delete(key)
    setPendingKeys(newPending)

    if (newPending.size === 0) {
      setShortcut(prev => prev.endsWith('+...') ? '' : prev)
    }
  }

  const startRecording = () => {
    setIsRecording(true)
    setShortcut('')
    setPendingKeys(new Set())
    setShortcutError('')
  }

  const stopRecording = () => {
    setIsRecording(false)
    setPendingKeys(new Set())
    // If we were in the middle of recording, clear the incomplete shortcut
    setShortcut(prev => {
      if (prev.endsWith('+...')) {
        return savedShortcut || ''
      }
      return prev
    })
  }

  const handleSaveShortcut = async () => {
    if (!shortcut || shortcut.endsWith('+...') || !window.electronAPI) return

    setShortcutError('')
    const result = await window.electronAPI.registerShortcut(shortcut)

    if (result.success) {
      setSavedShortcut(shortcut)
    } else {
      setShortcutError(result.error || 'Failed to register shortcut')
    }
  }

  const handleClearShortcut = async () => {
    if (!window.electronAPI) return

    await window.electronAPI.unregisterShortcut()
    setSavedShortcut(null)
    setShortcut('')
    setShortcutError('')
  }

  const handleSaveApiKey = async () => {
    if (!apiKey.trim() || !window.electronAPI) return

    setApiKeyError('')
    try {
      await window.electronAPI.setApiKey(apiKey.trim())
      setSavedApiKey(true)
    } catch {
      setApiKeyError('Failed to save API key')
    }
  }

  // Image analyzer keyboard shortcut handlers
  const handleImageKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecordingImage) return
    e.preventDefault()
    e.stopPropagation()

    const key = e.key
    const code = e.code

    const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(key)

    if (isModifier) {
      const currentCombo = buildShortcutString(e)
      if (currentCombo) {
        setImageShortcut(currentCombo + '+...')
      }
      setPendingImageKeys(new Set([...pendingImageKeys, key]))
    } else {
      let formattedKey = key

      if (key === ' ') {
        formattedKey = 'Space'
      } else if (key.length === 1) {
        formattedKey = key.toUpperCase()
      } else if (code.startsWith('Key')) {
        formattedKey = code.replace('Key', '')
      } else if (code.startsWith('Digit')) {
        formattedKey = code.replace('Digit', '')
      }

      const finalShortcut = buildShortcutString(e, formattedKey)
      setImageShortcut(finalShortcut)
      setIsRecordingImage(false)
      setPendingImageKeys(new Set())
    }
  }

  const handleImageKeyUp = (e: React.KeyboardEvent) => {
    if (!isRecordingImage) return

    const key = e.key
    const newPending = new Set(pendingImageKeys)
    newPending.delete(key)
    setPendingImageKeys(newPending)

    if (newPending.size === 0) {
      setImageShortcut(prev => prev.endsWith('+...') ? '' : prev)
    }
  }

  const startRecordingImage = () => {
    setIsRecordingImage(true)
    setImageShortcut('')
    setPendingImageKeys(new Set())
    setImageShortcutError('')
  }

  const stopRecordingImage = () => {
    setIsRecordingImage(false)
    setPendingImageKeys(new Set())
    setImageShortcut(prev => {
      if (prev.endsWith('+...')) {
        return savedImageShortcut || ''
      }
      return prev
    })
  }

  const handleSaveImageShortcut = async () => {
    if (!imageShortcut || imageShortcut.endsWith('+...') || !window.electronAPI) return

    setImageShortcutError('')
    const result = await window.electronAPI.registerImageShortcut(imageShortcut)

    if (result.success) {
      setSavedImageShortcut(imageShortcut)
    } else {
      setImageShortcutError(result.error || 'Failed to register shortcut')
    }
  }

  const handleClearImageShortcut = async () => {
    if (!window.electronAPI) return

    await window.electronAPI.unregisterImageShortcut()
    setSavedImageShortcut(null)
    setImageShortcut('')
    setImageShortcutError('')
  }

  // Text grab keyboard shortcut handlers
  const handleTextGrabKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecordingTextGrab) return
    e.preventDefault()
    e.stopPropagation()

    const key = e.key
    const code = e.code
    const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(key)

    if (isModifier) {
      const currentCombo = buildShortcutString(e)
      if (currentCombo) {
        setTextGrabShortcut(currentCombo + '+...')
      }
      setPendingTextGrabKeys(new Set([...pendingTextGrabKeys, key]))
    } else {
      let formattedKey = key
      if (key === ' ') formattedKey = 'Space'
      else if (key.length === 1) formattedKey = key.toUpperCase()
      else if (code.startsWith('Key')) formattedKey = code.replace('Key', '')
      else if (code.startsWith('Digit')) formattedKey = code.replace('Digit', '')

      const finalShortcut = buildShortcutString(e, formattedKey)
      setTextGrabShortcut(finalShortcut)
      setIsRecordingTextGrab(false)
      setPendingTextGrabKeys(new Set())
    }
  }

  const handleTextGrabKeyUp = (e: React.KeyboardEvent) => {
    if (!isRecordingTextGrab) return
    const key = e.key
    const newPending = new Set(pendingTextGrabKeys)
    newPending.delete(key)
    setPendingTextGrabKeys(newPending)
    if (newPending.size === 0) {
      setTextGrabShortcut(prev => prev.endsWith('+...') ? '' : prev)
    }
  }

  const startRecordingTextGrab = () => {
    setIsRecordingTextGrab(true)
    setTextGrabShortcut('')
    setPendingTextGrabKeys(new Set())
    setTextGrabShortcutError('')
  }

  const stopRecordingTextGrab = () => {
    setIsRecordingTextGrab(false)
    setPendingTextGrabKeys(new Set())
    setTextGrabShortcut(prev => {
      if (prev.endsWith('+...')) return savedTextGrabShortcut || ''
      return prev
    })
  }

  const handleSaveTextGrabShortcut = async () => {
    if (!textGrabShortcut || textGrabShortcut.endsWith('+...') || !window.electronAPI) return
    setTextGrabShortcutError('')
    const result = await window.electronAPI.registerTextGrabShortcut(textGrabShortcut)
    if (result.success) {
      setSavedTextGrabShortcut(textGrabShortcut)
    } else {
      setTextGrabShortcutError(result.error || 'Failed to register shortcut')
    }
  }

  const handleClearTextGrabShortcut = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.unregisterTextGrabShortcut()
    setSavedTextGrabShortcut(null)
    setTextGrabShortcut('')
    setTextGrabShortcutError('')
  }

  // Speech-to-text shortcut handlers
  const handleSpeechKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecordingSpeech) return
    e.preventDefault()
    e.stopPropagation()

    const key = e.key
    const code = e.code
    const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(key)

    if (isModifier) {
      const currentCombo = buildShortcutString(e)
      if (currentCombo) {
        setSpeechShortcut(currentCombo + '+...')
      }
      setPendingSpeechKeys(new Set([...pendingSpeechKeys, key]))
    } else {
      let formattedKey = key
      if (key === ' ') formattedKey = 'Space'
      else if (key.length === 1) formattedKey = key.toUpperCase()
      else if (code.startsWith('Key')) formattedKey = code.replace('Key', '')
      else if (code.startsWith('Digit')) formattedKey = code.replace('Digit', '')

      const finalShortcut = buildShortcutString(e, formattedKey)
      setSpeechShortcut(finalShortcut)
      setIsRecordingSpeech(false)
      setPendingSpeechKeys(new Set())
    }
  }

  const handleSpeechKeyUp = (e: React.KeyboardEvent) => {
    if (!isRecordingSpeech) return
    const key = e.key
    const newPending = new Set(pendingSpeechKeys)
    newPending.delete(key)
    setPendingSpeechKeys(newPending)
    if (newPending.size === 0) {
      setSpeechShortcut(prev => prev.endsWith('+...') ? '' : prev)
    }
  }

  const startRecordingSpeech = () => {
    setIsRecordingSpeech(true)
    setSpeechShortcut('')
    setPendingSpeechKeys(new Set())
    setSpeechShortcutError('')
  }

  const stopRecordingSpeech = () => {
    setIsRecordingSpeech(false)
    setPendingSpeechKeys(new Set())
    setSpeechShortcut(prev => {
      if (prev.endsWith('+...')) return savedSpeechShortcut || ''
      return prev
    })
  }

  const handleSaveSpeechShortcut = async () => {
    if (!speechShortcut || speechShortcut.endsWith('+...') || !window.electronAPI) return
    setSpeechShortcutError('')
    const result = await window.electronAPI.registerSpeechShortcut(speechShortcut)
    if (result.success) {
      setSavedSpeechShortcut(speechShortcut)
    } else {
      setSpeechShortcutError(result.error || 'Failed to register shortcut')
    }
  }

  const handleClearSpeechShortcut = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.unregisterSpeechShortcut()
    setSavedSpeechShortcut(null)
    setSpeechShortcut('')
    setSpeechShortcutError('')
  }

  // Master hotkey handlers
  const handleMasterKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecordingMaster) return
    e.preventDefault()
    e.stopPropagation()

    const key = e.key
    const code = e.code
    const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(key)

    if (isModifier) {
      const currentCombo = buildShortcutString(e)
      if (currentCombo) {
        setMasterShortcut(currentCombo + '+...')
      }
      setPendingMasterKeys(new Set([...pendingMasterKeys, key]))
    } else {
      let formattedKey = key
      if (key === ' ') formattedKey = 'Space'
      else if (key.length === 1) formattedKey = key.toUpperCase()
      else if (code.startsWith('Key')) formattedKey = code.replace('Key', '')
      else if (code.startsWith('Digit')) formattedKey = code.replace('Digit', '')

      const finalShortcut = buildShortcutString(e, formattedKey)
      setMasterShortcut(finalShortcut)
      setIsRecordingMaster(false)
      setPendingMasterKeys(new Set())
    }
  }

  const handleMasterKeyUp = (e: React.KeyboardEvent) => {
    if (!isRecordingMaster) return
    const key = e.key
    const newPending = new Set(pendingMasterKeys)
    newPending.delete(key)
    setPendingMasterKeys(newPending)
    if (newPending.size === 0) {
      setMasterShortcut(prev => prev.endsWith('+...') ? '' : prev)
    }
  }

  const startRecordingMaster = () => {
    setIsRecordingMaster(true)
    setMasterShortcut('')
    setPendingMasterKeys(new Set())
    setMasterShortcutError('')
  }

  const stopRecordingMaster = () => {
    setIsRecordingMaster(false)
    setPendingMasterKeys(new Set())
    setMasterShortcut(prev => {
      if (prev.endsWith('+...')) return savedMasterShortcut || ''
      return prev
    })
  }

  const handleSaveMasterShortcut = async () => {
    if (!masterShortcut || masterShortcut.endsWith('+...') || !window.electronAPI) return
    setMasterShortcutError('')
    const result = await window.electronAPI.registerMasterShortcut(masterShortcut)
    if (result.success) {
      setSavedMasterShortcut(masterShortcut)
    } else {
      setMasterShortcutError(result.error || 'Failed to register shortcut')
    }
  }

  const handleClearMasterShortcut = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.unregisterMasterShortcut()
    setSavedMasterShortcut(null)
    setMasterShortcut('')
    setMasterShortcutError('')
  }

  const handleSavePromptInstructions = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.setPromptInstructions(promptInstructionsText)
    setPromptInstructionsSaved(true)
  }

  const handleSaveImageInstructions = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.setImageInstructions(imageInstructionsText)
    setImageInstructionsSaved(true)
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden relative">
      {/* Titlebar drag region */}
      <div className="titlebar h-10 shrink-0 bg-background" />

      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar Navigation */}
        <aside className="w-52 border-r border-border flex flex-col py-2 px-2">
          <nav className="space-y-0.5 flex-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm border border-transparent",
                  activeTab === tab.id
                    ? "bg-secondary text-foreground border-border"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground hover:border-border/50"
                )}
              >
                <tab.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Sign Out */}
          <div className="pt-2 border-t border-border mt-2">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-secondary/50 hover:text-foreground hover:border-border/50 border border-transparent"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-auto">
          {/* Home Tab */}
          {activeTab === 'home' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-4xl font-bold tracking-tight mb-2">
                  Hello, {firstName}
                </h1>
                <p className="text-muted-foreground">
                  Welcome back to Vector
                </p>
              </div>

              {/* Prompt Rating Chart */}
              <Card className="border-border animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '0.1s' }}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">
                    Prompt Quality Score
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Your last 25 prompts with user and refined scores
                  </p>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={promptData}
                        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                      >
                        <defs>
                          <linearGradient id="gradientGrey" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="white" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="white" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="prompt"
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => value % 5 === 0 ? value : ''}
                        />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          domain={[0, 100]}
                          ticks={[0, 25, 50, 75, 100]}
                        />
                        <Tooltip
                          content={
                            <ChartTooltipContent
                              labelFormatter={(label) => `Prompt #${label}`}
                              formatter={(value: number) => value}
                            />
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="refinedScore"
                          stroke="hsl(210 100% 75%)"
                          fill="url(#gradientGrey)"
                          strokeWidth={1}
                          dot={false}
                          animationDuration={1500}
                          animationEasing="ease-out"
                        />
                        <Area
                          type="monotone"
                          dataKey="userScore"
                          stroke="hsl(0 80% 65%)"
                          fill="url(#gradientGrey)"
                          strokeWidth={1}
                          dot={false}
                          animationDuration={1500}
                          animationEasing="ease-out"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Clipboard History Tab */}
          {activeTab === 'clipboard' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-semibold">Clipboard History</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {history.length} {history.length === 1 ? 'item' : 'items'} saved
                  </p>
                </div>
                {history.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearHistory}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear All
                  </Button>
                )}
              </div>

              {history.length === 0 ? (
                <Card className="border-border border-dashed animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '0.1s' }}>
                  <CardContent className="py-12 text-center">
                    <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Your clipboard history will appear here
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Copy something to get started
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {history.map((item, index) => (
                    <Card
                      key={item.id}
                      className="border-border group hover:border-border/80 transition-colors animate-in fade-in slide-in-from-bottom-4 duration-300"
                      style={{ animationDelay: `${0.05 + index * 0.03}s` }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground whitespace-pre-wrap break-all line-clamp-3">
                              {item.preview}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {formatTime(item.timestamp)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => copyToClipboard(item.text)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeFromHistory(item.id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

{/* Analyzers Tab */}
          {activeTab === 'analyzers' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-2xl font-semibold mb-2">Analyzers</h2>
              <p className="text-muted-foreground mb-8">
                Configure your screen analyzers and keyboard shortcuts.
              </p>

              <div className="space-y-6 max-w-4xl">
                {/* Analyzer Nav Bar */}
                <Tabs value={activeAnalyzerTab} onValueChange={(v) => setActiveAnalyzerTab(v as AnalyzerTab)}>
                <TabsList>
                  <TabsTrigger value="prompt" className="gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Prompt
                  </TabsTrigger>
                  <TabsTrigger value="image" className="gap-2">
                    <Image className="w-4 h-4" />
                    Image
                  </TabsTrigger>
                  <TabsTrigger value="text" className="gap-2">
                    <Type className="w-4 h-4" />
                    Text
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="prompt" className="space-y-6 animate-in fade-in duration-300 mt-6">
                  <Card className="border-border">
                    <CardHeader>
                      <CardTitle className="text-base font-medium flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Prompt Analyzer
                      </CardTitle>
                      <CardDescription>
                        Configure the shortcut and instructions for analyzing prompts.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">Shortcut</label>
                          <Input
                            placeholder={isRecording ? "Press shortcut..." : "Click to record"}
                            value={shortcut}
                            readOnly
                            onKeyDown={handleKeyDown}
                            onKeyUp={handleKeyUp}
                            onFocus={startRecording}
                            onBlur={stopRecording}
                            className={cn(
                              "text-center",
                              isRecording && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                            )}
                          />
                          <div className="flex gap-2 mt-2">
                            <Button
                              onClick={handleSaveShortcut}
                              disabled={!shortcut || shortcut.endsWith('+...') || shortcut === savedShortcut}
                              size="sm"
                              className="flex-1"
                            >
                              {savedShortcut ? 'Update' : 'Save'}
                            </Button>
                            {savedShortcut && (
                              <Button variant="outline" size="sm" onClick={handleClearShortcut}>
                                Clear
                              </Button>
                            )}
                          </div>
                          {shortcutError && (
                            <p className="text-xs text-destructive mt-1">{shortcutError}</p>
                          )}
                          {savedShortcut && (
                            <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-md mt-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full" />
                              <span className="text-xs text-foreground">{savedShortcut}</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-2 block">Custom Instructions</label>
                          <textarea
                            placeholder="e.g. When improving my prompts, always keep them concise..."
                            value={promptInstructionsText}
                            onChange={(e) => {
                              setPromptInstructionsText(e.target.value)
                              setPromptInstructionsSaved(false)
                            }}
                            rows={4}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                          />
                          <Button
                            onClick={handleSavePromptInstructions}
                            disabled={promptInstructionsSaved}
                            size="sm"
                            className="mt-2 w-full"
                          >
                            {promptInstructionsSaved ? 'Saved' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="image" className="space-y-6 animate-in fade-in duration-300 mt-6">
                  <Card className="border-border">
                    <CardHeader>
                      <CardTitle className="text-base font-medium flex items-center gap-2">
                        <Image className="w-4 h-4" />
                        Image Analyzer
                      </CardTitle>
                      <CardDescription>
                        Configure the shortcut and instructions for analyzing images.
                      </CardDescription>
                    </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium mb-2 block">Shortcut</label>
                            <Input
                              placeholder={isRecordingImage ? "Press shortcut..." : "Click to record"}
                              value={imageShortcut}
                              readOnly
                              onKeyDown={handleImageKeyDown}
                              onKeyUp={handleImageKeyUp}
                              onFocus={startRecordingImage}
                              onBlur={stopRecordingImage}
                              className={cn(
                                "text-center",
                                isRecordingImage && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                              )}
                            />
                            <div className="flex gap-2 mt-2">
                              <Button
                                onClick={handleSaveImageShortcut}
                                disabled={!imageShortcut || imageShortcut.endsWith('+...') || imageShortcut === savedImageShortcut}
                                size="sm"
                                className="flex-1"
                              >
                                {savedImageShortcut ? 'Update' : 'Save'}
                              </Button>
                              {savedImageShortcut && (
                                <Button variant="outline" size="sm" onClick={handleClearImageShortcut}>
                                  Clear
                                </Button>
                              )}
                            </div>
                            {imageShortcutError && (
                              <p className="text-xs text-destructive mt-1">{imageShortcutError}</p>
                            )}
                            {savedImageShortcut && (
                              <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-md mt-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                <span className="text-xs text-foreground">{savedImageShortcut}</span>
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="text-sm font-medium mb-2 block">Custom Instructions</label>
                            <textarea
                              placeholder="e.g. When describing images, focus on visual design, not UI elements..."
                              value={imageInstructionsText}
                              onChange={(e) => {
                                setImageInstructionsText(e.target.value)
                                setImageInstructionsSaved(false)
                              }}
                              rows={4}
                              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                            />
                            <Button
                              onClick={handleSaveImageInstructions}
                              disabled={imageInstructionsSaved}
                              size="sm"
                              className="mt-2 w-full"
                            >
                              {imageInstructionsSaved ? 'Saved' : 'Save'}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="text" className="space-y-6 animate-in fade-in duration-300 mt-6">
                  <Card className="border-border">
                    <CardHeader>
                      <CardTitle className="text-base font-medium flex items-center gap-2">
                        <Type className="w-4 h-4" />
                        Text Grab
                      </CardTitle>
                      <CardDescription>
                        Configure the shortcut for extracting text from screen.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="max-w-sm">
                        <label className="text-sm font-medium mb-2 block">Shortcut</label>
                        <Input
                            placeholder={isRecordingTextGrab ? "Press shortcut..." : "Click to record"}
                            value={textGrabShortcut}
                            readOnly
                            onKeyDown={handleTextGrabKeyDown}
                            onKeyUp={handleTextGrabKeyUp}
                            onFocus={startRecordingTextGrab}
                            onBlur={stopRecordingTextGrab}
                            className={cn(
                              "text-center",
                              isRecordingTextGrab && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                            )}
                          />
                          <div className="flex gap-2 mt-2">
                            <Button
                              onClick={handleSaveTextGrabShortcut}
                              disabled={!textGrabShortcut || textGrabShortcut.endsWith('+...') || textGrabShortcut === savedTextGrabShortcut}
                              size="sm"
                              className="flex-1"
                            >
                              {savedTextGrabShortcut ? 'Update' : 'Save'}
                            </Button>
                            {savedTextGrabShortcut && (
                              <Button variant="outline" size="sm" onClick={handleClearTextGrabShortcut}>
                                Clear
                              </Button>
                            )}
                          </div>
                          {textGrabShortcutError && (
                            <p className="text-xs text-destructive mt-1">{textGrabShortcutError}</p>
                          )}
                          {savedTextGrabShortcut && (
                            <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-md mt-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full" />
                              <span className="text-xs text-foreground">{savedTextGrabShortcut}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                </TabsContent>
              </Tabs>
            </div>
            </div>
          )}

          {/* Speech Tab */}
          {activeTab === 'speech' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold">Speech to Text</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Record audio from your microphone and transcribe locally with Whisper
                </p>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-6">
                  {/* Microphone */}
                  <Card className="border-border animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '0.05s' }}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Mic className="w-4 h-4" />
                        Microphone
                      </CardTitle>
                      <CardDescription>
                        Select which microphone to use for recording
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <select
                        value={selectedMic}
                        onChange={(e) => {
                          setSelectedMic(e.target.value)
                          window.electronAPI?.setSelectedMic(e.target.value)
                        }}
                        className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground"
                      >
                        <option value="">System default</option>
                        {audioDevices.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                          </option>
                        ))}
                      </select>
                      {selectedMic && (
                        <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-md">
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          <span className="text-xs text-foreground truncate">
                            {audioDevices.find(d => d.deviceId === selectedMic)?.label || 'Selected'}
                          </span>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={async () => {
                          const devices = await navigator.mediaDevices.enumerateDevices()
                          setAudioDevices(devices.filter(d => d.kind === 'audioinput'))
                        }}
                      >
                        Refresh Devices
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Hotkey */}
                  <Card className="border-border animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '0.1s' }}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Hotkey
                      </CardTitle>
                      <CardDescription>
                        Hold to record, release to transcribe
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Input
                        placeholder={isRecordingSpeech ? "Press shortcut..." : "Click to record"}
                        value={speechShortcut}
                        readOnly
                        onKeyDown={handleSpeechKeyDown}
                        onKeyUp={handleSpeechKeyUp}
                        onFocus={startRecordingSpeech}
                        onBlur={stopRecordingSpeech}
                        className={cn(
                          "text-center text-sm",
                          isRecordingSpeech && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        )}
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleSaveSpeechShortcut}
                          disabled={!speechShortcut || speechShortcut.endsWith('+...') || speechShortcut === savedSpeechShortcut}
                          className="flex-1"
                          size="sm"
                        >
                          {savedSpeechShortcut ? 'Update' : 'Save'}
                        </Button>
                        {savedSpeechShortcut && (
                          <Button variant="outline" size="sm" onClick={handleClearSpeechShortcut}>
                            Clear
                          </Button>
                        )}
                      </div>
                      {speechShortcutError && (
                        <p className="text-xs text-destructive">{speechShortcutError}</p>
                      )}
                      {savedSpeechShortcut && (
                        <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-md">
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          <span className="text-xs text-foreground">{savedSpeechShortcut}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Model Selection */}
                  <Card className="border-border animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '0.2s' }}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Mic className="w-4 h-4" />
                        Whisper Model
                      </CardTitle>
                      <CardDescription>
                        Larger models are more accurate but slower and use more disk space
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {[
                        { value: 'tiny', label: 'Tiny', size: '~75 MB', ram: '~1 GB RAM', desc: 'Fastest, lower accuracy' },
                        { value: 'base', label: 'Base', size: '~150 MB', ram: '~1 GB RAM', desc: 'Good for quick transcriptions' },
                        { value: 'small', label: 'Small', size: '~500 MB', ram: '~2 GB RAM', desc: 'Best balance of speed and accuracy' },
                        { value: 'medium', label: 'Medium', size: '~1.5 GB', ram: '~4 GB RAM', desc: 'Highest accuracy, slower' },
                      ].map((model) => (
                        <button
                          key={model.value}
                          onClick={() => {
                            setSpeechModel(model.value)
                            window.electronAPI?.setSpeechModel(model.value)
                          }}
                          className={cn(
                            "w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left",
                            speechModel === model.value
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-secondary/30"
                          )}
                        >
                          <div>
                            <div className="text-sm font-medium">{model.label}</div>
                            <div className="text-xs text-muted-foreground">{model.desc}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">{model.size}</div>
                            <div className="text-[10px] text-muted-foreground/60">{model.ram}</div>
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={async () => {
                          setIsDownloadingModel(true)
                          setDownloadProgress('Starting...')
                          const result = await window.electronAPI?.downloadSpeechModel(speechModel)
                          if (result?.success) {
                            setDownloadProgress('Ready!')
                          } else {
                            setDownloadProgress(`Error: ${result?.error || 'Download failed'}`)
                          }
                          setIsDownloadingModel(false)
                        }}
                        disabled={isDownloadingModel}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border transition-colors",
                          isDownloadingModel
                            ? "border-border bg-secondary/20 cursor-wait"
                            : "border-primary/50 bg-primary/5 hover:bg-primary/10 cursor-pointer"
                        )}
                      >
                        {isDownloadingModel ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <Download className="w-3.5 h-3.5 text-primary" />
                        )}
                        <span className="text-xs font-medium">
                          {isDownloadingModel ? downloadProgress : `Download ${speechModel.charAt(0).toUpperCase() + speechModel.slice(1)} Model`}
                        </span>
                      </button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* Prompt History Tab */}
          {activeTab === 'history' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-semibold">Prompt History</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
                  </p>
                </div>
                <Button
                  onClick={() => setIsCreatingSession(true)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Session
                </Button>
              </div>

              {/* Create Session Dialog */}
              {isCreatingSession && (
                <Card className="border-border mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <CardContent className="pt-6">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Session name..."
                        value={newSessionName}
                        onChange={(e) => setNewSessionName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateSession()}
                        autoFocus
                      />
                      <Button onClick={handleCreateSession} disabled={!newSessionName.trim()}>
                        Create
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setIsCreatingSession(false)
                        setNewSessionName('')
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Context Modal */}
              {generatedContext && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <Card className="w-full max-w-3xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                    <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-blue-400" />
                          AI-Generated Session Context
                        </CardTitle>
                        <CardDescription>Optimized for AI coding agents - copy and paste into Claude Code, Cursor, etc.</CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setGeneratedContext(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto">
                      <div className="text-sm whitespace-pre-wrap bg-secondary/50 p-4 rounded-md leading-relaxed">
                        {generatedContext}
                      </div>
                    </CardContent>
                    <div className="p-6 pt-0 flex gap-2">
                      <Button onClick={copyContext} className="gap-2">
                        <Copy className="w-4 h-4" />
                        Copy to Clipboard
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setGeneratedContext(null)}
                      >
                        Close
                      </Button>
                    </div>
                  </Card>
                </div>
              )}

              {/* Sessions List */}
              {sessions.length === 0 ? (
                <Card className="border-border border-dashed">
                  <CardContent className="py-12 text-center">
                    <History className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      No sessions yet
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create a session to start tracking your prompts
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session, index) => {
                    const isActive = session.id === activeSessionId
                    return (
                    <Card
                      key={session.id}
                      className={cn(
                        "border-border animate-in fade-in slide-in-from-bottom-4 duration-300",
                        isActive && "border-green-500/50 bg-green-500/5"
                      )}
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <CardContent className="p-0">
                        {/* Session Header */}
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                          onClick={() => session.id && toggleSession(session.id)}
                        >
                          <div className="flex items-center gap-3">
                            {expandedSessions.has(session.id || '') ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{session.name}</p>
                                {isActive && (
                                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                                    Active
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {session.created_at && new Date(session.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit'
                                })}
                                {sessionPrompts[session.id || ''] && ` • ${sessionPrompts[session.id || ''].length} prompts`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {!isActive && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => session.id && setSessionAsActive(session.id)}
                              >
                                Set Active
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              disabled={isGeneratingContext === session.id}
                              onClick={() => session.id && handleGenerateContext(session.id)}
                            >
                              {isGeneratingContext === session.id ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3" />
                                  Context
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => session.id && handleDeleteSession(session.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Session Prompts */}
                        {expandedSessions.has(session.id || '') && (
                          <div className="border-t border-border">
                            {!sessionPrompts[session.id || ''] ? (
                              <div className="p-4 text-center text-muted-foreground text-sm">
                                Loading prompts...
                              </div>
                            ) : sessionPrompts[session.id || ''].length === 0 ? (
                              <div className="p-4 text-center text-muted-foreground text-sm">
                                No prompts in this session yet
                              </div>
                            ) : (
                              <div className="divide-y divide-border">
                                {sessionPrompts[session.id || ''].map((prompt, promptIndex) => (
                                  <div key={prompt.id} className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-medium text-muted-foreground">
                                        Prompt {promptIndex + 1}
                                      </span>
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="text-red-400">Original: {prompt.user_score}</span>
                                        <span className="text-muted-foreground">→</span>
                                        <span className="text-blue-400">Improved: {prompt.refined_score}</span>
                                      </div>
                                    </div>

                                    {/* Original Prompt */}
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <FileText className="w-3 h-3" />
                                        Original
                                      </p>
                                      <div className="bg-secondary/30 p-3 rounded-md">
                                        <p className="text-sm whitespace-pre-wrap">{prompt.original_prompt}</p>
                                      </div>
                                    </div>

                                    {/* Improved Prompt */}
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Sparkles className="w-3 h-3" />
                                        Improved
                                      </p>
                                      <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-md">
                                        <p className="text-sm whitespace-pre-wrap">{prompt.improved_prompt}</p>
                                      </div>
                                    </div>

                                    {/* Feedback */}
                                    {prompt.feedback && (
                                      <div className="text-xs text-muted-foreground italic">
                                        {prompt.feedback}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )})}
                </div>
              )}
            </div>
          )}

          {/* Vibe Mode Tab */}
          {activeTab === 'vibe' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-2xl font-bold tracking-tight mb-1">Vibe Mode</h1>
                <p className="text-muted-foreground text-sm">
                  Block distracting websites globally to stay focused. Changes apply to all browsers on this machine.
                </p>
              </div>

              {/* Toggle Card */}
              <Card>
                <CardContent className="flex items-center justify-between py-5 px-6">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-3 h-3 rounded-full transition-colors",
                      vibeModeEnabled ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-muted-foreground/30"
                    )} />
                    <div>
                      <p className="font-medium text-sm">{vibeModeEnabled ? 'Active' : 'Inactive'}</p>
                      <p className="text-xs text-muted-foreground">
                        {vibeModeEnabled
                          ? `Blocking ${vibeSites.length} site${vibeSites.length !== 1 ? 's' : ''}`
                          : 'Distractions are not blocked'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={vibeModeEnabled ? "destructive" : "default"}
                    size="sm"
                    disabled={vibeLoading || (!vibeModeEnabled && vibeSites.length === 0)}
                    onClick={async () => {
                      if (!window.electronAPI) return
                      setVibeLoading(true)
                      setVibeError('')
                      try {
                        if (vibeModeEnabled) {
                          const r = await window.electronAPI.disableVibeMode()
                          if (r.success) setVibeModeEnabled(false)
                          else setVibeError(r.error || 'Failed to disable')
                        } else {
                          const r = await window.electronAPI.enableVibeMode(vibeSites)
                          if (r.success) setVibeModeEnabled(true)
                          else setVibeError(r.error || 'Failed to enable')
                        }
                      } finally {
                        setVibeLoading(false)
                      }
                    }}
                  >
                    {vibeLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Shield className="w-4 h-4 mr-1.5" />}
                    {vibeModeEnabled ? 'Disable' : 'Enable'}
                  </Button>
                </CardContent>
              </Card>
              {vibeError && <p className="text-xs text-destructive">{vibeError}</p>}

              {/* Blocked Sites Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Blocked Sites</CardTitle>
                  <CardDescription>Add websites you want to block when Vibe Mode is active.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. youtube.com"
                      value={newVibeSite}
                      onChange={(e) => setNewVibeSite(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const site = newVibeSite.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '').trim().toLowerCase()
                          if (site && !vibeSites.includes(site)) {
                            const updated = [...vibeSites, site]
                            setVibeSites(updated)
                            window.electronAPI?.setVibeSites(updated)
                            if (vibeModeEnabled) {
                              window.electronAPI?.enableVibeMode(updated)
                            }
                          }
                          setNewVibeSite('')
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const site = newVibeSite.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '').trim().toLowerCase()
                        if (site && !vibeSites.includes(site)) {
                          const updated = [...vibeSites, site]
                          setVibeSites(updated)
                          window.electronAPI?.setVibeSites(updated)
                          if (vibeModeEnabled) {
                            window.electronAPI?.enableVibeMode(updated)
                          }
                        }
                        setNewVibeSite('')
                      }}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  {vibeSites.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No sites added yet. Add sites below or use the quick-add presets.</p>
                  ) : (
                    <div className="space-y-1 max-h-52 overflow-y-auto">
                      {vibeSites.map((site) => (
                        <div
                          key={site}
                          className="flex items-center justify-between px-3 py-1.5 rounded-md bg-secondary/50 group"
                        >
                          <span className="text-sm">{site}</span>
                          <button
                            onClick={() => {
                              const updated = vibeSites.filter(s => s !== site)
                              setVibeSites(updated)
                              window.electronAPI?.setVibeSites(updated)
                              if (vibeModeEnabled && updated.length > 0) {
                                window.electronAPI?.enableVibeMode(updated)
                              } else if (vibeModeEnabled && updated.length === 0) {
                                window.electronAPI?.disableVibeMode()
                                setVibeModeEnabled(false)
                              }
                            }}
                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Presets Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Quick Add</CardTitle>
                  <CardDescription>Common distracting sites — click to add.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {['youtube.com', 'tiktok.com', 'twitter.com', 'x.com', 'reddit.com', 'instagram.com', 'facebook.com', 'twitch.tv', 'netflix.com', 'discord.com'].map((site) => {
                      const added = vibeSites.includes(site)
                      return (
                        <button
                          key={site}
                          disabled={added}
                          onClick={() => {
                            if (added) return
                            const updated = [...vibeSites, site]
                            setVibeSites(updated)
                            window.electronAPI?.setVibeSites(updated)
                            if (vibeModeEnabled) {
                              window.electronAPI?.enableVibeMode(updated)
                            }
                          }}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs border transition-colors",
                            added
                              ? "bg-secondary text-muted-foreground border-border cursor-default line-through"
                              : "border-border hover:bg-secondary hover:text-foreground text-muted-foreground cursor-pointer"
                          )}
                        >
                          {site}
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>

    </div>
  )
}
