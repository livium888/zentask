# OCR fixtures

Real text that came out of ML Kit on a real phone, with what the app should
have made of it. These are the only evidence we have that extraction works;
everything in `extract.test.ts` is text someone invented.

## Adding a failing capture

In the app, open the capture that went wrong and tap **Report this**. Share it
to yourself, then save it here as `something-descriptive.txt`. The shared text
is already in the right format and already carries what the app actually
produced — you only have to fill in what it *should* have produced and delete
the `observed` comment.

Leave `# status: pending` on a case that fails. Pending cases are reported by
`bun run score` but do not fail the build; they are the backlog. Moving one to
`# status: enforced` is what progress looks like.

## Format

```
# name: british gas bill
# now: 2026-09-08T10:00
# status: enforced
# expect-recipe: bill
# expect-title-contains: Pay £84.60
# expect-due: 2026-09-30
# expect-confidence: high
---
BRITISH GAS
Total amount due £84.60
Payment due by 30/09/2026
```

Every `expect-` header is optional; a case with none is a raw dump kept for
later labelling. `# expect-due: none` asserts that no date was found. `# now`
fixes the clock so relative dates ("tomorrow") stay stable.

Redact anything you would not want in a public repository — account numbers,
addresses, phone numbers. The extraction does not need them to be real, only
to be shaped the same.
