# AI Study Helper (Study Smart)

Browser-based study assistant: turn notes into summaries, flashcards, quizzes, and Q&A.  
**Repository:** [github.com/cgoldstein27-maker/AIStudy_ColbyG](https://github.com/cgoldstein27-maker/AIStudy_ColbyG)

## Features

- Paste or upload notes (`.txt` / PDF text layers) and save study sets
- Auto-generated summaries and flashcards
- Spaced repetition (SM-2 style)
- **Standard quiz** from your notes (local mode; no API key required)
- **Ask notes** chat grounded on your sets (local retrieval; optional AI if you add a key)
- **Research notes** with optional Wikipedia context (timeouts so slow networks don’t hang)
- **Refine notes** restructuring without requiring a key (local fallback)

## Project layout

All app files live in **`AI School Helper/`**:

| Path | Role |
|------|------|
| `AI School Helper/index.html` | Entry page |
| `AI School Helper/css/styles.css` | Styles |
| `AI School Helper/js/study-smart-bundle.js` | Single-file build (works with `file://`) |
| `AI School Helper/js/*.js` | Modular sources (use with a local server + `app.js` if you prefer) |

## Run locally

```bash
cd "AI School Helper"
python3 -m http.server 8082
```

Open [http://localhost:8082](http://localhost:8082) (or another port if busy).

Double-clicking `index.html` can work for basic use; a local server is recommended for PDF.js and consistent behavior.

## Accounts & data

- Sign-in uses **email + password** stored only in this browser (hashed locally).
- Sets, SRS progress, and weak-topic stats live in **localStorage** and persist after you close the tab.
- This is **not** cloud sync—data stays on the device unless you use optional network AI calls.

## Optional AI

- The app runs fully in **keyless local mode**.
- If you add an OpenAI-compatible key (hidden optional fields in the UI), you can enable model-backed answers and paraphrased quiz generation where implemented.

## License

See `LICENSE` in this repository when present.
