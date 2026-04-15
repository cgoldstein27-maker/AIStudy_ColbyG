# AI Study Helper

Study Smart is a browser-based study assistant that helps students turn notes into summaries, flashcards, quizzes, and Q&A sessions.

## Features

- Upload or paste notes and build study sets
- Auto-generated summaries and flashcards
- Spaced repetition (SM-2 style review flow)
- Standard and advanced quiz modes
- Ask-notes chat with optional AI help
- Research notes generation with optional Wikipedia context

## Project Structure

- `AI School Helper/` – main app files
  - `index.html`
  - `css/styles.css`
  - `js/study-smart-bundle.js` (file:// friendly runtime)
  - modular source files in `js/`

## Run Locally

From the repository root:

```bash
cd "AI School Helper"
python3 -m http.server 8082
```

Then open:

- [http://localhost:8082](http://localhost:8082)

## Notes on Accounts and Data

- Sign in uses local email + password on this browser/device.
- Study sets and progress persist in localStorage and remain after closing tabs.
- Data is local to this device/browser (not a cloud account).

## Optional AI Setup

- Add an OpenAI key in the app (`sk-...`)
- Default API base: `https://api.openai.com/v1`
- Optional custom OpenAI-compatible base URL can be configured in-app

