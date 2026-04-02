import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, TrendingUp, Building2, AlertTriangle,
  ArrowRight, Sparkles, Upload, RefreshCw
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'
import { analyticsApi, invoiceApi } from '../utils/api'
import type { AnalyticsSummary, Invoice } from '../utils/types'
import { formatCurrency, formatDate, confidenceColor, confidenceLabel, statusBadgeClass, truncate } from '../utils/helpers'
import clsx from 'clsx'

function SkeletonCard() {
  return <div className="stat-card shimmer h-28 rounded-xl" />
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs">
        <div className="text-ink-400 mb-1">{label}</div>
        <div className="font-mono font-bold text-acid">
          {formatCurrency(payload[0].value)}
        </div>
        <div className="text-ink-500">{payload[1]?.value} invoices</div>
      </div>
    )
  }
  return null
}

export default function Dashboard() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [sumRes, invRes] = await Promise.all([
          analyticsApi.summary(),
          invoiceApi.list({ limit: 6 }),
        ])
        setSummary(sumRes.data)
        setRecentInvoices(invRes.data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const chartData = summary?.monthly_trend.map((m) => ({
    month: m.month,
    spend: m.total,
    count: m.count,
  })) ?? []

  return (
    <div className="space-y-6 stagger-children">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-50">Dashboard</h1>
          <p className="text-sm text-ink-400 mt-1">Invoice extraction overview</p>
        </div>
        <button
          className="btn-secondary flex items-center gap-2 text-sm"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="stat-label">Total Invoices</span>
                <FileText size={16} className="text-ink-500" />
              </div>
              <div className="stat-value">{summary?.total_invoices ?? 0}</div>
              <div className="text-xs text-ink-500 mt-1">
                {summary?.duplicate_count ?? 0} duplicates detected
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="stat-label">Total Spend</span>
                <TrendingUp size={16} className="text-ink-500" />
              </div>
              <div className="stat-value text-acid text-2xl">
                {formatCurrency(summary?.total_spend)}
              </div>
              <div className="text-xs text-ink-500 mt-1">
                Across {Object.keys(summary?.currencies ?? {}).length} currencies
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="stat-label">Vendors</span>
                <Building2 size={16} className="text-ink-500" />
              </div>
              <div className="stat-value">{summary?.top_vendors?.length ?? 0}</div>
              <div className="text-xs text-ink-500 mt-1">
                {summary?.top_vendors?.[0]?.name
                  ? `Top: ${truncate(summary.top_vendors[0].name, 20)}`
                  : 'No vendors yet'}
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="stat-label">Avg. Confidence</span>
                <Sparkles size={16} className="text-ink-500" />
              </div>
              <div className="stat-value" style={{ color: confidenceColor(summary?.avg_confidence) }}>
                {summary?.avg_confidence != null
                  ? `${(summary.avg_confidence * 100).toFixed(0)}%`
                  : '—'}
              </div>
              <div className="text-xs text-ink-500 mt-1">
                {confidenceLabel(summary?.avg_confidence)} accuracy
              </div>
            </div>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Monthly trend chart */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="section-title">Monthly Spend Trend</h2>
              <p className="section-sub">Invoice totals over time</p>
            </div>
          </div>
          {loading ? (
            <div className="shimmer h-48 rounded-lg" />
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-ink-500 text-sm">
              No data yet — upload some invoices to see trends
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c8f135" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#c8f135" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a42" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#6a6a88', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6a6a88', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="spend"
                  stroke="#c8f135"
                  strokeWidth={2}
                  fill="url(#spendGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top vendors */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Top Vendors</h2>
            <button
              className="text-xs text-acid hover:underline"
              onClick={() => navigate('/vendors')}
            >
              View all
            </button>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="shimmer h-10 rounded-lg" />
              ))}
            </div>
          ) : summary?.top_vendors?.length === 0 ? (
            <div className="text-ink-500 text-sm text-center py-8">No vendors yet</div>
          ) : (
            <div className="space-y-2">
              {summary?.top_vendors?.slice(0, 6).map((v, i) => (
                <div key={v.name} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-ink-600 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-200 truncate">{v.name}</div>
                    <div className="text-xs text-ink-500">{v.count} invoice{v.count !== 1 ? 's' : ''}</div>
                  </div>
                  <span className="text-sm font-mono text-ink-100 font-medium">
                    {formatCurrency(v.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent invoices */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800">
          <h2 className="section-title mb-0">Recent Invoices</h2>
          <button
            className="text-xs text-acid hover:underline flex items-center gap-1"
            onClick={() => navigate('/invoices')}
          >
            View all <ArrowRight size={12} />
          </button>
        </div>

        {loading ? (
          <div className="p-4 space-y-3">
            {Array(4).fill(0).map((_, i) => <div key={i} className="shimmer h-12 rounded-lg" />)}
          </div>
        ) : recentInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Upload size={40} className="text-ink-700" />
            <div className="text-center">
              <p className="text-ink-300 font-medium">No invoices yet</p>
              <p className="text-ink-500 text-sm mt-1">Upload your first invoice to get started</p>
            </div>
            <button className="btn-primary" onClick={() => navigate('/upload')}>
              Upload Invoice
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-800">
                  <th className="th">Invoice #</th>
                  <th className="th">Vendor</th>
                  <th className="th">Date</th>
                  <th className="th">Amount</th>
                  <th className="th">Confidence</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="table-row cursor-pointer"
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                  >
                    <td className="td font-mono text-xs text-ink-300">
                      {inv.invoice_number || <span className="text-ink-600">—</span>}
                    </td>
                    <td className="td">
                      <span className="font-medium">{truncate(inv.normalized_vendor || inv.vendor_name, 24) || '—'}</span>
                    </td>
                    <td className="td text-ink-400">{formatDate(inv.invoice_date)}</td>
                    <td className="td font-mono font-medium">
                      {formatCurrency(inv.total_amount, inv.currency)}
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="confidence-bar w-16">
                          <div
                            className="confidence-fill"
                            style={{
                              width: `${(inv.confidence_score ?? 0) * 100}%`,
                              background: confidenceColor(inv.confidence_score)
                            }}
                          />
                        </div>
                        <span className="text-xs text-ink-400">
                          {inv.confidence_score != null
                            ? `${(inv.confidence_score * 100).toFixed(0)}%`
                            : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="td">
                      <span className={statusBadgeClass(inv.processing_status)}>
                        {inv.processing_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
