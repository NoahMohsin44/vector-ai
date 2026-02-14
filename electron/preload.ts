import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Clipboard functions
  getClipboard: () => ipcRenderer.invoke('get-clipboard'),
  writeClipboard: (text: string) => ipcRenderer.invoke('write-clipboard', text),
  onClipboardChange: (callback: (text: string) => void) => {
    ipcRenderer.on('clipboard-change', (_event, text) => callback(text))
  },
  removeClipboardListener: () => {
    ipcRenderer.removeAllListeners('clipboard-change')
  },

  // Shortcut functions
  registerShortcut: (shortcut: string) => ipcRenderer.invoke('register-shortcut', shortcut),
  unregisterShortcut: () => ipcRenderer.invoke('unregister-shortcut'),
  getCurrentShortcut: () => ipcRenderer.invoke('get-current-shortcut'),
  closePopup: () => ipcRenderer.invoke('close-popup'),

  // Image analyzer shortcut functions
  registerImageShortcut: (shortcut: string) => ipcRenderer.invoke('register-image-shortcut', shortcut),
  unregisterImageShortcut: () => ipcRenderer.invoke('unregister-image-shortcut'),
  getCurrentImageShortcut: () => ipcRenderer.invoke('get-current-image-shortcut'),
  analyzeImage: () => ipcRenderer.invoke('analyze-image'),
  analyzeImageWithSelection: () => ipcRenderer.invoke('analyze-image-with-selection'),
  refineImageDescription: (
    currentDescription: string,
    userMessage: string,
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ) => ipcRenderer.invoke('refine-image-description', currentDescription, userMessage, chatHistory),

  // Prompt analysis functions
  analyzePrompt: () => ipcRenderer.invoke('analyze-prompt'),
  setApiKey: (apiKey: string) => ipcRenderer.invoke('set-api-key', apiKey),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  hasDefaultKey: () => ipcRenderer.invoke('has-default-key'),

  // Selection overlay functions
  selectionMade: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('selection-made', bounds),
  cancelSelection: () => ipcRenderer.invoke('cancel-selection'),
  getSelectionScreenshot: () => ipcRenderer.invoke('get-selection-screenshot'),

  // Text grab functions
  registerTextGrabShortcut: (shortcut: string) => ipcRenderer.invoke('register-textgrab-shortcut', shortcut),
  unregisterTextGrabShortcut: () => ipcRenderer.invoke('unregister-textgrab-shortcut'),
  getCurrentTextGrabShortcut: () => ipcRenderer.invoke('get-current-textgrab-shortcut'),
  extractText: () => ipcRenderer.invoke('extract-text'),

  // Speech-to-text functions
  registerSpeechShortcut: (shortcut: string) => ipcRenderer.invoke('register-speech-shortcut', shortcut),
  unregisterSpeechShortcut: () => ipcRenderer.invoke('unregister-speech-shortcut'),
  getCurrentSpeechShortcut: () => ipcRenderer.invoke('get-current-speech-shortcut'),
  getSpeechModel: () => ipcRenderer.invoke('get-speech-model'),
  setSpeechModel: (model: string) => ipcRenderer.invoke('set-speech-model', model),
  getSelectedMic: () => ipcRenderer.invoke('get-selected-mic'),
  setSelectedMic: (deviceId: string) => ipcRenderer.invoke('set-selected-mic', deviceId),
  shouldStopSpeech: () => ipcRenderer.invoke('should-stop-speech'),
  onStopSpeechRecording: (callback: () => void) => {
    ipcRenderer.on('stop-speech-recording', () => callback())
  },
  removeStopSpeechRecordingListener: () => {
    ipcRenderer.removeAllListeners('stop-speech-recording')
  },
  resizeSpeechPopup: (width: number, height: number) => ipcRenderer.invoke('resize-speech-popup', width, height),
  typeSpeechResult: (text: string) => ipcRenderer.invoke('type-speech-result', text),
  transcribeSpeech: (pcmBuffer: ArrayBuffer, sampleRate: number) => ipcRenderer.invoke('transcribe-speech', pcmBuffer, sampleRate),
  onSpeechProgress: (callback: (message: string) => void) => {
    ipcRenderer.on('speech-progress', (_event, message) => callback(message))
  },
  removeSpeechProgressListener: () => {
    ipcRenderer.removeAllListeners('speech-progress')
  },
  downloadSpeechModel: (model: string) => ipcRenderer.invoke('download-speech-model', model),
  onSpeechModelProgress: (callback: (data: { status: string; progress?: number }) => void) => {
    ipcRenderer.on('speech-model-progress', (_event, data) => callback(data))
  },
  removeSpeechModelProgressListener: () => {
    ipcRenderer.removeAllListeners('speech-model-progress')
  },

  // Custom instructions
  getPromptInstructions: () => ipcRenderer.invoke('get-prompt-instructions'),
  setPromptInstructions: (instructions: string) => ipcRenderer.invoke('set-prompt-instructions', instructions),
  getImageInstructions: () => ipcRenderer.invoke('get-image-instructions'),
  setImageInstructions: (instructions: string) => ipcRenderer.invoke('set-image-instructions', instructions),

  // Master hotkey functions
  registerMasterShortcut: (shortcut: string) => ipcRenderer.invoke('register-master-shortcut', shortcut),
  unregisterMasterShortcut: () => ipcRenderer.invoke('unregister-master-shortcut'),
  getCurrentMasterShortcut: () => ipcRenderer.invoke('get-current-master-shortcut'),
  analyzerPicked: (type: 'prompt' | 'image' | 'textgrab' | 'speech') => ipcRenderer.invoke('analyzer-picked', type),

  // Vibe Mode functions
  getVibeSettings: () => ipcRenderer.invoke('get-vibe-settings'),
  setVibeSites: (sites: string[]) => ipcRenderer.invoke('set-vibe-sites', sites),
  enableVibeMode: (sites: string[]) => ipcRenderer.invoke('enable-vibe-mode', sites),
  disableVibeMode: () => ipcRenderer.invoke('disable-vibe-mode'),

  // AI context generation
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
  ) => ipcRenderer.invoke('generate-ai-context', sessionName, prompts),

  // Score storage functions
  getScores: () => ipcRenderer.invoke('get-scores'),
  saveScore: (userScore: number, refinedScore: number) =>
    ipcRenderer.invoke('save-score', userScore, refinedScore),

  send: (channel: string, data: unknown) => {
    const validChannels = ['toMain']
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },
  receive: (channel: string, func: (...args: unknown[]) => void) => {
    const validChannels = ['fromMain']
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => func(...args))
    }
  },
})
