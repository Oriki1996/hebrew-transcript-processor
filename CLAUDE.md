# CLAUDE.md — Hebrew Transcript Processor

Codebase guide for AI assistants working on this repository.

---

## Project Overview

A **serverless, single-file web application** that processes raw Hebrew transcripts into structured academic documents using LLM APIs. Everything runs client-side in the browser — no backend, no build step, no package manager.

**Live entry point:** `hebrew_transcript_processor_with_pako.html`

---

## Repository Structure

```
hebrew-transcript-processor/
├── hebrew_transcript_processor_with_pako.html   # Main app (~1,483 lines of HTML/CSS/JS)
├── n8n_transcript_workflow.json                 # n8n automation workflow (Gemini-based)
├── cody-extension/                              # Chrome MV3 extension ("Cody Auto-Bridge")
│   ├── manifest.json                            # Extension manifest (v3)
│   ├── background.js                            # Service worker / message router
│   ├── content_bridge.js                        # Content script for localhost/file pages
│   ├── content_claude.js                        # Content script for claude.ai
│   └── test_bridge.html                         # Manual test harness for the extension
├── README.md                                    # Hebrew-language user documentation
└── .gitignore                                   # Ignores .bak, .DS_Store, Thumbs.db, *.log
```

---

## Main Application (`hebrew_transcript_processor_with_pako.html`)

### Architecture

The entire app is a **single self-contained HTML file**: no bundler, no npm, no external JS libraries (the "pako" in the filename refers to a previously embedded zlib library; PDF decompression now uses the native browser `DecompressionStream` API).

**File sections (in order):**
1. `<head>` — CSP meta tag, Google Fonts (Heebo), CSS variables
2. `<style>` — Glassmorphism peach theme + dark-academia mode, all inline
3. `<body>` — Three-screen UI: input screen, processing screen, output screen
4. `<script>` — All application logic (lines ~348–1483)

### Key Constants & Configuration

| Identifier | Purpose |
|---|---|
| `SYSTEM_PROMPT` | The large multi-section Hebrew system prompt (line 349). Contains labelled blocks: `[תפקיד]`, `[כללי ליבה]`, `[טון וסגנון]`, `[מדיניות שפה]`, `[פלט HTML]`, and four transcript-type routes. **Do not truncate or reformat this block.** |

### API Providers

The app supports three providers, selected via radio buttons:

| Provider | Identifier | API Endpoint | Key storage |
|---|---|---|---|
| Anthropic (default) | `anthropic` | `https://api.anthropic.com/v1/messages` | `localStorage('anthropic_api_key')` |
| Google Gemini | `gemini` | `https://generativelanguage.googleapis.com/v1/models/{model}:generateContent` | `localStorage('gemini_api_key')` |
| Cody Extension | `extension` | Routes through Chrome extension → claude.ai tab | n/a |

**Anthropic call specifics:**
- Header: `anthropic-dangerous-direct-browser-calls: true` (required for CORS from browser)
- Header: `anthropic-version: 2023-06-01`
- Timeout: 60-second `AbortController`
- `QUOTA_EXCEEDED` sentinel thrown on HTTP 429

**Gemini call specifics:**
- API key sent via `x-goog-api-key` header (not URL query param)
- Only `gemini-2.5-flash` is enabled on free tier; other models are `disabled` in the select
- Endpoint uses `v1` (not `v1beta`)
- `system_instruction.parts` carries the system prompt

### Core Functions

| Function | Location | Description |
|---|---|---|
| `callAPI()` | line 818 | Router: delegates to `callAnthropic`, `callGemini`, or `callExtension` |
| `callAnthropic()` | line 827 | Direct Anthropic Messages API fetch |
| `callGemini()` | line 867 | Direct Gemini generateContent fetch |
| `semanticChunks()` | line 914 | Splits long text at paragraph/sentence boundaries; Anthropic max 30,000 chars, Gemini max 80,000 chars |
| `extractDocxText()` | line 976 | Parses DOCX (ZIP + Office Open XML) without external libs |
| `extractPdfText()` | line 1020 | Pure-JS PDF parser: FlateDecode via `DecompressionStream`, BT/ET streams, UTF-16BE BOM |
| `appendResultToOutput()` | line 1263 | Incrementally renders each processed chunk into `#outputArea` |
| `handleQuotaError()` | line 1277 | On 429: displays partial results and export buttons |
| `callExtension()` | line 1330 | Sends chunk via `postMessage` to the Cody extension bridge |
| `HealthController` | line 1354 | Diagnostics object; `generateReport()` produces an async health report |
| `showScreen()` | line 510 | Switches between the three UI screens |
| `getActiveModel()` | line 521 | Returns currently selected model string |

