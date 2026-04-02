import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Upload as UploadIcon, FileText, Image, X, CheckCircle,
  AlertCircle, Loader2, RefreshCw, ArrowRight, Package
} from 'lucide-react'
import clsx from 'clsx'
import { invoiceApi } from '../utils/api'
import type { UploadResponse } from '../utils/types'
import { formatFileSize } from '../utils/helpers'

interface FileItem {
  file: File
  id: string
  status: 'queued' | 'uploading' | 'done' | 'error' | 'duplicate'
  result?: UploadResponse
  error?: string
  progress?: number
}

const ACCEPTED = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/tiff': ['.tiff', '.tif'],
  'application/pdf': ['.pdf'],
}

function FileIcon({ mime }: { mime: string }) {
  if (mime === 'application/pdf') return <FileText size={18} className="text-red-400" />
  return <Image size={18} className="text-blue-400" />
}

function StatusIcon({ status }: { status: FileItem['status'] }) {
  switch (status) {
    case 'uploading': return <Loader2 size={16} className="text-acid animate-spin" />
    case 'done': return <CheckCircle size={16} className="text-teal" />
    case 'error': return <AlertCircle size={16} className="text-coral" />
    case 'duplicate': return <RefreshCw size={16} className="text-amber-400" />
    default: return <div className="w-4 h-4 rounded-full border-2 border-ink-600" />
  }
}

