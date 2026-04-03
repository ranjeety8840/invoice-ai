import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Filter, RefreshCw, ChevronLeft, ChevronRight,
  AlertTriangle, Eye, Trash2, RotateCcw, Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { invoiceApi } from '../utils/api'
import type { Invoice } from '../utils/types'
import {
  formatCurrency, formatDate, confidenceColor,
  statusBadgeClass, truncate
} from '../utils/helpers'
import clsx from 'clsx'

const STATUSES = ['', 'done', 'processing', 'error', 'pending']
const CURRENCIES = ['', 'USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'SGD']

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [vendor, setVendor] = useState('')
  const [currency, setCurrency] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [retrying, setRetrying] = useState<string | null>(null)
  const navigate = useNavigate()
  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await invoiceApi.list({
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        vendor: vendor || undefined,
        currency: currency || undefined,
        status: status || undefined,
        search: search || undefined,
      })
      setInvoices(res.data)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, vendor, currency, status, search])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const handleRetry = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setRetrying(id)
    try {
      await invoiceApi.retry(id)
      toast.success('Reprocessing started')
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRetrying(null)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Delete this invoice?')) return
    try {
      await invoiceApi.delete(id)
      toast.success('Invoice deleted')
      setInvoices((prev) => prev.filter((inv) => inv.id !== id))
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-5 fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-50">Invoices</h1>
          <p className="text-sm text-ink-400 mt-1">
            All extracted invoice records
          </p>
        </div>
        <button
          className="btn-secondary flex items-center gap-2 text-sm"
          onClick={load}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"
            />
            <input
              className="input pl-9 py-2 text-sm"
              placeholder="Search invoices…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <input
            className="input w-40 py-2 text-sm"
            placeholder="Vendor filter"
            value={vendor}
            onChange={(e) => {
              setVendor(e.target.value);
              setPage(0);
            }}
          />
          <select
            className="input w-32 py-2 text-sm"
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              setPage(0);
            }}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c || "All currencies"}
              </option>
            ))}
          </select>
          <select
            className="input w-36 py-2 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || "All statuses"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array(8)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="shimmer h-12 rounded-lg" />
              ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-20 text-center text-ink-500">
            <Filter size={32} className="mx-auto mb-3 text-ink-700" />
            <p className="font-medium text-ink-300">No invoices found</p>
            <p className="text-sm mt-1">
              Try adjusting filters or upload more invoices
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-800">
                  <th className="th">Invoice #</th>
                  <th className="th">Vendor</th>
                  <th className="th">Date</th>
                  <th className="th">Due Date</th>
                  <th className="th">Amount</th>
                  <th className="th">Currency</th>
                  <th className="th">Confidence</th>
                  <th className="th">Status</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="table-row cursor-pointer"
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                  >
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-300">
                          {inv.invoice_number || "—"}
                        </span>
                        {inv.is_duplicate && (
                          <AlertTriangle
                            size={12}
                            className="text-amber-400 flex-shrink-0"
                          />
                        )}
                      </div>
                    </td>
                    <td className="td">
                      <div className="font-medium text-ink-100">
                        {truncate(
                          inv.normalized_vendor || inv.vendor_name,
                          26,
                        ) || "—"}
                      </div>
                    </td>
                    <td className="td text-ink-400">
                      {formatDate(inv.invoice_date)}
                    </td>
                    <td className="td text-ink-400">
                      {formatDate(inv.due_date)}
                    </td>
                    <td className="td font-mono font-semibold">
                      {formatCurrency(inv.total_amount, inv.currency)}
                    </td>
                    <td className="td">
                      <span className="badge bg-ink-800 text-ink-400 border border-ink-700">
                        {inv.currency || "USD"}
                      </span>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="confidence-bar w-14">
                          <div
                            className="confidence-fill"
                            style={{
                              width: `${(inv.confidence_score ?? 0) * 100}%`,
                              background: confidenceColor(inv.confidence_score),
                            }}
                          />
                        </div>
                        <span className="text-xs text-ink-400">
                          {inv.confidence_score != null
                            ? `${(inv.confidence_score * 100).toFixed(0)}%`
                            : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="td">
                      <span className={statusBadgeClass(inv.processing_status)}>
                        {inv.processing_status}
                      </span>
                    </td>
                    <td className="td" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          title="View"
                          className="p-1.5 rounded hover:bg-ink-700 text-ink-500 hover:text-ink-200"
                          onClick={() => navigate(`/invoices/${inv.id}`)}
                        >
                          <Eye size={14} />
                        </button>
                        {inv.processing_status === "error" && (
                          <button
                            title="Retry"
                            className="p-1.5 rounded hover:bg-ink-700 text-amber-500 hover:text-amber-300"
                            onClick={(e) => handleRetry(e, inv.id)}
                            disabled={retrying === inv.id}
                          >
                            {retrying === inv.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RotateCcw size={14} />
                            )}
                          </button>
                        )}
                        <button
                          title="Delete"
                          className="p-1.5 rounded hover:bg-red-900/30 text-ink-600 hover:text-coral"
                          onClick={(e) => handleDelete(e, inv.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-500">
          Page {page + 1} · {invoices.length} records
        </span>
        <div className="flex gap-2">
          <button
            className="btn-secondary py-2 px-3"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            className="btn-secondary py-2 px-3"
            onClick={() => setPage((p) => p + 1)}
            disabled={invoices.length < PAGE_SIZE}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
