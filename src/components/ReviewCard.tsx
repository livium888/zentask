import { useState } from "react";
import type { PendingReview } from "@/types";
import { formatDue } from "@/lib/format";

/**
 * One capture, one decision.
 *
 * The proposed line is editable in place, so a wrong guess costs a correction
 * rather than a re-do, and the raw text stays one tap away — the extractor is
 * allowed to be wrong, but it is never allowed to hide what it read.
 */
export function ReviewCard({
  review,
  onConfirm,
  onDismiss,
}: {
  review: PendingReview;
  onConfirm: (review: PendingReview, text: string) => void;
  onDismiss: (review: PendingReview) => void;
}) {
  const [text, setText] = useState(review.proposedText);
  const [showRaw, setShowRaw] = useState(false);

  return (
    <li className="rounded-2xl border border-line bg-white/[0.03] p-4">
      {review.confidence === "low" && (
        <p className="mb-2 text-xs text-muted">
          Not sure about this one — worth a glance.
        </p>
      )}

      <label className="sr-only" htmlFor={`review-${review.id}`}>
        What should this say?
      </label>
      <input
        id={`review-${review.id}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="w-full bg-transparent text-lg leading-snug outline-none focus:underline"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>from a {review.source === "camera" ? "photo" : review.source}</span>
        {review.proposedDueAt !== undefined && (
          <span className="rounded-full bg-white/5 px-2 py-0.5">
            {formatDue(review.proposedDueAt)}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowRaw((open) => !open)}
          className="underline underline-offset-2"
        >
          {showRaw ? "hide what we read" : "what we read"}
        </button>
      </div>

      {showRaw && (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-xs text-muted">
          {review.rawText}
        </pre>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm(review, text)}
          disabled={text.trim().length === 0}
          className="flex-1 rounded-xl bg-accent px-4 py-3 font-medium text-ink disabled:opacity-40"
        >
          Keep it
        </button>
        <button
          type="button"
          onClick={() => onDismiss(review)}
          className="rounded-xl border border-line px-4 py-3 text-muted"
        >
          Not this
        </button>
      </div>
    </li>
  );
}
