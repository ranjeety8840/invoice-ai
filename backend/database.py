"""
Database module - Supabase client and initialization
"""
import logging
from supabase import create_client, Client
from config import settings

logger = logging.getLogger(__name__)

_supabase_client: Client = None


def get_supabase() -> Client:
    """Get or create Supabase client (anon key for regular ops)"""
    global _supabase_client
    if _supabase_client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")
        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _supabase_client


def get_supabase_admin() -> Client:
    """Get Supabase admin client (service_role key for admin ops)"""
    key = settings.SUPABASE_SERVICE_KEY or settings.SUPABASE_KEY
    return create_client(settings.SUPABASE_URL, key)


async def init_db():
    """Initialize database tables via Supabase"""
    logger.info("Checking Supabase connection...")
    try:
        client = get_supabase()
        # Quick connection test
        client.table("invoices").select("id").limit(1).execute()
        logger.info("Supabase connection OK")
    except Exception as e:
        logger.warning(f"Supabase tables may not exist yet. Run migrations. Error: {e}")


# ─────────────────────────────────────────────
# SQL MIGRATION (run once in Supabase SQL editor)
# ─────────────────────────────────────────────
MIGRATION_SQL = """
-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    full_name   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice formats (for format detection & reuse)
CREATE TABLE IF NOT EXISTS public.invoice_formats (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    vendor_name     TEXT,
    template_hash   TEXT UNIQUE,          -- hash of structural features
    parsing_template JSONB,               -- reusable field-extraction hints
    sample_fields   JSONB,               -- example field names/positions
    usage_count     INTEGER DEFAULT 1,
    accuracy_score  FLOAT DEFAULT 0.0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Uploaded files metadata
CREATE TABLE IF NOT EXISTS public.uploaded_files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES public.users(id) ON DELETE SET NULL,
    original_name   TEXT NOT NULL,
    file_path       TEXT NOT NULL,          -- Supabase Storage path
    file_url        TEXT,                   -- public URL
    file_size       BIGINT,
    mime_type       TEXT,
    checksum        TEXT,                   -- SHA256 for duplicate detection
    upload_status   TEXT DEFAULT 'pending', -- pending | processing | done | error
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices (extracted structured data)
CREATE TABLE IF NOT EXISTS public.invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id             UUID REFERENCES public.uploaded_files(id) ON DELETE CASCADE,
    format_id           UUID REFERENCES public.invoice_formats(id) ON DELETE SET NULL,
    
    -- Core invoice fields
    invoice_number      TEXT,
    invoice_date        DATE,
    due_date            DATE,
    vendor_name         TEXT,
    vendor_address      TEXT,
    vendor_email        TEXT,
    vendor_phone        TEXT,
    vendor_tax_id       TEXT,
    
    buyer_name          TEXT,
    buyer_address       TEXT,
    buyer_email         TEXT,
    
    subtotal            NUMERIC(15,2),
    tax_amount          NUMERIC(15,2),
    discount_amount     NUMERIC(15,2),
    total_amount        NUMERIC(15,2),
    currency            TEXT DEFAULT 'USD',
    
    payment_terms       TEXT,
    payment_method      TEXT,
    notes               TEXT,
    
    -- Line items stored as JSONB array
    line_items          JSONB DEFAULT '[]',
    
    -- Raw data
    raw_ocr_text        TEXT,
    raw_llm_response    JSONB,
    
    -- Meta
    confidence_score    FLOAT DEFAULT 0.0,
    extraction_method   TEXT,               -- 'tesseract+gpt4' etc.
    is_duplicate        BOOLEAN DEFAULT FALSE,
    duplicate_of        UUID REFERENCES public.invoices(id),
    processing_status   TEXT DEFAULT 'pending', -- pending | processing | done | error
    error_message       TEXT,
    
    -- Normalized vendor (after normalization pass)
    normalized_vendor   TEXT,
    
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON public.invoices(vendor_name);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_currency ON public.invoices(currency);
CREATE INDEX IF NOT EXISTS idx_invoices_file_id ON public.invoices(file_id);
CREATE INDEX IF NOT EXISTS idx_files_checksum ON public.uploaded_files(checksum);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_formats ENABLE ROW LEVEL SECURITY;

-- Permissive policies (adjust for multi-tenant auth later)
CREATE POLICY "Allow all" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.uploaded_files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON public.invoice_formats FOR ALL USING (true) WITH CHECK (true);
"""
