export interface Document {
  id: string
  title: string
  description?: string
  originalFilename: string
  originalMimetype?: string
  size: number
  startTime: string
  endTime: string
  status: 'active' | 'expired' | 'deleted'
  isAccessible?: boolean
  timeRemaining?: number
  documentTextPreview?: string
  createdAt: string
  updatedAt?: string
}

export interface DocumentUploadRequest {
  title: string
  description?: string
  startTime: string
  endTime: string
  document: File
}

export interface DocumentUploadResponse {
  success: boolean
  document?: Document
  error?: string
  message?: string
}

export interface DocumentListResponse {
  success: boolean
  documents: Document[]
  pagination?: {
    limit: number
    offset: number
    total: number
  }
  error?: string
}

export interface DocumentAccessStatus {
  success: boolean
  status: 'pending' | 'accessible' | 'expired' | 'inactive'
  message: string
  isAccessible: boolean
  timeRemaining: number
  startTime: string
  endTime: string
}

export interface DocumentAccessResponse {
  success: boolean
  document?: {
    id: string
    title: string
    originalFilename: string
    originalMimetype: string
    data: string // base64 encoded
    size: number
    accessedAt: string
  }
  verification?: {
    confidence: number
    quality: number
    type: string
  }
  error?: string
  message?: string
}