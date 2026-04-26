import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import multer from "multer";
import { createRequire } from "module";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    console.error("WARNING: GEMINI_API_KEY is not set in environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const MODEL_NAME = "gemini-1.5-flash"; // Switched back to 1.5-flash for better stability/quota in some regions

  const firstNames = ["James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda", "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Matthew", "Lisa", "Anthony", "Betty"];
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez"];
  const titles = ["Senior Frontend Developer", "Backend Engineer", "Full Stack Developer", "AI/ML Specialist", "DevOps Engineer", "Product Designer", "Data Scientist", "iOS Developer", "Android Developer", "Site Reliability Engineer", "Cloud Architect", "Security Engineer", "Data Engineer", "Frontend Specialist"];
  const skills = [
    ["React", "TypeScript", "Tailwind", "Next.js", "Redux", "Storybook", "Jest"],
    ["Node.js", "Express", "PostgreSQL", "Redis", "Docker", "TypeORM", "Swagger"],
    ["Python", "Django", "FastAPI", "MongoDB", "Kubernetes", "Pytest", "gRPC"],
    ["AWS", "Azure", "Terraform", "CI/CD", "Prometheus", "Grafana", "Ansible"],
    ["Figma", "UI/UX", "Adobe XD", "Prototyping", "Design Systems", "User Research"],
    ["PyTorch", "TensorFlow", "Scikit-learn", "NLP", "Computer Vision", "HuggingFace"],
    ["Swift", "SwiftUI", "Objective-C", "CoreData", "Combine", "Unit Testing"],
    ["Kotlin", "Java", "Jetpack Compose", "Coroutines", "Dagger Hilt", "Retrofit"]
  ];

  const CANDIDATE_DB = Array.from({ length: 151 }, (_, i) => {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const title = titles[Math.floor(Math.random() * titles.length)];
    const skillSet = skills[Math.floor(Math.random() * skills.length)];
    
    return {
      id: (i + 1).toString(),
      name: `${firstName} ${lastName}`,
      title,
      experience: Math.floor(Math.random() * 12) + 2,
      raw_skills: skillSet.join(", "),
    };
  });

  app.post("/api/match", async (req, res) => {
    const { jd_text } = req.body;
    if (!jd_text) return res.status(400).json({ error: "JD text is required" });

    // Using a smaller subset to stay within token limits for the free tier
    const subset = CANDIDATE_DB.slice(0, 40);

    const prompt = `
      Analyze this Job Description: "${jd_text}"
      
      Task 1: Generate 3-4 category tags for this JD.
      Task 2: Select the top 12 most relevant candidates from this list (provide explainability for each): ${JSON.stringify(subset)}
      
      Respond strictly in JSON format:
      {
          "jd_tags": ["Tag1", "Tag2"],
          "candidates": [
              {
                  "id": "1",
                  "name": "Candidate Name",
                  "title": "Title",
                  "experience": 5,
                  "matchScore": 85,
                  "explainability": "Detailed summary.",
                  "interestScore": null,
                  "status": "Lead",
                  "insights": {
                    "pros": ["Strong backend", "Mentorship exp"],
                    "cons": ["Limited frontend", "Salary expectations high"],
                    "cultureFit": "High (Values collaboration)"
                  },
                  "skill_radar": {
                      "Technical": 90,
                      "System Design": 80,
                      "Communication": 85,
                      "Leadership": 60,
                      "Problem Solving": 95
                  }
              }
          ]
      }
    `;

    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
      const text = response.text.replace(/```json|```/gi, "").trim();
      const data = JSON.parse(text);
      res.json(data);
    } catch (error) {
      console.error("Match error:", error);
      res.status(500).json({ error: "Failed to analyze candidates" });
    }
  });

  app.post("/api/draft", async (req: any, res) => {
    const { candidate, jd_text } = req.body;
    
    const prompt = `
      You are ScoutAI. Write a SHORT, personalized LinkedIn outreach message for ${candidate.name}.
      They are a ${candidate.title}.
      The Job context is: ${jd_text}.
      
      Make it warm, professional, and slightly conversational. 
      Respond ONLY with the message text.
    `;

    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
      res.json({ draft: response.text });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat", upload.single('file'), async (req: any, res) => {
    const { candidate_id, history } = req.body;
    const file = req.file;
    const parsedHistory = JSON.parse(history);
    
    const candidate = CANDIDATE_DB.find(c => c.id === candidate_id) || CANDIDATE_DB[0];
    
    let fileContent = "";
    if (file && file.mimetype === "application/pdf") {
      try {
        const data = await pdf(file.buffer);
        fileContent = data.text;
      } catch (err) {
        console.error("PDF Parse error", err);
      }
    }

    const formattedHistory = parsedHistory.map((h: any) => `${h.role}: ${h.content}`).join("\n");

    const prompt = `
      You are simulating the PERSON: ${candidate.name}, a ${candidate.title} with skills in ${candidate.raw_skills}.
      You are being interviewed/contacted by a Recruiter for a new opportunity.
      
      Your goal is to be professional, interested but discerning. 
      Respond to the Recruiter's latest message based on your profile and the history.
      
      ${fileContent ? `Context: You just shared a document (like a portfolio or updated CV). Its content is: ${fileContent.slice(0, 5000)}` : ""}

      Chat History:
      ${formattedHistory}
      
      Respond strictly in JSON format:
      {
          "reply": "Your message as the candidate.",
          "interestScore": 85
      }
      (The interestScore should represent the candidate's interest level from 10 to 100).
    `;

    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
      const text = response.text.replace(/```json|```/gi, "").trim();
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Failed to generate chat response" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
