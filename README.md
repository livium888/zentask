# ZenTask

A to-do app for people who do not have time to keep a to-do app.

Photograph a bill, an appointment card, a parcel slip, a letter with a deadline.
The picture is read on the device, turned into one line you can act on, and put
in front of you for a single tap. That is the whole product.

## What it deliberately does not have

No projects, no tags, no priorities, no folders, no filters, no sign-up.

Those features are the reason people abandon task apps: the work of maintaining
the system starts competing with the work the system was supposed to help with,
and when someone is busy the maintenance is the first thing they drop. Every
field here has to earn its place against that.

## How a capture becomes a task

1. **Read the picture.** ML Kit text recognition, on device. The Latin model
   ships inside the APK, so the first capture works with no download and no
   network.
2. **Extract a task.** Deterministic rules — dates and times, amounts,
   references — combined by a small set of recipes (`bill`, `appointment`,
   `expiry`, `parcel`, `action-line`). Instant, offline, free.
3. **Ask.** The proposal lands in a review queue with the text it came from one
   tap away. Nothing files itself.

When the rules cannot reduce a capture to something confident, the app says so
and hands you an editable line rather than inventing a task. An optional cloud
pass can take over that case later; the app is fully usable without it.

There is no on-device LLM. A ~500 MB first-run model download is precisely the
tax the intended user will not pay, and CPU inference in an Android WebView is
slow on the mid-range phones most people carry.

## Running it

```bash
bun install
bun run dev      # browser: UI and typing work, reading pictures does not
bun run test     # extraction, storage and formatting
bun run build    # typecheck + web build
```

Reading pictures needs the installed Android app — there is no on-device OCR
model in a browser.

## Getting an APK

Push to `main`, or run the **Build** workflow manually. It attaches
`zentask-debug-apk` to the run.

To build locally you need the Android SDK (platform 35 and build tools) and
JDK 21:

```bash
bun run android:apk   # → android/app/build/outputs/apk/debug/
```

## Storage

On device: SQLite (`@capacitor-community/sqlite`). In the browser: IndexedDB.
Both sit behind one `TaskStore` interface, with an in-memory implementation for
tests and as a fallback if a store fails to open. Nothing is sent anywhere.

## Layout

```
src/lib/extract/   dates, money, recipes — the rules, and their tests
src/lib/db/        TaskStore interface + sqlite / indexeddb / memory
src/lib/ocr.ts     ML Kit wrapper
src/lib/capture.ts camera or gallery → OCR → proposed task
src/components/    review card, task list
android/           committed so the manifest and permissions are reviewable
```
