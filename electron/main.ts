import { app, BrowserWindow, Menu, clipboard, ipcMain, globalShortcut, screen, desktopCapturer, nativeImage, session, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { recognize } from 'tesseract.js'

const isDev = process.env.NODE_ENV !== 'production'

// OpenRouter API configuration
const DEFAULT_OPENROUTER_API_KEY = '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'
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Store API key (can be set from renderer, falls back to default)
let customApiKey: string | null = null

// Custom instructions for analyzers
const getSettingsFilePath = () => path.join(app.getPath('userData'), 'settings.json')

function loadSettings(): {
  promptInstructions?: string
  imageInstructions?: string
  speechModel?: string
  selectedMic?: string
  shortcuts?: { prompt?: string; image?: string; textGrab?: string; speech?: string; master?: string }
  downloadedModels?: Record<string, boolean>
  vibeMode?: { enabled?: boolean; sites?: string[] }
} {
  try {
    const filePath = getSettingsFilePath()
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    }
  } catch (error) {
    console.error('Error loading settings:', error)
  }
  return {}
}

function saveSettings(settings: Record<string, unknown>) {
  try {
    const current = loadSettings()
    const merged = { ...current, ...settings }
    fs.writeFileSync(getSettingsFilePath(), JSON.stringify(merged, null, 2))
  } catch (error) {
    console.error('Error saving settings:', error)
  }
}

let promptInstructions: string = loadSettings().promptInstructions || ''
let imageInstructions: string = loadSettings().imageInstructions || ''

// Scores data file path
const getScoresFilePath = () => {
  return path.join(app.getPath('userData'), 'prompt-scores.json')
}

// Load scores from file
function loadScores(): Array<{ timestamp: string; userScore: number; refinedScore: number }> {
  try {
    const filePath = getScoresFilePath()
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8')
      const scores = JSON.parse(data)
      if (Array.isArray(scores)) {
        return scores
      }
    }
  } catch (error) {
    console.error('Error loading scores:', error)
  }
  return []
}

// Save scores to file (keep last 1000)
function saveScore(userScore: number, refinedScore: number) {
  try {
    const scores = loadScores()
    scores.push({
      timestamp: new Date().toISOString(),
      userScore,
      refinedScore
    })
    // Keep only last 1000 entries
    const trimmedScores = scores.slice(-1000)
    const filePath = getScoresFilePath()
    fs.writeFileSync(filePath, JSON.stringify(trimmedScores, null, 2))
  } catch (error) {
    console.error('Error saving score:', error)
  }
}

let mainWindow: BrowserWindow | null = null
let popupWindow: BrowserWindow | null = null
let selectionWindow: BrowserWindow | null = null
let lastClipboardText = ''
let clipboardInterval: NodeJS.Timeout | null = null
let currentShortcut: string | null = null
let currentImageShortcut: string | null = null
let currentTextGrabShortcut: string | null = null
let currentSpeechShortcut: string | null = null
let isSpeechRecording: boolean = false
let speechShouldStop: boolean = false
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let whisperPipeline: any = null
let whisperModelLevel: string | null = null
let currentMasterShortcut: string | null = null

function isWhisperModelDownloaded(): boolean {
  const settings = loadSettings()
  const modelLevel = settings.speechModel || 'tiny'
  return settings.downloadedModels?.[modelLevel] === true
}
let pickerWindow: BrowserWindow | null = null
let pendingAnalysisType: 'prompt' | 'image' | 'textgrab' | 'speech' | null = null
let pendingSelectionBounds: { x: number; y: number; width: number; height: number } | null = null
let selectionDisplayInfo: { scaleFactor: number; bounds: { x: number; y: number }; size: { width: number; height: number }; displayId: number } | null = null

// Capture screenshot of a specific display or the one where the cursor is located, optionally cropping to bounds
async function captureScreenshot(cropBounds?: { x: number; y: number; width: number; height: number }, targetDisplayId?: number): Promise<string> {
  // Get all displays (don't sort - keep original order to match sources order)
  const allDisplays = screen.getAllDisplays()

  // Use specified display or find which display the cursor is on
  let activeDisplay: Electron.Display

  if (targetDisplayId !== undefined) {
    activeDisplay = allDisplays.find(d => d.id === targetDisplayId) || allDisplays[0]
  } else {
    const cursorPoint = screen.getCursorScreenPoint()
    activeDisplay = screen.getDisplayNearestPoint(cursorPoint)
  }

  const activeDisplayIndex = allDisplays.findIndex(d => d.id === activeDisplay.id)

  console.log('=== Screenshot Capture Debug ===')
  console.log('Target display index:', activeDisplayIndex, 'ID:', activeDisplay.id)
  console.log('Display bounds:', activeDisplay.bounds)
  console.log('Display size:', activeDisplay.size, 'Scale:', activeDisplay.scaleFactor)

  // Request large enough thumbnails to capture any display at good quality
  const maxSize = 4096

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: maxSize, height: maxSize }
  })

  if (sources.length === 0) {
    throw new Error('No screen sources found')
  }

  console.log('Sources count:', sources.length, 'Displays count:', allDisplays.length)
  sources.forEach((s, i) => {
    console.log(`Source ${i}: id=${s.id}, name="${s.name}", display_id=${s.display_id}, thumb=${s.thumbnail.getSize().width}x${s.thumbnail.getSize().height}`)
  })
  allDisplays.forEach((d, i) => {
    console.log(`Display ${i}: id=${d.id}, bounds=(${d.bounds.x},${d.bounds.y}), size=${d.size.width}x${d.size.height}, scale=${d.scaleFactor}`)
  })

  // Find the source that matches the active display
  let targetSource = sources[0]
  let matchMethod = 'default (first source)'

  // Method 1: Try to match by display_id (most reliable if available)
  for (const source of sources) {
    if (source.display_id && source.display_id.toString() === activeDisplay.id.toString()) {
      targetSource = source
      matchMethod = 'display_id match'
      break
    }
  }

  // Method 2: Match by extracting screen number from source.id and comparing to display index
  // On Windows, source.id is like "screen:0:0" where the first number often corresponds to display order
  if (matchMethod.startsWith('default')) {
    const sourceWithMatchingIndex = sources.find(source => {
      const match = source.id.match(/screen:(\d+):/)
      if (match) {
        const screenNum = parseInt(match[1], 10)
        return screenNum === activeDisplayIndex
      }
      return false
    })
    if (sourceWithMatchingIndex) {
      targetSource = sourceWithMatchingIndex
      matchMethod = 'source.id screen number'
    }
  }

  // Method 3: If sources and displays are same count, assume they're in the same order
  if (matchMethod.startsWith('default') && sources.length === allDisplays.length && activeDisplayIndex >= 0) {
    targetSource = sources[activeDisplayIndex]
    matchMethod = 'array index (same count)'
  }

  // Method 4: Check if target is primary display and match to "Screen 1" or "Entire Screen"
  if (matchMethod.startsWith('default')) {
    const primaryDisplay = screen.getPrimaryDisplay()
    const isTargetPrimary = activeDisplay.id === primaryDisplay.id

    if (isTargetPrimary) {
      // Primary display is often "Screen 1" or first in the list
      const primarySource = sources.find(s =>
        s.name.includes('Screen 1') ||
        s.name.includes('Entire Screen') ||
        s.name.toLowerCase().includes('primary')
      ) || sources[0]
      targetSource = primarySource
      matchMethod = 'primary display heuristic'
    } else {
      // For non-primary, try "Screen 2", "Screen 3" etc based on display index
      const displayNum = activeDisplayIndex + 1
      const secondarySource = sources.find(s => s.name.includes(`Screen ${displayNum}`))
      if (secondarySource) {
        targetSource = secondarySource
        matchMethod = `screen name "Screen ${displayNum}"`
      }
    }
  }

  // Method 5: Match by comparing thumbnail aspect ratio to display aspect ratio
  if (matchMethod.startsWith('default') && sources.length > 1) {
    const displayAspect = activeDisplay.size.width / activeDisplay.size.height
    let bestMatch = sources[0]
    let bestDiff = Infinity

    for (const source of sources) {
      const thumbSize = source.thumbnail.getSize()
      const thumbAspect = thumbSize.width / thumbSize.height
      const diff = Math.abs(thumbAspect - displayAspect)
      if (diff < bestDiff) {
        bestDiff = diff
        bestMatch = source
      }
    }
    if (bestDiff < 0.1) {
      targetSource = bestMatch
      matchMethod = 'aspect ratio match'
    }
  }

  console.log('Selected source:', targetSource.id, `"${targetSource.name}"`, '| Method:', matchMethod)
  console.log('=== End Debug ===')

  let thumbnail = targetSource.thumbnail

  // Store the full (uncropped) NativeImage for later use by cropStoredScreenshot
  selectionNativeImage = thumbnail

  // Crop to selected region if bounds provided
  if (cropBounds && selectionDisplayInfo) {
    const { size: displaySize } = selectionDisplayInfo

    // The selection bounds are in CSS/client coordinates (0-based, relative to the
    // selection overlay window which covers the entire display).
    // We need to map these to thumbnail pixel coordinates using the ratio of
    // thumbnail size to display CSS dimensions.
    const imageSize = thumbnail.getSize()
    const scaleX = imageSize.width / displaySize.width
    const scaleY = imageSize.height / displaySize.height

    const cropX = Math.round(cropBounds.x * scaleX)
    const cropY = Math.round(cropBounds.y * scaleY)
    const cropWidth = Math.round(cropBounds.width * scaleX)
    const cropHeight = Math.round(cropBounds.height * scaleY)

    // Ensure we don't exceed image bounds
    const safeX = Math.max(0, Math.min(cropX, imageSize.width - 1))
    const safeY = Math.max(0, Math.min(cropY, imageSize.height - 1))
    const safeWidth = Math.min(cropWidth, imageSize.width - safeX)
    const safeHeight = Math.min(cropHeight, imageSize.height - safeY)

    if (safeWidth > 0 && safeHeight > 0) {
      thumbnail = thumbnail.crop({
        x: safeX,
        y: safeY,
        width: safeWidth,
        height: safeHeight
      })
    }
  }

  // Convert to base64 JPEG (much smaller than PNG for faster API uploads)
  const jpegBuffer = thumbnail.toJPEG(85)
  const dataUrl = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`
  return dataUrl
}

// Analyze screenshot directly with vision AI - reads text AND analyzes prompt in a single call
async function analyzeScreenshotWithVision(imageDataUrl: string, apiKey: string): Promise<{ prompt: string; score: number; feedback: string; improvedPrompt: string; refinedScore: number }> {
  const systemPrompt = `You are an expert prompt analyst. You will receive a screenshot of a user's screen. Read ALL visible text directly from the image.