export default function Upload() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const navigate = useNavigate()

  const onDrop = useCallback((accepted: File[]) => {
    const newItems: FileItem[] = accepted.map((f) => ({
      file: f,
      id: Math.random().toString(36).slice(2),
      status: 'queued',
    }))
    setFiles((prev) => [...prev, ...newItems])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxSize: 20 * 1024 * 1024,
    onDropRejected: (rej) => {
      rej.forEach((r) => {
        const err = r.errors[0]
        toast.error(
          err.code === 'file-too-large'
            ? `${r.file.name}: File too large (max 20MB)`
            : `${r.file.name}: ${err.message}`
        )
      })
    },
  })

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const updateFile = (id: string, update: Partial<FileItem>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...update } : f)))
  }

  const processFiles = async () => {
    const queued = files.filter((f) => f.status === 'queued')
    if (!queued.length) return

    setIsProcessing(true)

    if (queued.length === 1) {
      // Single file
      const item = queued[0]
      updateFile(item.id, { status: 'uploading' })
      try {
        const res = await invoiceApi.upload(item.file)
        const data: UploadResponse = res.data
        updateFile(item.id, {
          status: data.status === 'error' ? 'error' : data.status === 'duplicate' ? 'duplicate' : 'done',
          result: data,
          error: data.status === 'error' ? data.message : undefined,
        })
        if (data.status !== 'error') {
          toast.success(`Processed: ${item.file.name}`)
        } else {
          toast.error(`Failed: ${data.message}`)
        }
      } catch (err: any) {
        updateFile(item.id, { status: 'error', error: err.message })
        toast.error(`${item.file.name}: ${err.message}`)
      }
    } else {
      // Batch: update all to uploading
      queued.forEach((f) => updateFile(f.id, { status: 'uploading' }))
      try {
        const res = await invoiceApi.uploadBatch(queued.map((f) => f.file))
        const data = res.data
        data.results.forEach((result: UploadResponse, i: number) => {
          const item = queued[i]
          if (!item) return
          updateFile(item.id, {
            status: result.status === 'error' ? 'error' : result.status === 'duplicate' ? 'duplicate' : 'done',
            result,
            error: result.status === 'error' ? result.message : undefined,
          })
        })
        toast.success(`Batch complete: ${data.successful}/${data.total} processed`)
      } catch (err: any) {
        queued.forEach((f) => updateFile(f.id, { status: 'error', error: err.message }))
        toast.error(`Batch failed: ${err.message}`)
      }
    }

    setIsProcessing(false)
  }

  const doneItems = files.filter((f) => f.status === 'done' || f.status === 'duplicate')
  const queuedCount = files.filter((f) => f.status === 'queued').length

  return (
    <div className="max-w-3xl mx-auto space-y-6 fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink-50">Upload Invoices</h1>
        <p className="text-sm text-ink-400 mt-1">
          Upload JPG, PNG, TIFF, WebP or PDF invoices. Supports batch processing up to 20 files.
        </p>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200',
          isDragActive
            ? 'border-acid bg-acid/5 drop-active'
            : 'border-ink-700 hover:border-ink-500 hover:bg-ink-900/50'
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-4">
          <div className={clsx(
            'w-16 h-16 rounded-2xl flex items-center justify-center transition-colors',
            isDragActive ? 'bg-acid/20' : 'bg-ink-800'
          )}>
            {isDragActive
              ? <Package size={28} className="text-acid" />
              : <UploadIcon size={28} className="text-ink-400" />
            }
          </div>
          <div>
            <p className="text-ink-100 font-semibold text-lg">
              {isDragActive ? 'Drop files here' : 'Drag & drop invoices'}
            </p>
            <p className="text-ink-500 text-sm mt-1">
              or <span className="text-acid underline underline-offset-2">browse files</span>
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {['PDF', 'JPG', 'PNG', 'TIFF', 'WebP'].map((ext) => (
              <span key={ext} className="badge bg-ink-800 text-ink-400 border border-ink-700">
                {ext}
              </span>
            ))}
            <span className="badge bg-ink-800 text-ink-400 border border-ink-700">Max 20MB</span>
          </div>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-800">
            <span className="text-sm font-medium text-ink-200">
              {files.length} file{files.length !== 1 ? 's' : ''} selected
            </span>
            <button
              className="text-xs text-ink-500 hover:text-ink-300"
              onClick={() => setFiles([])}
            >
              Clear all
            </button>
          </div>
          <ul className="divide-y divide-ink-800">
            {files.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <FileIcon mime={item.file.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-100 truncate font-medium">{item.file.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-ink-500">{formatFileSize(item.file.size)}</span>
                    {item.status === 'error' && (
                      <span className="text-xs text-coral">{item.error}</span>
                    )}
                    {item.status === 'duplicate' && (
                      <span className="text-xs text-amber-400">Duplicate detected</span>
                    )}
                    {item.status === 'done' && item.result?.invoice_id && (
                      <button
                        className="text-xs text-acid hover:underline"
                        onClick={() => navigate(`/invoices/${item.result!.invoice_id}`)}
                      >
                        View invoice →
                      </button>
                    )}
                  </div>
                </div>
                <StatusIcon status={item.status} />
                {item.status === 'queued' && (
                  <button
                    className="p-1 rounded hover:bg-ink-700 text-ink-500 hover:text-ink-300"
                    onClick={() => removeFile(item.id)}
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {files.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-ink-500">
            {queuedCount > 0 && (
              <span>{queuedCount} file{queuedCount !== 1 ? 's' : ''} ready to process</span>
            )}
          </div>
          <div className="flex gap-3">
            {doneItems.length > 0 && (
              <button
                className="btn-secondary flex items-center gap-2"
                onClick={() => navigate('/invoices')}
              >
                View All Invoices
                <ArrowRight size={14} />
              </button>
            )}
            {queuedCount > 0 && (
              <button
                className="btn-primary flex items-center gap-2"
                onClick={processFiles}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <Zap size={14} />
                    Process {queuedCount} Invoice{queuedCount !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="card p-5 bg-ink-900/50">
        <h3 className="text-sm font-semibold text-ink-300 mb-3">Tips for best results</h3>
        <ul className="space-y-1.5 text-xs text-ink-500">
          <li className="flex items-start gap-2">
            <span className="text-acid mt-0.5">•</span>
            Use high-resolution scans (300+ DPI) for printed invoices
          </li>
          <li className="flex items-start gap-2">
            <span className="text-acid mt-0.5">•</span>
            Digital PDFs (not scanned) give fastest &amp; most accurate results
          </li>
          <li className="flex items-start gap-2">
            <span className="text-acid mt-0.5">•</span>
            Batch upload up to 20 invoices at once for efficient processing
          </li>
          <li className="flex items-start gap-2">
            <span className="text-acid mt-0.5">•</span>
            Duplicate invoices are automatically detected and flagged
          </li>
        </ul>
      </div>
    </div>
  )
}

function Zap({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}
      stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}
