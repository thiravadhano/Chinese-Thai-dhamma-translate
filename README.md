# 佛典譯場 — Buddhist Text Translator

เครื่องมือแปลคัมภีร์พุทธศาสตร์ภาษาจีนคลาสสิก → ภาษาไทย  
รองรับการทำงานแบบ **local** และ **deploy บน Cloudflare Pages**

## Tech Stack

- **Framework**: Astro 4 (SSR mode, Node adapter)
- **AI**: Claude claude-sonnet-4-20250514 via Anthropic SDK
- **DB**: SQLite (better-sqlite3) สำหรับ local / Cloudflare D1 สำหรับ deploy
- **Input**: วางข้อความ | Upload .txt/.docx | ดึงจาก CBETA API
- **Output**: Parallel view จีน-ไทย | Export JSON corpus

---

## Local Development

### 1. Clone & Install

```bash
git clone https://github.com/your-username/dhamma-translator
cd dhamma-translator
npm install
```

### 2. Environment

```bash
cp .env.example .env
# แก้ไข .env:
# ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run

```bash
npm run dev
# → http://localhost:4321
```

---

## Deploy บน Cloudflare Pages

### วิธีที่ 1: Git Push (แนะนำ)

```bash
# ใน Cloudflare Dashboard:
# Pages → Create project → Connect Git → เลือก repo นี้
# Build settings:
#   Framework preset: Astro
#   Build command:    npm run build
#   Output dir:      dist/
# Environment variables:
#   ANTHROPIC_API_KEY = sk-ant-...
```

เปลี่ยน `astro.config.mjs` ก่อน deploy:

```bash
npm install @astrojs/cloudflare
```

```js
// astro.config.mjs — สำหรับ Cloudflare
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
});
```

### วิธีที่ 2: Wrangler CLI

```bash
npm install -g wrangler
wrangler pages deploy dist/ --project-name dhamma-translator
```

### Cloudflare D1 (แทน SQLite)

```bash
# สร้าง D1 database
wrangler d1 create corpus-db

# ใน wrangler.toml:
# [[d1_databases]]
# binding = "corpus_db"
# database_name = "corpus-db"
# database_id = "xxxx"
```

---

## Workflow การแปล

```
1. ไปที่ /          → นำเข้าข้อความ (วาง / upload / CBETA)
2. ไปที่ /texts/[id] → กด "แปลทั้งหมด" หรือแปลทีละ segment
3. แก้ไขคำแปลได้โดยตรงบนหน้าจอ (contenteditable)
4. กด ↓ JSON        → download corpus
5. npm run export-corpus → export ทุก text ลง data/corpus-export/
```

---

## Corpus Export

```bash
npm run export-corpus
# → data/corpus-export/T1609.json
# → data/corpus-export/index.json
```

ไฟล์ JSON เหล่านี้ commit ลง git ได้  
(corpus.db อยู่ใน .gitignore)

---

## Project Structure

```
src/
├── pages/
│   ├── index.astro          # หน้านำเข้า
│   ├── texts/
│   │   ├── index.astro      # คลังข้อความ
│   │   └── [id].astro       # parallel view
│   └── api/
│       ├── ingest.ts        # POST: นำเข้าข้อความ
│       ├── translate.ts     # POST: แปลด้วย Claude
│       ├── segment.ts       # PATCH: แก้ไขคำแปล
│       └── export/[id].ts   # GET: download JSON
├── lib/
│   ├── db.ts                # SQLite CRUD
│   ├── segment.ts           # ตัดประโยค
│   ├── translate.ts         # Claude API
│   └── cbeta.ts             # CBETA Open API
└── layouts/
    └── Base.astro           # Layout หลัก
```