### Transcript Types (Processing Routes)

The system prompt defines four named routes that the AI selects automatically:

- **Route א (Aleph) — Academic Lecture**: Full concept/theory extraction, removes first-person voice, appends `<h2>מושגים מרכזיים</h2>` glossary.
- **Route ב (Bet) — Work Meeting**: Decision/action-item mapping, executive summary, open items.
- **Route ג (Gimel) — Interview/Conversation**: Q&A structure, speaker attribution.
- **Route ד (Dalet) — Panel/Multi-speaker Discussion**: Multi-voice attribution with position mapping.

### Output Format Rules

- **Only these HTML tags are permitted in LLM output:** `h1`, `h2`, `h3`, `p`, `<strong>`
- No Markdown, no code fences, no XML
- Every document ends with: `<p>הסיכום הושלם.</p>`
- Mixed Hebrew/English terms formatted as: `מונח עברי (English Term)` on first occurrence

### localStorage Keys

| Key | Content |
|---|---|
| `anthropic_api_key` | Anthropic API key (persists across sessions) |
| `gemini_api_key` | Gemini API key |
| `active_provider` | `'anthropic'` \| `'gemini'` \| `'extension'` |
| `anthropic_model` | Selected Anthropic model ID |
| `gemini_model` | Selected Gemini model ID |
| `draft_raw` | Auto-saved raw input text |
| `draft_output` | Auto-saved processed output |
| `draft_stats` | Processing statistics string |

### Themes

| Theme | CSS class | Description |
|---|---|---|
| Default | *(none)* | Glassmorphism peach (`--bg:#fdf0e8`) |
| Dark Academia | `.dark-theme` | Dark purple (`--bg:#1a1525`) |

### Security (CSP)

The `<meta http-equiv="Content-Security-Policy">` restricts:
- `connect-src`: only `api.anthropic.com` and `generativelanguage.googleapis.com`
- `script-src`: `'unsafe-inline'` only (no external JS)
- No `eval` usage anywhere in the codebase

---

## Cody Auto-Bridge Chrome Extension (`cody-extension/`)

A Chrome Manifest V3 extension that bridges the main app to an open `claude.ai` browser tab, enabling API-key-free processing via the Claude web UI.

### Message Flow

```
App (localhost/file://)
  → content_bridge.js  (postMessage: REQUEST_EXTENSION_AI)
  → background.js      (chrome.runtime: TO_AI)
  → content_claude.js  (chrome.tabs.sendMessage: PROCESS_CHUNK)
  → claude.ai ProseMirror input → click Send → poll for response
  → background.js      (FROM_AI)
  → content_bridge.js  (postMessage: RESPONSE_FROM_EXTENSION / EXTENSION_ERROR)
  → App
```

### Extension Message Types

| Type | Direction | Meaning |
|---|---|---|
| `REQUEST_EXTENSION_AI` | App → bridge | Send a chunk for processing |
| `RESPONSE_FROM_EXTENSION` | Bridge → App | Processed result from Claude web |
| `EXTENSION_ERROR` | Bridge → App | Error from Claude tab |
| `BRIDGE_PING` / `BRIDGE_PONG` | App ↔ bridge | Diagnostic ping to check extension presence |
| `CHECK_CLAUDE_TAB` / `CLAUDE_TAB_STATUS` | App ↔ background | Check if a claude.ai tab is open |
| `TO_AI` / `FROM_AI` | Between background and content scripts | Internal routing |
| `PROCESS_CHUNK` | Background → content_claude.js | Inject text into claude.ai |

### Text Injection (content_claude.js)

Uses `DataTransfer` + `ClipboardEvent('paste')` to inject text into ProseMirror. Falls back to `document.execCommand('insertText')`. Response polling detects end-of-stream by watching for the disappearance of the stop/cancel button (2 × 2 s of silence = done). Safety timeout: 3 minutes.

---

## n8n Workflow (`n8n_transcript_workflow.json`)

A standalone n8n automation workflow for server-side batch processing via Gemini API. Import into any n8n instance.