STEP 1 - READ AND UNDERSTAND THE CONTEXT:
Look at the screenshot and read all visible text. Understand what's happening:
- What application/website is the user using? (ChatGPT, Claude, Claude Code, VS Code, browser, etc.)
- What is the overall context? (coding session, chat conversation, document editing, etc.)
- What parts are UI/interface vs actual content?
- What is the user trying to accomplish?

STEP 2 - IDENTIFY THE USER'S ACTUAL PROMPT:
Based on what you see, find the REAL prompt the user wrote or is writing to an AI.

THESE ARE NOT USER PROMPTS (ignore them):
- UI text: buttons, menus, labels, tooltips, status bars
- System/placeholder text: "What should Claude do next?", "How can I help?", "Type a message...", "Enter your prompt"
- AI RESPONSES: Long explanatory text, code explanations, answers FROM an AI assistant
- Claude Code specific: Task notifications, file paths, tool outputs, system reminders, "[Request interrupted]"
- Terminal/console output, error messages, log entries
- Instructions directed AT the user (help text, documentation)

THESE ARE LIKELY USER PROMPTS (look for these):
- Short to medium requests/questions written BY the user TO an AI
- Text that asks for something: "make it so...", "can you...", "please...", "fix the...", "add a..."
- Specific instructions or feature requests
- Questions about code, errors, or how to do something
- The most recent user message in a chat flow

STEP 3 - RATE THE PROMPT (1-100):
- Clarity: Is it clear what they want?
- Specificity: Enough context provided?
- Structure: Well-organized?
- Completeness: All necessary details included?

STEP 4 - CREATE AN IMPROVED VERSION:
Rewrite the user's prompt to be better while keeping the SAME intent and request. The improved version should:
- Be clearer and more specific
- Add helpful context where missing
- Be well-structured
- Remove ambiguity
- Keep the same tone and goal as the original
- NOT change what the user is asking for, just how they ask it

IMPORTANT GUIDELINES FOR IMPROVED PROMPT:
- DO NOT add generic placeholder examples like "e.g., [example]" or "[insert X here]"
- Instead, USE THE CONTEXT you can see on screen - reference actual file names, variable names, project details, or patterns visible in the screenshot
- If the user is working on a specific project, reference "the existing style/pattern in this project" or "following the current implementation"
- Keep it natural and ready-to-use without the user needing to fill in blanks
- The improved prompt should be something the user can copy and paste directly

If no user prompt is found (only UI/AI responses visible), score = 0, improvedPrompt should be empty, and refinedScore = 0.

STEP 5 - RATE THE IMPROVED PROMPT:
Score your improved version using the same criteria. The refined score should reflect how much better the improved prompt is.

Respond with ONLY this JSON, no other text:
{"prompt": "the exact user prompt identified", "score": <number 1-100>, "feedback": "brief explanation of what could be improved", "improvedPrompt": "the rewritten better version of the prompt", "refinedScore": <number 1-100>}`

  const finalPrompt = promptInstructions
    ? `${systemPrompt}\n\nADDITIONAL USER INSTRUCTIONS (follow these when analyzing and improving the prompt):\n${promptInstructions}`
    : systemPrompt

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://vector.app',
      'X-Title': 'Vector Prompt Analyzer'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        { role: 'system', content: finalPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Read all the text on this screenshot and analyze the user\'s prompt:' },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        }
      ],
      temperature: 0.3,
      max_tokens: 1500
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('No response from AI')
  }

  // Parse JSON from response
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    throw new Error('Could not parse AI response')
  } catch (e) {
    console.error('Parse error:', e, 'Content:', content)
    return {
      prompt: 'Could not identify prompt',
      score: 50,
      feedback: content.substring(0, 200),
      improvedPrompt: '',
      refinedScore: 50
    }
  }
}

// Analyze image and generate AI-friendly description
async function analyzeImageWithAI(imageBase64: string, apiKey: string): Promise<{ description: string }> {
  const systemPrompt = `You are an expert at describing visual design and UI styling for AI systems. Your primary focus is on HOW things look and are arranged, NOT what they say or mean.

