import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Copy, RotateCcw, Loader2, AlertTriangle,
  Building2, User, Calendar, DollarSign, Hash,
  FileText, Layers, CheckCircle2, ExternalLink
} from 'lucide-react'
import toast from 'react-hot-toast'
import { invoiceApi } from '../utils/api'
import type { Invoice } from '../utils/types'
import {
  formatCurrency, formatDate, confidenceColor,
  confidenceLabel, statusBadgeClass, truncate
} from '../utils/helpers'
import clsx from 'clsx'

function Field({ label, value, mono = false, icon: Icon }: {
  label: string; value?: string | number | null; mono?: boolean; icon?: any
}) {
  if (!value) return null
  return (
    <div className="space-y-1">
      <label className="label flex items-center gap-1">
        {Icon && <Icon size={11} />}
        {label}
      </label>
      <p className={clsx('text-sm text-ink-100', mono && 'font-mono')}>{String(value)}</p>
    </div>
  )
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (!id) return
    invoiceApi.get(id)
      .then((r) => setInvoice(r.data))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const handleRetry = async () => {
    if (!id) return
    setRetrying(true)
    try {
      await invoiceApi.retry(id)
      toast.success('Reprocessing complete')
      const r = await invoiceApi.get(id)
      setInvoice(r.data)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRetrying(false)
    }
  }

  const copyId = () => {
    navigator.clipboard.writeText(id || '')
    toast.success('ID copied')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="shimmer h-8 w-48 rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => <div key={i} className="shimmer h-32 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="text-center py-20">
        <p className="text-ink-400">Invoice not found</p>
        <button className="btn-secondary mt-4" onClick={() => navigate('/invoices')}>Back</button>
      </div>
    )
  }

  const conf = invoice.confidence_score ?? 0

  return (
    <div className="space-y-6 max-w-4xl fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            className="p-2 rounded-lg hover:bg-ink-800 text-ink-400"
            onClick={() => navigate('/invoices')}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-ink-50">
              Invoice {invoice.invoice_number || <span className="text-ink-500">No Number</span>}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={statusBadgeClass(invoice.processing_status)}>
                {invoice.processing_status}
              </span>
              {invoice.is_duplicate && (
                <span className="badge badge-yellow">
                  <AlertTriangle size={10} /> Duplicate
                </span>
              )}
              <button
                className="flex items-center gap-1 text-xs text-ink-600 hover:text-ink-400 font-mono"
                onClick={copyId}
              >
                {truncate(id, 12)}
                <Copy size={10} />
              </button>
            </div>
          </div>
        </div>
        {invoice.processing_status === 'error' && (
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Retry
          </button>
        )}
      </div>

      {/* Error message */}
      {invoice.error_message && (
        <div className="card p-4 border-red-900/50 bg-red-950/30">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-coral mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-coral">Processing Error</p>
              <p className="text-xs text-ink-400 mt-0.5">{invoice.error_message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Confidence */}
      <div className="card p-4 flex items-center gap-4">
        <div>
          <div className="label mb-1">Extraction Confidence</div>
          <div className="flex items-center gap-3">
            <div className="text-3xl font-bold font-mono" style={{ color: confidenceColor(conf) }}>
              {(conf * 100).toFixed(0)}%
            </div>
            <div>
              <div className="text-sm font-medium" style={{ color: confidenceColor(conf) }}>
                {confidenceLabel(conf)}
              </div>
              <div className="text-xs text-ink-500">{invoice.extraction_method}</div>
            </div>
          </div>
        </div>
        <div className="flex-1 confidence-bar h-2.5 rounded-full">
          <div
            className="confidence-fill h-full rounded-full"
            style={{ width: `${conf * 100}%`, background: confidenceColor(conf) }}
          />
        </div>
      </div>

      {/* Core data grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Vendor */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} className="text-acid" />
            <h2 className="font-semibold text-ink-100">Vendor / Seller</h2>
          </div>
          <div className="space-y-3">
            <Field label="Company Name" value={invoice.vendor_name} />
            {invoice.normalized_vendor && invoice.normalized_vendor !== invoice.vendor_name && (
              <Field label="Normalized Name" value={invoice.normalized_vendor} />
            )}
            <Field label="Address" value={invoice.vendor_address} />
            <Field label="Email" value={invoice.vendor_email} />
            <Field label="Tax ID / VAT" value={invoice.vendor_tax_id} mono />
          </div>
        </div>

        {/* Buyer */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={16} className="text-teal" />
            <h2 className="font-semibold text-ink-100">Buyer / Customer</h2>
          </div>
          <div className="space-y-3">
            <Field label="Name" value={invoice.buyer_name} />
            <Field label="Address" value={invoice.buyer_address} />
            <Field label="Email" value={invoice.buyer_email} />
          </div>
        </div>

        {/* Invoice info */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Hash size={16} className="text-blue-400" />
            <h2 className="font-semibold text-ink-100">Invoice Details</h2>
          </div>
          <div className="space-y-3">
            <Field label="Invoice Number" value={invoice.invoice_number} mono />
            <Field label="Invoice Date" value={formatDate(invoice.invoice_date)} />
            <Field label="Due Date" value={formatDate(invoice.due_date)} />
            <Field label="Payment Terms" value={invoice.payment_terms} />
            <Field label="Payment Method" value={invoice.payment_method} />
          </div>
        </div>

        {/* Amounts */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-acid" />
            <h2 className="font-semibold text-ink-100">Amounts</h2>
          </div>
          <div className="space-y-2">
            {invoice.subtotal != null && (
              <div className="flex justify-between py-2 border-b border-ink-800">
                <span className="text-sm text-ink-400">Subtotal</span>
                <span className="text-sm font-mono">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
              </div>
            )}
            {invoice.discount_amount != null && (
              <div className="flex justify-between py-2 border-b border-ink-800">
                <span className="text-sm text-ink-400">Discount</span>
                <span className="text-sm font-mono text-coral">-{formatCurrency(invoice.discount_amount, invoice.currency)}</span>
              </div>
            )}
            {invoice.tax_amount != null && (
              <div className="flex justify-between py-2 border-b border-ink-800">
                <span className="text-sm text-ink-400">Tax</span>
                <span className="text-sm font-mono">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between py-2">
              <span className="font-semibold text-ink-100">Total</span>
              <span className="font-bold font-mono text-acid text-lg">
                {formatCurrency(invoice.total_amount, invoice.currency)}
              </span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="text-xs text-ink-500">Currency</span>
              <span className="badge bg-ink-800 text-ink-300 border border-ink-700">
                {invoice.currency || 'USD'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Line items */}
      {invoice.line_items?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-ink-800">
            <Layers size={16} className="text-ink-400" />
            <h2 className="font-semibold text-ink-100">
              Line Items <span className="text-ink-500 font-normal text-sm">({invoice.line_items.length})</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-800">
                  <th className="th">Description</th>
                  <th className="th text-right">Qty</th>
                  <th className="th text-right">Unit Price</th>
                  <th className="th text-right">Tax %</th>
                  <th className="th text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map((item, i) => (
                  <tr key={i} className="border-b border-ink-800/50 hover:bg-ink-800/30">
                    <td className="td">
                      <div>{item.description || '—'}</div>
                      {item.sku && <div className="text-xs text-ink-500 font-mono mt-0.5">SKU: {item.sku}</div>}
                    </td>
                    <td className="td text-right font-mono">
                      {item.quantity != null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : '—'}
                    </td>
                    <td className="td text-right font-mono">
                      {formatCurrency(item.unit_price, invoice.currency)}
                    </td>
                    <td className="td text-right text-ink-400">
                      {item.tax_rate != null ? `${item.tax_rate}%` : '—'}
                    </td>
                    <td className="td text-right font-mono font-medium">
                      {formatCurrency(item.total, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes */}
      {invoice.notes && (
        <div className="card p-5">
          <h2 className="font-semibold text-ink-300 mb-2 text-sm uppercase tracking-wide">Notes</h2>
          <p className="text-sm text-ink-300">{invoice.notes}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="card p-5 bg-ink-900/50">
        <h2 className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3">Metadata</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-ink-600">Invoice ID</span>
            <span className="font-mono text-ink-400">{truncate(invoice.id, 16)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-600">Processed</span>
            <span className="text-ink-400">{formatDate(invoice.created_at)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-600">Method</span>
            <span className="text-ink-400 font-mono">{invoice.extraction_method || '—'}</span>
          </div>
          {invoice.is_duplicate && invoice.duplicate_of && (
            <div className="flex justify-between col-span-2">
              <span className="text-ink-600">Duplicate of</span>
              <button
                className="text-acid hover:underline font-mono"
                onClick={() => navigate(`/invoices/${invoice.duplicate_of}`)}
              >
                {truncate(invoice.duplicate_of, 16)} →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
