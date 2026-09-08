import type { PendingReview, Sample, Task, TaskSource } from "@/types";

export type NewTask = {
  text: string;
  source: TaskSource;
  dueAt?: number;
  rawText?: string;
  imagePath?: string;
};

/**
 * Everything the app needs from storage.
 *
 * There is no account and no server in v1: an app for people with no time
 * cannot open with a sign-up screen. The interface exists so the native
 * SQLite store and the browser store are interchangeable, and so the whole
 * app can be tested against an in-memory one.
 */
export interface TaskStore {
  init(): Promise<void>;
  listTasks(): Promise<Task[]>;
  addTask(input: NewTask): Promise<Task>;
  setDone(id: string, done: boolean): Promise<void>;
  removeTask(id: string): Promise<void>;
  listPending(): Promise<PendingReview[]>;
  addPending(review: PendingReview): Promise<void>;
  removePending(id: string): Promise<void>;
  listSamples(): Promise<Sample[]>;
  addSample(sample: Sample): Promise<void>;
  clearSamples(): Promise<void>;
}

/** Enough to be worth exporting, few enough never to matter on a phone. */
export const MAX_SAMPLES = 200;

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