PRIORITY ORDER (focus most on #1-3):

1. **Visual Style & Design** (MOST IMPORTANT - be very detailed here):
   - Color scheme: background colors, text colors, accent colors, gradients (use hex codes when possible)
   - Typography: font families (serif/sans-serif/monospace), sizes (small/medium/large), weights (light/regular/medium/bold), line heights
   - Spacing: padding, margins, gaps between elements (tight/comfortable/spacious)
   - Borders: styles (solid/dashed/none), widths, colors, radius (sharp/slightly rounded/very rounded/pill-shaped)
   - Shadows: box shadows, text shadows, drop shadows (subtle/medium/heavy)
   - Effects: blur, opacity, overlays, gradients
   - Theme: dark mode vs light mode, color temperature (warm/cool/neutral)
   - Design aesthetic: minimal, modern, classic, playful, corporate, technical, etc.

2. **Layout & Structure** (VERY IMPORTANT):
   - Overall page/component structure (single column, multi-column, grid, flex)
   - Visual hierarchy: what draws attention first, second, third
   - Alignment patterns (left/center/right, vertical centering)
   - Section divisions: how content areas are separated (cards, dividers, whitespace, backgrounds)
   - Responsive indicators: any visible breakpoint behavior
   - Navigation placement and style
   - Content density (sparse/balanced/dense)

3. **UI Components & Patterns**:
   - Types of components visible (buttons, inputs, cards, modals, tooltips, tabs, etc.)
   - Button styles (filled/outlined/ghost/link)
   - Input field styling (bordered/underlined/filled)
   - Icon style (outlined/filled, size, color)
   - Interactive states visible (hover, focus, active, disabled)
   - Animation indicators (if apparent from the static image)

4. **Brief Context** (keep minimal):
   - Type of UI (web app, mobile, dashboard, landing page, etc.)
   - General purpose (e.g., "settings panel", "data table", "login form") - just a few words

DO NOT focus on:
- Specific text content (only mention if relevant to styling, e.g., "button text is uppercase")
- What the application does or its features
- Data or information being displayed
- User actions or workflows

Format as a clear, structured description optimized for an AI trying to recreate or understand the visual design. Be specific and technical about styling choices.`

  const finalPrompt = imageInstructions
    ? `${systemPrompt}\n\nADDITIONAL USER INSTRUCTIONS (follow these when describing the image):\n${imageInstructions}`
    : systemPrompt

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://vector.app',
      'X-Title': 'Vector Image Analyzer'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        { role: 'system', content: finalPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Please describe this image in detail for AI consumption:' },
            { type: 'image_url', image_url: { url: imageBase64 } }
          ]
        }
      ],
      temperature: 0.3,
      max_tokens: 1500
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content

  if (!content) {
    throw new Error('No response from AI')
  }

  return { description: content }
}

// Extract text from image using local Tesseract.js OCR (no API needed)
async function extractTextFromImage(imageDataUrl: string): Promise<{ text: string }> {
  // Convert data URL to a PNG buffer for Tesseract
  const img = nativeImage.createFromDataURL(imageDataUrl)
  const pngBuffer = img.toPNG()

  console.log('Running Tesseract OCR on image...')
  const { data } = await recognize(pngBuffer, 'eng')

  const text = data.text.trim()
  if (!text) {
    return { text: '[No text found]' }
  }

  return { text }
}

// Main image analysis function
async function analyzeImageScreen(apiKey: string, bounds?: { x: number; y: number; width: number; height: number }, displayId?: number): Promise<{ description: string }> {
  try {
    // Capture screenshot (optionally cropped to selected region)
    console.log('Capturing screenshot for image analysis...', bounds ? `Region: ${bounds.width}x${bounds.height}` : 'Full screen')
    const screenshot = await captureScreenshot(bounds, displayId)

    // Analyze with vision model
    console.log('Analyzing image with AI...')
    const result = await analyzeImageWithAI(screenshot, apiKey)

    return result
  } catch (error) {
    console.error('Image analysis error:', error)
    throw error
  }
}

// Main analysis function - captures screenshot and analyzes with vision AI in a single call
async function analyzeScreen(apiKey: string, bounds?: { x: number; y: number; width: number; height: number }, displayId?: number): Promise<{ prompt: string; score: number; feedback: string; improvedPrompt: string; refinedScore: number; screenText: string }> {
  // Step 1: Take screenshot (optionally cropped to selected region)
  console.log('Capturing screenshot...', bounds ? `Region: ${bounds.width}x${bounds.height}` : 'Full screen')
  const screenshot = await captureScreenshot(bounds, displayId)
  console.log('Screenshot captured, data URL length:', screenshot.length)

  // Step 2: Analyze screenshot directly with vision AI (single call - reads text + analyzes prompt)
  console.log('Analyzing screenshot with vision AI...')
  const analysis = await analyzeScreenshotWithVision(screenshot, apiKey)

  return {
    ...analysis,
    screenText: analysis.prompt
  }
}

function createWindow() {
  // Remove the application menu
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a0a',
      symbolColor: '#666666',
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Start clipboard monitoring
  startClipboardMonitoring()

  mainWindow.on('closed', () => {
    mainWindow = null
    if (clipboardInterval) {
      clearInterval(clipboardInterval)
    }
  })
}

function createPopupWindow() {
  // Close existing popup if open
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.close()
    popupWindow = null
  }

  // Get cursor position
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { bounds } = display

  // Popup dimensions
  const popupWidth = 450
  const popupHeight = 520

  // Calculate position (centered on cursor, but keep within screen bounds)
  let x = Math.round(cursorPoint.x - popupWidth / 2)
  let y = Math.round(cursorPoint.y - 20) // Slightly above cursor

  // Keep within screen bounds
  if (x < bounds.x) x = bounds.x + 10
  if (x + popupWidth > bounds.x + bounds.width) x = bounds.x + bounds.width - popupWidth - 10
  if (y < bounds.y) y = bounds.y + 10
  if (y + popupHeight > bounds.y + bounds.height) y = bounds.y + bounds.height - popupHeight - 10

  popupWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x,
    y,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#0a0a0a',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Load the popup route
  if (isDev) {
    popupWindow.loadURL('http://localhost:5173/#/popup')
  } else {
    popupWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: '/popup'
    })
  }

  // Show window once ready
  popupWindow.once('ready-to-show', () => {
    popupWindow?.show()
  })

  // Note: We don't auto-close on blur anymore since analysis can take time
  // User can press ESC or click Close button to dismiss

  popupWindow.on('closed', () => {
    popupWindow = null
  })
}

function createImagePopupWindow() {
  // Close existing popup if open
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.close()
    popupWindow = null
  }

  // Get cursor position
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { bounds } = display

  // Popup dimensions - taller to accommodate chat
  const popupWidth = 520
  const popupHeight = 580

  // Calculate position (centered on cursor, but keep within screen bounds)
  let x = Math.round(cursorPoint.x - popupWidth / 2)
  let y = Math.round(cursorPoint.y - 20) // Slightly above cursor

  // Keep within screen bounds
  if (x < bounds.x) x = bounds.x + 10
  if (x + popupWidth > bounds.x + bounds.width) x = bounds.x + bounds.width - popupWidth - 10
  if (y < bounds.y) y = bounds.y + 10
  if (y + popupHeight > bounds.y + bounds.height) y = bounds.y + bounds.height - popupHeight - 10

  popupWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x,
    y,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#0a0a0a',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Load the image popup route
  if (isDev) {
    popupWindow.loadURL('http://localhost:5173/#/image-popup')
  } else {
    popupWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: '/image-popup'
    })
  }

  // Show window once ready
  popupWindow.once('ready-to-show', () => {
    popupWindow?.show()
  })

  popupWindow.on('closed', () => {
    popupWindow = null
  })
}

function createTextGrabPopupWindow() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.close()
    popupWindow = null
  }

  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { bounds } = display

  const popupWidth = 480
  const popupHeight = 520

  let x = Math.round(cursorPoint.x - popupWidth / 2)
  let y = Math.round(cursorPoint.y - 20)

  if (x < bounds.x) x = bounds.x + 10
  if (x + popupWidth > bounds.x + bounds.width) x = bounds.x + bounds.width - popupWidth - 10
  if (y < bounds.y) y = bounds.y + 10
  if (y + popupHeight > bounds.y + bounds.height) y = bounds.y + bounds.height - popupHeight - 10

  popupWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x,
    y,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#0a0a0a',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (isDev) {
    popupWindow.loadURL('http://localhost:5173/#/textgrab-popup')
  } else {
    popupWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: '/textgrab-popup'
    })
  }

  popupWindow.once('ready-to-show', () => {
    popupWindow?.show()
  })

  popupWindow.on('closed', () => {
    popupWindow = null
  })
}

// Speech shortcut: hold to record, release to transcribe.
// Electron's globalShortcut only fires keydown (with OS key-repeat). There is
// no keyup event, and the repeat delay varies (250-1000 ms) so timeout-based
// detection is unreliable. Instead, once recording starts we spawn a tiny
// PowerShell process that polls the *actual* key state via user32!GetAsyncKeyState.
// When the physical key is released the process exits and we send the stop signal.

// Map Electron accelerator key names → Windows virtual-key codes
const VK: Record<string, number> = {
  ...(Object.fromEntries(Array.from({ length: 26 }, (_, i) => [String.fromCharCode(97 + i), 0x41 + i]))),  // a-z
  ...(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), 0x30 + i]))),                     // 0-9
  ...(Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`f${i + 1}`, 0x70 + i]))),                   // f1-f24
  space: 0x20, enter: 0x0D, return: 0x0D, tab: 0x09, escape: 0x1B, backspace: 0x08,
  delete: 0x2E, insert: 0x2D, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
  up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  ',': 0xBC, '.': 0xBE, '/': 0xBF, ';': 0xBA, "'": 0xDE, '[': 0xDB, ']': 0xDD,
  '\\': 0xDC, '-': 0xBD, '=': 0xBB, '`': 0xC0,
  numpad0: 0x60, numpad1: 0x61, numpad2: 0x62, numpad3: 0x63, numpad4: 0x64,
  numpad5: 0x65, numpad6: 0x66, numpad7: 0x67, numpad8: 0x68, numpad9: 0x69,
  numpadadd: 0x6B, numpadsubtract: 0x6D, numpadmultiply: 0x6A, numpaddivide: 0x6F, numpaddecimal: 0x6E,
}
const MODIFIER_NAMES = new Set(['ctrl', 'control', 'alt', 'shift', 'super', 'meta', 'command', 'commandorcontrol', 'cmdorctrl'])

/** Return the VK code of the primary (non-modifier) key in an Electron shortcut string, or null. */
function shortcutMainVK(shortcut: string): number | null {
  const parts = shortcut.toLowerCase().split('+').map(s => s.trim())
  const main = parts.find(p => !MODIFIER_NAMES.has(p))
  return main ? VK[main] ?? null : null
}

