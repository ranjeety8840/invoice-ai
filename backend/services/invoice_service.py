"""
Invoice Processing Service - Orchestrates the full pipeline:
File upload → OCR → LLM parsing → Validation → Storage → Format learning
"""
import hashlib
import io
import logging
import mimetypes
import uuid
from typing import Optional, Tuple, List
from pathlib import Path

from database import get_supabase, get_supabase_admin
from services.ocr_service import ocr_service
from services.llm_service import llm_service
from schemas import InvoiceData, UploadResponse
from config import settings

logger = logging.getLogger(__name__)

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/jpg", "image/png", "image/tiff",
    "image/webp", "application/pdf"
}

MAX_FILE_SIZE = settings.MAX_FILE_SIZE_MB * 1024 * 1024  # bytes


class InvoiceProcessingService:

    async def process_upload(
        self,
        file_content: bytes,
        filename: str,
        mime_type: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> UploadResponse:
        """Full pipeline: validate → upload → OCR → parse → store"""

        # 1. Validate file
        validated_mime = self._validate_file(file_content, filename, mime_type)

        # 2. Check for duplicates
        checksum = hashlib.sha256(file_content).hexdigest()
        existing = await self._check_duplicate_file(checksum)
        if existing:
            return UploadResponse(
                file_id=existing["file_id"],
                invoice_id=existing.get("invoice_id"),
                status="duplicate",
                message="This exact file has been uploaded before.",
                file_url=existing.get("file_url")
            )

        # 3. Upload to Supabase Storage
        file_id = str(uuid.uuid4())
        file_path, file_url = await self._upload_to_storage(
            file_content, file_id, filename, validated_mime
        )

        # 4. Save file metadata
        await self._save_file_metadata(
            file_id=file_id,
            user_id=user_id,
            original_name=filename,
            file_path=file_path,
            file_url=file_url,
            file_size=len(file_content),
            mime_type=validated_mime,
            checksum=checksum
        )

        # 5. Run OCR
        try:
            ocr_result = await ocr_service.extract_text(file_content, validated_mime, filename)
            logger.info(f"OCR completed: method={ocr_result.method}, confidence={ocr_result.confidence:.2f}")
        except Exception as e:
            logger.error(f"OCR failed for {filename}: {e}")
            await self._update_file_status(file_id, "error")
            return UploadResponse(
                file_id=file_id,
                status="error",
                message=f"OCR extraction failed: {str(e)}"
            )

        # 6. Detect format (for template reuse)
        format_hash = llm_service.compute_format_hash(ocr_result.text)
        format_hint, format_id = await self._get_format_hint(format_hash)

        # 7. Parse with LLM
        invoice_id = str(uuid.uuid4())
        try:
            invoice_data, raw_response = await llm_service.parse_invoice(
                ocr_result.text,
                format_hint=format_hint
            )
            logger.info(f"LLM parsing completed: confidence={invoice_data.confidence_score:.2f}")
        except Exception as e:
            logger.error(f"LLM parsing failed for {filename}: {e}")
            await self._save_invoice_error(invoice_id, file_id, str(e), ocr_result.text)
            return UploadResponse(
                file_id=file_id,
                invoice_id=invoice_id,
                status="error",
                message=f"LLM parsing failed: {str(e)}"
            )

        # 8. Check for duplicate invoice (same invoice number + vendor)
        is_dup, dup_of = await self._check_duplicate_invoice(
            invoice_data.invoice_number,
            invoice_data.vendor_name,
            invoice_data.total_amount
        )

        # 9. Save invoice to database
        extraction_method = f"{ocr_result.method}+{settings.LLM_PROVIDER}"
        await self._save_invoice(
            invoice_id=invoice_id,
            file_id=file_id,
            invoice_data=invoice_data,
            raw_ocr_text=ocr_result.text,
            raw_llm_response=raw_response,
            extraction_method=extraction_method,
            is_duplicate=is_dup,
            duplicate_of=dup_of,
            format_id=format_id
        )

        # 10. Update/learn format template
        await self._upsert_format_template(
            format_hash=format_hash,
            format_id=format_id,
            vendor_name=invoice_data.vendor_name,
            invoice_data=invoice_data
        )

        # 11. Mark file as done
        await self._update_file_status(file_id, "done")

        return UploadResponse(
            file_id=file_id,
            invoice_id=invoice_id,
            status="success",
            message="Invoice processed successfully",
            file_url=file_url
        )

    def _validate_file(self, content: bytes, filename: str, mime_type: Optional[str]) -> str:
        """Validate file size, type, and content"""
        if len(content) > MAX_FILE_SIZE:
            raise ValueError(f"File too large. Max size: {settings.MAX_FILE_SIZE_MB}MB")

        if len(content) < 100:
            raise ValueError("File appears to be empty or corrupted")

        # Determine MIME type
        if not mime_type or mime_type == "application/octet-stream":
            mime_type, _ = mimetypes.guess_type(filename)

        # Magic byte detection
        if content[:4] == b"%PDF":
            mime_type = "application/pdf"
        elif content[:2] in (b"\xff\xd8", b"\xff\xe0", b"\xff\xe1"):
            mime_type = "image/jpeg"
        elif content[:8] == b"\x89PNG\r\n\x1a\n":
            mime_type = "image/png"

        if mime_type not in ALLOWED_MIME_TYPES:
            ext = Path(filename).suffix.lower()
            if ext in [".jpg", ".jpeg"]:
                mime_type = "image/jpeg"
            elif ext == ".png":
                mime_type = "image/png"
            elif ext == ".pdf":
                mime_type = "application/pdf"
            else:
                raise ValueError(f"Unsupported file type: {mime_type}. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}")

        return mime_type

    async def _check_duplicate_file(self, checksum: str) -> Optional[dict]:
        """Check if exact same file was uploaded before"""
        try:
            client = get_supabase()
            result = client.table("uploaded_files").select(
                "id, file_url"
            ).eq("checksum", checksum).limit(1).execute()

            if result.data:
                file_record = result.data[0]
                # Find associated invoice
                inv_result = client.table("invoices").select("id").eq(
                    "file_id", file_record["id"]
                ).limit(1).execute()

                return {
                    "file_id": file_record["id"],
                    "invoice_id": inv_result.data[0]["id"] if inv_result.data else None,
                    "file_url": file_record.get("file_url")
                }
        except Exception as e:
            logger.warning(f"Duplicate file check failed: {e}")
        return None

    async def _upload_to_storage(
        self, content: bytes, file_id: str, filename: str, mime_type: str
    ) -> Tuple[str, str]:
        """Upload file to Supabase Storage"""
        ext = Path(filename).suffix.lower() or ".bin"
        storage_path = f"invoices/{file_id}{ext}"

        try:
            client = get_supabase_admin()
            bucket = settings.SUPABASE_STORAGE_BUCKET

            # Ensure bucket exists
            try:
                client.storage.get_bucket(bucket)
            except Exception:
                client.storage.create_bucket(bucket, options={"public": True})

            # Upload
            client.storage.from_(bucket).upload(
                path=storage_path,
                file=content,
                file_options={"content-type": mime_type}
            )

            # Get public URL
            url_response = client.storage.from_(bucket).get_public_url(storage_path)
            file_url = url_response if isinstance(url_response, str) else str(url_response)

            return storage_path, file_url
        except Exception as e:
            logger.error(f"Storage upload failed: {e}")
            # Return placeholder - don't fail the whole pipeline
            return storage_path, f"{settings.SUPABASE_URL}/storage/v1/object/public/{bucket}/{storage_path}"

    async def _save_file_metadata(self, **kwargs):
        try:
            client = get_supabase()
            client.table("uploaded_files").insert({
                "id": kwargs["file_id"],
                "user_id": kwargs.get("user_id"),
                "original_name": kwargs["original_name"],
                "file_path": kwargs["file_path"],
                "file_url": kwargs.get("file_url"),
                "file_size": kwargs.get("file_size"),
                "mime_type": kwargs.get("mime_type"),
                "checksum": kwargs.get("checksum"),
                "upload_status": "processing"
            }).execute()
        except Exception as e:
            logger.error(f"Failed to save file metadata: {e}")

    async def _update_file_status(self, file_id: str, status: str):
        try:
            client = get_supabase()
            client.table("uploaded_files").update(
                {"upload_status": status}
            ).eq("id", file_id).execute()
        except Exception as e:
            logger.warning(f"Failed to update file status: {e}")

    async def _get_format_hint(self, format_hash: str) -> Tuple[Optional[str], Optional[str]]:
        """Look up existing format template for hash"""
        try:
            client = get_supabase()
            result = client.table("invoice_formats").select(
                "id, name, vendor_name, parsing_template"
            ).eq("template_hash", format_hash).limit(1).execute()

            if result.data:
                fmt = result.data[0]
                hint = f"Vendor: {fmt.get('vendor_name', 'Unknown')}"
                if fmt.get("parsing_template"):
                    hint += f". Template hints: {fmt['parsing_template']}"
                return hint, fmt["id"]
        except Exception as e:
            logger.warning(f"Format hint lookup failed: {e}")
        return None, None

    async def _check_duplicate_invoice(
        self, invoice_number: Optional[str], vendor_name: Optional[str], total: Optional[float]
    ) -> Tuple[bool, Optional[str]]:
        """Check if this invoice was already processed (same number + vendor)"""
        if not invoice_number or not vendor_name:
            return False, None
        try:
            client = get_supabase()
            result = client.table("invoices").select("id").eq(
                "invoice_number", invoice_number
            ).ilike("vendor_name", f"%{vendor_name[:20]}%").limit(1).execute()

            if result.data:
                return True, result.data[0]["id"]
        except Exception as e:
            logger.warning(f"Duplicate invoice check failed: {e}")
        return False, None

    async def _save_invoice(self, invoice_id: str, file_id: str, invoice_data: InvoiceData,
                            raw_ocr_text: str, raw_llm_response: str, extraction_method: str,
                            is_duplicate: bool, duplicate_of: Optional[str], format_id: Optional[str]):
        """Save extracted invoice data to database"""
        try:
            import json
            client = get_supabase()

            line_items_json = [item.dict() for item in invoice_data.line_items]

            record = {
                "id": invoice_id,
                "file_id": file_id,
                "format_id": format_id,
                "invoice_number": invoice_data.invoice_number,
                "invoice_date": invoice_data.invoice_date,
                "due_date": invoice_data.due_date,
                "vendor_name": invoice_data.vendor_name,
                "vendor_address": invoice_data.vendor_address,
                "vendor_email": invoice_data.vendor_email,
                "vendor_phone": invoice_data.vendor_phone,
                "vendor_tax_id": invoice_data.vendor_tax_id,
                "buyer_name": invoice_data.buyer_name,
                "buyer_address": invoice_data.buyer_address,
                "buyer_email": invoice_data.buyer_email,
                "subtotal": invoice_data.subtotal,
                "tax_amount": invoice_data.tax_amount,
                "discount_amount": invoice_data.discount_amount,
                "total_amount": invoice_data.total_amount,
                "currency": invoice_data.currency or "USD",
                "payment_terms": invoice_data.payment_terms,
                "payment_method": invoice_data.payment_method,
                "notes": invoice_data.notes,
                "line_items": line_items_json,
                "raw_ocr_text": raw_ocr_text[:50000],  # Truncate very long texts
                "raw_llm_response": {"response": str(raw_llm_response)[:10000]},
                "confidence_score": invoice_data.confidence_score,
                "extraction_method": extraction_method,
                "is_duplicate": is_duplicate,
                "duplicate_of": duplicate_of,
                "processing_status": "done"
            }

            client.table("invoices").insert(record).execute()
            logger.info(f"Invoice {invoice_id} saved successfully")
        except Exception as e:
            logger.error(f"Failed to save invoice: {e}")
            raise

    async def _save_invoice_error(self, invoice_id: str, file_id: str, error: str, ocr_text: str = ""):
        try:
            client = get_supabase()
            client.table("invoices").insert({
                "id": invoice_id,
                "file_id": file_id,
                "processing_status": "error",
                "error_message": error[:1000],
                "raw_ocr_text": ocr_text[:10000],
                "currency": "USD"
            }).execute()
        except Exception as e:
            logger.error(f"Failed to save invoice error: {e}")

    async def _upsert_format_template(
        self, format_hash: str, format_id: Optional[str],
        vendor_name: Optional[str], invoice_data: InvoiceData
    ):
        """Update or create format template for future reuse"""
        try:
            client = get_supabase()

            if format_id:
                # Update usage count and accuracy
                client.table("invoice_formats").update({
                    "usage_count": client.table("invoice_formats").select("usage_count").eq("id", format_id).execute().data[0]["usage_count"] + 1,
                    "accuracy_score": invoice_data.confidence_score,
                    "vendor_name": vendor_name or "Unknown"
                }).eq("id", format_id).execute()
            else:
                # Create new format template
                fields_present = [
                    f for f in ["invoice_number", "invoice_date", "vendor_name",
                                "total_amount", "line_items", "tax_amount"]
                    if getattr(invoice_data, f, None) is not None
                ]
                client.table("invoice_formats").insert({
                    "name": f"Format-{vendor_name or 'Unknown'}-{format_hash[:6]}",
                    "vendor_name": vendor_name,
                    "template_hash": format_hash,
                    "parsing_template": {"fields_present": fields_present},
                    "accuracy_score": invoice_data.confidence_score,
                    "usage_count": 1
                }).execute()
        except Exception as e:
            logger.warning(f"Format template upsert failed: {e}")

    async def retry_processing(self, invoice_id: str) -> UploadResponse:
        """Retry failed invoice processing"""
        try:
            client = get_supabase()

            # Get invoice and file info
            inv_result = client.table("invoices").select(
                "*, uploaded_files(file_path, file_url, original_name, mime_type)"
            ).eq("id", invoice_id).single().execute()

            if not inv_result.data:
                raise ValueError(f"Invoice {invoice_id} not found")

            inv = inv_result.data
            file_info = inv.get("uploaded_files", {})

            # Download file from storage
            admin = get_supabase_admin()
            file_content = admin.storage.from_(
                settings.SUPABASE_STORAGE_BUCKET
            ).download(file_info["file_path"])

            # Reprocess
            invoice_data, raw_response = await llm_service.parse_invoice(
                inv.get("raw_ocr_text", ""),
                retry_count=1
            )

            # Update invoice record
            client.table("invoices").update({
                "invoice_number": invoice_data.invoice_number,
                "vendor_name": invoice_data.vendor_name,
                "total_amount": invoice_data.total_amount,
                "invoice_date": invoice_data.invoice_date,
                "confidence_score": invoice_data.confidence_score,
                "processing_status": "done",
                "error_message": None,
                "line_items": [item.dict() for item in invoice_data.line_items]
            }).eq("id", invoice_id).execute()

            return UploadResponse(
                file_id=inv["file_id"],
                invoice_id=invoice_id,
                status="success",
                message="Invoice reprocessed successfully"
            )
        except Exception as e:
            logger.error(f"Retry failed for {invoice_id}: {e}")
            return UploadResponse(
                file_id="",
                invoice_id=invoice_id,
                status="error",
                message=str(e)
            )


invoice_service = InvoiceProcessingService()
