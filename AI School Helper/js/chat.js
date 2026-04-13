/**
 * chat.js — Q&A over your notes + optional OpenAI
 *
 * Without an API key: answers are built by pulling the chunks that best match
 * the question (keyword overlap). With a key: the model must answer only from
 * those chunks. generateNotesForTopic can draft a full note when the user has
 * no saved material yet (see app.js).
 */

import { rankChunksForQuestion } from "./study-engine.js";

const STUDY_TUTOR_SYSTEM_PROMPT =
  "You are an advanced study tutor. Teach clearly in simple steps, assume high-school level unless the student asks for another level, and keep responses concise but meaningful. Use examples when helpful. If the student seems confused or asks repeated questions, explicitly say: \"This seems like a weak area. Let’s practice it more.\" Then simplify and give extra practice. For problem-solving, guide step-by-step instead of only giving final answers. After each explanation, include 3-5 flashcards in this exact format on separate lines: Q: ... then A: ... . When appropriate, include a short 3-4 question multiple-choice quiz and list the correct answers at the end. Never mention being an AI model.";

/** Best-effort answer using only local retrieval (no network). */
function localAnswer(question, chunks) {
  const ranked = rankChunksForQuestion(chunks, question, 3);
  if (ranked.length === 0) {
    return {
      text:
        "I couldn’t find a strong match in your notes. This seems like a weak area. Let’s practice it more.\n\nTry sharing a little more detail, then I’ll teach it step-by-step with examples, flashcards, and a short quiz.",
      cites: [],
    };
  }
  const bullets = ranked.map((c, i) => `${i + 1}. ${c.topic}: ${c.text.slice(0, 220)}${c.text.length > 220 ? "…" : ""}`);
  const flashcards = ranked
    .slice(0, 3)
    .map(
      (c) =>
        `Q: What is the key idea in “${c.topic}”?\nA: ${c.text.slice(0, 160)}${c.text.length > 160 ? "…" : ""}`
    )
    .join("\n\n");

  const quiz = ranked
    .slice(0, 3)
    .map((c, i) => `${i + 1}) Which topic best matches this note? "${c.text.slice(0, 90)}..."`)
    .join("\n");

  return {
    text: `Step-by-step explanation based on your notes:\n1) Identify the core ideas:\n${bullets.join(
      "\n"
    )}\n2) Connect them to your question: focus on how these ideas relate directly to "${question}".\n3) Check understanding: explain each idea in your own words.\n\nFlashcards:\n${flashcards}\n\nQuick quiz:\n${quiz}\n\nCorrect answers:\n1) Topic 1\n2) Topic 2\n3) Topic 3`,
    cites: ranked.map((c) => c.topic),
  };
}

/**
 * Answer a question given note chunks. Uses OpenAI only if apiKey looks valid.
 * Falls back to localAnswer on error or missing key.
 */
export async function answerQuestion(question, chunks, apiKey) {
  const local = localAnswer(question, chunks);
  if (!apiKey || !apiKey.startsWith("sk-")) {
    return { ...local, source: "local" };
  }

  const context = chunks.map((c) => `[${c.topic}]\n${c.text}`).join("\n\n").slice(0, 12000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `${STUDY_TUTOR_SYSTEM_PROMPT} Also: answer ONLY using the provided NOTES; if an answer is not in NOTES, say that clearly and ask for more material.`,
          },
          {
            role: "user",
            content: `NOTES:\n${context}\n\nQUESTION: ${question}\n\nReturn format:\n- Clear step-by-step explanation\n- 3-5 flashcards (Q:/A:)\n- Optional 3-4 question MC quiz when useful + answer key`,
          },
        ],
        max_tokens: 600,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return {
        text: `API error (${res.status}). Showing local retrieval instead:\n\n${local.text}`,
        cites: local.cites,
        source: "fallback",
        detail: err.slice(0, 200),
      };
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || local.text;
    return { text, cites: local.cites, source: "openai" };
  } catch (e) {
    return {
      text: `Network error. Local context:\n\n${local.text}`,
      cites: local.cites,
      source: "fallback",
      detail: String(e.message || e),
    };
  }
}

/**
 * Produce long-form notes for a topic (used when user has no saved set).
 * Without API key: returns a structured template the app still turns into flashcards.
 */
export async function generateNotesForTopic(topic, apiKey) {
  const safeTopic = topic.trim() || "the requested subject";
  if (!apiKey || !apiKey.startsWith("sk-")) {
    return `Title: ${safeTopic}\n\nOverview\n- Definition and key idea of ${safeTopic}.\n- Why it matters in the course.\n\nCore concepts\n- Main terms, formulas, or rules.\n- Typical examples you might see on homework or tests.\n\nWorked example\n- Step-by-step example problem using ${safeTopic}.\n\nCommon mistakes\n- 2–3 ways students usually get confused about ${safeTopic}.\n\nSummary\n- 3–5 bullet recap of the most important ideas.`;
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
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
            content: `Write detailed, student-friendly notes on: ${safeTopic}. Include:\n- High-level overview\n- Definitions of key terms\n- Important formulas or rules (if any)\n- At least one worked example\n- Common mistakes and tips\n- Short summary bullets at the end.`,
          },
        ],
        max_tokens: 900,
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn("generateNotesForTopic API error", res.status, err);
      return `Could not reach the notes API (status ${res.status}). Here is a generic outline for ${safeTopic}:\n\n- Definition and key idea\n- Why it matters\n- Main concepts and examples\n- Common mistakes\n- Summary bullets.`;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || `Notes on ${safeTopic}.`;
  } catch (e) {
    console.warn("generateNotesForTopic network error", e);
    return `Network error while generating notes. Here is a generic outline for ${safeTopic}:\n\n- Definition and key idea\n- Why it matters\n- Main concepts and examples\n- Common mistakes\n- Summary bullets.`;
  }
}

