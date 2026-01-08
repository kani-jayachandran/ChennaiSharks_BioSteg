import { apiService } from './api'
import {
  Document,
  DocumentUploadRequest,
  DocumentUploadResponse,
  DocumentListResponse,
  DocumentAccessStatus,
  DocumentAccessResponse,
} from '../types/document'

class DocumentService {
  // Upload new document
  async uploadDocument(
    request: DocumentUploadRequest,
    onProgress?: (progress: number) => void
  ): Promise<DocumentUploadResponse> {
    try {
      const formData = new FormData()
      formData.append('document', request.document)
      formData.append('title', request.title)
      formData.append('startTime', request.startTime)
      formData.append('endTime', request.endTime)
      
      if (request.description) {
        formData.append('description', request.description)
      }

      const response = await apiService.uploadFile<DocumentUploadResponse>(
        '/api/documents/upload',
        formData,
        onProgress
      )
      return response
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Upload failed',
      }
    }
  }

  // Get user's documents
  async getDocuments(
    status?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<DocumentListResponse> {
    try {
      const params: any = { limit, offset }
      if (status) params.status = status

      const response = await apiService.get<DocumentListResponse>('/api/documents', params)
      return response
    } catch (error: any) {
      return {
        success: false,
        documents: [],
        error: error.response?.data?.error || 'Failed to fetch documents',
      }
    }
  }

  // Get document details
  async getDocument(documentId: string): Promise<Document | null> {
    try {
      const response = await apiService.get<{ success: boolean; document: Document }>(
        `/api/documents/${documentId}`
      )
      return response.success ? response.document : null
    } catch (error) {
      return null
    }
  }

  // Check document access status
  async getAccessStatus(documentId: string): Promise<DocumentAccessStatus | null> {
    try {
      const response = await apiService.get<DocumentAccessStatus>(
        `/api/documents/${documentId}/access-status`
      )
      return response
    } catch (error) {
      return null
    }
  }

  // Update document metadata
  async updateDocument(
    documentId: string,
    updates: {
      title?: string
      description?: string
      startTime?: string
      endTime?: string
    }
  ): Promise<boolean> {
    try {
      const response = await apiService.put<{ success: boolean }>(
        `/api/documents/${documentId}`,
        updates
      )
      return response.success
    } catch (error) {
      return false
    }
  }

  // Delete document
  async deleteDocument(documentId: string): Promise<boolean> {
    try {
      const response = await apiService.delete<{ success: boolean }>(
        `/api/documents/${documentId}`
      )
      return response.success
    } catch (error) {
      return false
    }
  }

  // Download document (after biometric verification)
  async downloadDocument(documentId: string, filename: string): Promise<void> {
    try {
      await apiService.downloadFile(`/api/documents/${documentId}/download`, filename)
    } catch (error) {
      throw new Error('Download failed')
    }
  }

  // Format file size
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Format time remaining
  formatTimeRemaining(milliseconds: number): string {
    if (milliseconds <= 0) return 'Expired'

    const seconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `${days}d ${hours % 24}h`
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  // Check if document is accessible now
  isDocumentAccessible(document: Document): boolean {
    const now = Date.now()
    const startTime = new Date(document.startTime).getTime()
    const endTime = new Date(document.endTime).getTime()

    return (
      document.status === 'active' &&
      now >= startTime &&
      now <= endTime
    )
  }

  // Get document status badge info
  getStatusBadge(document: Document): { text: string; className: string } {
    const now = Date.now()
    const startTime = new Date(document.startTime).getTime()
    const endTime = new Date(document.endTime).getTime()

    if (document.status !== 'active') {
      return { text: 'Inactive', className: 'badge-secondary' }
    }

    if (now < startTime) {
      return { text: 'Pending', className: 'badge-warning' }
    }

    if (now > endTime) {
      return { text: 'Expired', className: 'badge-error' }
    }

    return { text: 'Active', className: 'badge-success' }
  }
}

export const documentService = new DocumentService()
export default documentService