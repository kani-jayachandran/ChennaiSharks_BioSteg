import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { documentService } from '../services/documentService'
import { Document } from '../types/document'
import {
  FileText,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  Download,
  Eye,
  Trash2,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sortBy, setSortBy] = useState<'createdAt' | 'title' | 'endTime'>('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    loadDocuments()
  }, [statusFilter])

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const response = await documentService.getDocuments(statusFilter || undefined, 50, 0)
      if (response.success) {
        setDocuments(response.documents)
      }
    } catch (error) {
      console.error('Failed to load documents:', error)
      toast.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDocument = async (documentId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
      return
    }

    try {
      const success = await documentService.deleteDocument(documentId)
      if (success) {
        setDocuments(documents.filter(doc => doc.id !== documentId))
        toast.success('Document deleted successfully')
      } else {
        toast.error('Failed to delete document')
      }
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('Failed to delete document')
    }
  }

  // Filter and sort documents
  const filteredAndSortedDocuments = documents
    .filter(doc => {
      const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           doc.originalFilename.toLowerCase().includes(searchTerm.toLowerCase())
      return matchesSearch
    })
    .sort((a, b) => {
      let aValue: any, bValue: any
      
      switch (sortBy) {
        case 'title':
          aValue = a.title.toLowerCase()
          bValue = b.title.toLowerCase()
          break
        case 'endTime':
          aValue = new Date(a.endTime).getTime()
          bValue = new Date(b.endTime).getTime()
          break
        default:
          aValue = new Date(a.createdAt).getTime()
          bValue = new Date(b.createdAt).getTime()
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

  if (loading) {
    return (
      <div className="p-6">
        <LoadingSpinner size="lg" text="Loading documents..." />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-gray-600 mt-1">Manage your encrypted documents</p>
        </div>
        <Link to="/upload" className="btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          Upload Document
        </Link>
      </div>

      {/* Filters and Search */}
      <div className="card">
        <div className="card-body">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="sm:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
              </select>
            </div>

            {/* Sort */}
            <div className="sm:w-48">
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('-')
                  setSortBy(field as any)
                  setSortOrder(order as any)
                }}
                className="input"
              >
                <option value="createdAt-desc">Newest First</option>
                <option value="createdAt-asc">Oldest First</option>
                <option value="title-asc">Title A-Z</option>
                <option value="title-desc">Title Z-A</option>
                <option value="endTime-asc">Expires Soon</option>
                <option value="endTime-desc">Expires Later</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Documents List */}
      {filteredAndSortedDocuments.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {documents.length === 0 ? 'No documents yet' : 'No documents match your search'}
            </h3>
            <p className="text-gray-600 mb-6">
              {documents.length === 0 
                ? 'Upload your first document to get started with secure storage.'
                : 'Try adjusting your search terms or filters.'
              }
            </p>
            {documents.length === 0 && (
              <Link to="/upload" className="btn-primary">
                <Plus className="w-4 h-4 mr-2" />
                Upload Document
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredAndSortedDocuments.map((document) => {
            const statusBadge = documentService.getStatusBadge(document)
            const isAccessible = documentService.isDocumentAccessible(document)
            
            return (
              <div key={document.id} className="card hover:shadow-md transition-shadow">
                <div className="card-body">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-medium text-gray-900 truncate">
                            {document.title}
                          </h3>
                          <p className="text-sm text-gray-500 truncate">
                            {document.originalFilename}
                          </p>
                        </div>
                        <span className={`badge ${statusBadge.className}`}>
                          {statusBadge.text}
                        </span>
                      </div>

                      {document.description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {document.description}
                        </p>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Size</p>
                          <p className="font-medium">
                            {documentService.formatFileSize(document.size)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Created</p>
                          <p className="font-medium">
                            {format(new Date(document.createdAt), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Access Window</p>
                          <p className="font-medium">
                            {format(new Date(document.startTime), 'MMM d')} - {format(new Date(document.endTime), 'MMM d')}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Time Remaining</p>
                          <p className={`font-medium ${isAccessible ? 'text-success-600' : 'text-gray-600'}`}>
                            {document.timeRemaining ? documentService.formatTimeRemaining(document.timeRemaining) : 'Expired'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <Link
                        to={`/documents/${document.id}`}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDeleteDocument(document.id, document.title)}
                        className="p-2 text-gray-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isAccessible && (
                    <div className="mt-4 p-3 bg-success-50 border border-success-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-success-600" />
                          <span className="text-sm font-medium text-success-800">
                            Document is accessible now
                          </span>
                        </div>
                        <Link
                          to={`/documents/${document.id}`}
                          className="text-sm font-medium text-success-700 hover:text-success-800"
                        >
                          Access Document →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default DocumentsPage