# Study Smart (AI School Helper)

Study Smart is a browser-based learning tool that turns notes into a full study workflow:
- note upload/paste
- automatic summaries
- flashcards
- quizzes
- spaced repetition
- weak-topic tracking
- chat-based tutoring over your notes

This README focuses on a **detailed analysis of how the code works**.

## 1) Project Architecture

The app is intentionally simple: no backend, no database, and no build step required to use it.

- **UI Layer**: `index.html` + `css/styles.css`
- **App Controller Layer**: `js/app.js`
- **Domain/Logic Layer**:
  - `js/study-engine.js` (summary, chunking, flashcards, quiz generation, chunk ranking)
  - `js/srs.js` (SM-2 spaced repetition math)
  - `js/weak-topics.js` (weak area counters and sorting)
  - `js/chat.js` (local retrieval + optional OpenAI calls)
  - `js/storage.js` (localStorage persistence)
- **Single-file runtime for `file://`**:
  - `js/study-smart-bundle.js` (bundled equivalent logic)

### Why this architecture works well
- Clear separation of concerns: UI orchestration in `app.js`, algorithmic logic in dedicated modules.
- Easy to run in classrooms or on locked-down machines because it can work as a local file.
- Data is local-first, minimizing setup friction for students.

## 2) Runtime Modes

The code supports two execution modes:

1. **Server mode (modular)**  
   `index.html` can be wired to `js/app.js` as ES modules and served from localhost.

2. **Local file mode (`file://`)**  
   `index.html` currently uses `js/study-smart-bundle.js` (no imports), plus legacy PDF.js globals.

### Trade-off
- `file://` is easiest for end users.
- Modular mode is easier for development and maintenance.

## 3) Core Feature Analysis

## Upload Notes / Textbook Pages

Handled by `app.js`:
- accepts pasted text
- supports `.txt` file input directly
- supports PDF text extraction via PDF.js

Processing path:
1. user provides content
2. `processAndSaveDoc()` validates input
3. `buildStudyMaterial()` creates chunks + flashcards
4. `summarize()` creates an extractive summary
5. result is persisted in localStorage

### Important implementation note
PDF extraction relies on text-layer content (not OCR). Scanned image PDFs may produce poor extraction.

## Summary Generation

Implemented in `study-engine.js` via `summarize()`:
- sentence split
- tokenization
- term-frequency scoring
- top sentence selection

This is an **extractive summarizer** (it selects existing sentences), not an abstractive LLM rewrite.

Strengths:
- fast
- deterministic
- offline-capable

Limitations:
- may miss cross-sentence meaning
- quality depends on input structure and punctuation

## Flashcards + Quizzes

### Flashcards
`buildStudyMaterial()`:
- splits content into chunks (blank-line paragraphs)
- infers topic from first line
- creates recall-style cards from first/second sentences
- creates fallback card if text is too sparse

### Quizzes
`buildQuiz()`:
- 1 multiple-choice item per card
- uses card answer as correct option
- uses other card answers as distractors
- includes fallback distractors when needed

Strength:
- auto-generates many questions quickly

Limitation:
- distractors can be semantically weak without deeper semantic generation

## 4) Advanced Feature Analysis

## Spaced Repetition System (SRS)

Implemented in `srs.js` using SM-2 inspired scheduling:
- tracks `easeFactor`, `interval`, `repetitions`, `nextReview`
- ratings map to quality buckets (Again/Hard/Good/Easy)

Flow in `app.js`:
1. `collectDueCards()` gathers due cards
2. review UI reveals answer
3. quality button calls `rateSrs()`
4. schedule updates via `scheduleReview()`

This is a strong choice because SM-2 is proven and lightweight.

## Weak Topic Tracking

Implemented in `weak-topics.js`:
- increments wrong/correct counters by normalized topic key
- computes miss rate and sorts highest-risk topics first

Events that update weak topics:
- quiz wrong answers
- SRS low-quality ratings (`quality < 3`)

This provides adaptive feedback with very low complexity.

## AI Chatbot Over Notes

Implemented in `chat.js`:
- **Local mode**: keyword-overlap retrieval (`rankChunksForQuestion`)
- **OpenAI mode**: grounded answer from provided note context

Current tutoring behavior is explicitly guided to:
- explain in steps
- default to high-school level
- include flashcards
- include short quizzes when useful
- call out weak areas

### Fallback design quality
If API fails or key is missing, chat still works locally. This keeps the app usable in offline or low-connectivity contexts.

## “No notes required” topic flow

If no notes exist, chat can generate a starter note set (`generateNotesForTopic()`), then:
- save it as a document
- produce summary/cards/quiz from that generated content
- continue Q&A on the new set

This is a strong onboarding experience because users can start instantly.

## 5) Data Model (localStorage)

Stored under `study-smart-v1`.

High-level shape:
- `docs[]`: each note set (`id`, `title`, `content`, `summary`, `chunks`, `flashcards`)
- `srs{}`: keyed by flashcard id with review metadata
- `weakTopics{}`: keyed by normalized topic with wrong/correct counts
- `activeDocId`: selected set

Design quality:
- schema is compact
- easy to serialize
- easy to migrate by merging defaults in `loadState()`

Risk:
- localStorage size limits can be reached with very large PDFs/notes.

## 6) UI/UX Analysis

The tabbed interface maps directly to study tasks:
- Library
- Study (SRS)
- Quiz
- Weak topics
- Ask notes

Positive UX choices:
- immediate status messages
- no account required
- low friction for first use
- all major learning loops are visible in one app shell

Potential UX improvements:
- progress analytics over time (daily review counts)
- better quiz score summary screens
- explicit “difficulty level” controls in chat UI

## 7) Security and Privacy

Good:
- no backend means notes stay on device by default
- API key is optional

Considerations:
- API key is stored in localStorage when provided
- if shared computer, users should clear browser storage

Future hardening ideas:
- session-only key mode (memory only)
- explicit “clear all data” button

## 8) Performance Characteristics

Expected performance is good for small/medium note sets because:
- algorithms are lightweight
- all operations are in-memory
- no heavy framework overhead

Bottlenecks for larger data:
- PDF extraction time
- summary/quiz generation on very long documents
- localStorage serialization size and speed

## 9) Code Quality Observations

Strengths:
- clear comments and separation by domain
- deterministic local-first behavior
- resilient fallback paths

Technical debt to watch:
- duplicated logic between modular files and `study-smart-bundle.js`
- absence of automated tests
- minimal schema versioning/migration path

## 10) Recommended Next Steps

High-impact improvements:
1. Add unit tests for `study-engine.js` and `srs.js`
2. Introduce a small build pipeline to generate bundle automatically
3. Add structured analytics (review streaks, topic mastery trends)
4. Add OCR option for scanned PDFs/images
5. Add export/import for study sets (JSON)

---

## Quick Run Instructions

### Option A: Double-click local file
Open `index.html` directly (`file://`) with `css/` and `js/` next to it.

### Option B: Local server
```bash
cd "AI School Helper"
python3 -m http.server 8080
```
Then visit `http://127.0.0.1:8080/`.

