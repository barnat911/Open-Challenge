const OpenAI = require("openai");
const crypto = require("crypto");

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

function hashText(t) {
  return crypto.createHash("sha256").update(String(t || "")).digest("hex");
}

async function embed(text) {
  const c = client();
  const model = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

  const resp = await c.embeddings.create({
    model,
    input: String(text || "")
  });

  const v = resp.data?.[0]?.embedding;
  if (!Array.isArray(v)) throw new Error("Embedding missing");
  return v;
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den ? dot / den : 0;
}

async function whyRecommended({ user, job, score }) {
  const c = client();
  const model = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

  const system = `Return STRICT JSON only: {"why": "short <= 160 chars"}. Tunisian tourism context.`;
  const payload = {
    user: { skills: user.skills, experience: user.experience, availability: user.availability, location: user.location },
    job: { title: job.title, required_skills: job.required_skills, job_type: job.job_type, location: job.location },
    score
  };

  const resp = await c.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(payload) }
    ],
    temperature: 0.3
  });

  const text = resp.choices?.[0]?.message?.content || "{}";
  let parsed = {};
  try { parsed = JSON.parse(text); } catch {}
  const why = String(parsed.why || "Good fit based on skills and availability.").slice(0, 180);
  return { why };
}

module.exports = { embed, hashText, cosine, whyRecommended };