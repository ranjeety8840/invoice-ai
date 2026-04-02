import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, ChevronDown, ChevronRight, Loader2,
  RefreshCw, Wand2, Copy, AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { analyticsApi, invoiceApi } from '../utils/api'
import type { VendorGroup, FormatTemplate } from '../utils/types'
import { formatCurrency, formatDate } from '../utils/helpers'
import clsx from 'clsx'

export default function Vendors() {
  const [groups, setGroups] = useState<VendorGroup[]>([])
  const [formats, setFormats] = useState<FormatTemplate[]>([])
  const [duplicates, setDuplicates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [normalizing, setNormalizing] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'vendors' | 'formats' | 'duplicates'>('vendors')
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try {
      const [gRes, fRes, dRes] = await Promise.all([
        analyticsApi.vendorGroups(),
        analyticsApi.formats(),
        analyticsApi.duplicates(),
      ])
      setGroups(gRes.data)
      setFormats(fRes.data)
      setDuplicates(dRes.data)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleNormalize = async () => {
    setNormalizing(true)
    try {
      const res = await invoiceApi.normalizeVendors()
      toast.success(res.data.message)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setNormalizing(false)
    }
  }

  const toggleExpand = (vendor: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(vendor) ? next.delete(vendor) : next.add(vendor)
      return next
    })
  }

  return (
    <div className="space-y-5 fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-50">Vendors</h1>
          <p className="text-sm text-ink-400 mt-1">Auto-grouped vendors, format templates &amp; duplicates</p>
        </div>
        <div className="flex gap-3">
          <button
            className="btn-secondary text-sm flex items-center gap-2"
            onClick={handleNormalize}
            disabled={normalizing}
          >
            {normalizing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            Normalize Vendors
          </button>
          <button className="btn-secondary text-sm flex items-center gap-2" onClick={load}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-ink-900 rounded-xl w-fit border border-ink-800">
        {(['vendors', 'formats', 'duplicates'] as const).map((t) => (
          <button
            key={t}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t
                ? 'bg-ink-700 text-ink-50'
                : 'text-ink-400 hover:text-ink-200'
            )}
            onClick={() => setTab(t)}
          >
            {t === 'vendors' && `Vendor Groups (${groups.length})`}
            {t === 'formats' && `Format Templates (${formats.length})`}
            {t === 'duplicates' && `Duplicates (${duplicates.length})`}
          </button>
        ))}
      </div>

      {/* Vendor Groups */}
      {tab === 'vendors' && (
        <div className="space-y-2">
          {loading ? (
            Array(5).fill(0).map((_, i) => <div key={i} className="shimmer h-16 rounded-xl" />)
          ) : groups.length === 0 ? (
            <div className="card p-12 text-center">
              <Building2 size={40} className="mx-auto mb-3 text-ink-700" />
              <p className="text-ink-400">No vendor groups yet</p>
            </div>
          ) : groups.map((g) => (
            <div key={g.vendor} className="card overflow-hidden">
              <button
                className="w-full flex items-center gap-4 p-4 hover:bg-ink-800/50 transition-colors text-left"
                onClick={() => toggleExpand(g.vendor)}
              >
                <div className="w-9 h-9 rounded-lg bg-ink-800 border border-ink-700 flex items-center justify-center flex-shrink-0">
                  <Building2 size={16} className="text-ink-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ink-100">{g.vendor}</div>
                  <div className="text-xs text-ink-500 mt-0.5">
                    {g.invoice_count} invoice{g.invoice_count !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {Object.entries(g.total_spend).map(([curr, total]) => (
                    <div key={curr} className="text-right">
                      <div className="font-mono font-semibold text-ink-100">
                        {formatCurrency(total, curr)}
                      </div>
                      <div className="text-xs text-ink-500">{curr}</div>
                    </div>
                  ))}
                  {expanded.has(g.vendor)
                    ? <ChevronDown size={16} className="text-ink-500" />
                    : <ChevronRight size={16} className="text-ink-500" />
                  }
                </div>
              </button>

              {expanded.has(g.vendor) && (
                <div className="border-t border-ink-800 overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-ink-800/50">
                        <th className="th">Invoice #</th>
                        <th className="th">Date</th>
                        <th className="th">Amount</th>
                        <th className="th">Currency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.invoices.map((inv) => (
                        <tr
                          key={inv.id}
                          className="table-row cursor-pointer"
                          onClick={() => navigate(`/invoices/${inv.id}`)}
                        >
                          <td className="td font-mono text-xs">{inv.invoice_number || '—'}</td>
                          <td className="td text-ink-400">{formatDate(inv.date)}</td>
                          <td className="td font-mono font-medium">
                            {formatCurrency(inv.amount, inv.currency)}
                          </td>
                          <td className="td">
                            <span className="badge bg-ink-800 text-ink-400 border border-ink-700">
                              {inv.currency}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Format Templates */}
      {tab === 'formats' && (
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array(4).fill(0).map((_, i) => <div key={i} className="shimmer h-12 rounded" />)}
            </div>
          ) : formats.length === 0 ? (
            <div className="p-12 text-center text-ink-500">
              No format templates learned yet — they are auto-created as you upload invoices
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-800">
                  <th className="th">Template Name</th>
                  <th className="th">Vendor</th>
                  <th className="th text-right">Uses</th>
                  <th className="th text-right">Accuracy</th>
                  <th className="th">Created</th>
                </tr>
              </thead>
              <tbody>
                {formats.map((f) => (
                  <tr key={f.id} className="table-row">
                    <td className="td font-mono text-xs text-ink-300">{f.name}</td>
                    <td className="td">{f.vendor_name || '—'}</td>
                    <td className="td text-right">
                      <span className="badge-acid">{f.usage_count}</span>
                    </td>
                    <td className="td text-right">
                      <span className="font-mono text-sm" style={{ color: f.accuracy_score >= 0.8 ? '#00d4aa' : f.accuracy_score >= 0.6 ? '#c8f135' : '#fbbf24' }}>
                        {(f.accuracy_score * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="td text-ink-400">{formatDate(f.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Duplicates */}
      {tab === 'duplicates' && (
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array(3).fill(0).map((_, i) => <div key={i} className="shimmer h-12 rounded" />)}
            </div>
          ) : duplicates.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-teal text-4xl mb-3">✓</div>
              <p className="text-ink-300 font-medium">No duplicates detected</p>
              <p className="text-ink-500 text-sm mt-1">All invoices appear to be unique</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-ink-800 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                <span className="text-sm font-medium text-ink-200">
                  {duplicates.length} duplicate invoice{duplicates.length !== 1 ? 's' : ''} detected
                </span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink-800">
                    <th className="th">Invoice #</th>
                    <th className="th">Vendor</th>
                    <th className="th">Date</th>
                    <th className="th">Amount</th>
                    <th className="th">Original</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicates.map((d) => (
                    <tr
                      key={d.id}
                      className="table-row cursor-pointer"
                      onClick={() => navigate(`/invoices/${d.id}`)}
                    >
                      <td className="td font-mono text-xs">{d.invoice_number || '—'}</td>
                      <td className="td">{d.vendor_name || '—'}</td>
                      <td className="td text-ink-400">{formatDate(d.invoice_date)}</td>
                      <td className="td font-mono">{formatCurrency(d.total_amount, d.currency)}</td>
                      <td className="td">
                        {d.duplicate_of ? (
                          <button
                            className="text-xs text-acid hover:underline font-mono"
                            onClick={(e) => { e.stopPropagation(); navigate(`/invoices/${d.duplicate_of}`) }}
                          >
                            {d.duplicate_of.slice(0, 12)}…
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  )
}
