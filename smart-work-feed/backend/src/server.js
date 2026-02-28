require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { z } = require("zod");
const { initDB, getDB } = require("./db");
const { embed, hashText, cosine, whyRecommended } = require("./ai");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

initDB(process.env.DATABASE_PATH || "./data.sqlite");
const db = getDB();

app.get("/health", (req, res) => res.json({ ok: true }));

// ---------- Helpers ----------
function normalizeCity(s) {
  return String(s || "").trim().toLowerCase();
}

// Simple Tunisia-ish city proximity map (MVP)
function locationFit(userLoc, jobLoc) {
  const u = normalizeCity(userLoc);
  const j = normalizeCity(jobLoc);
  if (!u || !j) return 0.5;
  if (u === j) return 1.0;

  // lightweight “nearby” pairs (you can extend)
  const near = new Set([
    "sousse|monastir", "monastir|sousse",
    "tunis|ariana", "ariana|tunis",
    "tunis|ben arous", "ben arous|tunis",
    "sfax|mahdia", "mahdia|sfax"
  ]);
  if (near.has(`${u}|${j}`)) return 0.8;

  return 0.3;
}

function availabilityFit(userAvail, jobType) {
  const a = String(userAvail || "").toLowerCase();
  const t = String(jobType || "").toLowerCase();
  if (!a) return 0.6;
  if (t.includes("micro") && (a.includes("weekend") || a.includes("soir") || a.includes("any"))) return 0.9;
  if (t.includes("full") && a.includes("full")) return 0.9;
  return 0.6;
}

function getBehaviorScore(actorId, targetType, targetId) {
  // score in [0..1] from recent events
  const rows = db.prepare(`
    SELECT event_type, COUNT(*) as c
    FROM events
    WHERE actor_id = ? AND target_type = ? AND target_id = ?
    GROUP BY event_type
  `).all(actorId, targetType, targetId);

  let points = 0;
  for (const r of rows) {
    const et = r.event_type;
    const c = r.c || 0;
    if (et === "apply") points += 5 * c;
    else if (et === "save") points += 3 * c;
    else if (et === "click") points += 2 * c;
    else if (et === "view") points += 1 * c;
    else if (et === "skip") points -= 1 * c;
    else if (et === "cancel") points -= 8 * c;
  }
  // squash to 0..1
  const s = 1 / (1 + Math.exp(-points / 6));
  return s;
}

function getTrustScoreForUser(userId, role) {
  // Trust from ratings (avg last 10) + completion proxy from cancels
  const targetType = role === "company" ? "company" : "worker";
  const ratings = db.prepare(`
    SELECT stars FROM ratings
    WHERE target_id = ? AND target_type = ?
    ORDER BY id DESC LIMIT 10
  `).all(userId, targetType);

  const avgStars = ratings.length
    ? ratings.reduce((a, r) => a + r.stars, 0) / ratings.length
    : 4.0; // default optimistic for MVP

  // cancel penalty from events (actor cancels)
  const cancels = db.prepare(`
    SELECT COUNT(*) as c FROM events
    WHERE actor_id = ? AND event_type = 'cancel'
  `).get(userId)?.c || 0;

  const base = avgStars / 5; // 0..1
  const penalty = Math.min(0.4, cancels * 0.05);
  return Math.max(0, base - penalty);
}

async function getOrCreateEmbedding(entityType, entityId, text) {
  const h = hashText(text);
  const found = db.prepare(`
    SELECT vector_json FROM embeddings
    WHERE entity_type = ? AND entity_id = ? AND text_hash = ?
  `).get(entityType, entityId, h);

  if (found) return JSON.parse(found.vector_json);

  const v = await embed(text);
  db.prepare(`
    INSERT OR IGNORE INTO embeddings (entity_type, entity_id, text_hash, vector_json)
    VALUES (?, ?, ?, ?)
  `).run(entityType, entityId, h, JSON.stringify(v));

  return v;
}

