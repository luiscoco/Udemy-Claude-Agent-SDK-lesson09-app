import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, validateConfig, lessonOptions, optionPreview, pathAllowed, workspace, approvalDecision } from "./agent.js";
test("fixed scenarios and bounded numeric controls reject malformed input", () => {
 assert.deepEqual(validateConfig(DEFAULT_CONFIG), DEFAULT_CONFIG);
 for (const input of [null, {}, { ...DEFAULT_CONFIG, scenario: ["summary"] }, { ...DEFAULT_CONFIG, maxTurns: 0 }, { ...DEFAULT_CONFIG, maxTurns: 9 }, { ...DEFAULT_CONFIG, maxBudgetUsd: NaN }, { ...DEFAULT_CONFIG, maxBudgetUsd: 0 }, { ...DEFAULT_CONFIG, effort: "max" }]) assert.throws(() => validateConfig(input));
});
test("read-only availability and pre-approval are configured separately", () => {
 const options = lessonOptions(DEFAULT_CONFIG, () => {});
 assert.deepEqual(options.tools, ["Read", "Glob", "Grep"]); assert.ok(options.disallowedTools?.includes("Edit")); assert.deepEqual(options.settingSources, []);
});
test("approval experiment exposes Edit without putting it in allowedTools", () => {
 const options = lessonOptions({ ...DEFAULT_CONFIG, scenario: "approval" }, () => {});
 assert.deepEqual(options.tools, ["Read", "Edit"]); assert.deepEqual(options.allowedTools, ["Read"]); assert.ok(!options.disallowedTools?.includes("Edit")); assert.equal(options.permissionMode, "default");
});
test("blocked experiment loads project settings and explicitly denies Edit", () => {
 const options = lessonOptions({ ...DEFAULT_CONFIG, scenario: "blocked" }, () => {});
 assert.deepEqual(options.settingSources, ["project"]); assert.ok(options.disallowedTools?.includes("Edit"));
});
test("file guards reject secrets, parent paths, shell and unrelated writes", () => {
 const cwd = workspace("approval");
 assert.equal(pathAllowed(cwd, "Edit", { file_path: "status.txt" }), true);
 assert.equal(pathAllowed(cwd, "Edit", { file_path: "notes.md" }), false);
 assert.equal(pathAllowed(cwd, "Read", { file_path: ".env" }), false);
 assert.equal(pathAllowed(cwd, "Read", { file_path: "../status.txt" }), false);
 assert.equal(pathAllowed(cwd, "Bash", { command: "anything" }), false);
});
test("callback approves only the controlled Edit and emits its actual decision", async () => {
 const config = { ...DEFAULT_CONFIG, scenario: "approval" as const }; const events: unknown[] = [];
 assert.equal((await approvalDecision(config, "Edit", { file_path: "status.txt" }, e => events.push(e))).behavior, "allow");
 assert.equal((await approvalDecision(config, "Edit", { file_path: "../status.txt" }, e => events.push(e))).behavior, "deny");
 assert.equal(events.length, 2);
});
test("browser projection excludes inherited environment and private absolute paths", () => {
 const value = optionPreview(lessonOptions(DEFAULT_CONFIG, () => {})); assert.ok(!Object.hasOwn(value, "env")); assert.equal(value.cwd, "private classroom project"); assert.ok(!Object.hasOwn(value, "temperature"));
});
