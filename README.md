# Vector

A desktop tool that makes vibecoding faster. Instead of alt-tabbing, copying text, and manually explaining what's on your screen to an AI, Vector lets you do it all with a hotkey.

## What It Does

**Prompt Analyzer** — Select any region of your screen, and Vector reads the prompt you're writing to an AI (ChatGPT, Claude, Cursor, etc.), scores it, and gives you an improved version you can copy and paste directly. It uses the actual context visible on your screen so the suggestions aren't generic.

**Image Analyzer** — Select a UI or design on your screen and get a detailed, AI-friendly description of the visual style, layout, colors, spacing, and components. Paste it into your AI coding tool so it can replicate the design without you having to describe it manually. Includes a chat interface to refine the description.

**Text Grab** — Select any area of your screen and extract the text using local OCR (Tesseract.js). No API call needed, fully offline. Useful for pulling text from images, non-selectable UI, or terminal output.

**Speech to Text** — Hold a hotkey to record from your mic, release to transcribe using local Whisper models. The result is automatically pasted wherever your cursor is. Choose from Tiny to Medium models depending on speed vs accuracy preference.

**Clipboard History** — Tracks everything you copy. Search and re-copy past items.

**Prompt History & Sessions** — Every prompt you analyze is saved to a session. You can generate an AI-powered context summary of a session and paste it into Claude Code, Cursor, or any agent so it knows what you've been working on.

**Vibe Mode** — Blocks distracting websites (YouTube, Twitter, Reddit, etc.) at the system level by modifying the hosts file and disabling DNS-over-HTTPS in browsers. One toggle to go heads-down.

## How It Saves Time

The core loop when vibecoding is: look at screen, describe what you see to an AI, wait for a response, paste it back. Vector cuts out the manual describing step. Instead of typing "the button is blue, 12px rounded, with a subtle shadow and a gradient background..." you hit a hotkey, drag a selection, and get a copy-pasteable description in seconds.

Same idea for prompts — instead of wondering if your prompt is clear enough, Vector reads it directly from your screen, tells you what's weak, and gives you a better version. The session history feature means you can hand off context between AI coding tools without re-explaining everything.

## Setup

```bash
npm install
npm run dev
```

Requires an OpenRouter API key for the AI-powered features (prompt analysis, image analysis, context generation). Set it in the app under the Home tab. Text grab and speech-to-text work fully offline.

## Stack

- Electron + React + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- Tesseract.js for local OCR
- Whisper (via @xenova/transformers) for local speech-to-text
- OpenRouter API (Gemini Flash for vision, DeepSeek for text)
- Supabase for auth and score tracking
