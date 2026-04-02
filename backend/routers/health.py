"""
Health Check Router
"""
from fastapi import APIRouter
from config import settings
from database import get_supabase
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    checks = {
        "api": "ok",
        "supabase": "unknown",
        "llm": "unknown",
        "ocr": "unknown"
    }

    # Check Supabase
    try:
        client = get_supabase()
        client.table("invoices").select("id").limit(1).execute()
        checks["supabase"] = "ok"
    except Exception as e:
        checks["supabase"] = f"error: {str(e)[:50]}"

    # Check LLM
    if settings.OPENAI_API_KEY or settings.ANTHROPIC_API_KEY:
        checks["llm"] = f"configured ({settings.LLM_PROVIDER})"
    else:
        checks["llm"] = "not configured"

    # Check OCR
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        checks["ocr"] = "tesseract ok"
    except Exception:
        if settings.OPENAI_API_KEY:
            checks["ocr"] = "openai_vision fallback"
        else:
            checks["ocr"] = "not configured"

    overall = "ok" if all(v in ("ok",) or "ok" in str(v) or "configured" in str(v) or "fallback" in str(v) for v in checks.values()) else "degraded"

    return {
        "status": overall,
        "version": "1.0.0",
        "checks": checks,
        "llm_provider": settings.LLM_PROVIDER,
        "llm_model": settings.LLM_MODEL
    }
