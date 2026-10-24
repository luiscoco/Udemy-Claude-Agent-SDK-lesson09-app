# Claude Agent SDK · Lesson 09 · The options object

Based on Lesson09_The_Options_Object.pptx. A TypeScript lab that composes options, summarizes classroom TODOs, proves that pre-approval is not tool restriction, tests a programmatic Edit block against a project allow, and preserves a one-turn limit outcome.

## What you will learn

- Compose one options object: Set a model, fixed working directory, available tools, pre-approvals and limits before query(). Omitted fields use SDK defaults; this lab makes its relevant choices explicit.
- Separate three configuration sources: Inspect programmatic options, a real project settings file and a safe environment projection. The live host spreads process.env while keeping inherited secrets out of the UI.
- Understand configuration precedence: Managed policy ranks above application configuration. Local, project and user files have their own order. The experiment demonstrates a project Edit allow versus an explicit programmatic block.
- Distinguish tools from allowedTools: tools defines availability; allowedTools pre-approves calls. An unlisted Edit remains available in the approval experiment and reaches canUseTool.
- Observe a real callback decision: The host automatically approves only Edit on its private status.txt in the controlled experiment. This is an actual callback, not a simulated user approval or an unrestricted editing agent.
- Bound and inspect a run: Choose a turn limit, an SDK spend threshold and effort. Preserve actual typed results, including error_max_turns. Sampling parameters such as temperature are not SDK options.

## Configure and run

Use Node.js 24+, npm and your own Anthropic key with access to the configured model. Python is not required to run this app.

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson09-app.git
cd .\Udemy-Claude-Agent-SDK-lesson09-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations, use `cd .\agent-sdk\lesson09-options` instead of cloning. Open http://127.0.0.1:3109 and keep the terminal running. Ctrl+C stops it.

## Create your .env file

Preserve an existing .env. Copy the safe example if needed, enter the key locally and restart. The npm start and sample:env scripts load .env explicitly; shell variables take precedence.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3109
```

On Windows, if required, add `CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe` after confirming the installed path. Keep optional npm dependencies enabled. A second start recognizes this application; change PORT for another listener.

## Run the experiments

1. Keep Read-only TODO summary, maxTurns 8, SDK threshold $0.30 and low effort. Confirm the three TODO identifiers and unchanged status.txt.
2. Choose Only Read pre-approved · Edit available. Observe Edit in system/init, the real callback allow decision and the actual file changing to reviewed.
3. Choose Project allows Edit · options block it. Compare ["project"], the project allow file, disallowedTools and Edit missing from init. Confirm status.txt is unchanged.
4. Return to TODO summary with maxTurns 1. Inspect error_max_turns and any preserved post-result exception notice. A tool request alone is not a completed summary.
5. Download actual observations if useful. Run browser and CLI experiments sequentially.

```powershell
npm run sample:env -- summary 8
npm run sample:env -- approval 8
npm run sample:env -- blocked 8
npm run sample:env -- summary 1
```

`sample` uses only the inherited shell environment. Each run resets its own private classroom files; no arbitrary user project path is accepted.

## How the app was built

### 1. Validate bounded configuration

The host accepts fixed scenarios, a bounded turn count, an SDK budget threshold and supported effort values. It never accepts an arbitrary cwd or tool callback from the browser.

Source: `src/server.ts`, lines 58–58. Selected source; surrounding code omitted.

```typescript
const config = validateConfig(input);
```

### 2. Reset the classroom project

Each experiment starts from trusted fixture bytes in its own private directory. Resetting a scenario does not touch your other repositories.

Source: `src/agent.ts`, lines 26–26. Selected source; surrounding code omitted.

```typescript
for (const name of [
  "notes.md", "status.txt", ".claude/settings.json"
]) await writeFile(
  resolve(cwd, name),
  await readFile(resolve(ROOT, "fixtures/project", name))
);
```

### 3. Choose available and pre-approved tools

tools defines availability. allowedTools is a separate pre-approval list. In the approval experiment Edit remains available even though only Read is pre-approved.

Source: `src/agent.ts`, lines 50–51. Selected source; surrounding code omitted.

```typescript
// Selected option properties.
tools: readOnly
  ? ["Read", "Glob", "Grep"] : ["Read", "Edit"],
allowedTools: readOnly
  ? ["Read", "Glob", "Grep"] : ["Read"],
```

### 4. Apply the explicit Edit block

The blocked and read-only experiments add Edit to disallowedTools. The rest of the array also excludes shell, write and web tools. A bare tool-name block removes Edit from model availability.

Source: `src/agent.ts`, lines 52–52. Selected source; surrounding code omitted.

```typescript
// Selected tail of disallowedTools.
...(config.scenario === "blocked" || readOnly
  ? ["Edit"] : [])
```

### 5. Select filesystem settings

Only the blocked experiment loads the project settings source. Its settings file allows Edit, while the programmatic deny removes it. Other experiments isolate filesystem settings with an explicit empty array.

Source: `src/agent.ts`, lines 55–55. Selected source; surrounding code omitted.

```typescript
settingSources: config.scenario === "blocked"
  ? ["project"] : [],
