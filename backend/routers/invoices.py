"""
Invoice API Router
"""
import asyncio
import logging
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import JSONResponse

from services.invoice_service import invoice_service
from services.llm_service import llm_service
from schemas import InvoiceResponse, BatchUploadResponse, UploadResponse, RetryRequest
from database import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/upload", response_model=UploadResponse)
async def upload_invoice(
    file: UploadFile = File(...),
    user_id: Optional[str] = Query(None)
):
    """Upload and process a single invoice file"""
    content = await file.read()
    try:
        result = await invoice_service.process_upload(
            file_content=content,
            filename=file.filename,
            mime_type=file.content_type,
            user_id=user_id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@router.post("/upload/batch", response_model=BatchUploadResponse)
async def upload_batch(
    files: List[UploadFile] = File(...),
    user_id: Optional[str] = Query(None)
):
    """Upload and process multiple invoice files concurrently"""
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 files per batch")

    async def process_file(f: UploadFile) -> UploadResponse:
        try:
            content = await f.read()
            return await invoice_service.process_upload(
                file_content=content,
                filename=f.filename,
                mime_type=f.content_type,
                user_id=user_id
            )
        except Exception as e:
            logger.error(f"Batch item failed {f.filename}: {e}")
            return UploadResponse(
                file_id="",
                status="error",
                message=str(e)
            )

    # Process all files concurrently (with max 5 at a time to avoid rate limits)
    semaphore = asyncio.Semaphore(5)

    async def bounded_process(f):
        async with semaphore:
            return await process_file(f)

    results = await asyncio.gather(*[bounded_process(f) for f in files])

    successful = sum(1 for r in results if r.status in ("success", "duplicate"))
    failed = len(results) - successful

    return BatchUploadResponse(
        total=len(files),
        successful=successful,
        failed=failed,
        results=list(results)
    )


@router.get("/", response_model=List[InvoiceResponse])
async def list_invoices(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    vendor: Optional[str] = Query(None),
    currency: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    """List invoices with filtering and pagination"""
    try:
        client = get_supabase()
        query = client.table("invoices").select(
            "id, file_id, invoice_number, invoice_date, due_date, vendor_name, "
            "vendor_address, vendor_email, buyer_name, subtotal, tax_amount, "
            "discount_amount, total_amount, currency, payment_terms, line_items, "
            "confidence_score, processing_status, is_duplicate, duplicate_of, "
            "normalized_vendor, extraction_method, error_message, created_at"
        )

        if vendor:
            query = query.ilike("vendor_name", f"%{vendor}%")
        if currency:
            query = query.eq("currency", currency.upper())
        if status:
            query = query.eq("processing_status", status)
        if search:
            query = query.or_(
                f"invoice_number.ilike.%{search}%,vendor_name.ilike.%{search}%,buyer_name.ilike.%{search}%"
            )

        result = query.order("created_at", desc=True).range(skip, skip + limit - 1).execute()
        return result.data or []
    except Exception as e:
        logger.error(f"List invoices failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(invoice_id: str):
    """Get a single invoice by ID"""
    try:
        client = get_supabase()
        result = client.table("invoices").select("*").eq("id", invoice_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{invoice_id}/retry", response_model=UploadResponse)
async def retry_invoice(invoice_id: str):
    """Retry processing for a failed invoice"""
    result = await invoice_service.retry_processing(invoice_id)
    if result.status == "error":
        raise HTTPException(status_code=500, detail=result.message)
    return result


@router.post("/normalize-vendors")
async def normalize_vendors():
    """Batch normalize all vendor names using LLM"""
    try:
        client = get_supabase()

        # Get unique vendor names
        result = client.table("invoices").select("id, vendor_name").is_(
            "normalized_vendor", "null"
        ).not_.is_("vendor_name", "null").execute()

        if not result.data:
            return {"message": "No vendors to normalize", "count": 0}

        vendors = list(set(r["vendor_name"] for r in result.data if r["vendor_name"]))
        # Process in batches of 20
        normalized_map = {}
        for i in range(0, len(vendors), 20):
            batch = vendors[i:i+20]
            batch_result = await llm_service.normalize_vendors(batch)
            normalized_map.update(batch_result)

        # Update invoices
        updated = 0
        for record in result.data:
            vendor = record["vendor_name"]
            normalized = normalized_map.get(vendor)
            if normalized and normalized != vendor:
                client.table("invoices").update(
                    {"normalized_vendor": normalized}
                ).eq("id", record["id"]).execute()
                updated += 1

        return {"message": f"Normalized {updated} invoices", "count": updated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{invoice_id}")
async def delete_invoice(invoice_id: str):
    """Delete an invoice"""
    try:
        client = get_supabase()
        client.table("invoices").delete().eq("id", invoice_id).execute()
        return {"message": "Invoice deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
