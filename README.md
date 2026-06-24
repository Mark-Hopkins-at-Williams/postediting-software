# MT Post-Editing Tool

A small post-editing UI for `data/ch2.mt.jsonl`-style files. Shows the English
`source_text` and the raw `mt_text`, and lets you type a post-edited
translation that's saved back to the same jsonl file as a new `pe_text`
field (plus `edited: true`). The original `mt_text` is never overwritten, so
you can always compare raw MT vs. post-edit later.

## Stack

Zero dependencies, no build step:

- **Backend**: `server.js` — plain Node `http`/`fs`, no Express.
- **Frontend**: `public/` — React, loaded from vendored UMD files
  (`public/vendor/`), written with `React.createElement` directly (no JSX,
  so no Babel/webpack/Vite needed).

This was a deliberate choice: this machine has no `npm`/package manager
available, so anything requiring `npm install` couldn't be installed or
tested here. If you have npm elsewhere and want a conventional Express +
Vite/React setup instead, this is easy to port to that later — just say so.

## Running it

Needs only a `node` binary (v16+):

```bash
node server.js
```

Then open http://localhost:5050.

By default it edits `data/ch2.mt.jsonl`. To point at a different file or
port:

```bash
DATA_FILE=/path/to/other.jsonl PORT=5050 node server.js
```

## How it works

- `GET /api/records` returns every line of the jsonl file, parsed as JSON.
- `PUT /api/records/<unit_id>` takes `{ "pe_text": "..." }`, finds the
  matching record by `unit_id`, sets `pe_text` and `edited: true`, and
  rewrites the whole jsonl file (one record's `unit_id` per request — file
  is small enough that a full rewrite per save is simplest and atomic; it
  writes to a `.tmp` file and renames over the original so a crash mid-save
  can't corrupt the dataset).
- The UI (sidebar + editor) is in `public/app.js`. Click any row in the
  sidebar to jump to it, or use Prev/Next. Ctrl/Cmd+Enter saves the current
  record. "Show only unedited" filters the sidebar to records without a
  `pe_text` yet.
