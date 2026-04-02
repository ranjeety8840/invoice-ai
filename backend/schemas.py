"""
Pydantic schemas for request/response models
"""
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
import uuid


class ProcessingStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


class LineItem(BaseModel):
    description: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    total: Optional[float] = None
    tax_rate: Optional[float] = None
    sku: Optional[str] = None
    unit: Optional[str] = None

    class Config:
        extra = "allow"


class InvoiceData(BaseModel):
    """Structured invoice data extracted by LLM"""
    invoice_number: Optional[str] = Field(None, description="Invoice/bill number")
    invoice_date: Optional[str] = Field(None, description="Date of invoice (YYYY-MM-DD)")
    due_date: Optional[str] = Field(None, description="Payment due date (YYYY-MM-DD)")

    vendor_name: Optional[str] = Field(None, description="Seller/vendor company name")
    vendor_address: Optional[str] = None
    vendor_email: Optional[str] = None
    vendor_phone: Optional[str] = None
    vendor_tax_id: Optional[str] = None

    buyer_name: Optional[str] = Field(None, description="Buyer/customer name")
    buyer_address: Optional[str] = None
    buyer_email: Optional[str] = None

    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    discount_amount: Optional[float] = None
    total_amount: Optional[float] = Field(None, description="Total invoice amount")
    currency: Optional[str] = Field("USD", description="3-letter currency code")

    payment_terms: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None

    line_items: List[LineItem] = Field(default_factory=list)
    confidence_score: Optional[float] = Field(None, ge=0.0, le=1.0)

    @validator("currency")
    def normalize_currency(cls, v):
        if v:
            return v.upper().strip()[:3]
        return "USD"

    @validator("invoice_date", "due_date", pre=True)
    def parse_dates(cls, v):
        if not v:
            return None
        if isinstance(v, date):
            return str(v)
        # Accept common formats
        import re
        v = str(v).strip()
        if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            return v
        # Try to parse other formats
        for fmt in ["%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%B %d, %Y", "%b %d, %Y", "%d %B %Y"]:
            try:
                from datetime import datetime as dt
                return dt.strptime(v, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return v  # Return as-is if can't parse


class InvoiceResponse(BaseModel):
    id: str
    file_id: Optional[str]
    invoice_number: Optional[str]
    invoice_date: Optional[str]
    due_date: Optional[str]
    vendor_name: Optional[str]
    vendor_address: Optional[str]
    vendor_email: Optional[str]
    buyer_name: Optional[str]
    subtotal: Optional[float]
    tax_amount: Optional[float]
    discount_amount: Optional[float]
    total_amount: Optional[float]
    currency: Optional[str]
    payment_terms: Optional[str]
    line_items: List[Dict[str, Any]] = []
    confidence_score: Optional[float]
    processing_status: str
    is_duplicate: bool = False
    duplicate_of: Optional[str] = None
    normalized_vendor: Optional[str] = None
    extraction_method: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class UploadResponse(BaseModel):
    file_id: str
    invoice_id: Optional[str] = None
    status: str
    message: str
    file_url: Optional[str] = None


class BatchUploadResponse(BaseModel):
    total: int
    successful: int
    failed: int
    results: List[UploadResponse]


class AnalyticsSummary(BaseModel):
    total_invoices: int
    total_spend: float
    currencies: Dict[str, float]
    top_vendors: List[Dict[str, Any]]
    monthly_trend: List[Dict[str, Any]]
    currency_breakdown: List[Dict[str, Any]]
    duplicate_count: int
    avg_confidence: float


class FormatTemplate(BaseModel):
    id: str
    name: str
    vendor_name: Optional[str]
    usage_count: int
    accuracy_score: float
    created_at: str


class RetryRequest(BaseModel):
    invoice_id: str
    force_reprocess: bool = False
