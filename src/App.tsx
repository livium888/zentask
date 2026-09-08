import { useCallback, useEffect, useState } from "react";
import { ReviewCard } from "./components/ReviewCard";
import { TaskList } from "./components/TaskList";
import { captureFromImage, captureFromShare, NothingToRead, reviewFromText } from "./lib/capture";
import { createStore, type TaskStore } from "./lib/db";
import { isOcrAvailable, OcrUnavailable } from "./lib/ocr";
import { clearShared, onShareReceived, takeShared, type SharePayload } from "./lib/share-target";
import { ensureModel } from "./lib/entities";
import { reportText } from "./lib/report";
import {
  asBulkExport,
  isCollectingSamples,
  sampleFrom,
  setCollectingSamples,
  verdictFor,
} from "./lib/samples";
import type { Sample } from "./types";
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
  const [samples, setSamples] = useState<Sample[]>([]);
  const [collecting, setCollecting] = useState(isCollectingSamples);

  const refresh = useCallback(async (from: TaskStore) => {
    const [nextTasks, nextPending, nextSamples] = await Promise.all([
      from.listTasks(),
      from.listPending(),
      from.listSamples(),
    ]);
    setTasks(nextTasks);
    setPending(nextPending);
    setSamples(nextSamples);
  }, []);

  /**
   * Keep anything with something to teach.
   *
   * Silent by design: the point of collecting in bulk is that it costs the
   * user nothing at the moment of capture.
   */
  const remember = useCallback(
    async (from: TaskStore, review: PendingReview, outcome: "kept" | "dismissed", finalText?: string) => {
      if (!isCollectingSamples()) return;
      const verdict = verdictFor(review, outcome, finalText);
      if (!verdict) return;
      await from.addSample(sampleFrom(review, verdict, finalText));
    },
    [],
  );

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

  useEffect(() => {
    // Nothing waits on this. Until it lands, the rules do all the work.
    void ensureModel();
  }, []);

  const acceptShare = useCallback(
    async (payload: SharePayload) => {
      if (!store) return;
      setBusy(true);
      try {
        const review = await captureFromShare(payload);
        await store.addPending(review);
        await clearShared();
        await refresh(store);
      } catch (error) {
        // A share that reads as nothing is still consumed: leaving it queued
        // would offer the same dud every time the app is opened.
        await clearShared();
        setNote(error instanceof NothingToRead ? "Nothing to read in that." : "That didn't work.");
      } finally {
        setBusy(false);
      }
    },
    [refresh, store],
  );

  // Shares arrive two ways: on the intent that launched the app, and as an
  // event when it was already running. Coming back to the foreground is
  // checked too, since that is when a share can have been missed.
  useEffect(() => {
    if (!store) return;
    let handle: Awaited<ReturnType<typeof onShareReceived>>;
    let cancelled = false;

    const check = async () => {
      const payload = await takeShared();
      if (payload && !cancelled) await acceptShare(payload);
    };

    void check();
    void onShareReceived((payload) => void acceptShare(payload)).then((registered) => {
      if (cancelled) void registered?.remove();
      else handle = registered;
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      void handle?.remove();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [acceptShare, store]);

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
    await remember(store, review, "kept", text);
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
    await remember(store, review, "dismissed");
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

  async function exportSamples() {
    if (samples.length === 0) return;
    try {
      await reportText(asBulkExport(samples), "ZenTask capture log");
      setNote(`Sent ${samples.length}.`);
    } catch {
      setNote("Couldn't share that.");
    }
  }

  async function forgetSamples() {
    if (!store) return;
    await store.clearSamples();
    await refresh(store);
  }

  function toggleCollecting() {
    const next = !collecting;
    setCollectingSamples(next);
    setCollecting(next);
  }

  const open = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-32 pt-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">ZenTask</h1>
        <p className="mt-1 text-sm text-muted">
          Photograph it, or share it here. We'll turn it into the thing you have to do.
        </p>
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

      <section className="mt-10 border-t border-line pt-4 text-xs text-muted" aria-label="Improving it">
        <p>
          {collecting
            ? "Captures it gets wrong are kept on this phone so they can be fixed."
            : "Not keeping any captures."}
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button type="button" onClick={toggleCollecting} className="underline underline-offset-2">
            {collecting ? "stop keeping them" : "start keeping them"}
          </button>
          {samples.length > 0 && (
            <>
              <button type="button" onClick={() => void exportSamples()} className="underline underline-offset-2">
                send {samples.length}
              </button>
              <button type="button" onClick={() => void forgetSamples()} className="underline underline-offset-2">
                delete them
              </button>
            </>
          )}
        </div>
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
