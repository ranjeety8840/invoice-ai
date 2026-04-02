"""
LLM Parsing Service - Convert raw OCR text to structured invoice JSON
Supports: OpenAI GPT-4, Anthropic Claude
Includes: format detection, template reuse, confidence scoring
"""
import json
import logging
import re
from typing import Optional, Dict, Any, Tuple
import hashlib

from config import settings
from schemas import InvoiceData, LineItem

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# Master extraction prompt (engineered for maximum accuracy)
# ─────────────────────────────────────────────────────────────────
EXTRACTION_SYSTEM_PROMPT = """You are an expert invoice data extraction AI. 
Your job is to extract structured data from raw OCR text of invoices.

RULES:
1. Return ONLY a valid JSON object - no markdown, no explanation, no preamble.
2. Use null for fields that cannot be found (do not guess).
3. Dates MUST be in YYYY-MM-DD format. Convert all date formats.
4. Currency codes must be 3-letter ISO codes (USD, EUR, INR, GBP, etc.)
5. All monetary values must be numbers (float), not strings.
6. Extract ALL line items - even if there are many.
7. confidence_score: 0.0-1.0 based on how clearly the data was present.

FIELD INFERENCE RULES:
- If "total" appears with multiple values, use the LARGEST/FINAL total as total_amount
- If tax is shown as a percentage, calculate the actual amount
- Vendor = the company issuing the invoice (seller)
- Buyer = the company receiving the invoice (customer)
- Invoice number may be labeled as: Invoice #, Bill No., Reference, Ref No., Order ID
- Due date may be labeled as: Due Date, Payment Due, Pay By, Terms Net X (calculate if date given)

CONFIDENCE SCORING:
- 0.9-1.0: All major fields found clearly
- 0.7-0.9: Most fields found, minor ambiguity
- 0.5-0.7: Core fields found but some data unclear
- 0.3-0.5: Partial extraction, significant missing data
- 0.0-0.3: Very poor quality OCR or unclear document
"""

EXTRACTION_PROMPT_TEMPLATE = """Extract all invoice data from this OCR text and return a JSON object.

{format_hint}

OCR TEXT:
---
{ocr_text}
---

Return this exact JSON structure (use null for missing fields):
{{
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "vendor_name": "string or null",
  "vendor_address": "string or null",
  "vendor_email": "string or null",
  "vendor_phone": "string or null",
  "vendor_tax_id": "string or null",
  "buyer_name": "string or null",
  "buyer_address": "string or null",
  "buyer_email": "string or null",
  "subtotal": number or null,
  "tax_amount": number or null,
  "discount_amount": number or null,
  "total_amount": number or null,
  "currency": "USD",
  "payment_terms": "string or null",
  "payment_method": "string or null",
  "notes": "string or null",
  "line_items": [
    {{
      "description": "string",
      "quantity": number or null,
      "unit_price": number or null,
      "total": number or null,
      "tax_rate": number or null,
      "sku": "string or null",
      "unit": "string or null"
    }}
  ],
  "confidence_score": 0.85
}}"""

VENDOR_NORMALIZATION_PROMPT = """Normalize these vendor names to their canonical form.
Remove common suffixes (Inc, LLC, Ltd, Corp, Co.), fix typos, standardize capitalization.
Return ONLY a JSON object mapping original → normalized names.

Vendors: {vendors}
"""