```

### 6. Preserve the process environment

The TypeScript env option replaces the subprocess environment, so the host spreads inherited values before adding its own configuration. The UI projects only the harmless classroom value and never dumps keys.

Source: `src/agent.ts`, lines 57–57. Selected source; surrounding code omitted.

```typescript
env: {
  ...process.env,
  CLAUDE_CONFIG_DIR: resolve(ROOT, ".runtime/sdk-home"),
  LESSON09_CONTEXT: "classroom-options"
},
```

### 7. Call query with the composed options

The fixed prompt and composed object start one real SDK query. The SDK handles model and tool orchestration; the host observes the resulting stream.

Source: `src/agent.ts`, lines 81–81. Selected source; surrounding code omitted.

```typescript
const run = query({
  prompt: PROMPTS[config.scenario], options
});
```

### 8. Inspect actual init availability

The host narrows system/init and records the model, actual tool list and permission mode. The student checks this observation against the requested option configuration.

Source: `src/agent.ts`, lines 85–85. Selected source; surrounding code omitted.

```typescript
if (message.type === "system"
    && message.subtype === "init") {
  emit({ type: "initialized",
    model: message.model, tools: message.tools,
    permissionMode: message.permissionMode
  });
}
```

### 9. Guard each classroom path

PreToolUse checks every requested file operation against the fixed workspace. Passing the guard does not approve an unresolved permission request; it leaves the permission flow to continue.

Source: `src/agent.ts`, lines 61–61. Selected source; surrounding code omitted.

```typescript
if (pathAllowed(
  cwd, input.tool_name,
  input.tool_input as Record<string, unknown>
)) return {};
// Otherwise return a deny hook decision.
```

### 10. Resolve the unlisted Edit approval

The real canUseTool callback automatically approves only Edit on the private status file in the approval scenario. It records its actual decision before returning. Other requests are denied.

Source: `src/agent.ts`, lines 44–44. Selected source; surrounding code omitted.

```typescript
return allow
  ? { behavior: "allow", updatedInput: input }
  : { behavior: "deny",
      message: "Only the controlled status.txt Edit approval is supported."
    };
```

### 11. Preserve the typed SDK outcome

The host preserves the actual subtype and is_error distinction. A one-turn limit stays error_max_turns, even if some text or a tool request arrived first.

Source: `src/agent.ts`, lines 91–91. Selected source; surrounding code omitted.

```typescript
// Selected result fields.
status: message.subtype === "success" && message.is_error
  ? "error" : message.subtype,
```

### 12. Read the actual file after completion

The finally block closes the query and reads the real status file. The resulting changed flag provides file evidence independently of the model summary, including on interrupted or limited runs.

Source: `src/agent.ts`, lines 100–101. Selected source; surrounding code omitted.

```typescript
run.close();
const after = await files(config.scenario);
emit({ type: "workspace", stage: "after", files: after,
  changed: before.status !== after.status
});
```

### 13. Render the observed explanation

The browser uses a local Markdown parser and sanitizer to format actual answer text. It keeps configuration, native observations, callback decisions and on-disk evidence separate.

Source: `src/client.ts`, lines 35–35. Selected source; surrounding code omitted.

```typescript
renderMarkdown(el("answer"), answer);
// Show actual options, init, decisions and file reads.
```

## Interpret the evidence

- tools configures availability; allowedTools pre-approves calls. In the controlled approval scenario Edit is available but not pre-approved. The real callback automatically approves only Edit on status.txt. No human approval dialog is simulated.
- The blocked experiment loads a real project allow rule and programmatically disallows Edit. The actual init tools and unchanged file verify this specific interaction. It does not test managed policy or every settings-precedence combination. Permission deny rules have their own evaluation flow.
- TypeScript env replaces the subprocess environment. The host spreads process.env before adding a private config home and a harmless classroom variable; only a safe projection is shown. The model is not asked to read environment variables.
- maxTurns is a runtime turn limit, not an SDK message count. maxBudgetUsd is an estimate threshold, not an exact invoice or wall-clock guarantee. Effort is an independent configuration choice. The host also applies a timeout.
- Typed error results are preserved if iteration subsequently throws. The actual file is read in finally, independently of the assistant summary. Provider failures are not replaced with stored answers.
- Fixed directories and path hooks are local application guards, not an operating-system sandbox. No shell tool is available.
- The feature map covers reference topics such as MCP, subagents, skills, structured output, persistence and sandboxing; those integrations are not run here. Python snippets are reference-only.
- Sampling controls such as temperature, top_p and max_tokens belong to the Messages API, not this SDK options object. Use the Client SDK directly for that interface.

## Maintenance

```powershell
npm test
npm run build:client
python scripts/build-pages.py
```

Python is optional for regenerating the documentation. All five student pages, coloured source snippets, local Markdown parser/sanitizer, mascot, UML, fixtures and application sources are bundled. .env, dependencies, runtime files, teaching-material, presentation/output/reviewed/v3 folders, videos, audio and PowerPoint remain excluded from Git.

## References

- [Configure the Agent SDK](https://code.claude.com/docs/en/agent-sdk/configuration)
- [Permission evaluation](https://code.claude.com/docs/en/agent-sdk/permissions)
- [Approval callbacks](https://code.claude.com/docs/en/agent-sdk/user-input)
- [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript)
