import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Initialize Gemini SDK lazily to prevent crashing if key is missing during initialization
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// API routes go here FIRST
app.get("/decodemap.webp", (req, res) => {
  res.sendFile(path.join(process.cwd(), "decodemap.webp"));
});

// 1. Proxy API for FTC Scout GraphQL to bypass CORS
app.post("/api/ftc-scout", async (req, res) => {
  try {
    const { query, variables } = req.body;
    
    const response = await fetch("https://api.ftcscout.org/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: "FTC Scout API error",
        details: errorText,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    console.error("Error proxying FTC Scout API:", error);
    return res.status(500).json({
      error: "Failed to connect to FTC Scout API",
      message: error.message,
    });
  }
});

// 2. Gemini Alliance Selection Advisor Endpoint
app.post("/api/alliance-recommend", async (req, res) => {
  try {
    const { teamData, strategyPreference, eventName } = req.body;

    if (!teamData || !Array.isArray(teamData) || teamData.length === 0) {
      return res.status(400).json({
        error: "Invalid request data",
        message: "teamData must be a non-empty array of team statistics.",
      });
    }

    const ai = getGeminiClient();

    const systemPrompt = `You are an elite FIRST Tech Challenge (FTC) Strategy Analyst and Alliance Selection Expert.
Your goal is to analyze scouting team statistics from an FTC competition and recommend the best alliance combinations.
Be precise, realistic, and insightful. Analyze the strengths, weaknesses, and synergy of teams.
Do not make up fake metrics; rely strictly on the provided scouting averages, consistency ratings, and comments.`;

    const prompt = `
Event Name: ${eventName || "Local Scouting Event"}
Strategy Preference: ${strategyPreference || "Balanced (high scoring and consistent auto)"}

Scouted Team Statistics:
${JSON.stringify(teamData, null, 2)}

Based on the team statistics, please provide:
1. **Alliance Pick Recommendations**:
   - **First Pick Options**: Recommend the best 3 teams for the first pick of our alliance, detailing why they fit the strategy preference.
   - **Second Pick / Backup Options**: Recommend the best 3 teams for the second/backup alliance slot, emphasizing roles like reliable defense, parking, endgame climbing, or consistent autonomous scoring.
2. **Top Synergistic Pairings**: Suggest 2-3 specific alliance combos of teams and explain how they complement each other's autonomous runs and driver skill.
3. **Event Strategy Summary**: Provide tactical advice on what score threshold/auto route is needed to win the alliance eliminations at this event.

Format the output strictly as markdown. Keep it engaging, direct, and incredibly valuable for drive coaches. Use clear bold headings, bullet points, and clean lists. Avoid any meta-talk about yourself.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { text: systemPrompt },
        { text: prompt },
      ],
    });

    const recommendationMarkdown = response.text || "No recommendation generated.";
    return res.json({ recommendation: recommendationMarkdown });

  } catch (error: any) {
    console.error("Error generating alliance recommendations:", error);
    const hasKey = !!process.env.GEMINI_API_KEY;
    return res.status(500).json({
      error: "AI Generation failed",
      message: error.message,
      isApiKeyConfigured: hasKey,
    });
  }
});

// Serve frontend build or mount Vite dev server
async function setupServer() {
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
    console.log(`[FTC Scout Server] Running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

setupServer();
