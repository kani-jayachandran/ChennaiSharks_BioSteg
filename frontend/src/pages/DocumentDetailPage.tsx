import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { documentService } from '../services/documentService'
import { biometricService } from '../services/biometricService'
import { Document, DocumentAccessStatus } from '../types/document'
import {
  ArrowLeft,
  FileText,
  Calendar,
  Clock,
  Shield,
  Fingerprint,
  Download,
  Eye,
  AlertCircle,
  CheckCircle,
  Edit,
  Trash2,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const DocumentDetailPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>()
  const navigate = useNavigate()
  const [document, setDocument] = useState<Document | null>(null)
  const [accessStatus, setAccessStatus] = useState<DocumentAccessStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [isVerifying, setIsVerifying] = useState(false)
  const [hasWebAuthn, setHasWebAuthn] = useState(false)

  useEffect(() => {
    if (documentId) {
      loadDocumentData()
    }
    
    // Check WebAuthn support
    setHasWebAuthn(biometricService.isWebAuthnSupported())
  }, [documentId])

  const loadDocumentData = async () => {
    if (!documentId) return

    try {
      setLoading(true)
      
      // Load document details and access status in parallel
      const [docData, statusData] = await Promise.all([
        documentService.getDocument(documentId),
        documentService.getAccessStatus(documentId),
      ])

      if (docData) {
        setDocument(docData)
      } else {
        toast.error('Document not found')
        navigate('/documents')
        return
      }

      if (statusData) {
        setAccessStatus(statusData)
      }
    } catch (error) {
      console.error('Failed to load document:', error)
      toast.error('Failed to load document')
    } finally {
      setLoading(false)
    }
  }

  const handleBiometricVerification = async () => {
    if (!documentId || !hasWebAuthn) return

    try {
      setIsVerifying(true)
      
      const response = await biometricService.verifyBiometricAndAccessDocument(documentId)
      
      if (response.success && response.document) {
        toast.success('Document accessed successfully!')
        
        // Download the document
        biometricService.downloadDocument(
          response.document.data,
          response.document.originalFilename,
          response.document.originalMimetype
        )
      } else {
        toast.error(response.error || 'Biometric verification failed')
      }
    } catch (error: any) {
      console.error('Biometric verification error:', error)
      toast.error(error.message || 'Biometric verification failed')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleDeleteDocument = async () => {
    if (!document) return

    if (!confirm(`Are you sure you want to delete "${document.title}"? This action cannot be undone.`)) {
      return
    }

    try {
      const success = await documentService.deleteDocument(document.id)
      if (success) {
        toast.success('Document deleted successfully')
        navigate('/documents')
      } else {
        toast.error('Failed to delete document')
      }
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('Failed to delete document')
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <LoadingSpinner size="lg" text="Loading document..." />
      </div>
    )
  }

  if (!document) {
    return (
      <div className="p-6">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Document Not Found</h2>
          <p className="text-gray-600 mb-6">The document you're looking for doesn't exist or has been deleted.</p>
          <Link to="/documents" className="btn-primary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Documents
          </Link>
        </div>
      </div>
    )
  }

  const statusBadge = documentService.getStatusBadge(document)
  const isAccessible = accessStatus?.isAccessible || false

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/documents')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{document.title}</h1>
            <p className="text-gray-600">{document.originalFilename}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`badge ${statusBadge.className}`}>
            {statusBadge.text}
          </span>
          <button
            onClick={handleDeleteDocument}
            className="p-2 text-gray-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
            title="Delete document"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Document Info */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Document Information</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Title</p>
                <p className="text-gray-900">{document.title}</p>
              </div>
              
              {document.description && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Description</p>
                  <p className="text-gray-900">{document.description}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm font-medium text-gray-500">File Size</p>
                <p className="text-gray-900">{documentService.formatFileSize(document.size)}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500">Created</p>
                <p className="text-gray-900">{format(new Date(document.createdAt), 'PPpp')}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Access Window</p>
                <div className="space-y-1">
                  <p className="text-gray-900">
                    <strong>Start:</strong> {format(new Date(document.startTime), 'PPpp')}
                  </p>
                  <p className="text-gray-900">
                    <strong>End:</strong> {format(new Date(document.endTime), 'PPpp')}
                  </p>
                </div>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500">Time Remaining</p>
                <p className={`text-gray-900 ${isAccessible ? 'text-success-600' : ''}`}>
                  {document.timeRemaining ? documentService.formatTimeRemaining(document.timeRemaining) : 'Expired'}
                </p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-500">Status</p>
                <span className={`badge ${statusBadge.className}`}>
                  {statusBadge.text}
                </span>
              </div>
            </div>
          </div>

          {document.documentTextPreview && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-500 mb-2">Document Preview</p>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 line-clamp-4">
                  {document.documentTextPreview}...
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Access Status */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Access Status</h2>
        </div>
        <div className="card-body">
          {accessStatus ? (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border ${
                isAccessible 
                  ? 'bg-success-50 border-success-200' 
                  : 'bg-warning-50 border-warning-200'
              }`}>
                <div className="flex items-center space-x-3">
                  {isAccessible ? (
                    <CheckCircle className="w-6 h-6 text-success-600" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-warning-600" />
                  )}
                  <div>
                    <p className={`font-medium ${
                      isAccessible ? 'text-success-900' : 'text-warning-900'
                    }`}>
                      {accessStatus.message}
                    </p>
                    {isAccessible && (
                      <p className="text-sm text-success-700 mt-1">
                        You can now access this document using biometric authentication.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {isAccessible && (
                <div className="space-y-4">
                  {!hasWebAuthn ? (
                    <div className="p-4 bg-error-50 border border-error-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <AlertCircle className="w-5 h-5 text-error-600" />
                        <div>
                          <p className="text-sm font-medium text-error-900">
                            WebAuthn Not Supported
                          </p>
                          <p className="text-sm text-error-700 mt-1">
                            Your browser doesn't support biometric authentication. Please use a modern browser with WebAuthn support.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-4 bg-primary-50 border border-primary-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Fingerprint className="w-6 h-6 text-primary-600" />
                        <div>
                          <p className="font-medium text-primary-900">
                            Biometric Authentication Required
                          </p>
                          <p className="text-sm text-primary-700 mt-1">
                            Use your fingerprint or face recognition to access the document.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleBiometricVerification}
                        disabled={isVerifying}
                        className="btn-primary"
                      >
                        {isVerifying ? (
                          <>
                            <LoadingSpinner size="sm" />
                            Verifying...
                          </>
                        ) : (
                          <>
                            <Fingerprint className="w-4 h-4 mr-2" />
                            Access Document
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <LoadingSpinner size="sm" text="Checking access status..." />
            </div>
          )}
        </div>
      </div>

      {/* Security Information */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Security Features</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Shield className="w-5 h-5 text-primary-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">AES-256 Encryption</p>
                  <p className="text-sm text-gray-600">
                    Military-grade encryption protects your document content.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Eye className="w-5 h-5 text-primary-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Steganographic Storage</p>
                  <p className="text-sm text-gray-600">
                    Document is hidden inside a normal-looking image file.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Fingerprint className="w-5 h-5 text-primary-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Biometric Authentication</p>
                  <p className="text-sm text-gray-600">
                    Only your biometric data can unlock the document.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Clock className="w-5 h-5 text-primary-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Time-Based Access</p>
                  <p className="text-sm text-gray-600">
                    Document automatically locks after the time window expires.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DocumentDetailPage