/** Spawn a PowerShell process that exits as soon as the given virtual key is released. */
function waitForKeyRelease(vkCode: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const ps = `$d='[DllImport("user32.dll")]public static extern short GetAsyncKeyState(int v);';` +
      `$t=Add-Type -MemberDefinition $d -Name K -Namespace W -PassThru;` +
      `while(($t::GetAsyncKeyState(${vkCode})-band 0x8000)-ne 0){Start-Sleep -Milliseconds 50}`
    const proc = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 120000 }, () => resolve())
    // Safety: if popup closes before key release, kill the watcher
    const onPopupClosed = () => { try { proc.kill() } catch (_) { /* */ } }
    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.once('closed', onPopupClosed)
    }
  })
}

function handleSpeechShortcutPress() {
  // While recording, ignore every globalShortcut repeat
  if (isSpeechRecording) return

  // If state says recording but popup is gone, reset
  if (!popupWindow || popupWindow?.isDestroyed()) {
    isSpeechRecording = false
    speechShouldStop = false
  }

  // Check if the Whisper model has been downloaded
  if (!isWhisperModelDownloaded()) {
    const modelLevel = loadSettings().speechModel || 'tiny'
    const modelName = modelLevel.charAt(0).toUpperCase() + modelLevel.slice(1)
    dialog.showMessageBox({
      type: 'info',
      title: 'Whisper Model Not Downloaded',
      message: `The ${modelName} speech model hasn't been downloaded yet.`,
      detail: 'Go to Settings \u2192 Speech tab and download the model before using speech-to-text.',
      buttons: ['OK'],
    })
    return
  }

  // Start recording
  isSpeechRecording = true
  speechShouldStop = false
  createSpeechPopupWindow()
  console.log('[Speech] Recording started — release hotkey to stop')

  // Detect actual key release via Windows API
  const vk = shortcutMainVK(currentSpeechShortcut || '')
  if (vk !== null && process.platform === 'win32') {
    waitForKeyRelease(vk).then(() => {
      if (isSpeechRecording && !speechShouldStop) {
        speechShouldStop = true
        console.log('[Speech] Key physically released — stop signal sent')
      }
    })
  }
}

let speechPopupGen = 0

function createSpeechPopupWindow() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.close()
    popupWindow = null
  }

  const gen = ++speechPopupGen

  // Position at bottom center of the active display
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { bounds, workArea } = display

  const popupWidth = 200
  const popupHeight = 28

  const x = Math.round(bounds.x + (bounds.width - popupWidth) / 2)
  const y = workArea.y + workArea.height - popupHeight - 28

  popupWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x,
    y,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#0a0a0a',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })

  if (isDev) {
    popupWindow.loadURL('http://localhost:5173/#/speech-popup')
  } else {
    popupWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: '/speech-popup'
    })
  }

  popupWindow.once('ready-to-show', () => {
    if (!popupWindow) return
    // Show without stealing focus — backgroundThrottling:false keeps timers/rAF alive
    popupWindow.showInactive()
  })

  popupWindow.on('closed', () => {
    popupWindow = null
    // Only reset speech state if this is still the active speech popup.
    // A stale popup closing (replaced by a new one) must not clobber state.
    if (gen === speechPopupGen) {
      isSpeechRecording = false
      speechShouldStop = false
    }
  })
}

function createAnalyzerPickerWindow() {
  // Close existing picker if open
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.close()
    pickerWindow = null
  }

  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { bounds } = display

  const popupWidth = 340
  const popupHeight = 300

  let x = Math.round(cursorPoint.x - popupWidth / 2)
  let y = Math.round(cursorPoint.y - popupHeight / 2)

  if (x < bounds.x) x = bounds.x + 10
  if (x + popupWidth > bounds.x + bounds.width) x = bounds.x + bounds.width - popupWidth - 10
  if (y < bounds.y) y = bounds.y + 10
  if (y + popupHeight > bounds.y + bounds.height) y = bounds.y + bounds.height - popupHeight - 10

  pickerWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x,
    y,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#0a0a0a',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (isDev) {
    pickerWindow.loadURL('http://localhost:5173/#/analyzer-picker')
  } else {
    pickerWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: '/analyzer-picker'
    })
  }

  pickerWindow.once('ready-to-show', () => {
    pickerWindow?.show()
  })

  pickerWindow.on('closed', () => {
    pickerWindow = null
  })
}

// Store screenshot for selection overlay background
let selectionScreenshot: string | null = null
let selectionNativeImage: Electron.NativeImage | null = null

async function createSelectionOverlay() {
  // Close existing selection window if open
  if (selectionWindow && !selectionWindow.isDestroyed()) {
    selectionWindow.close()
    selectionWindow = null
  }

  // Get cursor position and find which display it's on
  const cursorPoint = screen.getCursorScreenPoint()
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint)

  // Store display info for coordinate conversion later
  selectionDisplayInfo = {
    scaleFactor: activeDisplay.scaleFactor || 1,
    bounds: { x: activeDisplay.bounds.x, y: activeDisplay.bounds.y },
    size: { width: activeDisplay.bounds.width, height: activeDisplay.bounds.height },
    displayId: activeDisplay.id
  }

  // Capture screenshot first to use as background (more reliable than transparency)
  // Pass the display ID to ensure we capture the correct monitor
  try {
    console.log('Capturing selection screenshot...')
    const screenshot = await captureScreenshot(undefined, activeDisplay.id)
    console.log('Selection screenshot captured, length:', screenshot?.length || 0)
    if (screenshot && screenshot.length > 100) {
      selectionScreenshot = screenshot
    } else {
      console.error('Screenshot capture returned empty or invalid data')
      selectionScreenshot = null
      selectionNativeImage = null
    }
  } catch (error) {
    console.error('Failed to capture screenshot for selection:', error)
    selectionScreenshot = null
    selectionNativeImage = null
  }

  selectionWindow = new BrowserWindow({
    x: activeDisplay.bounds.x,
    y: activeDisplay.bounds.y,
    width: activeDisplay.bounds.width,
    height: activeDisplay.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreen: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Remove menu for selection window
  selectionWindow.setMenu(null)

  // Load the selection overlay route
  if (isDev) {
    selectionWindow.loadURL('http://localhost:5173/#/selection')
  } else {
    selectionWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: '/selection'
    })
  }

  // Show window immediately once ready — no screenshot loading needed
  selectionWindow.once('ready-to-show', () => {
    if (selectionWindow) {
      selectionWindow.show()
      selectionWindow.setAlwaysOnTop(true, 'screen-saver')
      selectionWindow.focus()
    }
  })

  selectionWindow.on('closed', () => {
    selectionWindow = null
    // Don't clear selectionDisplayInfo or selectionScreenshot here
    // They will be cleared after analysis completes
  })
}

function startClipboardMonitoring() {
  // Initialize with current clipboard content
  lastClipboardText = clipboard.readText()

  // Poll clipboard every 500ms
  clipboardInterval = setInterval(() => {
    const currentText = clipboard.readText()
    if (currentText && currentText !== lastClipboardText) {
      lastClipboardText = currentText
      mainWindow?.webContents.send('clipboard-change', currentText)
    }
  }, 500)
}

// Handle request for current clipboard content
ipcMain.handle('get-clipboard', () => {
  return clipboard.readText()
})

// Handle writing to clipboard
ipcMain.handle('write-clipboard', (_event, text: string) => {
  clipboard.writeText(text)
  lastClipboardText = text
  return true
})

// Close popup window
ipcMain.handle('close-popup', () => {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.close()
    popupWindow = null
  }
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.close()
    pickerWindow = null
  }
  isSpeechRecording = false
  speechShouldStop = false
  return true
})

// Resize speech popup (for expanding from pill to results view)
ipcMain.handle('resize-speech-popup', (_event, width: number, height: number) => {
  if (popupWindow && !popupWindow.isDestroyed()) {
    // Keep it centered at bottom of screen
    const cursorPoint = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursorPoint)
    const { bounds, workArea } = display
    const newX = Math.round(bounds.x + (bounds.width - width) / 2)
    const newY = workArea.y + workArea.height - height - 40
    popupWindow.setBounds({ x: newX, y: newY, width, height }, true)
  }
  return true
})

