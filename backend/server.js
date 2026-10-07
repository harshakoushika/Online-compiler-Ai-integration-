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

const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const GROQ_MODEL =
  "openai/gpt-oss-120b";

if (!GROQ_API_KEY) {
  console.error(
    "❌ GROQ_API_KEY is not set. Add it in Render Environment Variables or backend/.env"
  );
  process.exit(1);
}

const app = express();

/* =====================================================
   CORS
===================================================== */

const allowedOrigins = [
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow tools like Postman/curl and same-origin requests
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS blocked for origin: ${origin}`)
      );
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(bodyParser.json({ limit: "1mb" }));

/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "SmartCompiler API is running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "SmartCompiler Backend",
    status: "healthy",
  });
});

/* =====================================================
   LANGUAGE CONFIGURATION
===================================================== */

const LANGUAGE_CONFIG = {
  c: {
    filename: "main.c",
    compileCmd: "gcc main.c -o main",
    runCmd: "./main",
  },

  cpp: {
    filename: "main.cpp",
    compileCmd: "g++ main.cpp -o main",
    runCmd: "./main",
  },

  python: {
    filename: "main.py",
    compileCmd: null,
    runCmd: "python3 main.py",
  },

  java: {
    filename: "Main.java",
    compileCmd: "javac Main.java",
    runCmd: "java Main",
  },

  node: {
    filename: "main.js",
    compileCmd: null,
    runCmd: "node main.js",
  },
};

/* =====================================================
   CODE COMPILATION / EXECUTION
===================================================== */

app.post("/api/compile", async (req, res) => {
  let tempDir = null;

  try {
    const { language, code, stdin } = req.body;

    if (!language || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({
        success: false,
        error: "Language and code required",
      });
    }

    if (code.length > 10000) {
      return res.status(400).json({
        success: false,
        error: "Code too large (max 10000 characters)",
      });
    }

    const config = LANGUAGE_CONFIG[language];

    if (!config) {
      return res.status(400).json({
        success: false,
        error: "Unsupported language",
      });
    }

    const temp = await makeTempDir();
    tempDir = temp.dir;

    const filePath = path.join(
      tempDir,
      config.filename
    );

    await fs.writeFile(
      filePath,
      code,
      "utf8"
    );

    let compileOutput = "";

    /* -------------------------------
       COMPILE
    -------------------------------- */

    if (config.compileCmd) {
      try {
        const { stdout, stderr } =
          await execp(
            config.compileCmd,
            {
              cwd: tempDir,
              timeout: 10000,
              maxBuffer: 1024 * 1024,
            }
          );

        compileOutput =
          (stdout || "") +
          (stderr || "");

      } catch (error) {
        return res.json({
          success: false,
          compileError:
            (error.stdout || "") +
            (error.stderr || "") +
            (error.message || ""),
        });
      }
    }

    /* -------------------------------
       EXECUTE
    -------------------------------- */

    try {
      let runCmd = config.runCmd;

      /*
        Temporary stdin implementation.

        This keeps your existing architecture working.
        For a public compiler, child_process.spawn()
        should eventually be used instead of putting
        stdin into a shell command.
      */

      if (
        typeof stdin === "string" &&
        stdin.length > 0
      ) {
        const safeStdin = stdin
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\$/g, "\\$")
          .replace(/`/g, "\\`");

        runCmd =
          `printf "%s" "${safeStdin}" | ${config.runCmd}`;
      }

      const { stdout, stderr } =
        await execp(
          runCmd,
          {
            cwd: tempDir,
            timeout: 5000,
            maxBuffer: 1024 * 1024,
          }
        );

      return res.json({
        success: true,
        compileOutput,
        stdout: stdout || "",
        stderr: stderr || "",
      });

    } catch (error) {
      return res.json({
        success: false,
        runError:
          (error.stdout || "") +
          (error.stderr || "") +
          (error.message || ""),
      });
    }

  } catch (error) {
    console.error(
      "Compile API Error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });

  } finally {
    /*
      Remove temporary directory
      after execution completes.
    */

    if (tempDir) {
      try {
        await fs.rm(
          tempDir,
          {
            recursive: true,
            force: true,
          }
        );
      } catch (cleanupError) {
        console.error(
          "Temp cleanup failed:",
          cleanupError.message
        );
      }
    }
  }
});

/* =====================================================
   AI CODE EXPLANATION
===================================================== */

app.post("/api/explain", async (req, res) => {
  try {
    const {
      language,
      code,
    } = req.body;

    if (
      !language ||
      typeof code !== "string" ||
      !code.trim()
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Language and code required",
      });
    }

    if (code.length > 5000) {
      return res.status(400).json({
        success: false,
        error:
          "Code too large (max 5000 characters)",
      });
    }

    if (!LANGUAGE_CONFIG[language]) {
      return res.status(400).json({
        success: false,
        error:
          "Unsupported language",
      });
    }

    const prompt = `
You are a beginner-friendly programming tutor.

Analyze the following ${language} code.

Return output STRICTLY as valid JSON.

Do not include markdown.
Do not include code fences.
Do not include any text outside the JSON object.

Return exactly this structure:

{
  "summary": "A short 1-2 sentence overview of what the entire program does.",
  "lineByLine": [
    {
      "line": 1,
      "code": "actual code from line 1",
      "explanation": "what this line does in simple English"
    }
  ],
  "timeComplexity": "Big-O notation with a simple explanation.",
  "spaceComplexity": "Big-O notation with a simple explanation.",
  "dryRun": {
    "input": "example input values",
    "steps": [
      "step 1",
      "step 2"
    ],
    "output": "final output"
  }
}

IMPORTANT RULES:

- lineByLine must contain one object for every non-empty line of code.
- Number lines using their actual source-code line numbers.
- Skip blank lines.
- Use beginner-friendly English.
- Do not invent functionality that is not present in the code.
- Return only JSON.

Code:

${code}
`;

    const response =
      await axios.post(
        GROQ_API_URL,
        {
          model: GROQ_MODEL,

          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],

          temperature: 0.3,

          response_format: {
            type: "json_object",
          },
        },
        {
          headers: {
            Authorization:
              `Bearer ${GROQ_API_KEY}`,

            "Content-Type":
              "application/json",
          },

          timeout: 30000,
        }
      );

    const text =
      response.data?.choices?.[0]
        ?.message?.content;

    if (!text) {
      return res.status(502).json({
        success: false,
        error:
          "AI returned an empty response",
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(
        text
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim()
      );

    } catch (error) {
      console.error(
        "AI JSON parse failed:",
        text
      );

      return res.status(502).json({
        success: false,
        error:
          "Could not parse AI response",
        raw: text,
      });
    }

    return res.json({
      success: true,
      explanation: parsed,
    });

  } catch (error) {
    console.error(
      "Groq API Error:",
      error.response?.data ||
        error.message
    );

    const status =
      error.response?.status || 500;

    return res
      .status(status)
      .json({
        success: false,
        error:
          "AI explanation failed",
        details:
          error.response?.data ||
          error.message,
      });
  }
});

/* =====================================================
   GLOBAL ERROR HANDLER
===================================================== */

app.use((error, req, res, next) => {
  console.error(
    "Unhandled Server Error:",
    error.message
  );

  res.status(500).json({
    success: false,
    error:
      "Unexpected server error",
  });
});

/* =====================================================
   START SERVER
===================================================== */

const PORT =
  process.env.PORT || 5000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `✅ SmartCompiler backend running on port ${PORT}`
    );
  }
);
