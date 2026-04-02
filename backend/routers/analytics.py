"""
Analytics API Router - aggregated insights from extracted invoice data
"""
import logging
from typing import Optional
from datetime import datetime, date
from fastapi import APIRouter, Query, HTTPException

from database import get_supabase
from schemas import AnalyticsSummary

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/summary", response_model=AnalyticsSummary)
async def get_summary(
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    currency: Optional[str] = Query(None)
):
    """Get analytics summary: totals, top vendors, trends"""
    try:
        client = get_supabase()

        # Base query filters
        query = client.table("invoices").select(
            "vendor_name, normalized_vendor, total_amount, currency, "
            "invoice_date, is_duplicate, confidence_score, processing_status"
        ).eq("processing_status", "done").eq("is_duplicate", False)

        if start_date:
            query = query.gte("invoice_date", start_date)
        if end_date:
            query = query.lte("invoice_date", end_date)
        if currency:
            query = query.eq("currency", currency.upper())

        result = query.execute()
        invoices = result.data or []

        # Total invoices
        total_invoices = len(invoices)

        # Total spend (all currencies)
        total_spend = sum(
            float(inv["total_amount"] or 0)
            for inv in invoices
            if inv["total_amount"] is not None
        )

        # Currency breakdown
        currency_totals = {}
        for inv in invoices:
            curr = inv.get("currency") or "USD"
            amt = float(inv.get("total_amount") or 0)
            currency_totals[curr] = currency_totals.get(curr, 0) + amt

        # Top vendors by spend
        vendor_totals = {}
        for inv in invoices:
            vendor = inv.get("normalized_vendor") or inv.get("vendor_name") or "Unknown"
            amt = float(inv.get("total_amount") or 0)
            if vendor not in vendor_totals:
                vendor_totals[vendor] = {"name": vendor, "total": 0, "count": 0}
            vendor_totals[vendor]["total"] += amt
            vendor_totals[vendor]["count"] += 1

        top_vendors = sorted(
            vendor_totals.values(),
            key=lambda x: x["total"],
            reverse=True
        )[:10]

        # Monthly trend
        monthly = {}
        for inv in invoices:
            d = inv.get("invoice_date")
            if d:
                try:
                    month_key = str(d)[:7]  # YYYY-MM
                    amt = float(inv.get("total_amount") or 0)
                    if month_key not in monthly:
                        monthly[month_key] = {"month": month_key, "total": 0, "count": 0}
                    monthly[month_key]["total"] += amt
                    monthly[month_key]["count"] += 1
                except Exception:
                    pass

        monthly_trend = sorted(monthly.values(), key=lambda x: x["month"])

        # Duplicate count
        dup_result = client.table("invoices").select("id", count="exact").eq(
            "is_duplicate", True
        ).execute()
        duplicate_count = dup_result.count or 0

        # Average confidence
        conf_values = [float(inv["confidence_score"] or 0) for inv in invoices if inv.get("confidence_score")]
        avg_confidence = sum(conf_values) / len(conf_values) if conf_values else 0

        return AnalyticsSummary(
            total_invoices=total_invoices,
            total_spend=round(total_spend, 2),
            currencies=currency_totals,
            top_vendors=top_vendors,
            monthly_trend=monthly_trend,
            currency_breakdown=[
                {"currency": k, "total": round(v, 2)}
                for k, v in sorted(currency_totals.items(), key=lambda x: x[1], reverse=True)
            ],
            duplicate_count=duplicate_count,
            avg_confidence=round(avg_confidence, 3)
        )
    except Exception as e:
        logger.error(f"Analytics summary failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vendor-groups")
async def get_vendor_groups():
    """Auto-group invoices by normalized vendor"""
    try:
        client = get_supabase()
        result = client.table("invoices").select(
            "id, vendor_name, normalized_vendor, total_amount, currency, invoice_date, invoice_number"
        ).eq("processing_status", "done").order("vendor_name").execute()

        groups = {}
        for inv in (result.data or []):
            vendor = inv.get("normalized_vendor") or inv.get("vendor_name") or "Unknown"
            if vendor not in groups:
                groups[vendor] = {
                    "vendor": vendor,
                    "invoice_count": 0,
                    "total_spend": {},
                    "invoices": []
                }
            groups[vendor]["invoice_count"] += 1
            curr = inv.get("currency", "USD")
            amt = float(inv.get("total_amount") or 0)
            groups[vendor]["total_spend"][curr] = groups[vendor]["total_spend"].get(curr, 0) + amt
            groups[vendor]["invoices"].append({
                "id": inv["id"],
                "invoice_number": inv.get("invoice_number"),
                "date": inv.get("invoice_date"),
                "amount": inv.get("total_amount"),
                "currency": curr
            })

        return sorted(groups.values(), key=lambda x: x["invoice_count"], reverse=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/duplicates")
async def get_duplicates():
    """List all detected duplicate invoices"""
    try:
        client = get_supabase()
        result = client.table("invoices").select(
            "id, invoice_number, vendor_name, total_amount, currency, invoice_date, duplicate_of, created_at"
        ).eq("is_duplicate", True).order("created_at", desc=True).execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/formats")
async def get_formats():
    """List learned invoice format templates"""
    try:
        client = get_supabase()
        result = client.table("invoice_formats").select(
            "id, name, vendor_name, usage_count, accuracy_score, created_at"
        ).order("usage_count", desc=True).execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/spend-by-vendor")
async def spend_by_vendor(currency: Optional[str] = Query(None)):
    """Total spend grouped by vendor"""
    try:
        client = get_supabase()
        query = client.table("invoices").select(
            "vendor_name, normalized_vendor, total_amount, currency"
        ).eq("processing_status", "done").eq("is_duplicate", False)

        if currency:
            query = query.eq("currency", currency.upper())

        result = query.execute()
        vendor_spend = {}
        for inv in (result.data or []):
            vendor = inv.get("normalized_vendor") or inv.get("vendor_name") or "Unknown"
            amt = float(inv.get("total_amount") or 0)
            curr = inv.get("currency", "USD")
            key = f"{vendor}_{curr}"
            if key not in vendor_spend:
                vendor_spend[key] = {"vendor": vendor, "currency": curr, "total": 0, "count": 0}
            vendor_spend[key]["total"] += amt
            vendor_spend[key]["count"] += 1

        return sorted(vendor_spend.values(), key=lambda x: x["total"], reverse=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
