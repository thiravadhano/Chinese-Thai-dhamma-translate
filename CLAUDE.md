# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev           # Start dev server at http://localhost:4321
npm run build         # Production build
npm run preview       # Preview production build
npm run export-corpus # Export all translations to data/corpus-export/ as JSON
```

No test suite or linter is configured.

## Environment Setup

```bash
cp .env.example .env
# Set ANTHROPIC_API_KEY in .env
```

Optional: `CORPUS_DB_PATH` overrides the default SQLite location (`./data/corpus.db`).

## Architecture

**佛典譯場** is an Astro 4 SSR app (Node adapter locally, Cloudflare Pages for production) for translating Classical Chinese Buddhist sutras into Thai using Claude AI.

### Data Flow

```
User submits text (manual / .txt / .docx upload / CBETA API fetch)
  → POST /api/ingest → segmentText() → SQLite (texts + segments tables)
  → /texts/[id] parallel editor
  → POST /api/translate → Claude API → segments.th saved
  → GET /api/export/[id] → JSON file
```

### Key Libraries (`src/lib/`)

| File | Responsibility |
|------|---------------|
| `db.ts` | SQLite schema (better-sqlite3), CRUD for `texts` and `segments` |
| `segment.ts` | Splits prose on `。！？；`; detects verse blocks by full-width space `　` prefix |
| `translate.ts` | Claude API calls with Buddhist-term system prompt; passes last 2 Thai segments as context; 300ms batch delay |
| `cbeta.ts` | Fetches Classical Chinese texts from CBETA Data API, parses HTML to extract prose/verse |

### API Routes (`src/pages/api/`)

- `POST /api/ingest` — accepts form data, segments text, writes to DB
- `POST /api/translate` — translates one or all segments via Claude
- `PATCH /api/segment` — inline edit of translated text or status
- `GET /api/export/[id]` — download text as JSON corpus file

### UI Pages

- `/` — ingestion form (3 tabs: manual / upload / CBETA)
- `/texts` — corpus library with translation progress bars
- `/texts/[id]` — parallel view (Chinese left, Thai right); contenteditable inline editing with blur-triggered saves; status badges (`draft` / `reviewed` / `final`)

### Database Schema

**texts**: `id, title, source (upload|cbeta|manual), cbeta_id, created_at`

**segments**: `id, text_id (FK), seq, zh, th, notes (JSON), status (draft|reviewed|final), created_at, updated_at`
Index on `(text_id, seq)`.

### Design System

Layout in `src/layouts/Base.astro`. Color palette: ink `#1a1410`, gold `#b8943f`, parchment `#f5efe4`. Fonts: Noto Serif TC (Chinese), Noto Serif Thai, IM Fell English SC.

### Export

`npm run export-corpus` (runs `scripts/export-json.ts`) writes per-text JSON files to `data/corpus-export/` and an `index.json`. These files are intended to be committed to git as a version-controlled corpus (the SQLite file is gitignored).

### Deployment (Cloudflare Pages)

Switch adapter to `@astrojs/cloudflare` and replace better-sqlite3 with Cloudflare D1 binding. Environment variables are set in the Pages dashboard.
