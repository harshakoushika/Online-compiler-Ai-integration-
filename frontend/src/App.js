import React, { useState } from "react";
import Editor from "@monaco-editor/react";
import "./App.css";

const DEFAULT_CODE = {
  python: `print("Hello from Python")`,

  node: `console.log("Hello from Node.js");`,

  c: `#include <stdio.h>

int main() {
    printf("Hello from C");
    return 0;
}`,

  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello from C++";
    return 0;
}`,

  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Java");
    }
}`
};

// Local:
// REACT_APP_API_URL=http://localhost:5001
//
// Production:
// REACT_APP_API_URL=https://your-backend.onrender.com

const API_URL =
  process.env.REACT_APP_API_URL || "http://localhost:5000";

function App() {
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState(DEFAULT_CODE.python);
  const [stdin, setStdin] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  const [explanation, setExplanation] = useState(null);
  const [explainLoading, setExplainLoading] = useState(false);

  const [darkMode, setDarkMode] = useState(false);

  const toggleTheme = () => {
    setDarkMode((prev) => !prev);
  };

  const getMonacoLanguage = (lang) => {
    switch (lang) {
      case "python":
        return "python";

      case "node":
        return "javascript";

      case "c":
        return "c";

      case "cpp":
        return "cpp";

      case "java":
        return "java";

      default:
        return "javascript";
    }
  };

  const runCode = async () => {
    if (!code.trim()) {
      setOutput("Please enter some code.");
      return;
    }

    setLoading(true);
    setOutput("Running...");

    try {
      const res = await fetch(`${API_URL}/api/compile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language,
          code,
          stdin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setOutput(
          data?.error
            ? `Error: ${data.error}`
            : `Request failed with status ${res.status}`
        );

        return;
      }

      if (data.success) {
        const result = [
          data.compileOutput || "",
          data.stdout || "",
          data.stderr || "",
        ]
          .filter(Boolean)
          .join("\n");

        setOutput(result || "Program executed successfully with no output.");
      } else if (data.compileError) {
        setOutput(`Compilation Error:\n${data.compileError}`);
      } else if (data.runError) {
        setOutput(`Runtime Error:\n${data.runError}`);
      } else {
        setOutput(JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.error("Compile request failed:", error);

      setOutput(
        `Unable to connect to the backend.\n\n${error.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  const explainCode = async () => {
    if (!code.trim()) {
      setExplanation("Please enter some code.");
      return;
    }

    setExplainLoading(true);
    setExplanation("Analyzing with AI...");

    try {
      const res = await fetch(`${API_URL}/api/explain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language,
          code,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setExplanation(
          data?.details?.error?.message ||
            data?.error ||
            `AI request failed with status ${res.status}`
        );

        return;
      }

      if (data.success) {
        setExplanation(data.explanation);
      } else {
        setExplanation(
          data.error || "Error generating explanation."
        );
      }
    } catch (error) {
      console.error("Explain request failed:", error);

      setExplanation(
        `Unable to connect to the AI backend.\n\n${error.message}`
      );
    } finally {
      setExplainLoading(false);
    }
  };

  const handleLanguageChange = (e) => {
    const lang = e.target.value;

    setLanguage(lang);
    setCode(DEFAULT_CODE[lang]);

    setOutput("");
    setExplanation(null);
  };

  return (
    <div
      className={
        darkMode
          ? "compiler-container dark"
          : "compiler-container"
      }
    >
      <button
        className="theme-toggle"
        onClick={toggleTheme}
      >
        {darkMode
          ? "Light Mode ☀️"
          : "Dark Mode 🌙"}
      </button>

      <h2>SmartCompiler</h2>

      <div className="section">
        <label>Language:</label>

        <select
          value={language}
          onChange={handleLanguageChange}
        >
          <option value="python">
            Python
          </option>

          <option value="node">
            Node.js
          </option>

          <option value="c">
            C
          </option>

          <option value="cpp">
            C++
          </option>

          <option value="java">
            Java
          </option>
        </select>
      </div>

      <Editor
        height="400px"
        language={getMonacoLanguage(language)}
        value={code}
        onChange={(value) =>
          setCode(value || "")
        }
        theme={
          darkMode
            ? "vs-dark"
            : "light"
        }
        options={{
          fontSize: 14,
          minimap: {
            enabled: false,
          },
          automaticLayout: true,
          scrollBeyondLastLine: false,
          wordWrap: "on",
        }}
      />

      <div className="section">
        <label>stdin (optional)</label>

        <textarea
          value={stdin}
          onChange={(e) =>
            setStdin(e.target.value)
          }
          placeholder="Enter program input here..."
          rows={4}
        />
      </div>

      <div className="button-group">
        <button
          onClick={runCode}
          disabled={
            loading ||
            explainLoading
          }
        >
          {loading
            ? "Running..."
            : "Run"}
        </button>

        <button
          onClick={explainCode}
          disabled={
            explainLoading ||
            loading
          }
        >
          {explainLoading
            ? "Explaining..."
            : "Explain Code 🤖"}
        </button>
      </div>

      <h3>Output</h3>

      <pre className="output-box">
        {output || "No output yet."}
      </pre>

      <h3>AI Explanation</h3>

      {typeof explanation === "string" ? (
        <pre className="explanation-box">
          {explanation}
        </pre>
      ) : explanation?.summary ? (
        <div className="explanation-box">
          <h4>Summary</h4>

          <p>
            {explanation.summary}
          </p>

          <h4>Line By Line</h4>

          {Array.isArray(
            explanation.lineByLine
          ) ? (
            explanation.lineByLine.map(
              (item, index) => (
                <div
                  key={
                    item.line || index
                  }
                  className="line-explanation"
                >
                  <strong>
                    Line {item.line}
                  </strong>

                  {item.code && (
                    <pre>
                      {item.code}
                    </pre>
                  )}

                  <div>
                    {item.explanation}
                  </div>
                </div>
              )
            )
          ) : (
            <pre>
              {
                explanation.lineByLine
              }
            </pre>
          )}

          <h4>
            Time Complexity
          </h4>

          <p>
            {
              explanation.timeComplexity
            }
          </p>

          <h4>
            Space Complexity
          </h4>

          <p>
            {
              explanation.spaceComplexity
            }
          </p>

          <h4>Dry Run</h4>

          {typeof explanation.dryRun ===
          "object" ? (
            <pre>
              {JSON.stringify(
                explanation.dryRun,
                null,
                2
              )}
            </pre>
          ) : (
            <pre>
              {
                explanation.dryRun
              }
            </pre>
          )}
        </div>
      ) : explanation ? (
        <pre className="explanation-box">
          {JSON.stringify(
            explanation,
            null,
            2
          )}
        </pre>
      ) : (
        <pre className="explanation-box">
          No explanation yet.
        </pre>
      )}
    </div>
  );
}

export default App;
