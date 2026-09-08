import type { PendingReview, Task } from "@/types";
import { newId, type NewTask, type TaskStore } from "./types";

/**
 * Browser storage, used by `bun run dev` and by the web build.
 *
 * IndexedDB rather than localStorage because a capture carries its OCR text
 * and can run to several kilobytes, and because localStorage writes block the
 * main thread — which on the capture path is the one thing that must stay fast.
 */

const DB_NAME = "zentask";
const DB_VERSION = 1;
const TASKS = "tasks";
const PENDING = "pending";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TASKS)) db.createObjectStore(TASKS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PENDING)) db.createObjectStore(PENDING, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = work(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createWebStore(): TaskStore {
  let db: IDBDatabase | undefined;
  const ready = async () => db ?? (db = await open());

  return {
    async init() {
      await ready();
    },
    async listTasks() {
      const all = await run<Task[]>(await ready(), TASKS, "readonly", (s) => s.getAll());
      return all.sort((a, b) => b.createdAt - a.createdAt);
    },
    async addTask(input: NewTask) {
      const task: Task = { id: newId(), done: false, createdAt: Date.now(), ...input };
      await run(await ready(), TASKS, "readwrite", (s) => s.put(task));
      return task;
    },
    async setDone(id, done) {
      const conn = await ready();
      const task = await run<Task | undefined>(conn, TASKS, "readonly", (s) => s.get(id));
      if (!task) return;
      await run(conn, TASKS, "readwrite", (s) => s.put({ ...task, done }));
    },
    async removeTask(id) {
      await run(await ready(), TASKS, "readwrite", (s) => s.delete(id));
    },
    async listPending() {
      const all = await run<PendingReview[]>(await ready(), PENDING, "readonly", (s) => s.getAll());
      return all.sort((a, b) => a.capturedAt - b.capturedAt);
    },
    async addPending(review) {
      await run(await ready(), PENDING, "readwrite", (s) => s.put(review));
    },
    async removePending(id) {
      await run(await ready(), PENDING, "readwrite", (s) => s.delete(id));
    },
  };
}
