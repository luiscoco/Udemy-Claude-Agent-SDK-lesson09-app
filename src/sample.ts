import { DEFAULT_CONFIG, runAgent, validateConfig } from "./agent.js";
try {
 const config = validateConfig({ ...DEFAULT_CONFIG, scenario: process.argv[2] || "summary", maxTurns: Number(process.argv[3] || 8) });
 await runAgent(config, event => { console.log(JSON.stringify(event)); if (event.type === "result" && event.status !== "success") process.exitCode = 1; });
} catch { console.error("The SDK experiment could not finish. Check configuration and the setup guide."); process.exitCode = 1; }
