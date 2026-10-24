import { query, type Options, type PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, basename } from "node:path";
import type { RunConfig, Scenario, FileState, LabEvent } from "./protocol.js";
export type { RunConfig, LabEvent } from "./protocol.js";
export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
export const DEFAULT_CONFIG: RunConfig = { scenario: "summary", maxTurns: 8, maxBudgetUsd: 0.30, effort: "low" };
export const PROMPTS: Record<Scenario, string> = {
 summary: "Summarize the open TODOs in this classroom project. First use Glob to find Markdown files, then Read notes.md. Preserve each TODO identifier in three short bullets. Do not edit files or claim tests ran.",
 approval: "Read status.txt, then use Edit to replace draft with reviewed in that file. This is a classroom approval experiment. Make no other edits. Briefly report what happened; do not claim tests ran.",
 blocked: "Read status.txt and try to replace draft with reviewed using Edit only if that tool is available. If Edit is unavailable, say that the configured tools prevent the change. Do not use another tool to edit and do not claim success without an edit.",
};
export function validateConfig(value: unknown): RunConfig {
 const input = value as Partial<RunConfig> | null;
 if (!input || typeof input.scenario !== "string" || !["summary", "approval", "blocked"].includes(input.scenario)) throw new Error("Choose summary, approval or blocked.");
 if (!Number.isInteger(input.maxTurns) || input.maxTurns! < 1 || input.maxTurns! > 8) throw new Error("maxTurns must be an integer from 1 to 8.");
 if (typeof input.maxBudgetUsd !== "number" || !Number.isFinite(input.maxBudgetUsd) || input.maxBudgetUsd < 0.05 || input.maxBudgetUsd > 1) throw new Error("Use an SDK budget threshold between $0.05 and $1.");
 if (input.effort !== "low" && input.effort !== "medium") throw new Error("Choose low or medium effort.");
 return { scenario: input.scenario, maxTurns: input.maxTurns!, maxBudgetUsd: input.maxBudgetUsd, effort: input.effort };
}
export const workspace = (scenario: Scenario) => resolve(ROOT, ".runtime", scenario, "project");
export async function prepareWorkspace(scenario: Scenario) {
 const cwd = workspace(scenario); await mkdir(resolve(cwd, ".claude"), { recursive: true });
 for (const name of ["notes.md", "status.txt", ".claude/settings.json"]) await writeFile(resolve(cwd, name), await readFile(resolve(ROOT, "fixtures/project", name)));
 await mkdir(resolve(ROOT, ".runtime/sdk-home"), { recursive: true });
 return cwd;
}
export async function files(scenario: Scenario): Promise<FileState> {
 const cwd = workspace(scenario);
 return { notes: await readFile(resolve(cwd, "notes.md"), "utf8"), status: await readFile(resolve(cwd, "status.txt"), "utf8"), projectSettings: await readFile(resolve(cwd, ".claude/settings.json"), "utf8") };
}
export function pathAllowed(cwd: string, name: string, input: Record<string, unknown>): boolean {
 if (name === "Read") return typeof input.file_path === "string" && ["notes.md", "status.txt"].some(file => resolve(cwd, input.file_path as string).toLowerCase() === resolve(cwd, file).toLowerCase());
 if (name === "Edit") return typeof input.file_path === "string" && resolve(cwd, input.file_path).toLowerCase() === resolve(cwd, "status.txt").toLowerCase();
 if (name === "Glob") return !String(input.pattern || "").includes("..") && !/^[\\/]|:/.test(String(input.pattern || "")) && resolve(cwd, String(input.path || ".")).toLowerCase() === cwd.toLowerCase();
 if (name === "Grep") return typeof input.path === "string" && [cwd, resolve(cwd, "notes.md")].some(path => resolve(cwd, input.path as string).toLowerCase() === path.toLowerCase());
 return false;
}
export async function approvalDecision(config: RunConfig, name: string, input: Record<string, unknown>, emit: (event: LabEvent) => void): Promise<PermissionResult> {
 const allow = config.scenario === "approval" && name === "Edit" && pathAllowed(workspace(config.scenario), name, input);
 emit({ type: "approval", name, decision: allow ? "allow" : "deny", reason: allow ? "Edit was not pre-approved; the host callback explicitly approves this one classroom file." : "The host callback denies requests outside the controlled approval exercise." });
 return allow ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: "Only the controlled status.txt Edit approval is supported." };
}
export function lessonOptions(config: RunConfig, emit: (event: LabEvent) => void, controller = new AbortController()): Options {
 const cwd = workspace(config.scenario), readOnly = config.scenario === "summary";
 return {
  model: MODEL, cwd,
  tools: readOnly ? ["Read", "Glob", "Grep"] : ["Read", "Edit"],
  allowedTools: readOnly ? ["Read", "Glob", "Grep"] : ["Read"],
  disallowedTools: ["Bash", "Write", "WebFetch", "WebSearch", ...(config.scenario === "blocked" || readOnly ? ["Edit"] : [])],
  permissionMode: "default", maxTurns: config.maxTurns, maxBudgetUsd: config.maxBudgetUsd, effort: config.effort,
  systemPrompt: "You are a concise classroom agent. Follow the fixed task. Work only with the classroom notes.md and status.txt. Read before editing. Do not use shell commands, modify other files, claim tests ran, or claim an edit succeeded if the configured tools prevented it.",
  settingSources: config.scenario === "blocked" ? ["project"] : [],
  mcpServers: {}, plugins: [], persistSession: false, abortController: controller,
  env: { ...process.env, CLAUDE_CONFIG_DIR: resolve(ROOT, ".runtime/sdk-home"), LESSON09_CONTEXT: "classroom-options" },
  canUseTool: (name, input) => approvalDecision(config, name, input, emit),
  hooks: { PreToolUse: [{ hooks: [async input => {
   if (input.hook_event_name !== "PreToolUse") return {};
   if (pathAllowed(cwd, input.tool_name, input.tool_input as Record<string, unknown>)) return {};
   return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Only the bundled classroom files and read-only discovery are permitted." } };
  }] }] },
 };
}
export function optionPreview(options: Options) {
 return { model: options.model, cwd: "private classroom project", tools: options.tools, allowedTools: options.allowedTools,
  disallowedTools: options.disallowedTools, permissionMode: options.permissionMode, settingSources: options.settingSources,
  maxTurns: options.maxTurns, maxBudgetUsd: options.maxBudgetUsd, effort: options.effort,
  canUseTool: "host callback", hooks: ["PreToolUse"], systemPrompt: options.systemPrompt };
}
export function redact(text: string) {
 const key = process.env.ANTHROPIC_API_KEY;
 return (key ? text.split(key).join("[REDACTED]") : text).replace(/sk-ant-[A-Za-z0-9_-]{16,}/g, "[REDACTED]").slice(0, 16000);
}
export async function runAgent(config: RunConfig, emit: (event: LabEvent) => void, controller = new AbortController()) {
 config = validateConfig(config); await prepareWorkspace(config.scenario);
 const before = await files(config.scenario), options = lessonOptions(config, emit, controller);
 emit({ type: "options", config, options: optionPreview(options), fileSettings: JSON.parse(before.projectSettings), environment: { inheritsProcessEnvironment: true, classroomVariable: "LESSON09_CONTEXT=classroom-options" } });
 emit({ type: "workspace", stage: "before", files: before, changed: false });
 const run = query({ prompt: PROMPTS[config.scenario], options }); let gotResult = false;
 try {
  for await (const message of run) {
   emit({ type: "message", sdkType: message.type, summary: "subtype" in message ? String(message.subtype) : "Observed SDK message" });
   if (message.type === "system" && message.subtype === "init") emit({ type: "initialized", model: message.model, tools: message.tools, permissionMode: message.permissionMode });
   if (message.type === "assistant") for (const block of message.message.content) {
    if (block.type === "text") emit({ type: "answer", text: redact(block.text) });
    if (block.type === "tool_use") { const input = block.input as Record<string, unknown>; emit({ type: "tool", name: block.name, target: typeof input.file_path === "string" ? basename(input.file_path) : String(input.pattern || "classroom directory").slice(0, 100) }); }
   }
   if (message.type === "result") {
    gotResult = true; emit({ type: "result", status: message.subtype === "success" && message.is_error ? "error" : message.subtype,
     text: redact(message.subtype === "success" ? message.result : message.errors.join("\n")), turns: message.num_turns, costUsd: message.total_cost_usd, sessionId: message.session_id });
   }
  }
  if (!gotResult) throw new Error("The SDK ended without a final result.");
 } catch (error) {
  if (!gotResult) throw error;
  emit({ type: "notice", text: "The runtime closed after a typed result; its actual outcome is preserved." });
 } finally {
  run.close(); const after = await files(config.scenario);
  emit({ type: "workspace", stage: "after", files: after, changed: before.status !== after.status });
 }
}