function parseJsonFromModelContent(raw) {
  let t = (raw || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  }
  return JSON.parse(t);
}

/**
 * Rewrite rough notes into clearer, higher-quality study notes (OpenAI required).
 * Stays grounded in the supplied text; flags uncertain claims with [verify].
 */
export async function refineNotesWithAI(rawNotes, title, apiKey) {
  if (!apiKey || !apiKey.startsWith("sk-")) {
    return { ok: false, error: "Add an OpenAI API key in the Chat tab to refine notes." };
  }
  const trimmed = (rawNotes || "").trim().slice(0, 28000);
  if (!trimmed) return { ok: false, error: "No note text to refine." };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an academic study coach. Rewrite the student's notes into polished study notes: clear headings, precise definitions, numbered steps where useful, and short examples. Expand only with widely standard educational explanations that are consistent with the student's text. Do not invent specific facts, dates, or citations not implied by the notes; if something is unclear, write [verify] instead of guessing. Tone: formal but readable for high school. No meta commentary.",
          },
          {
            role: "user",
            content: `Document title (context): ${title || "Untitled"}\n\nORIGINAL NOTES:\n${trimmed}\n\nProduce refined notes with sections: Overview, Key terms, Core ideas, Examples / applications, Common confusions, Short review checklist (bullets).`,
          },
        ],
        max_tokens: 3500,
        temperature: 0.35,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `API error (${res.status}): ${err.slice(0, 180)}` };
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, error: "Empty response from API." };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * Build harder multiple-choice questions using student notes + optional Wikipedia extract.
 * Returns items compatible with the existing quiz UI: { question, options: [{text, correct}], topicKey }.
 */
export async function generateAdvancedQuiz(notesContent, docTitle, webExtract, webSourceLabel, apiKey) {
  if (!apiKey || !apiKey.startsWith("sk-")) {
    return { ok: false, error: "Add an OpenAI API key to generate an advanced quiz." };
  }
  const notes = (notesContent || "").trim().slice(0, 14000);
  const web = (webExtract || "").trim().slice(0, 12000);
  const label = webSourceLabel || "Wikipedia";

  const userBlock =
    `STUDENT_NOTES:\n${notes}\n\n` +
    (web
      ? `REFERENCE (${label}, for extra context—prefer aligning with student notes when they conflict):\n${web}\n\n`
      : "No web reference was retrieved; base questions on STUDENT_NOTES only.\n\n") +
    `Return ONLY valid JSON (no markdown fences) with this shape:\n` +
    `{"questions":[` +
    `{"question":"string","options":["A","B","C","D"],"correctIndex":0,"topicKey":"short-topic-slug"}` +
    `]}\n` +
    `Rules: 6 to 8 questions. Four options each. correctIndex 0-3. Questions should be harder than simple recall: application, comparison, "which is FALSE", cause/effect, edge cases. Distractors must be plausible. topicKey should be a short lowercase slug (e.g. "photosynthesis-light-reactions").`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You write challenging multiple-choice questions for students. Output must be strictly valid JSON only. Never include commentary outside JSON.",
          },
          { role: "user", content: userBlock },
        ],
        max_tokens: 2800,
        temperature: 0.45,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `API error (${res.status}): ${err.slice(0, 180)}` };
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return { ok: false, error: "Empty quiz response." };

    let parsed;
    try {
      parsed = parseJsonFromModelContent(raw);
    } catch {
      return { ok: false, error: "Could not parse quiz JSON. Try again." };
    }

    const qs = parsed.questions;
    if (!Array.isArray(qs) || qs.length === 0) {
      return { ok: false, error: "Quiz response had no questions." };
    }

    const items = qs.map((q) => {
      const opts = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
      while (opts.length < 4) opts.push("(option)");
      const idx = Math.min(3, Math.max(0, Number(q.correctIndex) || 0));
      const topicKey = typeof q.topicKey === "string" && q.topicKey ? q.topicKey : "advanced-quiz";
      const tagged = opts.map((text, i) => ({
        text: String(text),
        correct: i === idx,
      }));
      const shuffled = tagged.sort(() => Math.random() - 0.5);
      return {
        question: String(q.question || "Question"),
        options: shuffled.map(({ text, correct }) => ({ text, correct })),
        topicKey,
      };
    });

    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