class LLMParsingService:
    """LLM-powered invoice parser with format detection and template reuse"""

    def __init__(self):
        self._openai_client = None
        self._anthropic_client = None

    def _get_openai_client(self):
        if not self._openai_client:
            import openai
            self._openai_client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return self._openai_client

    def _get_anthropic_client(self):
        if not self._anthropic_client:
            import anthropic
            self._anthropic_client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        return self._anthropic_client

    def compute_format_hash(self, ocr_text: str) -> str:
        """
        Compute a hash of the invoice's structural features for format detection.
        Uses key structural patterns rather than raw text for similarity matching.
        """
        text_lower = ocr_text.lower()

        # Extract structural fingerprint: presence of key sections
        features = []

        # Label patterns that indicate format structure
        label_patterns = [
            r"invoice\s*#", r"bill\s*to", r"ship\s*to", r"purchase\s*order",
            r"tax\s*id", r"gst", r"vat", r"subtotal", r"total\s*due",
            r"payment\s*terms", r"due\s*date", r"item\s*description",
            r"qty|quantity", r"unit\s*price", r"amount"
        ]

        for pattern in label_patterns:
            features.append("1" if re.search(pattern, text_lower) else "0")

        # Column structure hint (presence of tabular data)
        lines = ocr_text.split("\n")
        has_table = any(
            len(line.split()) >= 4 and
            any(c.isdigit() for c in line)
            for line in lines
        )
        features.append("T" if has_table else "F")

        fingerprint = "".join(features)
        return hashlib.md5(fingerprint.encode()).hexdigest()[:16]

    def _clean_llm_response(self, text: str) -> str:
        """Strip markdown fences and extra whitespace from LLM response"""
        text = text.strip()
        # Remove ```json ... ``` or ``` ... ```
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
        text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
        return text.strip()

    async def parse_invoice(
        self,
        ocr_text: str,
        format_hint: Optional[str] = None,
        retry_count: int = 0
    ) -> Tuple[InvoiceData, str]:
        """
        Parse OCR text into structured InvoiceData.
        Returns (InvoiceData, raw_response_str)
        
        Retry logic: up to 3 attempts with escalating prompts
        """
        format_hint_text = ""
        if format_hint:
            format_hint_text = f"HINT - This invoice matches a known format: {format_hint}\nPay special attention to the fields and structure described."

        prompt = EXTRACTION_PROMPT_TEMPLATE.format(
            ocr_text=ocr_text[:8000],  # Limit to avoid token overflow
            format_hint=format_hint_text
        )

        # Add retry escalation
        if retry_count > 0:
            prompt += f"\n\nNOTE: This is retry attempt {retry_count}. Please be extra careful about JSON validity and field extraction. Focus on getting at least: vendor_name, total_amount, invoice_date, and invoice_number."

        raw_response = ""
        parsed_data = {}

        for attempt in range(3):
            try:
                raw_response = await self._call_llm(prompt)
                clean_response = self._clean_llm_response(raw_response)
                parsed_data = json.loads(clean_response)
                break
            except json.JSONDecodeError as e:
                logger.warning(f"JSON parse failed attempt {attempt + 1}: {e}")
                if attempt == 2:
                    # Last resort: extract what we can with regex
                    parsed_data = self._regex_fallback(ocr_text)
                    raw_response = f"FALLBACK_REGEX: {json.dumps(parsed_data)}"
            except Exception as e:
                logger.error(f"LLM call failed attempt {attempt + 1}: {e}")
                if attempt == 2:
                    parsed_data = self._regex_fallback(ocr_text)

        # Validate and build InvoiceData
        invoice_data = self._build_invoice_data(parsed_data)
        return invoice_data, raw_response

    async def _call_llm(self, prompt: str) -> str:
        """Call configured LLM provider"""
        if settings.LLM_PROVIDER == "anthropic" and settings.ANTHROPIC_API_KEY:
            return await self._call_anthropic(prompt)
        elif settings.OPENAI_API_KEY:
            return await self._call_openai(prompt)
        else:
            raise RuntimeError("No LLM API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.")

    async def _call_openai(self, prompt: str) -> str:
        client = self._get_openai_client()
        response = await client.chat.completions.create(
            model=settings.LLM_MODEL or "gpt-4o",
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            max_tokens=4000,
            temperature=0.1,  # Low temperature for deterministic extraction
            response_format={"type": "json_object"}  # Force JSON mode
        )
        return response.choices[0].message.content

    async def _call_anthropic(self, prompt: str) -> str:
        client = self._get_anthropic_client()
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            system=EXTRACTION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.content[0].text

    def _regex_fallback(self, text: str) -> Dict[str, Any]:
        """
        Emergency regex-based extraction when LLM fails completely.
        Extracts the most critical fields.
        """
        logger.warning("Using regex fallback extraction")
        result = {
            "confidence_score": 0.2,
            "line_items": [],
            "currency": "USD"
        }

        # Invoice number
        inv_match = re.search(
            r"(?:invoice|bill|ref)[\s#:.-]*([A-Z0-9-]{3,20})",
            text, re.IGNORECASE
        )
        if inv_match:
            result["invoice_number"] = inv_match.group(1)

        # Total amount - look for largest monetary value near "total"
        total_match = re.search(
            r"(?:total|amount\s+due|grand\s+total)[:\s$€£₹]*([0-9,]+\.?\d*)",
            text, re.IGNORECASE
        )
        if total_match:
            try:
                result["total_amount"] = float(total_match.group(1).replace(",", ""))
            except ValueError:
                pass

        # Date
        date_match = re.search(
            r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{2}[/-]\d{2})",
            text
        )
        if date_match:
            result["invoice_date"] = date_match.group(1)

        # Currency detection
        if re.search(r"€|EUR", text):
            result["currency"] = "EUR"
        elif re.search(r"£|GBP", text):
            result["currency"] = "GBP"
        elif re.search(r"₹|INR|Rs\.?", text):
            result["currency"] = "INR"

        return result

    def _build_invoice_data(self, data: Dict[str, Any]) -> InvoiceData:
        """Safely build InvoiceData from parsed dict with validation"""
        # Sanitize numeric fields
        for field in ["subtotal", "tax_amount", "discount_amount", "total_amount"]:
            if field in data and data[field] is not None:
                try:
                    if isinstance(data[field], str):
                        data[field] = float(data[field].replace(",", "").replace("$", "").strip())
                    else:
                        data[field] = float(data[field])
                    if data[field] < 0:
                        data[field] = abs(data[field])
                except (ValueError, TypeError):
                    data[field] = None

        # Build line items
        line_items = []
        for item in data.get("line_items", []):
            if isinstance(item, dict):
                try:
                    li = LineItem(**{k: v for k, v in item.items() if k in LineItem.__fields__})
                    line_items.append(li)
                except Exception:
                    pass
        data["line_items"] = line_items

        # Ensure confidence_score is valid
        cs = data.get("confidence_score", 0.5)
        try:
            cs = max(0.0, min(1.0, float(cs)))
        except (TypeError, ValueError):
            cs = 0.5
        data["confidence_score"] = cs

        try:
            return InvoiceData(**{k: v for k, v in data.items() if k in InvoiceData.__fields__})
        except Exception as e:
            logger.error(f"Failed to build InvoiceData: {e}, data: {data}")
            return InvoiceData(confidence_score=0.1)

    async def normalize_vendors(self, vendor_names: list) -> Dict[str, str]:
        """Batch normalize vendor names using LLM"""
        if not vendor_names:
            return {}

        prompt = VENDOR_NORMALIZATION_PROMPT.format(
            vendors=json.dumps(vendor_names)
        )
        try:
            response = await self._call_llm(prompt)
            clean = self._clean_llm_response(response)
            return json.loads(clean)
        except Exception as e:
            logger.error(f"Vendor normalization failed: {e}")
            return {v: v for v in vendor_names}


llm_service = LLMParsingService()