function explorationMix(items, exploreRate = 0.15) {
  if (items.length <= 3) return items;
  const out = [];
  const exploreCount = Math.max(1, Math.floor(items.length * exploreRate));
  const exploitCount = items.length - exploreCount;

  const sorted = [...items].sort((a, b) => b.finalScore - a.finalScore);
  const exploit = sorted.slice(0, exploitCount);

  const rest = sorted.slice(exploitCount);
  // shuffle rest
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const explore = rest.slice(0, exploreCount);

  return [...exploit, ...explore];
}

// ---------- CRUD: Users & Jobs ----------
app.post("/users", (req, res) => {
  const schema = z.object({
    role: z.enum(["worker", "company"]).default("worker"),
    name: z.string().min(2),
    phone: z.string().min(6),
    skills: z.string().optional().default(""),
    experience: z.string().optional().default(""),
    availability: z.string().optional().default(""),
    location: z.string().optional().default("")
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const info = db.prepare(`
      INSERT INTO users (role, name, phone, skills, experience, availability, location)
      VALUES (@role, @name, @phone, @skills, @experience, @availability, @location)
    `).run(parsed.data);

    const user = db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
    res.json({ user });
  } catch (e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({ error: "Phone already exists" });
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/users", (req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY id DESC LIMIT 50").all();
  res.json({ users: rows });
});

app.post("/jobs", (req, res) => {
  const schema = z.object({
    companyId: z.number().int().positive().optional(),
    title: z.string().min(2),
    company_name: z.string().min(2),
    description: z.string().min(5),
    required_skills: z.string().min(2),
    location: z.string().optional().default(""),
    job_type: z.string().optional().default("micro-job"),
    start_date: z.string().optional().default(""),
    end_date: z.string().optional().default("")
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const info = db.prepare(`
    INSERT INTO jobs (company_id, title, company_name, description, required_skills, location, job_type, start_date, end_date)
    VALUES (@companyId, @title, @company_name, @description, @required_skills, @location, @job_type, @start_date, @end_date)
  `).run(parsed.data);

  const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(info.lastInsertRowid);
  res.json({ job });
});

app.get("/jobs", (req, res) => {
  const rows = db.prepare("SELECT * FROM jobs ORDER BY id DESC LIMIT 50").all();
  res.json({ jobs: rows });
});

// ---------- Events ----------
app.post("/events", (req, res) => {
  const schema = z.object({
    actorType: z.enum(["user"]),
    actorId: z.number().int().positive(),
    targetType: z.enum(["job", "user"]),
    targetId: z.number().int().positive(),
    eventType: z.enum(["view", "click", "save", "apply", "skip", "cancel"]),
    dwellSeconds: z.number().int().min(0).max(3600).optional().default(0)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const e = parsed.data;
  db.prepare(`
    INSERT INTO events (actor_type, actor_id, target_type, target_id, event_type, dwell_seconds)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(e.actorType, e.actorId, e.targetType, e.targetId, e.eventType, e.dwellSeconds);

  res.json({ ok: true });
});

// ---------- Ratings (Trust) ----------
app.post("/ratings", (req, res) => {
  const schema = z.object({
    raterId: z.number().int().positive(),
    raterType: z.enum(["company", "worker"]),
    targetId: z.number().int().positive(),
    targetType: z.enum(["worker", "company"]),
    stars: z.number().int().min(1).max(5),
    note: z.string().optional().default("")
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const r = parsed.data;
  db.prepare(`
    INSERT INTO ratings (rater_id, rater_type, target_id, target_type, stars, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(r.raterId, r.raterType, r.targetId, r.targetType, r.stars, r.note);

  res.json({ ok: true });
});

// ---------- FEED: Worker -> Jobs ----------
app.get("/feed/jobs", async (req, res) => {
  const userId = Number(req.query.userId);
  const limit = Math.min(30, Math.max(5, Number(req.query.limit || 20)));

  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "worker") return res.status(400).json({ error: "userId must be a worker" });

  const jobs = db.prepare("SELECT * FROM jobs ORDER BY id DESC LIMIT 80").all();

  // build user embedding once
  const userText = `skills: ${user.skills}\nexperience: ${user.experience}\navailability: ${user.availability}\nlocation: ${user.location}`;
  const userVec = await getOrCreateEmbedding("user", user.id, userText);

  const scored = [];
  const nowBoost = (job) => {
    // freshness: newer jobs get slight bump
    // id is increasing; simple proxy
    return Math.min(1, 0.6 + (job.id / (job.id + 50)));
  };

  for (const job of jobs) {
    const jobText = `title: ${job.title}\ndesc: ${job.description}\nrequired: ${job.required_skills}\nlocation: ${job.location}\ntype: ${job.job_type}`;
    const jobVec = await getOrCreateEmbedding("job", job.id, jobText);

    const sim = (cosine(userVec, jobVec) + 1) / 2; // -> 0..1
    const loc = locationFit(user.location, job.location); // 0..1
    const avail = availabilityFit(user.availability, job.job_type); // 0..1
    const trustCompany = job.company_id
      ? getTrustScoreForUser(job.company_id, "company")
      : 0.8;
    const behavior = getBehaviorScore(user.id, "job", job.id); // 0..1
    const fresh = nowBoost(job); // 0..1

    // weighted score (TikTok-ish)
    const finalScore =
      sim * 0.35 +
      loc * 0.20 +
      avail * 0.15 +
      trustCompany * 0.15 +
      behavior * 0.10 +
      fresh * 0.05;

    scored.push({
      job,
      breakdown: { sim, loc, avail, trustCompany, behavior, fresh },
      finalScore
    });
  }

  // mix exploration
  const mixed = explorationMix(scored, 0.15).slice(0, limit);

  // generate short “why” for top results (cap calls)
  const out = [];
  const topForWhy = mixed.slice(0, Math.min(8, mixed.length));

  for (const item of mixed) {
    let why = "Recommended based on fit.";
    if (topForWhy.includes(item)) {
      try {
        const ai = await whyRecommended({ user, job: item.job, score: Math.round(item.finalScore * 100) });
        why = ai.why;
      } catch {}
    }
    out.push({
      job: item.job,
      score: Math.round(item.finalScore * 100),
      why
    });
  }

  res.json({ user, feed: out });
});

// ---------- FEED: Company -> Candidates for a Job ----------
app.get("/feed/candidates", async (req, res) => {
  const jobId = Number(req.query.jobId);
  const limit = Math.min(30, Math.max(5, Number(req.query.limit || 20)));

  const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  const workers = db.prepare("SELECT * FROM users WHERE role='worker' ORDER BY id DESC LIMIT 200").all();

  const jobText = `title: ${job.title}\ndesc: ${job.description}\nrequired: ${job.required_skills}\nlocation: ${job.location}\ntype: ${job.job_type}`;
  const jobVec = await getOrCreateEmbedding("job", job.id, jobText);

  const scored = [];
  for (const w of workers) {
    const userText = `skills: ${w.skills}\nexperience: ${w.experience}\navailability: ${w.availability}\nlocation: ${w.location}`;
    const wVec = await getOrCreateEmbedding("user", w.id, userText);

    const sim = (cosine(wVec, jobVec) + 1) / 2;
    const loc = locationFit(w.location, job.location);
    const avail = availabilityFit(w.availability, job.job_type);
    const trustWorker = getTrustScoreForUser(w.id, "worker");
    const behavior = getBehaviorScore(w.id, "job", job.id); // worker’s past interaction with this job (if any)

    const finalScore =
      sim * 0.40 +
      loc * 0.20 +
      avail * 0.15 +
      trustWorker * 0.20 +
      behavior * 0.05;

    scored.push({ worker: w, finalScore });
  }

  scored.sort((a, b) => b.finalScore - a.finalScore);
  const top = scored.slice(0, limit).map(x => ({
    worker: x.worker,
    score: Math.round(x.finalScore * 100)
  }));

  res.json({ job, candidates: top });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API running on http://localhost:${port}`));