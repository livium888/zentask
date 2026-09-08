import { Capacitor } from "@capacitor/core";
import { createMemoryStore } from "./memory";
import { createSqliteStore } from "./sqlite";
import type { TaskStore } from "./types";
import { createWebStore } from "./web";

/**
 * Pick a store for the platform we are actually on.
 *
 * A store that fails to open must not take the app down with it — losing
 * yesterday's tasks is bad, but a capture button that does nothing is worse.
 * The memory fallback keeps the session usable and the failure visible.
 */
export async function createStore(): Promise<{ store: TaskStore; degraded: boolean }> {
  const candidate = Capacitor.isNativePlatform() ? createSqliteStore() : createWebStore();
  try {
    await candidate.init();
    return { store: candidate, degraded: false };
  } catch (error) {
    console.error("Storage unavailable, running in memory for this session.", error);
    const memory = createMemoryStore();
    await memory.init();
    return { store: memory, degraded: true };
  }
}

export type { NewTask, TaskStore } from "./types";
export { createMemoryStore } from "./memory";
