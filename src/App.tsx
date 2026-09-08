import { useCallback, useEffect, useState } from "react";
import { ReviewCard } from "./components/ReviewCard";
import { TaskList } from "./components/TaskList";
import { captureFromImage, NothingToRead, reviewFromText } from "./lib/capture";
import { createStore, type TaskStore } from "./lib/db";
import { isOcrAvailable, OcrUnavailable } from "./lib/ocr";
import type { PendingReview, Task } from "./types";

/**
 * One screen.
 *
 * Captures waiting for a decision sit above the list, because an unanswered
 * capture is the only thing in this app that needs the user. Everything a
 * conventional to-do app puts here — projects, tags, priorities, filters — is
 * deliberately absent: that machinery is the reason people stop using these.
 */
export function App() {
  const [store, setStore] = useState<TaskStore>();
  const [degraded, setDegraded] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async (from: TaskStore) => {
    const [nextTasks, nextPending] = await Promise.all([from.listTasks(), from.listPending()]);
    setTasks(nextTasks);
    setPending(nextPending);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void createStore().then(async ({ store: opened, degraded: fellBack }) => {
      if (cancelled) return;
      setStore(opened);
      setDegraded(fellBack);
      await refresh(opened);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function capture(source: "camera" | "gallery") {
    if (!store || busy) return;
    setBusy(true);
    setNote(undefined);
    try {
      const review = await captureFromImage(source);
      await store.addPending(review);
      await refresh(store);
    } catch (error) {
      if (error instanceof OcrUnavailable) setNote(error.message);
      else if (error instanceof NothingToRead) setNote("No text found in that picture.");
      else if (isCancelled(error)) setNote(undefined);
      else setNote("That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addTyped() {
    if (!store) return;
    const text = draft.trim();
    if (!text) return;
    try {
      const review = reviewFromText(text, "manual");
      await store.addTask({ text: review.proposedText, source: "manual", dueAt: review.proposedDueAt });
    } catch {
      // A typed line is always worth keeping, even if nothing could be read from it.
      await store.addTask({ text, source: "manual" });
    }
    setDraft("");
    await refresh(store);
  }

  async function confirm(review: PendingReview, text: string) {
    if (!store) return;
    await store.addTask({
      text,
      source: review.source,
      dueAt: review.proposedDueAt,
      rawText: review.rawText,
      imagePath: review.imagePath,
    });
    await store.removePending(review.id);
    await refresh(store);
  }

  async function dismiss(review: PendingReview) {
    if (!store) return;
    await store.removePending(review.id);
    await refresh(store);
  }

  async function toggle(task: Task) {
    if (!store) return;
    await store.setDone(task.id, !task.done);
    await refresh(store);
  }

  async function remove(task: Task) {
    if (!store) return;
    await store.removeTask(task.id);
    await refresh(store);
  }

  const open = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-32 pt-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">ZenTask</h1>
        <p className="mt-1 text-sm text-muted">Photograph it. We'll turn it into the thing you have to do.</p>
      </header>

      {degraded && (
        <p className="mt-4 rounded-xl border border-line p-3 text-xs text-muted">
          Storage didn't open, so anything added now lasts only until you close the app.
        </p>
      )}

      {pending.length > 0 && (
        <section className="mt-8" aria-label="Waiting for you">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
            Is this it?
          </h2>
          <ul className="mt-3 space-y-3">
            {pending.map((review) => (
              <ReviewCard key={review.id} review={review} onConfirm={confirm} onDismiss={dismiss} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8" aria-label="Your list">
        <TaskList tasks={open} onToggle={toggle} onRemove={remove} />
        {done.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-xs uppercase tracking-widest text-muted">
              Done ({done.length})
            </summary>
            <TaskList tasks={done} onToggle={toggle} onRemove={remove} />
          </details>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-ink/95 px-5 pb-6 pt-3 backdrop-blur">
        {note && <p className="pb-2 text-xs text-muted">{note}</p>}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void addTyped()}
            placeholder="or just type it"
            aria-label="Add a task by typing"
            className="min-w-0 flex-1 rounded-xl border border-line bg-transparent px-4 py-3 outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={() => void capture("gallery")}
            disabled={busy}
            aria-label="Pick a picture"
            className="rounded-xl border border-line px-4 py-3 disabled:opacity-40"
          >
            🖼
          </button>
          <button
            type="button"
            onClick={() => void capture("camera")}
            disabled={busy}
            aria-label="Take a picture"
            className="rounded-xl bg-accent px-5 py-3 text-ink disabled:opacity-40"
          >
            {busy ? "…" : "📷"}
          </button>
        </div>
        {!isOcrAvailable() && (
          <p className="pt-2 text-xs text-muted">
            Reading pictures needs the installed Android app.
          </p>
        )}
      </div>
    </main>
  );
}

/** The user backing out of the camera is not an error worth reporting. */
function isCancelled(error: unknown): boolean {
  return error instanceof Error && /cancel/i.test(error.message);
}
