import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import multer from "multer";
import { createRequire } from "module";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
const upload = multer({ storage: multer.memoryStorage() });

const DB_PATH = path.join(process.cwd(), "database.json");

const readDB = () => JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
const writeDB = (data: any) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

async function callGemini(prompt: string, apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Gemini Error: ${data.error?.message || response.statusText}`);
  if (!data.candidates) throw new Error("No response generated.");
  return data.candidates[0].content.parts[0].text.replace(/```json|```/gi, "").trim();
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(cors());
  app.use(express.json());

  const apiKey = process.env.GEMINI_API_KEY || "";

  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find((u: any) => u.username === username && u.password === password);
    
    if (user) {
      res.json({ success: true, role: user.role, candidateId: user.candidateId });
    } else {
      res.status(401).json({ success: false, error: "Invalid credentials" });
    }
  });

  app.get("/api/candidate/:id", (req, res) => {
    const db = readDB();
    const candidate = db.candidates.find((c: any) => c.id === req.params.id);
    if (candidate) res.json(candidate);
    else res.status(404).json({ error: "Not found" });
  });

  app.post("/api/apply", (req, res) => {
    const newCandidate = req.body;
    const db = readDB();
    
    const newId = (db.candidates.length + 1).toString();
    const candidateEntry = {
      ...newCandidate,
      id: newId,
      status: "Applied",
      personality: "Eager, polite, and hopeful about the opportunity.", 
    };

    db.candidates.push(candidateEntry);

    const username = newCandidate.name.split(' ')[0].toLowerCase() + newId;
    db.users.push({
      username: username,
      password: "password123",
      role: "candidate",
      candidateId: newId
    });

    writeDB(db);
    res.json({ success: true, candidateId: newId, username, password: "password123" });
  });

  app.post("/api/candidate/rate", (req, res) => {
    const { candidate_id, score } = req.body;
    const db = readDB();
    const idx = db.candidates.findIndex((c: any) => c.id === candidate_id);
    if(idx !== -1) {
      db.candidates[idx].interestScore = score;
      writeDB(db);
      res.json({ success: true, score });
    } else {
      res.status(404).json({ error: "Candidate not found" });
    }
  });

  app.post("/api/match", async (req, res) => {
    const { jd_text, priority = "Balanced" } = req.body;
    const db = readDB();
    const subset = db.candidates;

    const prompt = `
      Analyze this Job Description: "${jd_text}"
      Priority Weighting: Focus heavily on ${priority}.
      
      Task 1: Generate 3 category tags.
      Task 2: Select the top candidates from this list (provide explainability): ${JSON.stringify(subset)}
      
      Respond strictly in JSON format:
      {
          "jd_tags": ["Tag1", "Tag2"],
          "candidates": [
              { "id": "1", "name": "Name", "title": "Title", "experience": 5, "matchScore": 85, "explainability": "Summary", "interestScore": null, "skill_radar": { "Technical": 90, "System Design": 80, "Communication": 85, "Leadership": 60, "Problem Solving": 95 } }
          ]
      }
    `;

    try {
      const cleanJsonText = await callGemini(prompt, apiKey);
      res.json(JSON.parse(cleanJsonText));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat", upload.single('file'), async (req: any, res) => {
    const { candidate_id, history, isCandidateRole } = req.body;
    const file = req.file;
    const db = readDB();
    const candidate = db.candidates.find((c: any) => c.id === candidate_id);
    
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });

    let fileContent = "";
    if (file && file.mimetype === "application/pdf") {
      try {
        const data = await pdf(file.buffer);
        fileContent = data.text;
      } catch (err) {
        console.error("PDF Parse error", err);
      }
    }

    const parsedHistory = JSON.parse(history);
    const formattedHistory = parsedHistory.map((h: any) => `${h.role}: ${h.content}`).join("\n");

    let prompt = "";
    if (isCandidateRole === "true") {
      prompt = `
        You are simulating an AI Recruiter at ScoutAI. 
        You are chatting with a candidate named ${candidate.name} (${candidate.title}).
        Your goal is to be helpful, answer their questions about their application status (${candidate.status}), and keep them engaged.
        ${fileContent ? `Context: You just shared a document. Its content is: ${fileContent.slice(0, 3000)}` : ""}
        
        Chat History:
        ${formattedHistory}
        
        Respond strictly in JSON format:
        { "reply": "Your message as the recruiter." }
      `;
    } else {
      prompt = `
        You are simulating the PERSON: ${candidate.name}, a ${candidate.title}.
        PERSONALITY TRAITS: ${candidate.personality}
        Your profile: ${candidate.experience} years exp, Notice: ${candidate.noticePeriod}, Location: ${candidate.location}.
        ${candidate.resumeText ? `Here is your full Resume text to draw context from: """${candidate.resumeText}"""` : ""}
        ${fileContent ? `Context: You just shared a document. Its content is: ${fileContent.slice(0, 3000)}` : ""}
        
        You are being contacted by a Recruiter. Respond based on your personality and history. Do not initiate unless asked.
        
        Chat History:
        ${formattedHistory}
        
        Respond strictly in JSON format:
        { "reply": "Your message as the candidate.", "interestScore": 85 }
      `;
    }

    try {
      const cleanJsonText = await callGemini(prompt, apiKey);
      res.json(JSON.parse(cleanJsonText));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();