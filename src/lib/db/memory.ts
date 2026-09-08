import type { PendingReview, Sample, Task } from "@/types";
import { MAX_SAMPLES, newId, type NewTask, type TaskStore } from "./types";

/** Used by tests, and as the last-resort store if a device store fails to open. */
export function createMemoryStore(): TaskStore {
  let tasks: Task[] = [];
  let pending: PendingReview[] = [];
  let samples: Sample[] = [];

  return {
    async init() {},
    async listTasks() {
      return [...tasks].sort((a, b) => b.createdAt - a.createdAt);
    },
    async addTask(input: NewTask) {
      const task: Task = { id: newId(), done: false, createdAt: Date.now(), ...input };
      tasks.push(task);
      return task;
    },
    async setDone(id, done) {
      tasks = tasks.map((task) => (task.id === id ? { ...task, done } : task));
    },
    async removeTask(id) {
      tasks = tasks.filter((task) => task.id !== id);
    },
    async listPending() {
      return [...pending].sort((a, b) => a.capturedAt - b.capturedAt);
    },
    async addPending(review) {
      pending.push(review);
    },
    async removePending(id) {
      pending = pending.filter((review) => review.id !== id);
    },
    async listSamples() {
      return [...samples].sort((a, b) => a.capturedAt - b.capturedAt);
    },
    async addSample(sample) {
      samples = [...samples, sample].slice(-MAX_SAMPLES);
    },
    async clearSamples() {
      samples = [];
    },
  };
}
