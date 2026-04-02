import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Invoices from './pages/Invoices'
import InvoiceDetail from './pages/InvoiceDetail'
import Analytics from './pages/Analytics'
import Vendors from './pages/Vendors'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a1a2e',
            color: '#dddde8',
            border: '1px solid #3b3b57',
            borderRadius: '10px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#c8f135', secondary: '#06060d' } },
          error: { iconTheme: { primary: '#ff6b6b', secondary: '#06060d' } },
        }}
      />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="upload" element={<Upload />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="vendors" element={<Vendors />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
