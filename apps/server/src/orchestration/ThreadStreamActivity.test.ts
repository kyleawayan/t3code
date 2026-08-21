import { describe, expect, it } from "vite-plus/test";

import { computeThreadStalled, make, STALL_WARN_MS } from "./ThreadStreamActivity.ts";

const NOW = 10_000_000;
// A turn that IS stalled: active, silent past the threshold, nothing else live.
const stalledInput = {
  activeTurnId: "turn-1",
  lastActivityMs: NOW - STALL_WARN_MS,
  nowMs: NOW,
  thresholdMs: STALL_WARN_MS,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  backgroundLiveness: null,
} as const;

describe("computeThreadStalled", () => {
  it("flags an active turn that is silent past the threshold", () => {
    expect(computeThreadStalled(stalledInput)).toBe(true);
  });

  it("treats the threshold as inclusive (>=)", () => {
    expect(computeThreadStalled({ ...stalledInput, lastActivityMs: NOW - STALL_WARN_MS })).toBe(
      true,
    );
  });

  it("does NOT flag when silence is under the threshold (still streaming/thinking)", () => {
    expect(computeThreadStalled({ ...stalledInput, lastActivityMs: NOW - 1_000 })).toBe(false);
  });

  it("does NOT flag when there is no active turn", () => {
    expect(computeThreadStalled({ ...stalledInput, activeTurnId: null })).toBe(false);
  });

  it("does NOT flag when activity has never been recorded (e.g. after a restart)", () => {
    expect(computeThreadStalled({ ...stalledInput, lastActivityMs: undefined })).toBe(false);
  });

  it("does NOT flag while waiting on a pending approval", () => {
    expect(computeThreadStalled({ ...stalledInput, hasPendingApprovals: true })).toBe(false);
  });

  it("does NOT flag while waiting on pending user input", () => {
    expect(computeThreadStalled({ ...stalledInput, hasPendingUserInput: true })).toBe(false);
  });

  it("does NOT flag while background work is running (subagents)", () => {
    expect(computeThreadStalled({ ...stalledInput, backgroundLiveness: "working" })).toBe(false);
  });

  it("does NOT flag while a monitor/background shell is live (dev server)", () => {
    expect(computeThreadStalled({ ...stalledInput, backgroundLiveness: "monitoring" })).toBe(false);
  });
});

describe("ThreadStreamActivity", () => {
  it("returns undefined for a thread with no recorded activity", () => {
    const service = make();
    expect(service.getLastActivityMs("thread-unseen")).toBeUndefined();
  });

  it("records and reads the latest activity timestamp", () => {
    const service = make();
    service.recordActivity("thread-1", 1_000);
    expect(service.getLastActivityMs("thread-1")).toBe(1_000);
    service.recordActivity("thread-1", 2_500);
    expect(service.getLastActivityMs("thread-1")).toBe(2_500);
  });

  it("tracks threads independently", () => {
    const service = make();
    service.recordActivity("thread-a", 10);
    service.recordActivity("thread-b", 20);
    expect(service.getLastActivityMs("thread-a")).toBe(10);
    expect(service.getLastActivityMs("thread-b")).toBe(20);
  });

  it("clear drops a thread's entry so it reads as unseen again", () => {
    const service = make();
    service.recordActivity("thread-1", 1_000);
    service.clear("thread-1");
    expect(service.getLastActivityMs("thread-1")).toBeUndefined();
  });

  it("clear of an unknown thread is a no-op", () => {
    const service = make();
    expect(() => service.clear("thread-missing")).not.toThrow();
    expect(service.getLastActivityMs("thread-missing")).toBeUndefined();
  });
});
