import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./memory";

/** The contract every store implementation has to honour. */
describe("task store", () => {
  it("returns newest tasks first", async () => {
    const store = createMemoryStore();
    await store.addTask({ text: "older", source: "manual" });
    await new Promise((r) => setTimeout(r, 2));
    await store.addTask({ text: "newer", source: "manual" });
    expect((await store.listTasks()).map((t) => t.text)).toEqual(["newer", "older"]);
  });

  it("marks a task done without losing it", async () => {
    const store = createMemoryStore();
    const task = await store.addTask({ text: "pay bill", source: "camera" });
    await store.setDone(task.id, true);
    const [stored] = await store.listTasks();
    expect(stored).toMatchObject({ id: task.id, done: true });
  });

  it("keeps the OCR text a task came from", async () => {
    const store = createMemoryStore();
    await store.addTask({ text: "Pay £84.60", source: "camera", rawText: "BRITISH GAS\nTotal £84.60" });
    expect((await store.listTasks())[0]!.rawText).toContain("BRITISH GAS");
  });

  it("holds captures in review order, oldest first", async () => {
    const store = createMemoryStore();
    await store.addPending({ id: "b", source: "camera", rawText: "x", capturedAt: 200, proposedText: "second", confidence: "low" });
    await store.addPending({ id: "a", source: "camera", rawText: "y", capturedAt: 100, proposedText: "first", confidence: "high" });
    expect((await store.listPending()).map((r) => r.proposedText)).toEqual(["first", "second"]);
  });

  it("drops a capture once it has been dealt with", async () => {
    const store = createMemoryStore();
    await store.addPending({ id: "a", source: "share", rawText: "y", capturedAt: 1, proposedText: "t", confidence: "low" });
    await store.removePending("a");
    expect(await store.listPending()).toHaveLength(0);
  });
});
