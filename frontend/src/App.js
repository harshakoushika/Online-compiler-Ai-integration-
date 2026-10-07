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

function App() {
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState(DEFAULT_CODE["python"]);
  const [stdin, setStdin] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const toggleTheme = () => setDarkMode(prev => !prev);

  const getMonacoLanguage = (lang) => {
    switch (lang) {
      case "python": return "python";
      case "node": return "javascript";
      case "c": return "c";
      case "cpp": return "cpp";
      case "java": return "java";
      default: return "javascript";
    }
  };

  const runCode = async () => {
    setLoading(true);
    setOutput("Running...");

    try {
      const res = await fetch("http://localhost:5000/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code, stdin })
      });

      const data = await res.json();

      if (data.success) {
        setOutput(
          (data.compileOutput || "") +
          "\n" +
          (data.stdout || "") +
          (data.stderr || "")
        );
      } else {
        setOutput(JSON.stringify(data, null, 2));
      }
    } catch (error) {
      setOutput("Error: " + error.message);
    }

    setLoading(false);
  };

  const explainCode = async () => {
    setExplainLoading(true);
    setExplanation("Analyzing with AI...");

    try {
      const res = await fetch("http://localhost:5000/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code })
      });

      const data = await res.json();

      if (data.success) {
        setExplanation(data.explanation);
      } else {
        setExplanation("Error generating explanation.");
      }
    } catch (error) {
      setExplanation("Error: " + error.message);
    }

    setExplainLoading(false);
  };

  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    setLanguage(lang);
    setCode(DEFAULT_CODE[lang]);
  };

  return (
    <div className={darkMode ? "compiler-container dark" : "compiler-container"}>

      <button className="theme-toggle" onClick={toggleTheme}>
        {darkMode ? "Light Mode ☀️" : "Dark Mode 🌙"}
      </button>

      <h2>SmartCompiler</h2>

      <div className="section">
        <label>Language:</label>
        <select value={language} onChange={handleLanguageChange}>
          <option value="python">Python</option>
          <option value="node">Node.js</option>
          <option value="c">C</option>
          <option value="cpp">C++</option>
          <option value="java">Java</option>
        </select>
      </div>

      <Editor
        height="400px"
        language={getMonacoLanguage(language)}
        value={code}
        onChange={(value) => setCode(value || "")}
        theme={darkMode ? "vs-dark" : "light"}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          automaticLayout: true,
        }}
      />

      <div className="section">
        <label>stdin (optional)</label>
        <input
          value={stdin}
          onChange={e => setStdin(e.target.value)}
        />
      </div>

      <div className="button-group">
        <button onClick={runCode} disabled={loading}>
          {loading ? "Running..." : "Run"}
        </button>

        <button onClick={explainCode} disabled={explainLoading}>
          {explainLoading ? "Explaining..." : "Explain Code 🤖"}
        </button>
      </div>

      <h3>Output</h3>
      <pre>{output}</pre>

      <h3>AI Explanation</h3>

      {/* STRING RESPONSE */}
      {typeof explanation === "string" ? (
        <pre className="explanation-box">{explanation}</pre>
      ) : explanation?.summary ? (
        <div className="explanation-box">

          <h4>Summary</h4>
          <p>{explanation.summary}</p>

          <h4>Line By Line</h4>
          {Array.isArray(explanation.lineByLine) ? (
            explanation.lineByLine.map((item, index) => (
              <div key={index} style={{ marginBottom: "8px" }}>
                <strong>{item.line}</strong>
                <div>{item.explanation}</div>
              </div>
            ))
          ) : (
            <pre>{explanation.lineByLine}</pre>
          )}

          <h4>Time Complexity</h4>
          <p>{explanation.timeComplexity}</p>

          <h4>Space Complexity</h4>
          <p>{explanation.spaceComplexity}</p>

          <h4>Dry Run</h4>
          {typeof explanation.dryRun === "object" ? (
            <pre>{JSON.stringify(explanation.dryRun, null, 2)}</pre>
          ) : (
            <pre>{explanation.dryRun}</pre>
          )}

        </div>
      ) : explanation ? (
        <pre className="explanation-box">
          {JSON.stringify(explanation, null, 2)}
        </pre>
      ) : (
        <pre className="explanation-box">No explanation yet.</pre>
      )}

    </div>
  );
}

export default App;
