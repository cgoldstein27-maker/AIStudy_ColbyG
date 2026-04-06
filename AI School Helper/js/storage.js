/**
 * storage.js — persistence for Study Smart
 *
 * All app data (note sets, SRS stats, weak-topic tallies) lives in the browser’s
 * localStorage under one JSON blob. Nothing is sent to a server unless the user
 * uses the optional OpenAI features elsewhere.
 */

/** Key used for the single localStorage entry holding the whole app state. */
const STORAGE_KEY = "study-smart-v1";

/** Fresh empty shape; merged with parsed data on load so new fields get defaults. */
export function defaultState() {
  return {
    docs: [], // saved note sets (content, summary, flashcards, chunks…)
    srs: {}, // per–flashcard-id spaced repetition metadata
    weakTopics: {}, // aggregated wrong/right counts by topic key
    activeDocId: null, // which set is selected in the Library UI
  };
}

/** Read and parse state; on error or missing data, return defaults. */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed, docs: parsed.docs || [] };
  } catch {
    return defaultState();
  }
}

/** Serialize the full state object to localStorage. */
export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Short unique id for new documents and flashcards (no external deps). */
export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
