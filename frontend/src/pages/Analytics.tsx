import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, LineChart, Line, Legend
} from 'recharts'
import { analyticsApi } from '../utils/api'
import type { AnalyticsSummary } from '../utils/types'
import { formatCurrency, formatDateShort, confidenceColor } from '../utils/helpers'
import { RefreshCw, TrendingUp, PieChartIcon } from 'lucide-react'
import toast from 'react-hot-toast'

const COLORS = ['#c8f135', '#00d4aa', '#7c6af7', '#ff6b6b', '#fbbf24', '#60a5fa', '#f472b6', '#34d399']

const TooltipStyle = {
  contentStyle: {
    background: '#1a1a2e',
    border: '1px solid #3b3b57',
    borderRadius: '8px',
    fontSize: 12,
    color: '#dddde8',
  }
}

export default function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ start: '', end: '' })

  const load = async () => {
    setLoading(true)
    try {
      const res = await analyticsApi.summary({
        start_date: dateRange.start || undefined,
        end_date: dateRange.end || undefined,
      })
      setSummary(res.data)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [dateRange.start, dateRange.end])

  const vendorBarData = summary?.top_vendors?.slice(0, 8).map((v) => ({
    name: v.name.length > 16 ? v.name.slice(0, 16) + '…' : v.name,
    fullName: v.name,
    spend: v.total,
    count: v.count,
  })) ?? []

  const currencyPieData = summary?.currency_breakdown?.map((c, i) => ({
    name: c.currency,
    value: c.total,
    color: COLORS[i % COLORS.length],
  })) ?? []

  const monthlyData = summary?.monthly_trend?.map((m) => ({
    month: m.month,
    spend: m.total,
    invoices: m.count,
  })) ?? []

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload
      return (
        <div className="bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-xs">
          <div className="text-ink-300 font-medium mb-1">{d.fullName || d.name || d.month}</div>
          {payload.map((p: any) => (
            <div key={p.dataKey} className="flex justify-between gap-4">
              <span className="text-ink-500">{p.name}</span>
              <span className="font-mono" style={{ color: p.color }}>
                {p.dataKey === 'spend' || p.dataKey === 'value'
                  ? formatCurrency(p.value)
                  : p.value}
              </span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6 fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-50">Analytics</h1>
          <p className="text-sm text-ink-400 mt-1">Spend insights and invoice trends</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="input text-sm py-2 w-40"
              value={dateRange.start}
              onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))}
              placeholder="Start date"
            />
            <span className="text-ink-600">→</span>
            <input
              type="date"
              className="input text-sm py-2 w-40"
              value={dateRange.end}
              onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
              placeholder="End date"
            />
          </div>
          <button
            className="btn-secondary text-sm flex items-center gap-2 py-2"
            onClick={() => setDateRange({ start: '', end: '' })}
          >
            Clear
          </button>
          <button className="btn-secondary text-sm flex items-center gap-2 py-2" onClick={load}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Invoices', value: summary?.total_invoices ?? 0, suffix: '' },
          { label: 'Total Spend', value: formatCurrency(summary?.total_spend ?? 0), accent: true },
          { label: 'Duplicates', value: summary?.duplicate_count ?? 0, suffix: ' found' },
          {
            label: 'Avg Confidence',
            value: summary?.avg_confidence != null ? `${(summary.avg_confidence * 100).toFixed(0)}%` : '—',
            color: confidenceColor(summary?.avg_confidence)
          },
        ].map((k) => (
          <div key={k.label} className="stat-card">
            <span className="stat-label">{k.label}</span>
            <span
              className="text-2xl font-bold font-mono"
              style={{ color: k.color || (k.accent ? '#c8f135' : '#f0f0f5') }}
            >
              {loading ? <span className="shimmer inline-block w-20 h-7 rounded" /> : `${k.value}${k.suffix || ''}`}
            </span>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Monthly spend */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-acid" />
            <h2 className="section-title mb-0">Monthly Spend</h2>
          </div>
          {loading ? <div className="shimmer h-52 rounded-lg" /> : monthlyData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-ink-500 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a42" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#6a6a88', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6a6a88', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="spend" stroke="#c8f135" strokeWidth={2.5} dot={{ fill: '#c8f135', r: 3 }} name="spend" />
                <Line type="monotone" dataKey="invoices" stroke="#00d4aa" strokeWidth={1.5} dot={false} name="invoices" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Currency pie */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon size={16} className="text-teal" />
            <h2 className="section-title mb-0">By Currency</h2>
          </div>
          {loading ? <div className="shimmer h-52 rounded-lg" /> : currencyPieData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-ink-500 text-sm">No data</div>
          ) : (
            <div>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={currencyPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {currencyPieData.map((entry, i) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {currencyPieData.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                      <span className="text-ink-400">{c.name}</span>
                    </div>
                    <span className="font-mono text-ink-200">{formatCurrency(c.value, c.name)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top vendors bar */}
      <div className="card p-5">
        <h2 className="section-title mb-1">Top Vendors by Spend</h2>
        <p className="section-sub mb-4">Top 8 vendors ranked by total invoice amount</p>
        {loading ? <div className="shimmer h-64 rounded-lg" /> : vendorBarData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-ink-500 text-sm">No vendor data</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={vendorBarData} margin={{ top: 4, right: 4, left: -20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a42" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#6a6a88', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                angle={-30}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fill: '#6a6a88', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="spend" fill="#c8f135" radius={[4, 4, 0, 0]} name="spend" maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Currency breakdown table */}
      {summary?.currency_breakdown && summary.currency_breakdown.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-800">
            <h2 className="section-title mb-0">Currency-wise Totals</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-800">
                <th className="th">Currency</th>
                <th className="th text-right">Total Spend</th>
                <th className="th text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {summary.currency_breakdown.map((c) => {
                const total = summary.currency_breakdown.reduce((s, x) => s + x.total, 0)
                const share = total > 0 ? (c.total / total) * 100 : 0
                return (
                  <tr key={c.currency} className="table-row">
                    <td className="td">
                      <span className="badge bg-ink-800 text-ink-300 border border-ink-700">
                        {c.currency}
                      </span>
                    </td>
                    <td className="td text-right font-mono font-semibold">
                      {formatCurrency(c.total, c.currency)}
                    </td>
                    <td className="td text-right">
                      <div className="flex items-center justify-end gap-3">
                        <div className="confidence-bar w-20 h-1.5">
                          <div
                            className="confidence-fill h-full"
                            style={{ width: `${share}%`, background: '#c8f135' }}
                          />
                        </div>
                        <span className="text-xs text-ink-400 w-10 text-right">
                          {share.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
