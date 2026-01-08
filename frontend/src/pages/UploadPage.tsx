import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { documentService } from '../services/documentService'
import { DocumentUploadRequest } from '../types/document'
import {
  Upload,
  FileText,
  Calendar,
  Clock,
  Shield,
  AlertCircle,
  CheckCircle,
  X,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import { format, addDays, addHours } from 'date-fns'

interface UploadForm {
  title: string
  description: string
  startTime: string
  endTime: string
}

const UploadPage: React.FC = () => {
  const navigate = useNavigate()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UploadForm>({
    defaultValues: {
      startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      endTime: format(addDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm"),
    },
  })

  const startTime = watch('startTime')
  const endTime = watch('endTime')

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleFileSelect(files[0])
    }
  }

  const handleFileSelect = (file: File) => {
    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]

    if (!allowedTypes.includes(file.type)) {
      toast.error('Only PDF and DOC files are allowed')
      return
    }

    // Validate file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File size must be less than 50MB')
      return
    }

    setSelectedFile(file)
    
    // Auto-fill title if empty
    const title = watch('title')
    if (!title) {
      const fileName = file.name.replace(/\.[^/.]+$/, '') // Remove extension
      setValue('title', fileName)
    }
  }

  const onSubmit = async (data: UploadForm) => {
    if (!selectedFile) {
      toast.error('Please select a file to upload')
      return
    }

    // Validate time window
    const start = new Date(data.startTime)
    const end = new Date(data.endTime)
    const now = new Date()

    if (start < now) {
      toast.error('Start time cannot be in the past')
      return
    }

    if (end <= start) {
      toast.error('End time must be after start time')
      return
    }

    const timeDiff = end.getTime() - start.getTime()
    if (timeDiff < 60 * 1000) {
      toast.error('Time window must be at least 1 minute')
      return
    }

    if (timeDiff > 30 * 24 * 60 * 60 * 1000) {
      toast.error('Time window cannot exceed 30 days')
      return
    }

    try {
      setIsUploading(true)
      setUploadProgress(0)

      const request: DocumentUploadRequest = {
        title: data.title.trim(),
        description: data.description?.trim() || undefined,
        startTime: data.startTime,
        endTime: data.endTime,
        document: selectedFile,
      }

      const response = await documentService.uploadDocument(
        request,
        (progress) => setUploadProgress(progress)
      )

      if (response.success) {
        toast.success('Document uploaded and secured successfully!')
        navigate('/documents')
      } else {
        toast.error(response.error || 'Upload failed')
      }
    } catch (error: any) {
      console.error('Upload error:', error)
      toast.error(error.message || 'Upload failed')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const quickTimePresets = [
    { label: '1 Hour', hours: 1 },
    { label: '6 Hours', hours: 6 },
    { label: '1 Day', hours: 24 },
    { label: '3 Days', hours: 72 },
    { label: '1 Week', hours: 168 },
  ]

  const setQuickTime = (hours: number) => {
    const start = new Date()
    const end = addHours(start, hours)
    setValue('startTime', format(start, "yyyy-MM-dd'T'HH:mm"))
    setValue('endTime', format(end, "yyyy-MM-dd'T'HH:mm"))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Upload Document</h1>
        <p className="text-gray-600 mt-2">
          Secure your document with encryption and biometric protection
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* File Upload */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900">Select Document</h2>
          </div>
          <div className="card-body">
            <div
              className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-primary-400 bg-primary-50'
                  : selectedFile
                  ? 'border-success-300 bg-success-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              {selectedFile ? (
                <div className="space-y-4">
                  <CheckCircle className="w-12 h-12 text-success-600 mx-auto" />
                  <div>
                    <p className="text-lg font-medium text-success-900">{selectedFile.name}</p>
                    <p className="text-success-700">
                      {documentService.formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="btn-secondary"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove File
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                  <div>
                    <p className="text-lg font-medium text-gray-900">
                      Drop your document here, or click to browse
                    </p>
                    <p className="text-gray-500">
                      Supports PDF, DOC, and DOCX files up to 50MB
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Document Details */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900">Document Details</h2>
          </div>
          <div className="card-body space-y-4">
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                {...register('title', {
                  required: 'Title is required',
                  minLength: {
                    value: 3,
                    message: 'Title must be at least 3 characters',
                  },
                })}
                type="text"
                className={`input ${errors.title ? 'input-error' : ''}`}
                placeholder="Enter document title"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-error-600">{errors.title.message}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description (Optional)
              </label>
              <textarea
                {...register('description')}
                rows={3}
                className="input"
                placeholder="Enter document description"
              />
            </div>
          </div>
        </div>

        {/* Access Time Window */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-gray-900">Access Time Window</h2>
            <p className="text-sm text-gray-600">
              Set when this document can be accessed with biometric authentication
            </p>
          </div>
          <div className="card-body space-y-4">
            {/* Quick Presets */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quick Presets
              </label>
              <div className="flex flex-wrap gap-2">
                {quickTimePresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setQuickTime(preset.hours)}
                    className="btn-secondary text-sm"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time *
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    {...register('startTime', {
                      required: 'Start time is required',
                    })}
                    type="datetime-local"
                    className={`input pl-10 ${errors.startTime ? 'input-error' : ''}`}
                  />
                </div>
                {errors.startTime && (
                  <p className="mt-1 text-sm text-error-600">{errors.startTime.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="endTime" className="block text-sm font-medium text-gray-700 mb-1">
                  End Time *
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    {...register('endTime', {
                      required: 'End time is required',
                    })}
                    type="datetime-local"
                    className={`input pl-10 ${errors.endTime ? 'input-error' : ''}`}
                  />
                </div>
                {errors.endTime && (
                  <p className="mt-1 text-sm text-error-600">{errors.endTime.message}</p>
                )}
              </div>
            </div>

            {/* Time Window Info */}
            {startTime && endTime && (
              <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-medium text-primary-900">Access Window</h4>
                    <p className="text-sm text-primary-700 mt-1">
                      Document will be accessible from{' '}
                      <strong>{format(new Date(startTime), 'MMM d, yyyy h:mm a')}</strong> to{' '}
                      <strong>{format(new Date(endTime), 'MMM d, yyyy h:mm a')}</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security Notice */}
        <div className="card">
          <div className="card-body">
            <div className="flex items-start space-x-3">
              <Shield className="w-6 h-6 text-primary-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-gray-900">Security Process</h3>
                <ul className="text-sm text-gray-600 mt-2 space-y-1">
                  <li>• Your document will be encrypted with military-grade AES-256 encryption</li>
                  <li>• The encrypted document will be hidden inside a normal-looking image</li>
                  <li>• Only the steganographic image will be stored in the cloud</li>
                  <li>• Biometric authentication is required to access the document</li>
                  <li>• Access is only possible during the specified time window</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <div className="card">
            <div className="card-body">
              <div className="flex items-center space-x-4">
                <LoadingSpinner size="sm" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">Uploading...</span>
                    <span className="text-sm text-gray-600">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/documents')}
            className="btn-secondary"
            disabled={isUploading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={!selectedFile || isUploading}
          >
            {isUploading ? (
              <>
                <LoadingSpinner size="sm" />
                Securing Document...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Secure Document
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default UploadPage