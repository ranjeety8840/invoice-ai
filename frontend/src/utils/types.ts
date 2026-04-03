export interface LineItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
  tax_rate?: number;
  sku?: string;
  unit?: string;
}

export interface Invoice {
  id: string;
  file_id?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  vendor_name?: string;
  vendor_address?: string;
  vendor_email?: string;
  vendor_phone?: string;
  vendor_tax_id?: string;
  buyer_name?: string;
  buyer_address?: string;
  buyer_email?: string;
  subtotal?: number;
  tax_amount?: number;
  discount_amount?: number;
  total_amount?: number;
  currency?: string;
  payment_terms?: string;
  payment_method?: string;
  notes?: string;
  line_items: LineItem[];
  confidence_score?: number;
  processing_status: "pending" | "processing" | "done" | "error";
  is_duplicate: boolean;
  duplicate_of?: string;
  normalized_vendor?: string;
  extraction_method?: string;
  error_message?: string;
  created_at?: string;
}

export interface UploadResponse {
  file_id: string;
  invoice_id?: string;
  status: "success" | "error" | "duplicate";
  message: string;
  file_url?: string;
}

export interface BatchUploadResponse {
  total: number;
  successful: number;
  failed: number;
  results: UploadResponse[];
}

export interface AnalyticsSummary {
  total_invoices: number;
  total_spend: number;
  currencies: Record<string, number>;
  top_vendors: { name: string; total: number; count: number }[];
  monthly_trend: { month: string; total: number; count: number }[];
  currency_breakdown: { currency: string; total: number }[];
  duplicate_count: number;
  avg_confidence: number;
}

export interface VendorGroup {
  vendor: string;
  invoice_count: number;
  total_spend: Record<string, number>;
  invoices: {
    id: string;
    invoice_number?: string;
    date?: string;
    amount?: number;
    currency?: string;
  }[];
}

export interface FormatTemplate {
  id: string;
  name: string;
  vendor_name?: string;
  usage_count: number;
  accuracy_score: number;
  created_at: string;
}

export interface HealthStatus {
  status: string;
  version: string;
  checks: Record<string, string>;
  llm_provider: string;
  llm_model: string;
}
