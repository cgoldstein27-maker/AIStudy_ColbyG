
// chat.js — Study Smart AI (Notes + Web Hybrid)

// ===== CONFIG =====
const OPENAI_API_KEY = localStorage.getItem("openai_api_key");
const WEB_API_KEY = localStorage.getItem("tavily_api_key"); // or any search API

// ===== MAIN ENTRY =====
export async function askAI(question, options = {}) {
  const state = loadState();
  const activeDoc = getActiveDoc(state);

  const noteContext = getRelevantChunks(activeDoc, question);
  let webContext = "";

  // Decide if we need web
  if (shouldSearchWeb(question, noteContext)) {
    webContext = await fetchWebResults(question);
  }

  const prompt = buildPrompt({
    question,
    noteContext,
    webContext,
    mode: options.mode || "tutor",
  });

  const response = await callOpenAI(prompt);

  return response;
}

// ===== PROMPT BUILDER =====
function buildPrompt({ question, noteContext, webContext, mode }) {
  const baseSystem = `
You are a smart study assistant.

You have TWO sources:
1. Student notes (PRIMARY)
2. Web knowledge (SECONDARY)

Rules:
- Prioritize notes first
- Use web only to fill gaps or improve clarity
- Label sections:
  [From Notes]
  [From Web]

Always:
- Explain clearly (high school level unless asked otherwise)
- Use examples
- Highlight key ideas
`;

  let taskInstruction = "";

  if (mode === "quiz") {
    taskInstruction = `
Generate a quiz using BOTH notes and web knowledge.

Requirements:
- 5–10 questions
- Mix:
  - multiple choice
  - short answer
- Include:
  - conceptual understanding
  - application
- Make wrong answers realistic

Return JSON:
{
  questions: [
    {
      type: "mc",
      question: "",
      options: [],
      answer: ""
    }
  ]
}
`;
  } else if (mode === "improve") {
    taskInstruction = `
Improve these notes:
- Rewrite clearly
- Add missing concepts
- Add definitions + examples
- Organize with headings and bullet points
`;
  } else {
    taskInstruction = `
Answer the question clearly and help the student understand deeply.
`;
  }

  return `
${baseSystem}

${taskInstruction}

NOTES:
${noteContext || "No strong relevant notes found."}

WEB:
${webContext || "No web data used."}

QUESTION:
${question}
`;
}

// ===== OPENAI CALL =====
async function callOpenAI(prompt) {
  if (!OPENAI_API_KEY) {
    return "⚠️ No API key set.";
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "Error getting response.";
}

// ===== WEB SEARCH =====
async function fetchWebResults(query) {
  if (!WEB_API_KEY) return "";

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: WEB_API_KEY,
        query,
        max_results: 3,
      }),
    });

    const data = await res.json();

    return data.results
      .map(r => `- ${r.title}: ${r.content}`)
      .join("\n");
  } catch (e) {
    console.error("Web search failed", e);
    return "";
  }
}

// ===== DECISION LOGIC =====
function shouldSearchWeb(question, noteContext) {
  if (!noteContext || noteContext.length < 200) return true;

  const triggers = ["latest", "recent", "why", "how", "explain better"];
  return triggers.some(word => question.toLowerCase().includes(word));
}

// ===== NOTE RETRIEVAL =====
function getRelevantChunks(doc, question) {
  if (!doc || !doc.chunks) return "";

  const words = question.toLowerCase().split(/\W+/);

  return doc.chunks
    .map(chunk => {
      let score = 0;
      for (let word of words) {
        if (chunk.text.toLowerCase().includes(word)) score++;
      }
      return { chunk, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(c => c.chunk.text)
    .join("\n\n");
}

// ===== STATE HELPERS =====
function loadState() {
  return JSON.parse(localStorage.getItem("study-smart-v1")) || {};
}

function getActiveDoc(state) {
  return state.docs?.find(d => d.id === state.activeDocId);
}

// ===== EXTRA FEATURES =====

// Generate Quiz
export async function generateQuiz() {
  return askAI("Generate a quiz for this topic", { mode: "quiz" });
}

// Improve Notes
export async function improveNotes() {
  return askAI("Improve my notes", { mode: "improve" });
}