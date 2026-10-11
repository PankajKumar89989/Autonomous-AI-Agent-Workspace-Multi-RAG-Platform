import { describe, expect, it } from "vitest";

import { emptyRun, isActive, reduceEvent, type RunStep } from "@/lib/research";

const step = (id: string, status: RunStep["status"]): RunStep => ({
  id, agent: id, task: "t", status, attempts: 1, duration_ms: null, summary: null, error: null, fallback: false,
});

const log: [string, unknown][] = [
  ["run", { run_id: "r1" }],
  ["step", step("planner", "running")],
  ["step", step("planner", "completed")],
  ["plan", { steps: [step("planner", "completed"), step("document", "pending"), step("analyst", "pending")] }],
  ["step", step("document", "running")],
  ["step", step("document", "completed")],
  ["sources", { sources: [{ n: 1, kind: "document", title: "a.pdf", cited: false }] }],
  ["report", { markdown: "## Executive Summary [1]", sources: [{ n: 1, kind: "document", title: "a.pdf", cited: true }] }],
  ["done", { warnings: ["careful"], duration_ms: 1234 }],
];
const replay = () => log.reduce((state, [event, data]) => reduceEvent(state, event, data), emptyRun("objective", "queued"));

describe("reduceEvent", () => {
  it("builds the finished run from the event log", () => {
    const run = replay();
    expect(run).toMatchObject({ id: "r1", status: "completed", report: "## Executive Summary [1]", warnings: ["careful"], duration_ms: 1234 });
    expect(run.steps.map((s) => `${s.id}:${s.status}`)).toEqual(["planner:completed", "document:completed", "analyst:pending"]);
    expect(run.sources[0].cited).toBe(true);
  });

  it("gives the same result when the whole log is replayed (reconnecting)", () => {
    expect(replay()).toEqual(replay());
  });

  it("handles failure and cancellation", () => {
    const failed = reduceEvent(emptyRun("x"), "error", { message: "boom", warnings: ["w"] });
    expect(failed).toMatchObject({ status: "failed", error: "boom", warnings: ["w"] });
    expect(reduceEvent(emptyRun("x"), "cancelled", {}).status).toBe("cancelled");
  });

  it("ignores unknown events", () => {
    const run = emptyRun("x");
    expect(reduceEvent(run, "heartbeat", {})).toBe(run);
  });
});

describe("isActive", () => {
  it("is true only while queued or running", () => {
    expect(["queued", "running"].every((s) => isActive(s as never))).toBe(true);
    expect(["completed", "failed", "cancelled", undefined].some((s) => isActive(s as never))).toBe(false);
  });
});
