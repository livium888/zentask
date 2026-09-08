import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { Confidence, PendingReview, Sample, SampleVerdict, Task, TaskSource } from "@/types";
import { MAX_SAMPLES, newId, type NewTask, type TaskStore } from "./types";

/**
 * On-device SQLite. Nothing leaves the phone.
 *
 * Columns are deliberately flat — no projects, no tags, no priorities. Those
 * are the fields that turn a to-do app into a second job, and adding them
 * later is a migration; removing them later is a redesign.
 */

const DB = "zentask";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  due_at INTEGER,
  source TEXT NOT NULL,
  raw_text TEXT,
  image_path TEXT
);
CREATE INDEX IF NOT EXISTS tasks_created_at ON tasks (created_at DESC);

CREATE TABLE IF NOT EXISTS pending (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  image_path TEXT,
  captured_at INTEGER NOT NULL,
  proposed_text TEXT NOT NULL,
  proposed_due_at INTEGER,
  confidence TEXT NOT NULL,
  recipe TEXT
);

CREATE TABLE IF NOT EXISTS samples (
  id TEXT PRIMARY KEY NOT NULL,
  captured_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  proposed_text TEXT NOT NULL,
  proposed_due_at INTEGER,
  confidence TEXT NOT NULL,
  recipe TEXT,
  verdict TEXT NOT NULL,
  final_text TEXT
);
CREATE INDEX IF NOT EXISTS samples_captured_at ON samples (captured_at);
`;

type TaskRow = {
  id: string;
  text: string;
  done: number;
  created_at: number;
  due_at: number | null;
  source: string;
  raw_text: string | null;
  image_path: string | null;
};

type PendingRow = {
  id: string;
  source: string;
  raw_text: string;
  image_path: string | null;
  captured_at: number;
  proposed_text: string;
  proposed_due_at: number | null;
  confidence: string;
  recipe: string | null;
};

/** SQLite has no NULL in our domain types; absent is absent. */
function optional<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    text: row.text,
    done: row.done === 1,
    createdAt: row.created_at,
    dueAt: optional(row.due_at),
    source: row.source as TaskSource,
    rawText: optional(row.raw_text),
    imagePath: optional(row.image_path),
  };
}

function toPending(row: PendingRow): PendingReview {
  return {
    id: row.id,
    source: row.source as TaskSource,
    rawText: row.raw_text,
    imagePath: optional(row.image_path),
    capturedAt: row.captured_at,
    proposedText: row.proposed_text,
    proposedDueAt: optional(row.proposed_due_at),
    confidence: row.confidence === "high" ? "high" : "low",
    recipe: optional(row.recipe),
  };
}

type SampleRow = {
  id: string;
  captured_at: number;
  source: string;
  raw_text: string;
  proposed_text: string;
  proposed_due_at: number | null;
  confidence: string;
  recipe: string | null;
  verdict: string;
  final_text: string | null;
};

function toSample(row: SampleRow): Sample {
  return {
    id: row.id,
    capturedAt: row.captured_at,
    source: row.source as TaskSource,
    rawText: row.raw_text,
    proposedText: row.proposed_text,
    proposedDueAt: optional(row.proposed_due_at),
    confidence: row.confidence as Confidence,
    recipe: optional(row.recipe),
    verdict: row.verdict as SampleVerdict,
    finalText: optional(row.final_text),
  };
}

export function createSqliteStore(): TaskStore {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  let db: SQLiteDBConnection | undefined;

  async function ready(): Promise<SQLiteDBConnection> {
    if (db) return db;
    const existing = (await sqlite.isConnection(DB, false)).result;
    db = existing
      ? await sqlite.retrieveConnection(DB, false)
      : await sqlite.createConnection(DB, false, "no-encryption", 1, false);
    await db.open();
    await db.execute(SCHEMA);
    return db;
  }

  async function select<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    const result = await (await ready()).query(sql, values as never[]);
    return (result.values ?? []) as T[];
  }

  return {
    async init() {
      await ready();
    },
    async listTasks() {
      const rows = await select<TaskRow>("SELECT * FROM tasks ORDER BY created_at DESC");
      return rows.map(toTask);
    },
    async addTask(input: NewTask) {
      const task: Task = { id: newId(), done: false, createdAt: Date.now(), ...input };
      await (await ready()).run(
        `INSERT INTO tasks (id, text, done, created_at, due_at, source, raw_text, image_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [task.id, task.text, 0, task.createdAt, task.dueAt ?? null, task.source, task.rawText ?? null, task.imagePath ?? null],
      );
      return task;
    },
    async setDone(id, done) {
      await (await ready()).run("UPDATE tasks SET done = ? WHERE id = ?", [done ? 1 : 0, id]);
    },
    async removeTask(id) {
      await (await ready()).run("DELETE FROM tasks WHERE id = ?", [id]);
    },
    async listPending() {
      const rows = await select<PendingRow>("SELECT * FROM pending ORDER BY captured_at ASC");
      return rows.map(toPending);
    },
    async addPending(review) {
      await (await ready()).run(
        `INSERT OR REPLACE INTO pending
         (id, source, raw_text, image_path, captured_at, proposed_text, proposed_due_at, confidence, recipe)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [review.id, review.source, review.rawText, review.imagePath ?? null, review.capturedAt,
         review.proposedText, review.proposedDueAt ?? null, review.confidence, review.recipe ?? null],
      );
    },
    async removePending(id) {
      await (await ready()).run("DELETE FROM pending WHERE id = ?", [id]);
    },
    async listSamples() {
      const rows = await select<SampleRow>("SELECT * FROM samples ORDER BY captured_at ASC");
      return rows.map(toSample);
    },
    async addSample(sample) {
      const db = await ready();
      await db.run(
        `INSERT OR REPLACE INTO samples
         (id, captured_at, source, raw_text, proposed_text, proposed_due_at,
          confidence, recipe, verdict, final_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sample.id, sample.capturedAt, sample.source, sample.rawText, sample.proposedText,
         sample.proposedDueAt ?? null, sample.confidence, sample.recipe ?? null,
         sample.verdict, sample.finalText ?? null],
      );
      // Keep the log bounded without needing a separate tidy-up anywhere.
      await db.run(
        `DELETE FROM samples WHERE id NOT IN (
           SELECT id FROM samples ORDER BY captured_at DESC LIMIT ?
         )`,
        [MAX_SAMPLES],
      );
    },
    async clearSamples() {
      await (await ready()).run("DELETE FROM samples", []);
    },
  };
}
