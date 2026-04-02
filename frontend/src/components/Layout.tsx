import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Upload, FileText, BarChart3,
  Building2, Zap, Menu, X, Activity
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload', icon: Upload, label: 'Upload' },
  { to: '/invoices', icon: FileText, label: 'Invoices' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/vendors', icon: Building2, label: 'Vendors' },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed lg:relative inset-y-0 left-0 z-30 w-60 flex flex-col',
          'bg-ink-900 border-r border-ink-800 transition-transform duration-200',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-ink-800">
          <div className="w-8 h-8 rounded-lg bg-acid flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-bold text-ink-50 text-base leading-tight">InvoiceAI</div>
            <div className="text-[10px] text-ink-500 font-medium tracking-wide uppercase">Extraction Engine</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-acid/10 text-acid border border-acid/20'
                    : 'text-ink-400 hover:text-ink-100 hover:bg-ink-800'
                )
              }
            >
              <Icon size={16} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom status */}
        <div className="px-4 py-4 border-t border-ink-800">
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <Activity size={12} className="text-teal" />
            <span>API Connected</span>
          </div>
          <div className="text-[10px] text-ink-600 mt-0.5 font-mono">v1.0.0</div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-16 border-b border-ink-800 bg-ink-950 flex items-center px-5 gap-4 flex-shrink-0">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-ink-800 text-ink-400"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-500">InvoiceAI</span>
            <span className="text-ink-700">/</span>
            <span className="text-ink-200 capitalize font-medium">
              {location.pathname.split('/')[1] || 'Dashboard'}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <NavLink
              to="/upload"
              className="btn-primary text-sm flex items-center gap-2 py-2 px-4"
            >
              <Upload size={14} strokeWidth={2.5} />
              Upload Invoice
            </NavLink>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6 max-w-screen-xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