// Register global shortcut for prompt analyzer
ipcMain.handle('register-shortcut', (_event, shortcut: string) => {
  try {
    // Unregister previous shortcut if exists
    if (currentShortcut) {
      globalShortcut.unregister(currentShortcut)
    }

    // Register new shortcut - now opens selection overlay first
    const success = globalShortcut.register(shortcut, () => {
      pendingAnalysisType = 'prompt'
      // Add small delay to ensure any previous windows are fully closed
      setTimeout(() => {
        createSelectionOverlay().catch(err => console.error('Selection overlay error:', err))
      }, 50)
    })

    if (success) {
      currentShortcut = shortcut
      const s = loadSettings(); const sc = s.shortcuts || {}; sc.prompt = shortcut; saveSettings({ shortcuts: sc })
      return { success: true }
    } else {
      return { success: false, error: 'Shortcut registration failed' }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Unregister shortcut
ipcMain.handle('unregister-shortcut', () => {
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut)
    currentShortcut = null
    const s = loadSettings(); const sc = s.shortcuts || {}; delete sc.prompt; saveSettings({ shortcuts: sc })
  }
  return true
})

// Get current shortcut
ipcMain.handle('get-current-shortcut', () => {
  return currentShortcut
})

// Register global shortcut for image analyzer
ipcMain.handle('register-image-shortcut', (_event, shortcut: string) => {
  try {
    // Unregister previous shortcut if exists
    if (currentImageShortcut) {
      globalShortcut.unregister(currentImageShortcut)
    }

    // Register new shortcut - opens selection overlay for image analysis
    const success = globalShortcut.register(shortcut, () => {
      pendingAnalysisType = 'image'
      // Add small delay to ensure any previous windows are fully closed
      setTimeout(() => {
        createSelectionOverlay().catch(err => console.error('Selection overlay error:', err))
      }, 50)
    })

    if (success) {
      currentImageShortcut = shortcut
      const s = loadSettings(); const sc = s.shortcuts || {}; sc.image = shortcut; saveSettings({ shortcuts: sc })
      return { success: true }
    } else {
      return { success: false, error: 'Shortcut registration failed' }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Unregister image shortcut
ipcMain.handle('unregister-image-shortcut', () => {
  if (currentImageShortcut) {
    globalShortcut.unregister(currentImageShortcut)
    currentImageShortcut = null
    const s = loadSettings(); const sc = s.shortcuts || {}; delete sc.image; saveSettings({ shortcuts: sc })
  }
  return true
})

// Get current image shortcut
ipcMain.handle('get-current-image-shortcut', () => {
  return currentImageShortcut
})

// Register global shortcut for text grab
ipcMain.handle('register-textgrab-shortcut', (_event, shortcut: string) => {
  try {
    if (currentTextGrabShortcut) {
      globalShortcut.unregister(currentTextGrabShortcut)
    }

    const success = globalShortcut.register(shortcut, () => {
      pendingAnalysisType = 'textgrab'
      setTimeout(() => {
        createSelectionOverlay().catch(err => console.error('Selection overlay error:', err))
      }, 50)
    })

    if (success) {
      currentTextGrabShortcut = shortcut
      const s = loadSettings(); const sc = s.shortcuts || {}; sc.textGrab = shortcut; saveSettings({ shortcuts: sc })
      return { success: true }
    } else {
      return { success: false, error: 'Shortcut registration failed' }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('unregister-textgrab-shortcut', () => {
  if (currentTextGrabShortcut) {
    globalShortcut.unregister(currentTextGrabShortcut)
    currentTextGrabShortcut = null
    const s = loadSettings(); const sc = s.shortcuts || {}; delete sc.textGrab; saveSettings({ shortcuts: sc })
  }
  return true
})

ipcMain.handle('get-current-textgrab-shortcut', () => {
  return currentTextGrabShortcut
})

// Register global shortcut for speech-to-text (hold to record, release to transcribe)
ipcMain.handle('register-speech-shortcut', (_event, shortcut: string) => {
  try {
    if (currentSpeechShortcut) {
      globalShortcut.unregister(currentSpeechShortcut)
    }

    const success = globalShortcut.register(shortcut, handleSpeechShortcutPress)

    if (success) {
      currentSpeechShortcut = shortcut
      const s = loadSettings(); const sc = s.shortcuts || {}; sc.speech = shortcut; saveSettings({ shortcuts: sc })
      return { success: true }
    } else {
      return { success: false, error: 'Shortcut registration failed' }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('unregister-speech-shortcut', () => {
  if (currentSpeechShortcut) {
    globalShortcut.unregister(currentSpeechShortcut)
    currentSpeechShortcut = null
    const s = loadSettings(); const sc = s.shortcuts || {}; delete sc.speech; saveSettings({ shortcuts: sc })
  }
  isSpeechRecording = false
  return true
})

ipcMain.handle('get-current-speech-shortcut', () => {
  return currentSpeechShortcut
})

// Polling endpoint: popup asks if it should stop recording (avoids webContents.send disposed frame errors)
ipcMain.handle('should-stop-speech', () => {
  if (speechShouldStop) {
    speechShouldStop = false
    console.log('[Speech] Popup polled: returning STOP')
    return true
  }
  return false
})

// Register global master shortcut (opens analyzer picker)
ipcMain.handle('register-master-shortcut', (_event, shortcut: string) => {
  try {
    if (currentMasterShortcut) {
      globalShortcut.unregister(currentMasterShortcut)
    }

    const success = globalShortcut.register(shortcut, () => {
      createAnalyzerPickerWindow()
    })

    if (success) {
      currentMasterShortcut = shortcut
      const s = loadSettings(); const sc = s.shortcuts || {}; sc.master = shortcut; saveSettings({ shortcuts: sc })
      return { success: true }
    } else {
      return { success: false, error: 'Shortcut registration failed' }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('unregister-master-shortcut', () => {
  if (currentMasterShortcut) {
    globalShortcut.unregister(currentMasterShortcut)
    currentMasterShortcut = null
    const s = loadSettings(); const sc = s.shortcuts || {}; delete sc.master; saveSettings({ shortcuts: sc })
  }
  return true
})

ipcMain.handle('get-current-master-shortcut', () => {
  return currentMasterShortcut
})

// Handle analyzer picked from picker popup
ipcMain.handle('analyzer-picked', (_event, type: 'prompt' | 'image' | 'textgrab' | 'speech') => {
  // Close the picker window
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.close()
    pickerWindow = null
  }

  // Speech doesn't need selection overlay — go straight to recording popup
  if (type === 'speech') {
    handleSpeechShortcutPress()
    return
  }

  pendingAnalysisType = type
  setTimeout(() => {
    createSelectionOverlay().catch(err => console.error('Selection overlay error:', err))
  }, 50)
})

// Extract text from selected screen region (local OCR, no API key needed)
ipcMain.handle('extract-text', async () => {
  try {
    const bounds = pendingSelectionBounds
    pendingSelectionBounds = null

    let screenshot: string

    if (selectionScreenshot && bounds) {
      console.log('Cropping stored screenshot for text extraction:', bounds)
      screenshot = cropStoredScreenshot(selectionScreenshot, bounds)
    } else {
      console.log('No stored screenshot, capturing new one for text extraction...')
      const displayId = selectionDisplayInfo?.displayId
      screenshot = await captureScreenshot(bounds || undefined, displayId)
    }

    console.log('Extracting text with local OCR...')
    const result = await extractTextFromImage(screenshot)

    selectionDisplayInfo = null
    selectionScreenshot = null
    selectionNativeImage = null

    return { success: true, data: result }
  } catch (error) {
    console.error('Text extraction error:', error)
    pendingSelectionBounds = null
    selectionDisplayInfo = null
    selectionScreenshot = null
    selectionNativeImage = null
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
})

// Analyze image (for test button) - opens selection overlay
ipcMain.handle('analyze-image', async () => {
  pendingAnalysisType = 'image'
  await createSelectionOverlay()
  return { success: true }
})

// Set custom OpenRouter API key (optional override)
ipcMain.handle('set-api-key', (_event, apiKey: string) => {
  customApiKey = apiKey.trim() || null
  return true
})

// Get custom API key (returns empty if using default)
ipcMain.handle('get-api-key', () => {
  return customApiKey || ''
})

// Check if using default key
ipcMain.handle('has-default-key', () => {
  return !!DEFAULT_OPENROUTER_API_KEY && DEFAULT_OPENROUTER_API_KEY !== 'YOUR_DEFAULT_API_KEY_HERE'
})

// Custom instructions for analyzers
ipcMain.handle('get-prompt-instructions', () => {
  return promptInstructions
})

ipcMain.handle('set-prompt-instructions', (_event, instructions: string) => {
  promptInstructions = instructions
  saveSettings({ promptInstructions: instructions })
  return true
})

ipcMain.handle('get-image-instructions', () => {
  return imageInstructions
})

ipcMain.handle('set-image-instructions', (_event, instructions: string) => {
  imageInstructions = instructions
  saveSettings({ imageInstructions: instructions })
  return true
})

// Speech-to-text model setting
ipcMain.handle('get-speech-model', () => {
  const settings = loadSettings()
  return settings.speechModel || 'tiny'
})

ipcMain.handle('set-speech-model', (_event, model: string) => {
  saveSettings({ speechModel: model })
  return true
})

// Type speech transcription result into the previously active text field
ipcMain.handle('type-speech-result', (_event, text: string) => {
  console.log('[Speech] type-speech-result called, text:', JSON.stringify(text).substring(0, 100))
  // Write to clipboard
  clipboard.writeText(text)
  lastClipboardText = text

  // Reset speech state so the next hotkey press works immediately
  isSpeechRecording = false
  speechShouldStop = false

  // Close the popup — focus stays on the user's active window (popup is non-focusable)
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.close()
  }

  // After a short delay for focus to return, simulate Ctrl+V to paste
  setTimeout(() => {
    if (process.platform === 'win32') {
      execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")'
      ], (err) => {
        if (err) console.error('Failed to simulate paste:', err)
      })
    }
  }, 250)

  return true
})

// Selected microphone setting
ipcMain.handle('get-selected-mic', () => {
  const settings = loadSettings()
  return settings.selectedMic || ''
})

ipcMain.handle('set-selected-mic', (_event, deviceId: string) => {
  saveSettings({ selectedMic: deviceId })
  return true
})

// Pre-download a Whisper model (called from Dashboard)
ipcMain.handle('download-speech-model', async (_event, modelLevel: string) => {
  try {
    console.log(`Pre-downloading Whisper model: ${modelLevel}...`)
    const { pipeline } = await import('@xenova/transformers')
    const transcriber = await pipeline(
      'automatic-speech-recognition',
      `Xenova/whisper-${modelLevel}`,
      {
        progress_callback: (p: { status: string; progress?: number; file?: string }) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (p.status === 'progress' && p.progress != null) {
              mainWindow.webContents.send('speech-model-progress', { status: 'downloading', progress: Math.round(p.progress) })
            } else if (p.status === 'done') {
              mainWindow.webContents.send('speech-model-progress', { status: 'done' })
            }
          }
        }
      }
    )
    // Cache it
    whisperPipeline = transcriber
    whisperModelLevel = modelLevel
    // Mark model as downloaded in settings
    const dm = loadSettings().downloadedModels || {}
    dm[modelLevel] = true
    saveSettings({ downloadedModels: dm })
    console.log(`Whisper model ${modelLevel} downloaded and cached.`)
    return { success: true }
  } catch (error) {
    console.error('Model download error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Download failed' }
  }
})

// Transcribe speech audio using Whisper in the main process (Node.js)
ipcMain.handle('transcribe-speech', async (_event, pcmBuffer: ArrayBuffer, sampleRate: number) => {
  console.log('[Speech] transcribe-speech called, buffer:', pcmBuffer?.byteLength, 'bytes, sampleRate:', sampleRate)
  try {
    const pcmRaw = new Float32Array(pcmBuffer)
    console.log('[Speech] PCM samples:', pcmRaw.length, 'duration:', (pcmRaw.length / sampleRate).toFixed(1), 's')

    // Resample to 16kHz if needed
    let pcm16k: Float32Array
    if (Math.abs(sampleRate - 16000) < 1) {
      pcm16k = pcmRaw
    } else {
      const ratio = sampleRate / 16000
      const newLen = Math.round(pcmRaw.length / ratio)
      pcm16k = new Float32Array(newLen)
      for (let i = 0; i < newLen; i++) {
        const idx = i * ratio
        const lo = Math.floor(idx)
        const hi = Math.min(lo + 1, pcmRaw.length - 1)
        const f = idx - lo
        pcm16k[i] = pcmRaw[lo] * (1 - f) + pcmRaw[hi] * f
      }
    }

    const settings = loadSettings()
    const modelLevel = settings.speechModel || 'tiny'

    // Load or switch Whisper model (cached after first load)
    if (!whisperPipeline || whisperModelLevel !== modelLevel) {
      console.log(`Loading Whisper model: ${modelLevel}...`)
      whisperModelLevel = modelLevel

      const { pipeline } = await import('@xenova/transformers')
      whisperPipeline = await pipeline(
        'automatic-speech-recognition',
        `Xenova/whisper-${modelLevel}`,
        {
          progress_callback: (p: { status: string; progress?: number; file?: string }) => {
            try {
              if (popupWindow && !popupWindow.isDestroyed()) {
                if (p.status === 'progress' && p.progress != null) {
                  popupWindow.webContents.send('speech-progress', `Downloading... ${Math.round(p.progress)}%`)
                } else if (p.status === 'ready') {
                  popupWindow.webContents.send('speech-progress', 'Transcribing...')
                }
              }
            } catch (_) { /* popup may be closing */ }
          }
        }
      )
      console.log('Whisper model loaded.')
      // Mark model as downloaded so future checks pass
      const dm2 = loadSettings().downloadedModels || {}
      dm2[modelLevel] = true
      saveSettings({ downloadedModels: dm2 })
    }

    console.log(`Transcribing ${pcm16k.length} samples...`)
    const result = await whisperPipeline(pcm16k, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'english',
      task: 'transcribe',
    })

    const text = (result as { text: string }).text?.trim() || ''
    console.log('Transcription result:', text.substring(0, 100))
    return { success: true, text }
  } catch (error) {
    console.error('Transcription error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Transcription failed' }
  }
})

// Handle selection made from overlay
ipcMain.handle('selection-made', (_event, bounds: { x: number; y: number; width: number; height: number }) => {
  // Store the selection bounds for the analysis
  pendingSelectionBounds = bounds
  const analysisType = pendingAnalysisType
  pendingAnalysisType = null

  // Close the selection window
  if (selectionWindow && !selectionWindow.isDestroyed()) {
    selectionWindow.close()
    selectionWindow = null
  }

  if (analysisType === 'image') {
    createImagePopupWindow()
  } else if (analysisType === 'textgrab') {
    createTextGrabPopupWindow()
  } else {
    createPopupWindow()
  }
})

// Handle selection cancellation
ipcMain.handle('cancel-selection', () => {
  pendingSelectionBounds = null
  pendingAnalysisType = null
  selectionDisplayInfo = null
  selectionScreenshot = null
  selectionNativeImage = null

  if (selectionWindow && !selectionWindow.isDestroyed()) {
    selectionWindow.close()
    selectionWindow = null
  }
})

// Get the screenshot for selection overlay background
ipcMain.handle('get-selection-screenshot', () => {
  console.log('get-selection-screenshot called, has screenshot:', !!selectionScreenshot, 'length:', selectionScreenshot?.length || 0)
  return selectionScreenshot
})

// Crop the stored selection screenshot to the user's selection bounds.
// Uses the stored NativeImage directly to avoid data URL roundtrip issues.
function cropStoredScreenshot(storedDataUrl: string, bounds: { x: number; y: number; width: number; height: number }): string {
  const displaySize = selectionDisplayInfo?.size

  if (!displaySize) {
    console.error('cropStoredScreenshot: no displaySize, returning full screenshot')
    return storedDataUrl
  }

  // Use the stored NativeImage directly (avoids data URL -> NativeImage roundtrip
  // which can silently fail on large screenshots)
  const img = selectionNativeImage || nativeImage.createFromDataURL(storedDataUrl)
  const imageSize = img.getSize()

  console.log('cropStoredScreenshot: imageSize:', imageSize, 'displaySize:', displaySize, 'bounds:', bounds)

  if (imageSize.width === 0 || imageSize.height === 0) {
    console.error('cropStoredScreenshot: zero-dimension image, returning full screenshot')
    return storedDataUrl
  }

  // Map CSS/client coordinates to image pixel coordinates
  const scaleX = imageSize.width / displaySize.width
  const scaleY = imageSize.height / displaySize.height

  const cropX = Math.round(bounds.x * scaleX)
  const cropY = Math.round(bounds.y * scaleY)
  const cropWidth = Math.round(bounds.width * scaleX)
  const cropHeight = Math.round(bounds.height * scaleY)

  // Ensure we don't exceed image bounds
  const safeX = Math.max(0, Math.min(cropX, imageSize.width - 1))
  const safeY = Math.max(0, Math.min(cropY, imageSize.height - 1))
  const safeWidth = Math.min(cropWidth, imageSize.width - safeX)
  const safeHeight = Math.min(cropHeight, imageSize.height - safeY)

  console.log('cropStoredScreenshot: crop:', { safeX, safeY, safeWidth, safeHeight })

  if (safeWidth <= 0 || safeHeight <= 0) {
    console.error('cropStoredScreenshot: empty crop area, returning full screenshot')
    return storedDataUrl
  }

  const cropped = img.crop({ x: safeX, y: safeY, width: safeWidth, height: safeHeight })
  const jpegBuffer = cropped.toJPEG(85)
  return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`
}

// Analyze prompt from screen
ipcMain.handle('analyze-prompt', async () => {
  // Use custom key if set, otherwise use default
  const apiKey = customApiKey || DEFAULT_OPENROUTER_API_KEY

  if (!apiKey || apiKey === 'YOUR_DEFAULT_API_KEY_HERE') {
    return {
      success: false,
      error: 'No API key configured. Please contact the developer or set your own OpenRouter API key.'
    }
  }

  try {
    const bounds = pendingSelectionBounds
    pendingSelectionBounds = null

    let screenshot: string

    if (selectionScreenshot && bounds) {
      // Use the stored screenshot from when the selection overlay was shown,
      // cropped to the user's selection. This ensures we analyze exactly what
      // the user saw and selected, not a new capture taken after the popup opened.
      console.log('Cropping stored screenshot to selection bounds:', bounds)
      screenshot = cropStoredScreenshot(selectionScreenshot, bounds)
    } else {
      // Fallback: take a new screenshot (shouldn't happen in normal flow)
      console.log('No stored screenshot, capturing new one...')
      const displayId = selectionDisplayInfo?.displayId
      screenshot = await captureScreenshot(bounds || undefined, displayId)
    }

    console.log('Analyzing screenshot with vision AI...')
    const analysis = await analyzeScreenshotWithVision(screenshot, apiKey)

    // Clear state after analysis
    selectionDisplayInfo = null
    selectionScreenshot = null
    selectionNativeImage = null

    return {
      success: true,
      data: {
        ...analysis,
        screenText: analysis.prompt
      }
    }
  } catch (error) {
    console.error('Analysis error:', error)
    pendingSelectionBounds = null
    selectionDisplayInfo = null
    selectionScreenshot = null
    selectionNativeImage = null
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
})

// Analyze image with selection bounds
ipcMain.handle('analyze-image-with-selection', async () => {
  const apiKey = customApiKey || DEFAULT_OPENROUTER_API_KEY

  if (!apiKey || apiKey === 'YOUR_DEFAULT_API_KEY_HERE') {
    return {
      success: false,
      error: 'No API key configured. Please contact the developer or set your own OpenRouter API key.'
    }
  }

  try {
    const bounds = pendingSelectionBounds
    pendingSelectionBounds = null

    let screenshot: string

    if (selectionScreenshot && bounds) {
      // Use the stored screenshot cropped to selection
      console.log('Cropping stored screenshot for image analysis:', bounds)
      screenshot = cropStoredScreenshot(selectionScreenshot, bounds)
    } else {
      // Fallback: take a new screenshot
      console.log('No stored screenshot, capturing new one for image analysis...')
      const displayId = selectionDisplayInfo?.displayId
      screenshot = await captureScreenshot(bounds || undefined, displayId)
    }

    console.log('Analyzing image with AI...')
    const result = await analyzeImageWithAI(screenshot, apiKey)

    // Clear state after analysis
    selectionDisplayInfo = null
    selectionScreenshot = null
    selectionNativeImage = null

    return { success: true, data: result }
  } catch (error) {
    console.error('Image analysis error:', error)
    pendingSelectionBounds = null
    selectionDisplayInfo = null
    selectionScreenshot = null
    selectionNativeImage = null
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
})

// Refine image description via chat
ipcMain.handle('refine-image-description', async (
  _event,
  currentDescription: string,
  userMessage: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
) => {
  const apiKey = customApiKey || DEFAULT_OPENROUTER_API_KEY

  if (!apiKey || apiKey === 'YOUR_DEFAULT_API_KEY_HERE') {
    return {
      success: false,
      error: 'No API key configured.'
    }
  }

  try {
    const systemPrompt = `You are helping refine an AI-friendly image description. The user will ask you to modify, add, or remove details from the description.

Current description:
${currentDescription}

Based on the user's request, provide an updated version of the complete description. Keep the same structured format but incorporate the user's requested changes. Only output the refined description, no explanations.`

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt }
    ]

    // Add chat history
    for (const msg of chatHistory) {
      messages.push({ role: msg.role, content: msg.content })
    }

    // Add the new user message
    messages.push({ role: 'user', content: userMessage })

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vector.app',
        'X-Title': 'Vector Image Analyzer'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages,
        temperature: 0.3,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No response from AI')
    }

    return { success: true, data: { description: content } }
  } catch (error) {
    console.error('Refine description error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Generate AI-powered session context for AI agents
ipcMain.handle('generate-ai-context', async (
  _event,
  sessionName: string,
  prompts: Array<{
    original_prompt: string
    improved_prompt: string
    user_score: number
    refined_score: number
    feedback: string
    created_at?: string
  }>
) => {
  const apiKey = customApiKey || DEFAULT_OPENROUTER_API_KEY

  if (!apiKey || apiKey === 'YOUR_DEFAULT_API_KEY_HERE') {
    return { success: false, error: 'No API key configured.' }
  }

  if (!prompts || prompts.length === 0) {
    return { success: false, error: 'No prompts in this session.' }
  }

  try {
    const promptsText = prompts.map((p, i) => {
      const time = p.created_at ? new Date(p.created_at).toLocaleString() : `Prompt ${i + 1}`
      return `--- Prompt ${i + 1} (${time}) ---
Original (Score: ${p.user_score}/100):
${p.original_prompt}

Improved Version (Score: ${p.refined_score}/100):
${p.improved_prompt}

Analysis Feedback: ${p.feedback}`
    }).join('\n\n')

    const systemPrompt = `You are an expert at analyzing prompt history sessions and generating comprehensive context summaries. Your output will be given directly to an AI coding agent (like Claude Code) so it can understand what the user has been working on and continue helping them efficiently.

Generate a rich, structured context document that covers:

1. **Project Overview** - What project/app/feature is the user working on? What technologies or frameworks are involved? Infer from the prompts.

2. **Session Narrative** - Tell the story of what happened in this session chronologically. What did the user start with? How did the work evolve? What were the key turning points or decisions?

3. **User's Goals & Intent** - What is the user ultimately trying to achieve? What are their priorities? What patterns show what they care about most?

4. **Current State** - Based on the most recent prompts, where did the user leave off? What is likely the next thing they need help with?

5. **Key Technical Details** - Extract any specific file names, function names, libraries, APIs, architectural patterns, or implementation details mentioned in the prompts.

6. **Recurring Themes & Patterns** - What topics keep coming up? What does the user struggle with? What kind of help do they ask for most?

7. **Recommendations for Next Agent** - Based on everything above, what should an AI agent know to be maximally helpful? What context is critical? What should the agent prioritize?

Format this as clean markdown that's easy for an AI to parse. Be specific and concrete - reference actual prompt content. Don't be generic or vague.
The summary should be detailed enough that an AI agent reading it would feel like they were present for the entire session.`

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vector.app',
        'X-Title': 'Vector Context Generator'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Here is the session "${sessionName}" with ${prompts.length} prompts. Analyze these and generate a comprehensive context summary:\n\n${promptsText}`
          }
        ],
        temperature: 0.4,
        max_tokens: 3000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No response from AI')
    }

    return { success: true, data: content }
  } catch (error) {
    console.error('Context generation error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// Get all prompt scores
ipcMain.handle('get-scores', () => {
  return loadScores()
})

// Save a new score entry
ipcMain.handle('save-score', (_event, userScore: number, refinedScore: number) => {
  saveScore(Math.round(userScore), Math.round(refinedScore))
  return true
})

// ── Vibe Mode: block distracting sites via Windows hosts file ──

const HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts'
const VIBE_START = '# VECTOR-VIBEMODE-START'
const VIBE_END = '# VECTOR-VIBEMODE-END'

function buildHostEntries(sites: string[]): string[] {
  const entries: string[] = []
  for (const site of sites) {
    const domain = site.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '').trim().toLowerCase()
    if (!domain) continue
    entries.push(`0.0.0.0 ${domain}`)
    if (!domain.startsWith('www.')) {
      entries.push(`0.0.0.0 www.${domain}`)
    }
  }
  return entries
}

/**
 * Run a PowerShell script elevated (UAC prompt). Uses -EncodedCommand so
 * no temp file is needed — avoids the race where -Wait doesn't truly wait
 * and the temp .ps1 is deleted before the elevated process reads it.
 */
function runElevatedPS(script: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    execFile('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `Start-Process powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}') -Verb RunAs -Wait -WindowStyle Hidden`
    ], { timeout: 60000 }, (err) => {
      if (err) {
        console.error('[VibeMode] Elevated script error:', err)
        resolve({ success: false, error: 'Admin permission denied or script failed.' })
      } else {
        resolve({ success: true })
      }
    })
  })
}

function makeEnableScript(sites: string[]): string {
  const entries = buildHostEntries(sites)
  // Build PowerShell array literal: @('0.0.0.0 youtube.com','0.0.0.0 www.youtube.com')
  const psArray = entries.map(e => `'${e}'`).join(',')
  return [
    // ── 1. Write hosts file entries ──
    `$hostsPath = '${HOSTS_PATH}'`,
    `$startTag = '${VIBE_START}'`,
    `$endTag = '${VIBE_END}'`,
    `$content = [System.IO.File]::ReadAllText($hostsPath)`,
    `$si = $content.IndexOf($startTag)`,
    `$ei = $content.IndexOf($endTag)`,
    `if ($si -ge 0 -and $ei -ge 0) { $content = $content.Substring(0, $si) + $content.Substring($ei + $endTag.Length) }`,
    `$content = $content.TrimEnd()`,
    `$nl = [Environment]::NewLine`,
    `$entries = @(${psArray})`,
    `$block = $startTag + $nl + ($entries -join $nl) + $nl + $endTag`,
    `$content = $content + $nl + $block + $nl`,
    `[System.IO.File]::WriteAllText($hostsPath, $content)`,
    // ── 2. Disable DNS-over-HTTPS in Chrome, Edge, Firefox via group policy ──
    // Without this, browsers bypass the hosts file entirely.
    `New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Google\\Chrome' -Force | Out-Null`,
    `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Google\\Chrome' -Name 'DnsOverHttpsMode' -Value 'off' -Type String -Force`,
    `New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge' -Force | Out-Null`,
    `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge' -Name 'DnsOverHttpsMode' -Value 'off' -Type String -Force`,
    `New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\Mozilla\\Firefox' -Force | Out-Null`,
    `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Mozilla\\Firefox' -Name 'DNSOverHTTPS' -Value 0 -Type DWord -Force`,
    // Brave (Chromium-based, uses same policy path as Chrome but under BraveSoftware)
    `New-Item -Path 'HKLM:\\SOFTWARE\\Policies\\BraveSoftware\\Brave' -Force | Out-Null`,
    `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\BraveSoftware\\Brave' -Name 'DnsOverHttpsMode' -Value 'off' -Type String -Force`,
    // ── 3. Flush every DNS cache layer ──
    `ipconfig /flushdns | Out-Null`,
    `Clear-DnsClientCache`,
    // Flush Chrome/Edge internal DNS cache by resetting their socket pools
    // (Chrome watches this registry key and reloads policies within seconds)
  ].join('\n')
}

function makeDisableScript(): string {
  return [
    // ── 1. Remove hosts file entries ──
    `$hostsPath = '${HOSTS_PATH}'`,
    `$startTag = '${VIBE_START}'`,
    `$endTag = '${VIBE_END}'`,
    `$content = [System.IO.File]::ReadAllText($hostsPath)`,
    `$si = $content.IndexOf($startTag)`,
    `$ei = $content.IndexOf($endTag)`,
    `if ($si -ge 0 -and $ei -ge 0) { $content = $content.Substring(0, $si) + $content.Substring($ei + $endTag.Length) }`,
    `$content = $content.TrimEnd() + [Environment]::NewLine`,
    `[System.IO.File]::WriteAllText($hostsPath, $content)`,
    // ── 2. Restore DNS-over-HTTPS browser policies (remove our overrides) ──
    `Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Google\\Chrome' -Name 'DnsOverHttpsMode' -ErrorAction SilentlyContinue`,
    `Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge' -Name 'DnsOverHttpsMode' -ErrorAction SilentlyContinue`,
    `Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Mozilla\\Firefox' -Name 'DNSOverHTTPS' -ErrorAction SilentlyContinue`,
    `Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\BraveSoftware\\Brave' -Name 'DnsOverHttpsMode' -ErrorAction SilentlyContinue`,
    // ── 3. Flush DNS caches ──
    `ipconfig /flushdns | Out-Null`,
    `Clear-DnsClientCache`,
  ].join('\n')
}

/** Read the hosts file and check our marker is present */
function verifyHostsBlocked(): boolean {
  try {
    const content = fs.readFileSync(HOSTS_PATH, 'utf8')
    return content.includes(VIBE_START)
  } catch (_) {
    return false
  }
}

ipcMain.handle('get-vibe-settings', () => {
  const settings = loadSettings()
  return {
    enabled: settings.vibeMode?.enabled ?? false,
    sites: settings.vibeMode?.sites ?? [],
  }
})

ipcMain.handle('set-vibe-sites', (_event, sites: string[]) => {
  const vm = loadSettings().vibeMode || {}
  vm.sites = sites
  saveSettings({ vibeMode: vm })
  return true
})

ipcMain.handle('enable-vibe-mode', async (_event, sites: string[]) => {
  if (!sites.length) return { success: false, error: 'No sites to block.' }
  const result = await runElevatedPS(makeEnableScript(sites))
  if (result.success) {
    // Verify the hosts file was actually modified
    if (!verifyHostsBlocked()) {
      console.warn('[VibeMode] Script succeeded but hosts file not modified — antivirus may be blocking')
      return { success: false, error: 'Hosts file was not modified. Your antivirus may be blocking changes.' }
    }
    saveSettings({ vibeMode: { enabled: true, sites } })
  }
  return result
})

ipcMain.handle('disable-vibe-mode', async () => {
  const result = await runElevatedPS(makeDisableScript())
  if (result.success) {
    const vm = loadSettings().vibeMode || {}
    vm.enabled = false
    saveSettings({ vibeMode: vm })
  }
  return result
})

app.whenReady().then(() => {
  // Auto-grant media (microphone) permissions for speech-to-text
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
      return
    }
    callback(true)
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'media') return true
    return true
  })

  createWindow()

  // Restore saved shortcuts from settings
  const savedSettings = loadSettings()
  const sc = savedSettings.shortcuts
  if (sc) {
    if (sc.prompt) {
      const ok = globalShortcut.register(sc.prompt, () => {
        pendingAnalysisType = 'prompt'
        setTimeout(() => { createSelectionOverlay().catch(err => console.error('Selection overlay error:', err)) }, 50)
      })
      if (ok) { currentShortcut = sc.prompt; console.log('Restored prompt shortcut:', sc.prompt) }
    }
    if (sc.image) {
      const ok = globalShortcut.register(sc.image, () => {
        pendingAnalysisType = 'image'
        setTimeout(() => { createSelectionOverlay().catch(err => console.error('Selection overlay error:', err)) }, 50)
      })
      if (ok) { currentImageShortcut = sc.image; console.log('Restored image shortcut:', sc.image) }
    }
    if (sc.textGrab) {
      const ok = globalShortcut.register(sc.textGrab, () => {
        pendingAnalysisType = 'textgrab'
        setTimeout(() => { createSelectionOverlay().catch(err => console.error('Selection overlay error:', err)) }, 50)
      })
      if (ok) { currentTextGrabShortcut = sc.textGrab; console.log('Restored text grab shortcut:', sc.textGrab) }
    }
    if (sc.speech) {
      const ok = globalShortcut.register(sc.speech, handleSpeechShortcutPress)
      if (ok) { currentSpeechShortcut = sc.speech; console.log('Restored speech shortcut:', sc.speech) }
    }
    if (sc.master) {
      const ok = globalShortcut.register(sc.master, () => { createAnalyzerPickerWindow() })
      if (ok) { currentMasterShortcut = sc.master; console.log('Restored master shortcut:', sc.master) }
    }
  }

  // Re-apply vibe mode blocks if it was left enabled
  const vibeSettings = savedSettings.vibeMode
  if (vibeSettings?.enabled && vibeSettings.sites?.length) {
    // Only re-apply if the hosts file doesn't already have our entries
    if (!verifyHostsBlocked()) {
      runElevatedPS(makeEnableScript(vibeSettings.sites)).then(r => {
        if (r.success) console.log('Restored vibe mode blocks on startup')
        else console.warn('Failed to restore vibe mode blocks:', r.error)
      })
    } else {
      console.log('Vibe mode blocks already present in hosts file')
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll()
})
