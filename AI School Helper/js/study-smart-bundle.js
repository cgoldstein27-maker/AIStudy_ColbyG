/*!
 * study-smart-bundle.js — Study Smart in one script for file://
 *
 * Browsers often block ES module `import` when you open HTML from disk.
 * This file inlines the same logic as js/storage.js, study-engine.js, srs.js,
 * weak-topics.js, chat.js, and app.js inside one IIFE so nothing is global
 * except what PDF.js sets (pdfjsLib) from index.html.
 *
 * Section order: STORAGE → STUDY ENGINE → SRS → WEAK TOPICS → CHAT → APP UI
 */

(function () {
  "use strict";

  /* ========== STORAGE (localStorage) ========== */
  const STORAGE_KEY = "study-smart-v1";

  function defaultState() {
    return { docs: [], srs: {}, weakTopics: {}, activeDocId: null };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed, docs: parsed.docs || [] };
    } catch {
      return defaultState();
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function newId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /* ========== STUDY ENGINE (summaries, chunks, cards, quiz, chunk rank) ========== */
  /** Words ignored when scoring “important” terms for summaries / chat match. */
  const STOP = new Set(
    "a an the and or but in on at to for of is are was were be been being it its this that these those as by with from into through during before after above below between under again further then once here there when where why how all both each few more most other some such no nor not only own same so than too very can will just about into over also".split(
      " "
    )
  );

  function tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w));
  }

  function splitChunks(content) {
    const parts = content
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return [content.trim()].filter(Boolean);
    return parts;
  }

  function firstLineLabel(chunk) {
    const line = chunk.split("\n")[0].trim();
    const short = line.length > 72 ? `${line.slice(0, 69)}…` : line;
    return short || "General";
  }

  function topicKey(label) {
    return label.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  }

  function splitSentences(text) {
    return text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12);
  }

  /** Pick top sentences by TF overlap with the whole doc (extractive summary). */
  function summarize(content, maxSentences) {
    maxSentences = maxSentences === undefined ? 5 : maxSentences;
    const sentences = splitSentences(content);
    if (sentences.length === 0) return content.slice(0, 500);
    const docTokens = tokenize(content);
    const tf = {};
    for (const t of docTokens) tf[t] = (tf[t] || 0) + 1;
    const maxTf = Math.max.apply(null, Object.values(tf).concat([1]));

    const scored = sentences.map(function (s, i) {
      const st = tokenize(s);
      let score = 0;
      for (let ti = 0; ti < st.length; ti++) score += (tf[st[ti]] || 0) / maxTf;
      score += st.length * 0.02;
      return { s: s, i: i, score: score };
    });

    scored.sort(function (a, b) {
      return b.score - a.score;
    });
    const picked = new Set(scored.slice(0, maxSentences).map(function (x) {
      return x.i;
    }));
    const ordered = sentences.filter(function (_, i) {
      return picked.has(i);
    });
    return ordered.join(" ");
  }

  /** Split into paragraphs → chunks with topic labels; build flashcard Q/A per chunk. */
  function buildStudyMaterial(content, idPrefix) {
    const rawChunks = splitChunks(content);
    const chunks = rawChunks.map(function (text) {
      const topic = firstLineLabel(text);
      return { text: text, topic: topic, topicKey: topicKey(topic) };
    });

    const flashcards = [];
    let n = 0;
    for (let ci = 0; ci < chunks.length; ci++) {
      const c = chunks[ci];
      const sentences = splitSentences(c.text);
      if (sentences.length === 0) continue;
      const head = sentences[0];
      const rest = sentences.slice(1).join(" ");
      const back = rest.length > 20 ? head + " " + rest : c.text;
      flashcards.push({
        id: idPrefix + "-fc-" + n++,
        topic: c.topic,
        topicKey: c.topicKey,
        q: "Explain or recall: " + c.topic,
        a: back.slice(0, 1200),
      });
      if (sentences.length >= 2) {
        flashcards.push({
          id: idPrefix + "-fc-" + n++,
          topic: c.topic,
          topicKey: c.topicKey,
          q:
            'In your notes, what follows this idea? "' +
            head.slice(0, 120) +
            (head.length > 120 ? "…" : "") +
            '"',
          a: sentences[1].slice(0, 800),
        });
      }
    }

    if (flashcards.length === 0 && content.trim()) {
      flashcards.push({
        id: idPrefix + "-fc-0",
        topic: "Overview",
        topicKey: "overview",
        q: "What is the main takeaway from this material?",
        a: summarize(content, 3).slice(0, 1000),
      });
    }

    return { chunks: chunks, flashcards: flashcards };
  }

  const FALLBACK_DISTRACTORS = [
    "Not stated in these notes.",
    "A different concept from another section.",
    "The opposite of what the material describes.",
  ];

  /** One multiple-choice question per card; distractors from other cards or fallbacks. */
  function buildQuiz(cards) {
    const answers = cards.map(function (c) {
      return c.a;
    });
    const quiz = [];
    for (let i = 0; i < cards.length; i++) {
      const correct = cards[i].a;
      const distractors = answers
        .filter(function (_, j) {
          return j !== i;
        })
        .sort(function () {
          return Math.random() - 0.5;
        })
        .slice(0, 3);
      let safety = 0;
      while (distractors.length < 3 && answers.length > 1 && safety++ < 20) {
        const extra = answers[Math.floor(Math.random() * answers.length)];
        if (extra !== correct && distractors.indexOf(extra) === -1) distractors.push(extra);
      }
      for (let fi = 0; fi < FALLBACK_DISTRACTORS.length; fi++) {
        const f = FALLBACK_DISTRACTORS[fi];
        if (distractors.length >= 3) break;
        if (f !== correct && distractors.indexOf(f) === -1) distractors.push(f);
      }
      const options = [{ text: correct, correct: true }].concat(
        distractors.map(function (t) {
          return { text: t, correct: false };
        })
      );
      options.sort(function () {
        return Math.random() - 0.5;
      });
      quiz.push({
        question: cards[i].q,
        options: options,
        topicKey: cards[i].topicKey,
      });
    }
    return quiz.sort(function () {
      return Math.random() - 0.5;
    });
  }

  /** Score chunks by token overlap with the user question (used by local chat). */
  function rankChunksForQuestion(chunks, question, topK) {
    topK = topK === undefined ? 3 : topK;
    const qTokens = new Set(tokenize(question));
    if (qTokens.size === 0) return chunks.slice(0, topK);
    const scored = chunks.map(function (c) {
      const ct = tokenize(c.text);
      let hit = 0;
      for (let ti = 0; ti < ct.length; ti++) if (qTokens.has(ct[ti])) hit++;
      return { c: c, score: hit / Math.sqrt(ct.length + 1) };
    });
    scored.sort(function (a, b) {
      return b.score - a.score;
    });
    return scored
      .filter(function (x) {
        return x.score > 0;
      })
      .slice(0, topK)
      .map(function (x) {
        return x.c;
      });
  }

  /* ========== SRS (SM-2 spaced repetition) ========== */
  function scheduleReview(quality, card) {
    let easeFactor = card.easeFactor === undefined ? 2.5 : card.easeFactor;
    let interval = card.interval === undefined ? 0 : card.interval;
    let repetitions = card.repetitions === undefined ? 0 : card.repetitions;
    const q = Math.min(5, Math.max(0, quality));

    if (q < 3) {
      repetitions = 0;
      interval = 1;
    } else {
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
      repetitions += 1;
    }

    easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    const dayMs = 24 * 60 * 60 * 1000;
    const nextReview = Date.now() + interval * dayMs;

    return { easeFactor: easeFactor, interval: interval, repetitions: repetitions, nextReview: nextReview };
  }

  function defaultSrsMeta() {
    return { easeFactor: 2.5, interval: 0, repetitions: 0, nextReview: 0 };
  }

  function isDue(meta) {
    if (!meta || meta.nextReview === undefined) return true;
    return meta.nextReview <= Date.now();
  }

  /* ========== WEAK TOPICS (quiz + SRS mistakes) ========== */
  function recordWeak(state, topicKey, label, deltaWrong, deltaCorrect) {
    deltaWrong = deltaWrong || 0;
    deltaCorrect = deltaCorrect || 0;
    if (!topicKey) return;
    const w = state.weakTopics[topicKey] || {
      label: label || topicKey,
      wrong: 0,
      correct: 0,
    };
    if (label) w.label = label;
    w.wrong += deltaWrong;
    w.correct += deltaCorrect;
    state.weakTopics[topicKey] = w;
  }

  function weakTopicList(state) {
    return Object.keys(state.weakTopics)
      .map(function (key) {
        const v = state.weakTopics[key];
        const total = v.wrong + v.correct;
        const rate = total ? v.wrong / total : 0;
        return { key: key, label: v.label, wrong: v.wrong, correct: v.correct, total: total, rate: rate };
      })
      .filter(function (x) {
        return x.total > 0;
      })
      .sort(function (a, b) {
        return b.rate - a.rate || b.wrong - a.wrong;
      });
  }

  /* ========== CHAT (local retrieval + optional OpenAI) ========== */
  const STUDY_TUTOR_SYSTEM_PROMPT =
    "You are an advanced study tutor. Teach clearly in simple steps, assume high-school level unless the student asks for another level, and keep responses concise but meaningful. Use examples when helpful. If the student seems confused or asks repeated questions, explicitly say: \"This seems like a weak area. Let’s practice it more.\" Then simplify and give extra practice. For problem-solving, guide step-by-step instead of only giving final answers. After each explanation, include 3-5 flashcards in this exact format on separate lines: Q: ... then A: ... . When appropriate, include a short 3-4 question multiple-choice quiz and list the correct answers at the end. Never mention being an AI model.";

  function localAnswer(question, chunks) {
    const ranked = rankChunksForQuestion(chunks, question, 3);
    if (ranked.length === 0) {
      return {
        text:
          "I couldn’t find a strong match in your notes. This seems like a weak area. Let’s practice it more.\n\nTry sharing a little more detail, then I’ll teach it step-by-step with examples, flashcards, and a short quiz.",
        cites: [],
      };
    }
    const bullets = ranked
      .map(function (c) {
        return c.topic + ": " + c.text.slice(0, 220) + (c.text.length > 220 ? "…" : "");
      })
      .join("\n");
    const flashcards = ranked
      .slice(0, 3)
      .map(function (c) {
        return (
          "Q: What is the key idea in \"" +
          c.topic +
          "\"?\nA: " +
          c.text.slice(0, 160) +
          (c.text.length > 160 ? "…" : "")
        );
      })
      .join("\n\n");
    const quiz = ranked
      .slice(0, 3)
      .map(function (c, i) {
        return i + 1 + ") Which topic best matches this note? \"" + c.text.slice(0, 90) + "...\"";
      })
      .join("\n");
    return {
      text:
        "Step-by-step explanation based on your notes:\n1) Identify the core ideas:\n" +
        bullets +
        '\n2) Connect them to your question: focus on how these ideas relate directly to "' +
        question +
        "\".\n3) Check understanding: explain each idea in your own words.\n\nFlashcards:\n" +
        flashcards +
        "\n\nQuick quiz:\n" +
        quiz +
        "\n\nCorrect answers:\n1) Topic 1\n2) Topic 2\n3) Topic 3",
      cites: ranked.map(function (c) {
        return c.topic;
      }),
    };
  }

  /** Returns a Promise (fetch) so the UI can .then() without async/await if needed. */
  function answerQuestion(question, chunks, apiKey) {
    const local = localAnswer(question, chunks);
    if (!apiKey || apiKey.indexOf("sk-") !== 0) {
      return Object.assign({}, local, { source: "local" });
    }

    const context = chunks
      .map(function (c) {
        return "[" + c.topic + "]\n" + c.text;
      })
      .join("\n\n")
      .slice(0, 12000);

    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              STUDY_TUTOR_SYSTEM_PROMPT +
              " Also: answer ONLY using the provided NOTES; if an answer is not in NOTES, say that clearly and ask for more material.",
          },
          {
            role: "user",
            content:
              "NOTES:\n" +
              context +
              "\n\nQUESTION: " +
              question +
              "\n\nReturn format:\n- Clear step-by-step explanation\n- 3-5 flashcards (Q:/A:)\n- Optional 3-4 question MC quiz when useful + answer key",
          },
        ],
        max_tokens: 600,
        temperature: 0.3,
      }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (err) {
            return {
              text: "API error (" + res.status + "). Showing local retrieval instead:\n\n" + local.text,
              cites: local.cites,
              source: "fallback",
              detail: err.slice(0, 200),
            };
          });
        }
        return res.json().then(function (data) {
          const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
            ? data.choices[0].message.content.trim()
            : local.text);
          return { text: text, cites: local.cites, source: "openai" };
        });
      })
      .catch(function (e) {
        return {
          text: "Network error. Local context:\n\n" + local.text,
          cites: local.cites,
          source: "fallback",
          detail: String(e.message || e),
        };
      });
  }

  /** Long-form notes for “no saved set yet” flow; template if no API key. */
  function generateNotesForTopic(topic, apiKey) {
    const safeTopic = topic.trim() || "the requested subject";
    if (!apiKey || apiKey.indexOf("sk-") !== 0) {
      return (
        "Title: " +
        safeTopic +
        "\n\nOverview\n- Definition and key idea of " +
        safeTopic +
        ".\n- Why it matters in the course.\n\nCore concepts\n- Main terms, formulas, or rules.\n- Typical examples you might see on homework or tests.\n\nWorked example\n- Step-by-step example problem using " +
        safeTopic +
        ".\n\nCommon mistakes\n- 2–3 ways students usually get confused about " +
        safeTopic +
        ".\n\nSummary\n- 3–5 bullet recap of the most important ideas."
      );
    }

    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a study tutor writing detailed notes for a high-school student. Use clear headings, simple language, step-by-step structure, examples, and at least one worked example. End with 3-5 flashcards in Q:/A: format and a short 3-4 question multiple-choice quiz with answer key.",
          },
          {
            role: "user",
            content:
              "Write detailed, student-friendly notes on: " +
              safeTopic +
              ". Include:\n- High-level overview\n- Definitions of key terms\n- Important formulas or rules (if any)\n- At least one worked example\n- Common mistakes and tips\n- Short summary bullets at the end.",
          },
        ],
        max_tokens: 900,
        temperature: 0.4,
      }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (err) {
            console.warn("generateNotesForTopic API error", res.status, err);
            return (
              "Could not reach the notes API (status " +
              res.status +
              "). Here is a generic outline for " +
              safeTopic +
              ":\n\n- Definition and key idea\n- Why it matters\n- Main concepts and examples\n- Common mistakes\n- Summary bullets."
            );
          });
        }
        return res.json().then(function (data) {
          const text =
            data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
              ? data.choices[0].message.content.trim()
              : null;
          return text || "Notes on " + safeTopic + ".";
        });
      })
      .catch(function (e) {
        console.warn("generateNotesForTopic network error", e);
        return (
          "Network error while generating notes. Here is a generic outline for " +
          safeTopic +
          ":\n\n- Definition and key idea\n- Why it matters\n- Main concepts and examples\n- Common mistakes\n- Summary bullets."
        );
      });
  }

  /* ========== APP (DOM, tabs, Library, SRS UI, Quiz, Chat wiring) ========== */
  const OPENAI_STORAGE = "study-smart-openai-key";
  let state = loadState();
  const $ = function (sel) {
    return document.querySelector(sel);
  };

  function persist() {
    saveState(state);
  }

  function setTab(name) {
    const tabs = document.querySelectorAll(".tab");
    for (let i = 0; i < tabs.length; i++) {
      const t = tabs[i];
      const on = t.getAttribute("data-tab") === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    }
    const panels = document.querySelectorAll(".panel");
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      const active = p.id === "panel-" + name;
      p.classList.toggle("active", active);
      p.hidden = !active;
    }
  }

  function getDoc(id) {
    for (let i = 0; i < state.docs.length; i++) if (state.docs[i].id === id) return state.docs[i];
    return null;
  }

  function renderDocList() {
    const ul = $("#doc-list");
    const empty = $("#doc-empty");
    ul.innerHTML = "";
    if (state.docs.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    for (let i = 0; i < state.docs.length; i++) {
      const d = state.docs[i];
      const li = document.createElement("li");
      li.dataset.id = d.id;
      li.classList.toggle("active", d.id === state.activeDocId);
      li.innerHTML = '<span class="title"></span><span class="meta"></span>';
      li.querySelector(".title").textContent = d.title;
      li.querySelector(".meta").textContent =
        (d.flashcards && d.flashcards.length ? d.flashcards.length : 0) + " cards";
      li.addEventListener(
        "click",
        (function (docId) {
          return function () {
            state.activeDocId = docId;
            persist();
            renderDocList();
            renderActiveDoc();
          };
        })(d.id)
      );
      ul.appendChild(li);
    }
  }

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
    const fcs = doc.flashcards || [];
    for (let i = 0; i < Math.min(8, fcs.length); i++) {
      const fc = fcs[i];
      const li = document.createElement("li");
      li.innerHTML = "<strong></strong><span></span>";
      li.querySelector("strong").textContent = fc.q;
      li.querySelector("span").textContent = fc.a;
      prev.appendChild(li);
    }
  }

  /**
   * Prefer global pdfjsLib from index.html (works on file://).
   * Otherwise dynamic-import the v4 module (usually when served over http).
   */
  function extractPdfText(file) {
    if (typeof pdfjsLib !== "undefined" && pdfjsLib.getDocument) {
      return file.arrayBuffer().then(function (buf) {
        return pdfjsLib.getDocument({ data: buf }).promise.then(function (pdf) {
          let text = "";
          const num = pdf.numPages;
          function pageLoop(n) {
            if (n > num) return Promise.resolve(text.trim());
            return pdf.getPage(n).then(function (page) {
              return page.getTextContent().then(function (content) {
                let line = "";
                for (let i = 0; i < content.items.length; i++) line += content.items[i].str + " ";
                text += line + "\n\n";
                return pageLoop(n + 1);
              });
            });
          }
          return pageLoop(1);
        });
      });
    }
    return import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs")
      .then(function (pdfjs) {
        pdfjs.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";
        return file.arrayBuffer().then(function (buf) {
          return pdfjs.getDocument({ data: buf }).promise;
        });
      })
      .then(function (pdf) {
        let text = "";
        const chain = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          chain.push(i);
        }
        return chain.reduce(function (p, pageNum) {
          return p.then(function () {
            return pdf.getPage(pageNum).then(function (page) {
              return page.getTextContent().then(function (content) {
                text +=
                  content.items
                    .map(function (it) {
                      return it.str;
                    })
                    .join(" ") + "\n\n";
              });
            });
          });
        }, Promise.resolve()).then(function () {
          return text.trim();
        });
      });
  }

  /** Build chunks/cards/summary, push doc, init SRS due-now, refresh UI. */
  function processAndSaveDoc(title, content) {
    const trimmed = content.trim();
    if (!trimmed) {
      $("#upload-status").textContent = "Add some text before saving.";
      return;
    }
    const id = newId();
    const built = buildStudyMaterial(trimmed, id);
    const chunks = built.chunks;
    const flashcards = built.flashcards;
    const summary = summarize(trimmed, 6);
    const doc = {
      id: id,
      title: title.trim() || "Untitled",
      content: trimmed,
      summary: summary,
      chunks: chunks,
      flashcards: flashcards,
      createdAt: Date.now(),
    };
    state.docs.unshift(doc);
    state.activeDocId = id;
    for (let i = 0; i < flashcards.length; i++) {
      const fc = flashcards[i];
      if (!state.srs[fc.id]) state.srs[fc.id] = Object.assign({}, defaultSrsMeta(), { nextReview: 0 });
    }
    persist();
    $("#upload-status").textContent = "Saved “" + doc.title + "” with " + flashcards.length + " flashcards.";
    $("#doc-title").value = "";
    $("#doc-content").value = "";
    renderDocList();
    renderActiveDoc();
    refreshSelectors();
    renderWeakTopics();
  }

  function deleteActiveDoc() {
    const doc = state.activeDocId ? getDoc(state.activeDocId) : null;
    if (!doc) return;
    if (!confirm('Delete "' + doc.title + '" and its study data?')) return;
    const fcs = doc.flashcards || [];
    for (let i = 0; i < fcs.length; i++) delete state.srs[fcs[i].id];
    state.docs = state.docs.filter(function (d) {
      return d.id !== doc.id;
    });
    state.activeDocId = state.docs[0] ? state.docs[0].id : null;
    persist();
    renderDocList();
    renderActiveDoc();
    refreshSelectors();
    srsQueue = [];
    renderWeakTopics();
  }

  let srsQueue = [];
  let srsIndex = 0;

  /** Cards whose nextReview is due (or missing) across every saved set. */
  function collectDueCards() {
    const due = [];
    for (let di = 0; di < state.docs.length; di++) {
      const d = state.docs[di];
      const fcs = d.flashcards || [];
      for (let fi = 0; fi < fcs.length; fi++) {
        const fc = fcs[fi];
        const meta = state.srs[fc.id] || Object.assign({}, defaultSrsMeta(), { nextReview: 0 });
        if (isDue(meta)) due.push({ doc: d, card: fc, meta: meta });
      }
    }
    return due.sort(function () {
      return Math.random() - 0.5;
    });
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
    $("#srs-progress").textContent = "Card " + (srsIndex + 1) + " of " + srsQueue.length;
    $("#srs-q").textContent = item.card.q;
    $("#srs-a").textContent = item.card.a;
    $("#srs-a").hidden = true;
    $("#srs-reveal").hidden = false;
    $("#srs-rates").hidden = true;
  }

  function startSrsSession() {
    srsQueue = collectDueCards();
    srsIndex = 0;
    renderSrsCard();
  }

  function revealSrs() {
    $("#srs-a").hidden = false;
    $("#srs-reveal").hidden = true;
    $("#srs-rates").hidden = false;
  }

  function rateSrs(quality) {
    const item = srsQueue[srsIndex];
    if (!item) return;
    const prev = state.srs[item.card.id] || defaultSrsMeta();
    state.srs[item.card.id] = scheduleReview(quality, prev);
    if (quality < 3) recordWeak(state, item.card.topicKey, item.card.topic, 1, 0);
    else recordWeak(state, item.card.topicKey, item.card.topic, 0, 1);
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

  let quizItems = [];
  let quizIdx = 0;
  let quizLocked = false;

  function refreshSelectors() {
    const qSel = $("#quiz-doc-select");
    const cSel = $("#chat-doc-select");
    qSel.innerHTML = "";
    cSel.innerHTML = "";
    for (let i = 0; i < state.docs.length; i++) {
      const d = state.docs[i];
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
    const has = doc && doc.flashcards && doc.flashcards.length > 0;
    empty.hidden = has;
    area.hidden = !has && area.hidden;
  }

  function startQuiz() {
    const docId = $("#quiz-doc-select").value;
    const doc = getDoc(docId);
    if (!doc || !doc.flashcards || !doc.flashcards.length) {
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
    $("#quiz-progress").textContent = "Question " + (quizIdx + 1) + " of " + quizItems.length;
    $("#quiz-question").textContent = item.question;
    $("#quiz-feedback").textContent = "";
    $("#quiz-next").hidden = true;
    const opts = $("#quiz-options");
    opts.innerHTML = "";
    quizLocked = false;
    for (let i = 0; i < item.options.length; i++) {
      const opt = item.options[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = opt.text.length > 200 ? opt.text.slice(0, 197) + "…" : opt.text;
      btn.dataset.correct = opt.correct ? "1" : "0";
      btn.addEventListener(
        "click",
        (function (b, it, o) {
          return function () {
            onQuizPick(b, it, o);
          };
        })(btn, item, opt)
      );
      opts.appendChild(btn);
    }
  }

  function onQuizPick(btn, item, opt) {
    if (quizLocked) return;
    quizLocked = true;
    const buttons = $("#quiz-options").querySelectorAll("button");
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      b.disabled = true;
      if (b.dataset.correct === "1") b.classList.add("correct");
    }
    if (!opt.correct) {
      btn.classList.add("wrong");
      recordWeak(state, item.topicKey, null, 1, 0);
    } else recordWeak(state, item.topicKey, null, 0, 1);
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
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const div = document.createElement("div");
      div.className = "weak-item";
      const pct = Math.round(r.rate * 100);
      div.innerHTML =
        "<div><div class=\"name\"></div><div class=\"weak-bar\"><span style=\"width:" +
        pct +
        '%"></span></div></div><div class="stats"></div>';
      div.querySelector(".name").textContent = r.label;
      div.querySelector(".stats").textContent = r.wrong + " miss · " + r.correct + " hit · " + pct + "% miss rate";
      list.appendChild(div);
    }
  }

  function appendChat(role, text, cites) {
    const log = $("#chat-log");
    const div = document.createElement("div");
    div.className = "chat-msg " + role;
    div.textContent = text;
    if (cites && cites.length) {
      const cite = document.createElement("div");
      cite.className = "cite";
      cite.textContent = "Sections: " + cites.join(" · ");
      div.appendChild(cite);
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  /** Attach all click/change handlers once at startup. */
  function bindUi() {
    const tabEls = document.querySelectorAll(".tab");
    for (let i = 0; i < tabEls.length; i++) {
      tabEls[i].addEventListener(
        "click",
        (function (tabEl) {
          return function () {
            const name = tabEl.getAttribute("data-tab");
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
          };
        })(tabEls[i])
      );
    }

    $("#btn-save-doc").addEventListener("click", function () {
      processAndSaveDoc($("#doc-title").value, $("#doc-content").value);
    });

    $("#doc-file").addEventListener("change", function (e) {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      $("#upload-status").textContent = "Reading " + file.name + "…";
      const isPdf =
        file.type === "application/pdf" ||
        (file.name && file.name.toLowerCase().slice(-4) === ".pdf");
      const p = isPdf ? extractPdfText(file) : file.text();
      Promise.resolve(p)
        .then(function (text) {
          $("#doc-content").value = text;
          if (!$("#doc-title").value) $("#doc-title").value = file.name.replace(/\.[^.]+$/, "");
          $("#upload-status").textContent = "Loaded into the editor. Click Save & process when ready.";
        })
        .catch(function (err) {
          $("#upload-status").textContent = "Could not read file: " + (err.message || err);
        });
    });

    $("#btn-delete-doc").addEventListener("click", deleteActiveDoc);
    $("#btn-regenerate").addEventListener("click", function () {
      const doc = state.activeDocId ? getDoc(state.activeDocId) : null;
      if (!doc) return;
      const fcs = doc.flashcards || [];
      for (let i = 0; i < fcs.length; i++) delete state.srs[fcs[i].id];
      const built = buildStudyMaterial(doc.content, doc.id);
      doc.chunks = built.chunks;
      doc.flashcards = built.flashcards;
      doc.summary = summarize(doc.content, 6);
      for (let i = 0; i < doc.flashcards.length; i++) {
        state.srs[doc.flashcards[i].id] = Object.assign({}, defaultSrsMeta(), { nextReview: 0 });
      }
      persist();
      renderDocList();
      renderActiveDoc();
      renderWeakTopics();
      $("#upload-status").textContent = "Regenerated summary and cards.";
    });

    $("#srs-reveal").addEventListener("click", revealSrs);
    $("#srs-rates").addEventListener("click", function (e) {
      const btn = e.target.closest("[data-quality]");
      if (!btn) return;
      rateSrs(Number(btn.getAttribute("data-quality")));
    });

    $("#btn-start-quiz").addEventListener("click", startQuiz);
    $("#quiz-next").addEventListener("click", quizNext);

    $("#openai-key").addEventListener("change", function () {
      const v = $("#openai-key").value.trim();
      if (v) localStorage.setItem(OPENAI_STORAGE, v);
      else localStorage.removeItem(OPENAI_STORAGE);
    });

    $("#btn-chat-send").addEventListener("click", function () {
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

      // Chat dropdown first; if empty, use the Library’s active set.
      let docId = $("#chat-doc-select").value;
      if (!docId && state.activeDocId) docId = state.activeDocId;
      const doc = docId ? getDoc(docId) : null;

      // Existing notes: answer from chunks (OpenAI optional, still grounded on notes).
      if (doc) {
        const chunks =
          doc.chunks && doc.chunks.length > 0 ? doc.chunks : buildStudyMaterial(doc.content, doc.id).chunks;
        answerQuestion(q, chunks, apiKey).then(function (res) {
          status.textContent =
            res.source === "openai" ? "Answer from model + your notes." : "Answer from your notes (local retrieval).";
          appendChat("bot", res.text, res.cites);
        });
        return;
      }

      // No sets: synthesize note text, save as a new doc, then answer from it.
      status.textContent = "No notes yet — creating a new notes set for this topic…";
      generateNotesForTopic(q, apiKey).then(function (notes) {
        const shortTitle = q.length > 60 ? q.slice(0, 57) + "…" : q;
        processAndSaveDoc(shortTitle || "AI-generated notes", notes);
        const newDoc = state.activeDocId ? getDoc(state.activeDocId) : null;
        if (newDoc) {
          const chunks =
            newDoc.chunks && newDoc.chunks.length > 0
              ? newDoc.chunks
              : buildStudyMaterial(newDoc.content, newDoc.id).chunks;
          return answerQuestion(q, chunks, apiKey).then(function (res) {
            status.textContent =
              res.source === "openai"
                ? "Answer from freshly generated notes."
                : "Answer from freshly generated notes (local retrieval).";
            appendChat("bot", res.text, res.cites);
          });
        }
        status.textContent = "Created notes outline, but something went wrong linking it to chat.";
      });
    });
  }

  function boot() {
    if (!state.docs.length) state = Object.assign(defaultState(), state);
    bindUi();
    renderDocList();
    renderActiveDoc();
    refreshSelectors();
    renderWeakTopics();
    renderQuizEmpty();
    setTab("library");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
