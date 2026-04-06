/**
 * app.js — Study Smart UI and glue code
 *
 * Wires the HTML (tabs, forms, lists) to storage + study-engine + SRS + chat.
 * Two ways to run the app:
 *   - `index.html` with this file as `type="module"` (needs a local server for some browsers).
 *   - `study-smart-bundle.js` (no modules; for opening index.html from disk).
 */

import { loadState, saveState, newId, defaultState } from "./storage.js";
import { buildStudyMaterial, summarize, buildQuiz } from "./study-engine.js";
import { scheduleReview, defaultSrsMeta, isDue } from "./srs.js";
import { recordWeak, weakTopicList } from "./weak-topics.js";
import { answerQuestion, generateNotesForTopic } from "./chat.js";

/** localStorage key for the optional OpenAI API key (never sent except to OpenAI by chat.js). */
const OPENAI_STORAGE = "study-smart-openai-key";

/** @type {ReturnType<typeof loadState>} */
let state = loadState();

/** Shorthand for one DOM node (matches how the HTML ids are set up). */
const $ = (sel) => document.querySelector(sel);

/** Write current in-memory state to localStorage. */
function persist() {
  saveState(state);
}

/** Show one main panel and mark the matching tab as active (accessibility + CSS). */
function setTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".panel").forEach((p) => {
    p.classList.toggle("active", p.id === `panel-${name}`);
    p.hidden = p.id !== `panel-${name}`;
  });
}

function getDoc(id) {
  return state.docs.find((d) => d.id === id);
}

/** Rebuild the Library sidebar list from `state.docs`. */
function renderDocList() {
  const ul = $("#doc-list");
  const empty = $("#doc-empty");
  ul.innerHTML = "";
  if (state.docs.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const d of state.docs) {
    const li = document.createElement("li");
    li.dataset.id = d.id;
    li.classList.toggle("active", d.id === state.activeDocId);
    li.innerHTML = `<span class="title"></span><span class="meta"></span>`;
    li.querySelector(".title").textContent = d.title;
    li.querySelector(".meta").textContent = `${d.flashcards?.length || 0} cards`;
    li.addEventListener("click", () => {
      state.activeDocId = d.id;
      persist();
      renderDocList();
      renderActiveDoc();
    });
    ul.appendChild(li);
  }
}

