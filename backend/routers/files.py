"""
Files and Health API Routers
"""
from fastapi import APIRouter, HTTPException, Query
from database import get_supabase
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/files")
async def list_files(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100)
):
    """List uploaded files with metadata"""
    try:
        client = get_supabase()
        result = client.table("uploaded_files").select(
            "id, original_name, file_url, file_size, mime_type, upload_status, created_at"
        ).order("created_at", desc=True).range(skip, skip + limit - 1).execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
