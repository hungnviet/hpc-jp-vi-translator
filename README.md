# Voice Translator Demo

Small Next.js demo that records or uploads Japanese audio, transcribes with OpenAI, translates Japanese → Vietnamese, and returns synthesized Vietnamese speech.

## Quick links (in this repo)
- UI and controls: [pages/index.tsx](pages/index.tsx) — functions: [`startRecording`](pages/index.tsx), [`stopRecording`](pages/index.tsx), [`handleFileUpload`](pages/index.tsx), [`startRealtimeTranslation`](pages/index.tsx), [`stopRealtimeTranslation`](pages/index.tsx)
- API handler: [pages/api/translate.ts](pages/api/translate.ts) — default export: [`handler`](pages/api/translate.ts)
- App wrapper: [pages/_app.tsx](pages/_app.tsx)
- Tailwind config: [tailwind.config.js](tailwind.config.js)
- PostCSS config: [postcss.config.js](postcss.config.js)
- Styles: [styles/globals.css](styles/globals.css)
- Project config: [tsconfig.json](tsconfig.json), [package.json](package.json)
- Environment template: [.env.local](.env.local)

## Requirements
- Node.js 18+ (recommended)
- An OpenAI API key with access to the APIs used in [pages/api/translate.ts](pages/api/translate.ts).

## Setup
1. Install dependencies:
   ```sh
   npm install
   ```
   See [package.json](package.json) for scripts and versions.

2. Create your local environment file:
   - Copy `.env.local` and set your OpenAI key:
     ```
     OPENAI_API_KEY=sk-...
     ```
   - Do NOT commit `.env.local`; it is ignored by `.gitignore`.

## Run (development)
```sh
npm run dev
```
Open http://localhost:3000 to use the UI at [pages/index.tsx](pages/index.tsx).

## Build / Start (production)
```sh
npm run build
npm run start
```

## How it works (high level)
1. The browser UI records audio (or accepts file uploads) and encodes audio as base64.
2. The client POSTs the base64 audio to the server endpoint [pages/api/translate.ts](pages/api/translate.ts).
3. The API:
   - decodes base64 to a file and calls OpenAI speech-to-text (Whisper) to transcribe Japanese audio,
   - sends the Japanese text to the chat completion model to translate into Vietnamese,
   - uses the TTS API to synthesize Vietnamese speech and returns the synthesized audio as base64.
4. The client plays the returned audio and displays the translated text.

## Notes & tips
- Supported audio formats depend on the browser and the OpenAI audio endpoints. The demo records webm in-browser; uploads accept common formats.
- Realtime mode uses in-browser VAD (energy-based) to segment utterances before sending them to the server. See [`startRealtimeTranslation`](pages/index.tsx).
- For larger audio uploads, increase the size limit in [pages/api/translate.ts](pages/api/translate.ts) `config.api.bodyParser.sizeLimit`.

## Troubleshooting
- "Microphone error": ensure the page is served over HTTPS (or localhost) and microphone permissions are granted.
- If you get API errors, confirm [OPENAI_API_KEY](.env.local) is valid and has required access.

## Security / Privacy
- Do not commit secret keys. `.env.local` is ignored by the included `.gitignore`.
- Be mindful that audio and transcriptions are sent to external services (OpenAI).

## License
This demo repository is provided as-is for development and learning.
