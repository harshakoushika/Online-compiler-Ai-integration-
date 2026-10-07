const axios = require("axios");
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs").promises;
const path = require("path");
const util = require("util");
const execp = util.promisify(require("child_process").exec);
const { makeTempDir } = require("./utils");
const cors = require("cors");

require("dotenv").config();


const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "openai/gpt-oss-120b";

if (!GROQ_API_KEY) {
  console.error("  GROQ_API_KEY is not set. Create a .env file with GROQ_API_KEY=your_key");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));

const LANGUAGE_CONFIG = {
  c: {
    filename: "main.c",
    image: "gcc:latest",
    compileCmd: "gcc main.c -o main",
    runCmd: "./main",
  },
  cpp: {
    filename: "main.cpp",
    image: "gcc:latest",
    compileCmd: "g++ main.cpp -o main",
    runCmd: "./main",
  },
  python: {
    filename: "main.py",
    image: "python:3.11-slim",
    compileCmd: null,
    runCmd: "python3 main.py",
  },
  java: {
    filename: "Main.java",
    image: "eclipse-temurin:17-jdk",
    compileCmd: "javac Main.java",
    runCmd: "java Main",
  },
  node: {
    filename: "main.js",
    image: "node:18-slim",
    compileCmd: null,
    runCmd: "node main.js",
  },
};


app.post("/api/compile", async (req, res) => {
  try {
    const { language, code, stdin } = req.body;

    if (!language || !code) {
      return res.status(400).json({ error: "Language and code required" });
    }

    const config = LANGUAGE_CONFIG[language];
    if (!config) {
      return res.status(400).json({ error: "Unsupported language" });
    }

    const { dir } = await makeTempDir();
    const filePath = path.join(dir, config.filename);

    await fs.writeFile(filePath, code);

    const containerPath = "/work";
    const baseDocker = `docker run --rm -v "${dir}:${containerPath}" -w ${containerPath} ${config.image}`;

    let compileOutput = "";

    if (config.compileCmd) {
      try {
        const { stdout, stderr } = await execp(
          `${baseDocker} /bin/sh -c "${config.compileCmd}"`
        );
        compileOutput = stdout + stderr;
      } catch (err) {
        return res.json({
          success: false,
          compileError: (err.stdout || "") + (err.stderr || "") + err.message,
        });
      }
    }

    try {
      let runCmd = `${baseDocker} /bin/sh -c "${config.runCmd}"`;

      if (stdin && stdin.trim() !== "") {
        const safeStdin = stdin.replace(/"/g, '\\"');
        runCmd = `${baseDocker} /bin/sh -c "printf \\"${safeStdin}\\" | ${config.runCmd}"`;
      }

      const { stdout, stderr } = await execp(runCmd, {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      });

      res.json({ success: true, compileOutput, stdout, stderr });
    } catch (err) {
      res.json({
        success: false,
        runError: (err.stdout || "") + (err.stderr || "") + err.message,
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.post("/api/explain", async (req, res) => {
  try {
    const { language, code } = req.body;

    if (!language || !code) {
      return res.status(400).json({ error: "Language and code required" });
    }

    if (code.length > 5000) {
      return res.status(400).json({ error: "Code too large (max 5000 characters)" });
    }

    const prompt = `
You are a beginner-friendly programming tutor.

Analyze the following ${language} code.

Return output STRICTLY in valid JSON format with NO extra text:

{
  "summary": "A short 1-2 sentence overview of what the entire program does.",
  "lineByLine": [
    { "line": 1, "code": "actual code from line 1", "explanation": "what this line does in simple English" },
    { "line": 2, "code": "actual code from line 2", "explanation": "what this line does in simple English" }
  ],
  "timeComplexity": "Big-O notation with a simple reason why.",
  "spaceComplexity": "Big-O notation with a simple reason why.",
  "dryRun": {
    "input": "example input values",
    "steps": ["step 1", "step 2"],
    "output": "final output"
  }
}

IMPORTANT RULES:
- "lineByLine" MUST contain one object for EVERY single line of code. Do NOT leave it empty.
- Number lines starting from 1.
- Skip blank lines but include all code lines.
- Use very simple English a beginner can understand.
- No markdown, no code blocks, no text outside the JSON object.

Code to analyze:
\`\`\`${language}
${code}
\`\`\`
`;

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    let text = response.data.choices[0].message.content;

    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.log("JSON parse failed. Sending raw.");
      parsed = {
        summary: "Could not parse AI response properly.",
        raw: text,
      };
    }

    res.json({ success: true, explanation: parsed });

  } catch (error) {
    console.error("Groq API Error:", error.response?.data || error.message);
    res.status(500).json({
      error: "AI explanation failed",
      details: error.response?.data || error.message,
    });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅  SmartCompiler backend running on port ${PORT}`);
});