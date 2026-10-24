import { renderMarkdown } from "./markdown.js";
const el = (id) => document.getElementById(id);
const field = (id) => el(id);
const select = (id) => el(id);
let ready = false, busy = false, answer = "";
const observed = [];
function text(id, value) { el(id).textContent = String(value ?? "—"); }
function json(id, value) { el(id).textContent = JSON.stringify(value, null, 2); Prism.highlightElement(el(id)); }
function config() { return { scenario: select("scenario").value, maxTurns: Number(field("max-turns").value), maxBudgetUsd: Number(field("budget").value), effort: select("effort").value }; }
function controls() {
    el("run").disabled = busy || !ready;
    for (const id of ["scenario", "max-turns", "budget", "effort"])
        el(id).disabled = busy;
}
function showFiles(value, stage) {
    renderMarkdown(el("notes"), value.notes);
    text(`status-${stage}`, value.status);
    json("settings", JSON.parse(value.projectSettings));
}
function log(label, detail) {
    const item = document.createElement("li"), strong = document.createElement("strong"), span = document.createElement("span");
    strong.textContent = label;
    span.textContent = detail;
    item.append(strong, span);
    el("events").append(item);
}
function consume(event) {
    observed.push(event);
    if (event.type === "options") {
        json("options", event.options);
        json("settings", event.fileSettings);
        json("environment", event.environment);
    }
    else if (event.type === "workspace") {
        showFiles(event.files, event.stage);
        if (event.stage === "after")
            text("file-changed", event.changed ? "Changed on disk" : "Unchanged on disk");
    }
    else if (event.type === "initialized") {
        json("init", event);
        text("available-tools", event.tools.join(", "));
        text("edit-available", event.tools.includes("Edit") ? "Yes" : "No");
    }
    else if (event.type === "message")
        log(event.sdkType, event.summary);
    else if (event.type === "tool")
        log(`Tool request · ${event.name}`, event.target);
    else if (event.type === "approval") {
        log(`canUseTool · ${event.decision}`, `${event.name}: ${event.reason}`);
        const item = document.createElement("li");
        item.textContent = `${event.name} → ${event.decision}. ${event.reason}`;
        el("approvals").append(item);
    }
    else if (event.type === "answer") {
        answer += (answer ? "\n\n" : "") + event.text;
        renderMarkdown(el("answer"), answer);
    }
    else if (event.type === "result") {
        text("status", event.status);
        text("turns", event.turns);
        text("cost", `$${event.costUsd.toFixed(5)}`);
        text("session", event.sessionId);
        if (!answer && event.text)
            renderMarkdown(el("answer"), event.text);
        const row = document.createElement("tr");
        for (const value of [config().scenario, String(config().maxTurns), event.status, event.sessionId]) {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
        }
        el("history").append(row);
    }
    else {
        text("notice", event.text);
        if (event.type === "error")
            text("status", "Run could not finish");
    }
}
async function run() {
    busy = true;
    controls();
    answer = "";
    renderMarkdown(el("answer"), "");
    el("events").replaceChildren();
    el("approvals").replaceChildren();
    text("notice", "");
    text("status", "Running…");
    text("edit-available", "Waiting for init");
    text("file-changed", "Waiting for after-run evidence");
    text("status-after", "Waiting for run");
    try {
        const response = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config()) });
        if (!response.ok || !response.body)
            throw new Error(await response.text());
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let pending = "";
        while (true) {
            const { value, done } = await reader.read();
            pending += decoder.decode(value, { stream: !done });
            const lines = pending.split("\n");
            pending = lines.pop();
            for (const line of lines)
                if (line.trim())
                    consume(JSON.parse(line));
            if (done) {
                if (pending.trim())
                    consume(JSON.parse(pending));
                break;
            }
        }
    }
    catch (error) {
        text("status", "Run could not finish");
        text("notice", error instanceof Error ? error.message : "Check the setup guide.");
    }
    finally {
        busy = false;
        controls();
    }
}
el("run").onclick = () => void run();
el("download").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ source: "Actual SDK observations and on-disk file reads", events: observed }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "lesson09-observations.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
try {
    const server = await (await fetch("/api/config")).json();
    ready = server.ready;
    text("model", server.model);
    text("configuration", ready ? "Server key configured · private classroom files only" : "Configure your key in .env and restart. See How to run.");
    function prompt() { text("prompt", server.prompts[select("scenario").value]); }
    select("scenario").onchange = prompt;
    prompt();
    const value = await (await fetch("/api/project")).json();
    showFiles(value, "before");
}
catch {
    text("notice", "Could not load the local application. Check that its server is running.");
}
controls();