**Node sequence:**
1. **Manual Trigger** — start workflow
2. **פרוס חבילה (Code)** — validates and unpacks `payload[]` array from JSON input
3. **עבד חלק אחד בכל פעם (SplitInBatches)** — processes one chunk at a time (batchSize: 1)
4. **קרא ל-Gemini API (HTTP Request)** — POST to Gemini `v1/models/gemini-2.5-flash:generateContent` using `$vars.GEMINI_API_KEY`
5. **חלץ תשובה (Code)** — extracts `candidates[0].content.parts[0].text`
6. **Quality Auditor node** — post-processing validation step

**Config:** `maxOutputTokens: 8192`, `temperature: 0.3`

---

## Development Conventions

### No Build System

There is no `package.json`, `webpack`, `vite`, or any bundler. To "build":
1. Edit `hebrew_transcript_processor_with_pako.html` directly
2. Open in browser to test
3. No compilation or transpilation needed

### Editing the Main HTML File

- The file is ~1,483 lines; all logic is in one `<script>` block starting at line 348
- CSS custom properties (CSS variables) control all theming — prefer editing `--var` definitions over hardcoded values
- The `SYSTEM_PROMPT` constant spans lines 349–428 and uses labelled block syntax (`[תפקיד]`, `[כללי ליבה]`, etc.) — keep this format when modifying
- All UI text is in Hebrew (RTL document, `dir="rtl"` on `<html>`)

### Adding a New AI Provider

1. Add a radio button in the provider group (HTML)
2. Add key input + model select elements (HTML)
3. Add `localStorage` save/restore logic (following existing patterns)
4. Implement `callNewProvider(userContent, maxTokens)` async function
5. Add the provider case to `callAPI()` router
6. Update `updateProviderUI()` to show/hide the new model group
7. Update `HealthController.auditErrors()` to check the new key

### Adding a New Transcript Type

1. Add a new Route section to `SYSTEM_PROMPT` following the existing `[מסלול א/ב/ג/ד]` pattern
2. The type identification is done by the LLM itself — no client-side changes needed for routing

### Error Handling Pattern

- `QUOTA_EXCEEDED` string is thrown (not an Error object) on HTTP 429 — the caller `handleQuotaError()` catches this sentinel
- All user-facing error messages are in Hebrew
- API errors include the HTTP status code and truncated response body (300 chars max)
- `AbortController` with 60-second timeout on all API calls

### Chunking Strategy (`semanticChunks`)

- Splits at double-newlines (paragraphs) first
- Falls back to single-newline, then sentence-end punctuation
- Anthropic limit: 30,000 chars/chunk; Gemini limit: 80,000 chars/chunk
- Overlap: none (each chunk is independent)

### Extension Development

- Load unpacked from `cody-extension/` in `chrome://extensions` with Developer Mode on
- After editing any extension file, click "Reload" in `chrome://extensions`
- Use `test_bridge.html` to verify the postMessage bridge without a real transcript
- The extension targets `https://claude.ai/*` — test with a live Claude conversation open

---

## Git Conventions

- Commit messages follow the pattern: `type(scope): description (vNN)` where NN is an incrementing version
- Common types: `feat`, `fix`, `style`, `refactor`, `chore`
- Common scopes: `api`, `gemini`, `cody-extension`, `diagnostics`, `n8n`
- Version numbers appear in parentheses at the end of feat commits (e.g., `(v15)`)

---

## Key Constraints for AI Assistants

1. **No eval()** — the CSP and explicit code policy prohibit it; never introduce eval, `new Function()`, or dynamic script injection
2. **No external JS dependencies** — the app must remain a single self-contained HTML file; do not add `<script src="...">` tags pointing to CDNs
3. **Hebrew UI text** — all user-visible strings must remain in Hebrew
4. **HTML-only output** — the LLM output renderer expects only `h1/h2/h3/p/strong`; do not add Markdown rendering
5. **No server component** — the app is explicitly serverless; do not introduce any backend, proxy, or server-side logic
6. **localStorage only** — API keys and drafts persist via `localStorage`; do not use cookies, IndexedDB, or sessionStorage
7. **RTL layout** — the document is `dir="rtl"`; all layout additions must be RTL-compatible
8. **CSP compliance** — new `fetch()` calls must only go to `api.anthropic.com` or `generativelanguage.googleapis.com`; update the CSP meta tag if adding new endpoints
