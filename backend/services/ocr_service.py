"""
OCR Service - Extract raw text from invoice images/PDFs
Supports: Tesseract (local), OpenAI Vision (cloud), PDF text extraction
"""
import io
import base64
import logging
import subprocess
from typing import Optional, Tuple
from pathlib import Path

import pytesseract
from PIL import Image
import fitz  # PyMuPDF
import httpx

from config import settings

logger = logging.getLogger(__name__)


class OCRResult:
    def __init__(self, text: str, method: str, confidence: float = 0.0, pages: int = 1):
        self.text = text
        self.method = method
        self.confidence = confidence
        self.pages = pages


class OCRService:
    """Multi-strategy OCR with fallback chain"""

    def __init__(self):
        self.tesseract_available = self._check_tesseract()

    def _check_tesseract(self) -> bool:
        try:
            pytesseract.get_tesseract_version()
            logger.info("Tesseract is available")
            return True
        except Exception:
            logger.warning("Tesseract not available, will use OpenAI Vision")
            return False

    async def extract_text(self, file_content: bytes, mime_type: str, filename: str) -> OCRResult:
        """
        Main extraction entry point with fallback chain:
        1. For PDFs: try embedded text first (fastest, no OCR needed)
        2. For images/scanned PDFs: try Tesseract (if available)
        3. Fallback to OpenAI Vision (most accurate)
        """
        is_pdf = mime_type == "application/pdf" or filename.lower().endswith(".pdf")

        if is_pdf:
            result = await self._extract_pdf(file_content)
            if result and len(result.text.strip()) > 50:
                return result

        # Convert to images for OCR
        images = await self._to_images(file_content, mime_type, filename)
        if not images:
            raise ValueError("Could not convert file to images for OCR")

        # Try Tesseract first (free, local)
        if self.tesseract_available and settings.OCR_PROVIDER == "tesseract":
            try:
                return await self._tesseract_ocr(images)
            except Exception as e:
                logger.warning(f"Tesseract failed: {e}, falling back to OpenAI Vision")

        # Fallback to OpenAI Vision
        if settings.OPENAI_API_KEY:
            return await self._openai_vision_ocr(images)

        raise RuntimeError("No OCR method available. Set OPENAI_API_KEY or install Tesseract.")

    async def _extract_pdf(self, content: bytes) -> Optional[OCRResult]:
        """Extract embedded text from PDF (no OCR needed for digital PDFs)"""
        try:
            doc = fitz.open(stream=content, filetype="pdf")
            full_text = ""
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                full_text += page.get_text("text") + "\n\n"
            doc.close()

            if full_text.strip():
                return OCRResult(
                    text=full_text.strip(),
                    method="pdf_embedded_text",
                    confidence=0.95,
                    pages=len(doc) if hasattr(doc, '__len__') else 1
                )
        except Exception as e:
            logger.warning(f"PDF text extraction failed: {e}")
        return None

    async def _to_images(self, content: bytes, mime_type: str, filename: str) -> list:
        """Convert file content to list of PIL Images"""
        images = []
        try:
            if mime_type == "application/pdf" or filename.lower().endswith(".pdf"):
                doc = fitz.open(stream=content, filetype="pdf")
                for page_num in range(min(len(doc), 10)):  # Max 10 pages
                    page = doc.load_page(page_num)
                    mat = fitz.Matrix(2, 2)  # 2x zoom for better OCR
                    pix = page.get_pixmap(matrix=mat)
                    img_bytes = pix.tobytes("png")
                    images.append(Image.open(io.BytesIO(img_bytes)))
                doc.close()
            else:
                images.append(Image.open(io.BytesIO(content)))
        except Exception as e:
            logger.error(f"Image conversion failed: {e}")
        return images

    async def _tesseract_ocr(self, images: list) -> OCRResult:
        """Run Tesseract OCR on images"""
        texts = []
        confidences = []

        for img in images:
            # Preprocess: convert to grayscale, increase contrast
            img = img.convert("L")  # Grayscale

            data = pytesseract.image_to_data(
                img,
                output_type=pytesseract.Output.DICT,
                config="--oem 3 --psm 6"
            )

            text = pytesseract.image_to_string(
                img,
                config="--oem 3 --psm 6"
            )
            texts.append(text)

            # Calculate confidence from word-level data
            valid_conf = [int(c) for c in data["conf"] if int(c) > 0]
            if valid_conf:
                confidences.append(sum(valid_conf) / len(valid_conf))

        avg_confidence = sum(confidences) / len(confidences) / 100 if confidences else 0.5

        return OCRResult(
            text="\n\n--- PAGE BREAK ---\n\n".join(texts),
            method="tesseract",
            confidence=avg_confidence,
            pages=len(images)
        )

    async def _openai_vision_ocr(self, images: list) -> OCRResult:
        """Use OpenAI GPT-4 Vision for OCR (most accurate)"""
        import openai

        client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        all_texts = []
        for i, img in enumerate(images):
            # Convert PIL image to base64
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            img_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{img_b64}",
                                    "detail": "high"
                                }
                            },
                            {
                                "type": "text",
                                "text": (
                                    "Extract ALL text from this invoice image exactly as it appears. "
                                    "Preserve the layout structure. Include all numbers, dates, addresses, "
                                    "line items, totals, and any other text. Do not summarize."
                                )
                            }
                        ]
                    }
                ],
                max_tokens=4000
            )
            all_texts.append(response.choices[0].message.content)

        return OCRResult(
            text="\n\n--- PAGE BREAK ---\n\n".join(all_texts),
            method="openai_vision",
            confidence=0.92,
            pages=len(images)
        )


ocr_service = OCRService()
