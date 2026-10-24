export type Scenario = "summary" | "approval" | "blocked";
export type RunConfig = { scenario: Scenario; maxTurns: number; maxBudgetUsd: number; effort: "low" | "medium" };
export type FileState = { notes: string; status: string; projectSettings: string };
export type LabEvent =
 | { type: "options"; config: RunConfig; options: Record<string, unknown>; fileSettings: unknown; environment: { inheritsProcessEnvironment: true; classroomVariable: string } }
 | { type: "workspace"; stage: "before" | "after"; files: FileState; changed: boolean }
 | { type: "initialized"; model: string; tools: string[]; permissionMode: string }
 | { type: "message"; sdkType: string; summary: string }
 | { type: "tool"; name: string; target: string }
 | { type: "approval"; name: string; decision: "allow" | "deny"; reason: string }
 | { type: "answer"; text: string }
 | { type: "result"; status: string; text: string; turns: number; costUsd: number; sessionId: string }
 | { type: "notice" | "error"; text: string };
