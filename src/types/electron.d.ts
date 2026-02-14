export interface PromptAnalysisResult {
  prompt: string
  score: number
  feedback: string
  improvedPrompt: string
  refinedScore: number
  screenText?: string
}

export interface AnalyzePromptResponse {
  success: boolean
  data?: PromptAnalysisResult
  error?: string
}

export interface SelectionBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PromptScore {
  timestamp: string
  userScore: number
  refinedScore: number
}

export interface ImageAnalysisResult {
  description: string
}

export interface AnalyzeImageResponse {
  success: boolean
  data?: ImageAnalysisResult
  error?: string
}

export interface TextGrabResult {
  text: string
}

export interface ExtractTextResponse {
  success: boolean
  data?: TextGrabResult
  error?: string
}

export interface SpeechToTextResult {
  text: string
}

export interface ElectronAPI {
  platform: string
  getClipboard: () => Promise<string>
  writeClipboard: (text: string) => Promise<boolean>
  onClipboardChange: (callback: (text: string) => void) => void
  removeClipboardListener: () => void
  registerShortcut: (shortcut: string) => Promise<{ success: boolean; error?: string }>
  unregisterShortcut: () => Promise<boolean>
  getCurrentShortcut: () => Promise<string | null>
  closePopup: () => Promise<boolean>
  analyzePrompt: () => Promise<AnalyzePromptResponse>
  setApiKey: (apiKey: string) => Promise<boolean>
  getApiKey: () => Promise<string>
  hasDefaultKey: () => Promise<boolean>
  selectionMade: (bounds: SelectionBounds) => Promise<void>
  cancelSelection: () => Promise<void>
  getSelectionScreenshot: () => Promise<string | null>
  generateAIContext: (
    sessionName: string,
    prompts: Array<{
      original_prompt: string
      improved_prompt: string
      user_score: number
      refined_score: number
      feedback: string
      created_at?: string
    }>
  ) => Promise<{ success: boolean; data?: string; error?: string }>
  getScores: () => Promise<PromptScore[]>
  saveScore: (userScore: number, refinedScore: number) => Promise<boolean>
  // Image analyzer functions
  registerImageShortcut: (shortcut: string) => Promise<{ success: boolean; error?: string }>
  unregisterImageShortcut: () => Promise<boolean>
  getCurrentImageShortcut: () => Promise<string | null>
  analyzeImage: () => Promise<AnalyzeImageResponse>
  analyzeImageWithSelection: () => Promise<AnalyzeImageResponse>
  refineImageDescription: (
    currentDescription: string,
    userMessage: string,
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ) => Promise<AnalyzeImageResponse>
  // Text grab functions
  registerTextGrabShortcut: (shortcut: string) => Promise<{ success: boolean; error?: string }>
  unregisterTextGrabShortcut: () => Promise<boolean>
  getCurrentTextGrabShortcut: () => Promise<string | null>
  extractText: () => Promise<ExtractTextResponse>
  // Speech-to-text functions
  registerSpeechShortcut: (shortcut: string) => Promise<{ success: boolean; error?: string }>
  unregisterSpeechShortcut: () => Promise<boolean>
  getCurrentSpeechShortcut: () => Promise<string | null>
  getSpeechModel: () => Promise<string>
  setSpeechModel: (model: string) => Promise<boolean>
  getSelectedMic: () => Promise<string>
  setSelectedMic: (deviceId: string) => Promise<boolean>
  shouldStopSpeech: () => Promise<boolean>
  onStopSpeechRecording: (callback: () => void) => void
  removeStopSpeechRecordingListener: () => void
  resizeSpeechPopup: (width: number, height: number) => Promise<boolean>
  typeSpeechResult: (text: string) => Promise<boolean>
  transcribeSpeech: (pcmBuffer: ArrayBuffer, sampleRate: number) => Promise<{ success: boolean; text?: string; error?: string }>
  onSpeechProgress: (callback: (message: string) => void) => void
  removeSpeechProgressListener: () => void
  downloadSpeechModel: (model: string) => Promise<{ success: boolean; error?: string }>
  onSpeechModelProgress: (callback: (data: { status: string; progress?: number }) => void) => void
  removeSpeechModelProgressListener: () => void
  // Vibe Mode functions
  getVibeSettings: () => Promise<{ enabled: boolean; sites: string[] }>
  setVibeSites: (sites: string[]) => Promise<boolean>
  enableVibeMode: (sites: string[]) => Promise<{ success: boolean; error?: string }>
  disableVibeMode: () => Promise<{ success: boolean; error?: string }>
  // Custom instructions
  getPromptInstructions: () => Promise<string>
  setPromptInstructions: (instructions: string) => Promise<boolean>
  getImageInstructions: () => Promise<string>
  setImageInstructions: (instructions: string) => Promise<boolean>
  // Master hotkey functions
  registerMasterShortcut: (shortcut: string) => Promise<{ success: boolean; error?: string }>
  unregisterMasterShortcut: () => Promise<boolean>
  getCurrentMasterShortcut: () => Promise<string | null>
  analyzerPicked: (type: 'prompt' | 'image' | 'textgrab' | 'speech') => Promise<void>
  send: (channel: string, data: unknown) => void
  receive: (channel: string, func: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