/** Show summary + a few flashcards for the currently active set. */
function renderActiveDoc() {
  const card = $("#active-doc-card");
  const doc = state.activeDocId ? getDoc(state.activeDocId) : null;
  if (!doc) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  $("#active-doc-title").textContent = doc.title;
  $("#active-summary").textContent = doc.summary || "—";
  const prev = $("#active-cards-preview");
  prev.innerHTML = "";
  (doc.flashcards || []).slice(0, 8).forEach((fc) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong></strong><span></span>`;
    li.querySelector("strong").textContent = fc.q;
    li.querySelector("span").textContent = fc.a;
    prev.appendChild(li);
  });
}

/**
 * Pull plain text from a PDF using pdf.js (ES module build from CDN).
 * Used when running with a server; the file:// bundle uses global pdfjsLib instead.
 */
async function extractPdfText(file) {
  const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n\n";
  }
  return text.trim();
}

/**
 * Turn raw text into a saved document: chunks, summary, flashcards, and initial SRS rows.
 * Also clears the compose form and refreshes dependent UI.
 */
function processAndSaveDoc(title, content) {
  const trimmed = content.trim();
  if (!trimmed) {
    $("#upload-status").textContent = "Add some text before saving.";
    return;
  }
  const id = newId();
  const { chunks, flashcards } = buildStudyMaterial(trimmed, id);
  const summary = summarize(trimmed, 6);
  const doc = {
    id,
    title: title.trim() || "Untitled",
    content: trimmed,
    summary,
    chunks,
    flashcards,
    createdAt: Date.now(),
  };
  state.docs.unshift(doc);
  state.activeDocId = id;
  for (const fc of flashcards) {
    if (!state.srs[fc.id]) state.srs[fc.id] = { ...defaultSrsMeta(), nextReview: 0 };
  }
  persist();
  $("#upload-status").textContent = `Saved “${doc.title}” with ${flashcards.length} flashcards.`;
  $("#doc-title").value = "";
  $("#doc-content").value = "";
  renderDocList();
  renderActiveDoc();
  refreshSelectors();
  renderWeakTopics();
}

/** Remove the active set and its SRS entries; pick another active doc if any remain. */
function deleteActiveDoc() {
  const doc = state.activeDocId ? getDoc(state.activeDocId) : null;
  if (!doc) return;
  if (!confirm(`Delete “${doc.title}” and its study data?`)) return;
  for (const fc of doc.flashcards || []) delete state.srs[fc.id];
  state.docs = state.docs.filter((d) => d.id !== doc.id);
  state.activeDocId = state.docs[0]?.id || null;
  persist();
  renderDocList();
  renderActiveDoc();
  refreshSelectors();
  srsQueue = [];
  renderWeakTopics();
}

/* ---------- Spaced repetition (Study tab) ---------- */
let srsQueue = [];
let srsIndex = 0;
let srsRevealed = false;

/** All flashcards across all sets whose nextReview is in the past (or unset). */
function collectDueCards() {
  const due = [];
  for (const d of state.docs) {
    for (const fc of d.flashcards || []) {
      const meta = state.srs[fc.id] || { ...defaultSrsMeta(), nextReview: 0 };
      if (isDue(meta)) due.push({ doc: d, card: fc, meta });
    }
  }
  return due.sort(() => Math.random() - 0.5);
}

function renderSrsCard() {
  const empty = $("#srs-empty");
  const session = $("#srs-session");
  if (srsQueue.length === 0) {
    empty.hidden = false;
    session.hidden = true;
    return;
  }
  empty.hidden = true;
  session.hidden = false;
  const item = srsQueue[srsIndex];
  $("#srs-progress").textContent = `Card ${srsIndex + 1} of ${srsQueue.length}`;
  $("#srs-q").textContent = item.card.q;
  $("#srs-a").textContent = item.card.a;
  $("#srs-a").hidden = true;
  $("#srs-reveal").hidden = false;
  $("#srs-rates").hidden = true;
  srsRevealed = false;
}

function startSrsSession() {
  srsQueue = collectDueCards();
  srsIndex = 0;
  renderSrsCard();
}

function revealSrs() {
  srsRevealed = true;
  $("#srs-a").hidden = false;
  $("#srs-reveal").hidden = true;
  $("#srs-rates").hidden = false;
}

/** Map button quality to SM-2 update and weak-topic stats, then advance the queue. */
function rateSrs(quality) {
  const item = srsQueue[srsIndex];
  if (!item) return;
  const prev = state.srs[item.card.id] || defaultSrsMeta();
  state.srs[item.card.id] = scheduleReview(quality, prev);
  if (quality < 3) {
    recordWeak(state, item.card.topicKey, item.card.topic, 1, 0);
  } else {
    recordWeak(state, item.card.topicKey, item.card.topic, 0, 1);
  }
  persist();
  srsIndex += 1;
  if (srsIndex >= srsQueue.length) {
    srsQueue = collectDueCards();
    srsIndex = 0;
    if (srsQueue.length === 0) {
      renderSrsCard();
      renderWeakTopics();
      return;
    }
  }
  renderSrsCard();
  renderWeakTopics();
}

/* ---------- Quiz ---------- */
let quizItems = [];
let quizIdx = 0;
let quizLocked = false;

/** Fill quiz + chat dropdowns from `state.docs`. */
function refreshSelectors() {
  const qSel = $("#quiz-doc-select");
  const cSel = $("#chat-doc-select");
  qSel.innerHTML = "";
  cSel.innerHTML = "";
  for (const d of state.docs) {
    const o1 = document.createElement("option");
    o1.value = d.id;
    o1.textContent = d.title;
    qSel.appendChild(o1);
    const o2 = document.createElement("option");
    o2.value = d.id;
    o2.textContent = d.title;
    cSel.appendChild(o2);
  }
  if (state.activeDocId) {
    qSel.value = state.activeDocId;
    cSel.value = state.activeDocId;
  }
}

function renderQuizEmpty() {
  const area = $("#quiz-area");
  const empty = $("#quiz-empty");
  const docId = $("#quiz-doc-select").value;
  const doc = docId ? getDoc(docId) : null;
  const has = doc && (doc.flashcards || []).length > 0;
  empty.hidden = has;
  area.hidden = !has && area.hidden;
}

function startQuiz() {
  const docId = $("#quiz-doc-select").value;
  const doc = getDoc(docId);
  if (!doc || !(doc.flashcards || []).length) {
    $("#quiz-empty").hidden = false;
    return;
  }
  quizItems = buildQuiz(doc.flashcards);
  quizIdx = 0;
  quizLocked = false;
  $("#quiz-area").hidden = false;
  $("#quiz-empty").hidden = true;
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const item = quizItems[quizIdx];
  $("#quiz-progress").textContent = `Question ${quizIdx + 1} of ${quizItems.length}`;
  $("#quiz-question").textContent = item.question;
  $("#quiz-feedback").textContent = "";
  $("#quiz-next").hidden = true;
  const opts = $("#quiz-options");
  opts.innerHTML = "";
  quizLocked = false;
  item.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = opt.text.length > 200 ? `${opt.text.slice(0, 197)}…` : opt.text;
    btn.dataset.correct = opt.correct ? "1" : "0";
    btn.addEventListener("click", () => onQuizPick(btn, item, opt));
    opts.appendChild(btn);
  });
}

function onQuizPick(btn, item, opt) {
  if (quizLocked) return;
  quizLocked = true;
  const buttons = $("#quiz-options").querySelectorAll("button");
  buttons.forEach((b) => {
    b.disabled = true;
    if (b.dataset.correct === "1") b.classList.add("correct");
  });
  if (!opt.correct) {
    btn.classList.add("wrong");
    recordWeak(state, item.topicKey, null, 1, 0);
  } else {
    recordWeak(state, item.topicKey, null, 0, 1);
  }
  persist();
  $("#quiz-feedback").textContent = opt.correct ? "Correct." : "Not quite — green shows the right answer.";
  $("#quiz-next").hidden = false;
  renderWeakTopics();
}

function quizNext() {
  quizIdx += 1;
  if (quizIdx >= quizItems.length) {
    $("#quiz-area").hidden = true;
    $("#quiz-feedback").textContent = "Quiz complete.";
    renderQuizEmpty();
    return;
  }
  renderQuizQuestion();
}

/* ---------- Weak topics (Insights tab) ---------- */
function renderWeakTopics() {
  const list = $("#weak-list");
  const empty = $("#weak-empty");
  const rows = weakTopicList(state);
  list.innerHTML = "";
  if (rows.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const r of rows) {
    const div = document.createElement("div");
    div.className = "weak-item";
    const pct = Math.round(r.rate * 100);
    div.innerHTML = `
      <div>
        <div class="name"></div>
        <div class="weak-bar"><span style="width:${pct}%"></span></div>
      </div>
      <div class="stats"></div>`;
    div.querySelector(".name").textContent = r.label;
    div.querySelector(".stats").textContent = `${r.wrong} miss · ${r.correct} hit · ${pct}% miss rate`;
    list.appendChild(div);
  }
}

/* ---------- Chat log ---------- */
function appendChat(role, text, cites) {
  const log = $("#chat-log");
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  if (cites && cites.length) {
    const cite = document.createElement("div");
    cite.className = "cite";
    cite.textContent = `Sections: ${cites.join(" · ")}`;
    div.appendChild(cite);
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

/* ---------- Wire DOM events once ---------- */
function bindUi() {
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      const name = t.dataset.tab;
      setTab(name);
      if (name === "study") startSrsSession();
      if (name === "quiz") {
        refreshSelectors();
        renderQuizEmpty();
      }
      if (name === "insights") renderWeakTopics();
      if (name === "chat") {
        refreshSelectors();
        const key = localStorage.getItem(OPENAI_STORAGE);
        if (key) $("#openai-key").value = key;
      }
    });
  });

  $("#btn-save-doc").addEventListener("click", () => {
    const title = $("#doc-title").value;
    const content = $("#doc-content").value;
    processAndSaveDoc(title, content);
  });

  $("#doc-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    $("#upload-status").textContent = `Reading ${file.name}…`;
    try {
      let text = "";
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        text = await extractPdfText(file);
      } else {
        text = await file.text();
      }
      $("#doc-content").value = text;
      if (!$("#doc-title").value) $("#doc-title").value = file.name.replace(/\.[^.]+$/, "");
      $("#upload-status").textContent = "Loaded into the editor. Click Save & process when ready.";
    } catch (err) {
      $("#upload-status").textContent = `Could not read file: ${err.message || err}`;
    }
  });

  $("#btn-delete-doc").addEventListener("click", deleteActiveDoc);
  $("#btn-regenerate").addEventListener("click", () => {
    const doc = state.activeDocId ? getDoc(state.activeDocId) : null;
    if (!doc) return;
    for (const fc of doc.flashcards || []) delete state.srs[fc.id];
    const { chunks, flashcards } = buildStudyMaterial(doc.content, doc.id);
    doc.chunks = chunks;
    doc.flashcards = flashcards;
    doc.summary = summarize(doc.content, 6);
    for (const fc of flashcards) {
      state.srs[fc.id] = { ...defaultSrsMeta(), nextReview: 0 };
    }
    persist();
    renderDocList();
    renderActiveDoc();
    renderWeakTopics();
    $("#upload-status").textContent = "Regenerated summary and cards.";
  });

  $("#srs-reveal").addEventListener("click", revealSrs);
  $("#srs-rates").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-quality]");
    if (!btn) return;
    rateSrs(Number(btn.dataset.quality));
  });

  $("#btn-start-quiz").addEventListener("click", startQuiz);
  $("#quiz-next").addEventListener("click", quizNext);

  $("#openai-key").addEventListener("change", () => {
    const v = $("#openai-key").value.trim();
    if (v) localStorage.setItem(OPENAI_STORAGE, v);
    else localStorage.removeItem(OPENAI_STORAGE);
  });

  $("#btn-chat-send").addEventListener("click", async () => {
    const q = $("#chat-input").value.trim();
    const status = $("#chat-status");
    if (!q) {
      status.textContent = "Type a question or a topic first.";
      return;
    }
    status.textContent = "Thinking…";
    appendChat("user", q);
    $("#chat-input").value = "";
    const apiKey = $("#openai-key").value.trim() || localStorage.getItem(OPENAI_STORAGE) || "";

    // Prefer chat dropdown, then whichever set is active in the Library.
    let docId = $("#chat-doc-select").value;
    if (!docId && state.activeDocId) docId = state.activeDocId;
    const doc = docId ? getDoc(docId) : null;

    // Ground answers in an existing saved set when we have one.
    if (doc) {
      const chunks =
        doc.chunks?.length > 0 ? doc.chunks : buildStudyMaterial(doc.content, doc.id).chunks;
      const res = await answerQuestion(q, chunks, apiKey);
      status.textContent =
        res.source === "openai"
          ? "Answer from model + your notes."
          : "Answer from your notes (local retrieval).";
      appendChat("bot", res.text, res.cites);
      return;
    }

    // No sets yet: generate note text from the user message, save it, then answer from that material.
    status.textContent = "No notes yet — creating a new notes set for this topic…";
    const notes = await generateNotesForTopic(q, apiKey);
    const shortTitle = q.length > 60 ? `${q.slice(0, 57)}…` : q;
    processAndSaveDoc(shortTitle || "AI-generated notes", notes);
    const newDoc = state.activeDocId ? getDoc(state.activeDocId) : null;
    if (newDoc) {
      const chunks =
        newDoc.chunks?.length > 0 ? newDoc.chunks : buildStudyMaterial(newDoc.content, newDoc.id).chunks;
      const res = await answerQuestion(q, chunks, apiKey);
      status.textContent =
        res.source === "openai"
          ? "Answer from freshly generated notes."
          : "Answer from freshly generated notes (local retrieval).";
      appendChat("bot", res.text, res.cites);
    } else {
      status.textContent = "Created notes outline, but something went wrong linking it to chat.";
    }
  });
}

function boot() {
  if (!state.docs.length) state = { ...defaultState(), ...state };
  bindUi();
  renderDocList();
  renderActiveDoc();
  refreshSelectors();
  renderWeakTopics();
  renderQuizEmpty();
  setTab("library");
}

boot();
