# InvoiceAI — Intelligent Invoice Extraction Engine

> AI-powered invoice data extraction with OCR, LLM parsing, Supabase storage, and analytics dashboard.

---

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Quick Start (Local)](#quick-start-local)
5. [Supabase Setup](#supabase-setup)
6. [Environment Variables](#environment-variables)
7. [Deployment](#deployment)
8. [API Reference](#api-reference)
9. [Key Design Decisions](#key-design-decisions)
10. [Assumptions and Limitations](#assumptions-and-limitations)
11. [Potential Improvements](#potential-improvements)

---

## System Architecture

```
React Frontend (Vite + TypeScript)
  Upload | Invoices | Detail | Analytics | Vendors
         |
         | REST API (axios)
         v
FastAPI Backend
  /api/invoices   /api/analytics   /api/health
         |
  Invoice Processing Pipeline
    1. File Validation (magic bytes, size, type)
    2. Duplicate Check  (SHA256 hash of file)
    3. Supabase Storage Upload
    4. OCR:
         a. PDF embedded text  (free, instant)
         b. Tesseract OCR      (local fallback)
         c. OpenAI Vision      (cloud fallback)
    5. Format Detection (MD5 structural hash)
    6. LLM Parsing (GPT-4o / Claude):
         - 3-attempt retry
         - Regex emergency fallback
         - Confidence scoring
    7. Duplicate Invoice Check (number + vendor)
    8. Save to Supabase DB
    9. Learn/update format template
         |
         v
Supabase (PostgreSQL + Storage)
  Tables: users, uploaded_files, invoices, invoice_formats
  Storage: invoices/{file_id}.pdf|jpg|png
```

---

## Tech Stack

| Layer      | Technology                                 |
|------------|--------------------------------------------|
| Frontend   | React 18 + TypeScript + Vite               |
| Styling    | Tailwind CSS (custom dark design system)   |
| Charts     | Recharts                                   |
| Backend    | FastAPI + Python 3.11+                     |
| OCR        | Tesseract + PyMuPDF + OpenAI Vision        |
| LLM        | OpenAI GPT-4o (or Anthropic Claude)        |
| Database   | Supabase (PostgreSQL)                      |
| Storage    | Supabase Storage                           |
| Deploy BE  | Render                                     |
| Deploy FE  | Vercel                                     |

---

## Project Structure

```
invoice-ai/
├── backend/
│   ├── main.py                    # FastAPI app entrypoint
│   ├── config.py                  # Settings via pydantic-settings
│   ├── database.py                # Supabase client + SQL migration
│   ├── schemas.py                 # Pydantic request/response models
│   ├── requirements.txt
│   ├── render.yaml                # Render deployment config
│   ├── .env.example
│   ├── routers/
│   │   ├── invoices.py            # Upload, list, get, retry, delete
│   │   ├── analytics.py           # Summary, vendors, duplicates, formats
│   │   ├── files.py               # File metadata listing
│   │   └── health.py              # Health check
│   └── services/
│       ├── ocr_service.py         # Multi-strategy OCR pipeline
│       ├── llm_service.py         # LLM parsing + vendor normalization
│       └── invoice_service.py     # Full pipeline orchestration
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── vercel.json
    ├── .env.example
    └── src/
        ├── App.tsx                 # Router setup
        ├── main.tsx
        ├── index.css               # Global styles + design tokens
        ├── components/
        │   └── Layout.tsx          # Sidebar + top nav
        ├── pages/
        │   ├── Dashboard.tsx       # KPIs + charts + recent invoices
        │   ├── Upload.tsx          # Drag-drop + batch processing
        │   ├── Invoices.tsx        # Table with search/filter/pagination
        │   ├── InvoiceDetail.tsx   # Full invoice view + line items
        │   ├── Analytics.tsx       # Spend charts + currency breakdown
        │   └── Vendors.tsx         # Vendor groups + formats + duplicates
        └── utils/
            ├── api.ts              # Axios API client
            ├── types.ts            # TypeScript interfaces
            └── helpers.ts          # Formatters + utilities
```

---

## Quick Start (Local)

### Prerequisites
- Python 3.11+
- Node.js 18+
- Tesseract OCR (optional — OpenAI Vision is the fallback if not installed)
  - macOS: `brew install tesseract`
  - Ubuntu: `sudo apt install tesseract-ocr`
  - Windows: https://github.com/UB-Mannheim/tesseract/wiki

### 1. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — fill in SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY, OPENAI_API_KEY
uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/api/docs

### 2. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
# For local dev, leave VITE_API_URL empty (Vite proxy handles /api → localhost:8000)
npm run dev
```

Frontend: http://localhost:3000

### 3. Run database migration

In the **Supabase SQL Editor** (Dashboard → SQL Editor), paste and run the entire `MIGRATION_SQL` string from `backend/database.py`. This creates all required tables, indexes, and RLS policies.

---

## Supabase Setup

1. Create a project at https://supabase.com
2. Go to **Settings → API** and copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY`
3. Go to **Settings → Database** → connection string → `DATABASE_URL`
4. Run the SQL migration (step 3 above)
5. The `invoices` storage bucket is auto-created on first upload

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase anon public key |
| `SUPABASE_SERVICE_KEY` | Yes | service_role key (for storage writes) |
| `OPENAI_API_KEY` | Yes* | OpenAI key (*or use Anthropic) |
| `ANTHROPIC_API_KEY` | Yes* | Anthropic key (alternative to OpenAI) |
| `LLM_PROVIDER` | No | `openai` (default) or `anthropic` |
| `LLM_MODEL` | No | `gpt-4o` (default) |
| `OCR_PROVIDER` | No | `tesseract` (default) or `openai_vision` |
| `ALLOWED_ORIGINS` | No | Comma-separated frontend URLs for CORS |
| `MAX_FILE_SIZE_MB` | No | Default: 20 |
| `DEBUG` | No | `True` for dev, `False` for prod |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes (prod) | Full backend URL e.g. `https://invoice-ai.onrender.com` |

---

## Deployment

### IMPORTANT: What to change before deploying

**File: `backend/config.py`**
```python
# Line ~30 — update with your actual Vercel domain:
ALLOWED_ORIGINS: List[str] = os.getenv(
    "ALLOWED_ORIGINS",
    "https://YOUR-APP.vercel.app"   # <-- CHANGE THIS
).split(",")
```

**File: `frontend/vercel.json`**
```json
{
  "env": {
    "VITE_API_URL": "https://YOUR-BACKEND.onrender.com"  // <-- CHANGE THIS
  }
}
```

**File: `frontend/vite.config.ts`** (dev proxy target)
```ts
proxy: {
  '/api': {
    target: 'http://localhost:8000',  // fine for local dev
  }
}
```

---

### Backend → Render

1. Push code to GitHub
2. https://render.com → New Web Service
3. Connect repo, set **Root Directory** to `backend`
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Health check path: `/api/health`
7. Add all env vars in the Render dashboard

Note: Render free tier spins down after inactivity. Use Render paid ($7/mo) or a cron ping to keep it warm.

---

### Frontend → Vercel

1. https://vercel.com → New Project → Import GitHub repo
2. Root Directory: `frontend`
3. Framework: Vite (auto-detected)
4. Add env var: `VITE_API_URL` = your Render backend URL
5. Deploy

---

## API Reference

### Invoices
```
POST   /api/invoices/upload          Upload single invoice
POST   /api/invoices/upload/batch    Upload up to 20 invoices
GET    /api/invoices/                List invoices (filterable)
GET    /api/invoices/{id}            Get single invoice
POST   /api/invoices/{id}/retry      Retry failed invoice
DELETE /api/invoices/{id}            Delete invoice
POST   /api/invoices/normalize-vendors  Batch normalize vendor names
```

### Analytics
```
GET /api/analytics/summary           KPIs + trends
GET /api/analytics/vendor-groups     Auto-grouped by vendor
GET /api/analytics/duplicates        All duplicate invoices
GET /api/analytics/formats           Learned format templates
GET /api/analytics/spend-by-vendor   Spend per vendor
```

### System
```
GET /api/health     System health + service status
GET /api/files      Uploaded file metadata
```

Full interactive Swagger docs: `https://your-backend.onrender.com/api/docs`

---

## Key Design Decisions

**1. Three-tier OCR fallback chain**
PDF embedded text → Tesseract → OpenAI Vision. This prioritizes cost (free) over accuracy, with cloud fallback for hard cases. On Render (no Tesseract), only PDF text extraction + OpenAI Vision are used.

**2. LLM retry + regex emergency fallback**
The LLM parser retries up to 3 times with escalating instructions. If all LLM attempts fail (network error, malformed JSON), a regex fallback extracts at minimum: invoice number, total amount, date, and currency — ensuring partial data is always saved.

**3. Format detection via structural fingerprinting**
Instead of comparing raw text, we hash the presence/absence of ~15 structural label patterns (invoice #, bill to, subtotal, etc.) into an MD5 fingerprint. Matching fingerprints share format templates, letting the LLM receive vendor-specific hints on subsequent uploads, improving both accuracy and speed.

**4. Dual-level duplicate detection**
File-level (SHA256 of bytes) catches exact re-uploads instantly without any DB query. Invoice-level (invoice number + vendor name) catches re-processed versions of the same invoice or manually re-submitted invoices.

**5. Confidence score surfaced prominently**
The LLM self-rates confidence 0.0–1.0. This is displayed as a color-coded bar in both the list and detail views, helping users immediately identify which extractions need manual review without reading every field.

**6. Batch processing with bounded concurrency**
The `/upload/batch` endpoint processes up to 20 files, but limits to 5 concurrent LLM calls via asyncio.Semaphore to stay within OpenAI rate limits without implementing a full job queue.

---

## Assumptions and Limitations

| Item | Detail |
|---|---|
| Authentication | Not implemented — all data is accessible. Add Supabase Auth for production multi-tenant use |
| Invoice language | Optimized for English. Other languages work but confidence may be lower |
| Max pages | PDF processing capped at 10 pages per file |
| OCR on Render | Tesseract is NOT pre-installed on Render. Set `OCR_PROVIDER=openai_vision` in Render env vars |
| Currency | Defaults to USD when currency cannot be detected from the document |
| LLM cost | GPT-4o Vision costs ~$0.01–0.05 per invoice page depending on resolution |
| Supabase free tier | 500MB database, 1GB storage, 2GB bandwidth — sufficient for a demo with ~500 invoices |
| Concurrent uploads | Free tier APIs may throttle; paid tiers handle production volumes |

---

## Potential Improvements

**Near-term**
- Supabase Auth for multi-user isolation
- Field bounding-box highlighting on invoice image
- CSV/Excel export of extracted data
- ZIP batch upload (auto-extract and process all invoices inside)
- Email ingestion (parse invoices from email attachments)

**Medium-term**
- User correction feedback → retrain format templates
- Multi-language support with language detection
- Approval workflow for low-confidence invoices
- QuickBooks / Xero / SAP integration
- Mobile-responsive upload (camera capture)

**Long-term**
- Async job queue (Celery + Redis) for high-volume processing
- Vector search for similar invoices
- Anomaly detection (unusual amounts, new vendors)
- On-premise deployment with local LLM (Ollama)
- Fine-tuned extraction model on your invoice corpus
