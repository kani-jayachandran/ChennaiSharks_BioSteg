import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { documentService } from '../services/documentService'
import { biometricService } from '../services/biometricService'
import { Document } from '../types/document'
import { BiometricTemplate } from '../types/biometric'
import {
  FileText,
  Upload,
  Fingerprint,
  Clock,
  Shield,
  Activity,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Plus,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { format } from 'date-fns'

const DashboardPage: React.FC = () => {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<Document[]>([])
  const [templates, setTemplates] = useState<BiometricTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalDocuments: 0,
    activeDocuments: 0,
    accessibleDocuments: 0,
    expiredDocuments: 0,
  })

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      
      // Load recent documents
      const documentsResponse = await documentService.getDocuments(undefined, 10, 0)
      if (documentsResponse.success) {
        setDocuments(documentsResponse.documents)
        
        // Calculate stats
        const total = documentsResponse.documents.length
        const active = documentsResponse.documents.filter(d => d.status === 'active').length
        const accessible = documentsResponse.documents.filter(d => d.isAccessible).length
        const expired = documentsResponse.documents.filter(d => d.status === 'expired').length
        
        setStats({
          totalDocuments: total,
          activeDocuments: active,
          accessibleDocuments: accessible,
          expiredDocuments: expired,
        })
      }

      // Load biometric templates
      const templatesData = await biometricService.getTemplates()
      setTemplates(templatesData)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const quickActions = [
    {
      name: 'Upload Document',
      description: 'Secure a new document with biometric protection',
      href: '/upload',
      icon: Upload,
      color: 'bg-primary-500 hover:bg-primary-600',
    },
    {
      name: 'View Documents',
      description: 'Access your encrypted document library',
      href: '/documents',
      icon: FileText,
      color: 'bg-success-500 hover:bg-success-600',
    },
    {
      name: 'Setup Biometric',
      description: 'Configure fingerprint or face recognition',
      href: '/biometric',
      icon: Fingerprint,
      color: 'bg-warning-500 hover:bg-warning-600',
    },
  ]

  if (loading) {
    return (
      <div className="p-6">
        <LoadingSpinner size="lg" text="Loading dashboard..." />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {getGreeting()}, {user?.firstName}!
            </h1>
            <p className="text-primary-100 mt-1">
              Your documents are secure and protected with biometric authentication
            </p>
          </div>
          <Shield className="w-16 h-16 text-primary-200" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Documents</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalDocuments}</p>
              </div>
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Documents</p>
                <p className="text-2xl font-bold text-gray-900">{stats.activeDocuments}</p>
              </div>
              <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-success-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Accessible Now</p>
                <p className="text-2xl font-bold text-gray-900">{stats.accessibleDocuments}</p>
              </div>
              <div className="w-12 h-12 bg-warning-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-warning-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Biometric Setup</p>
                <p className="text-2xl font-bold text-gray-900">{templates.length}</p>
              </div>
              <div className="w-12 h-12 bg-error-100 rounded-lg flex items-center justify-center">
                <Fingerprint className="w-6 h-6 text-error-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Link
                  key={action.name}
                  to={action.href}
                  className="group relative overflow-hidden rounded-lg border border-gray-200 p-6 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${action.color} transition-colors`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-gray-900 group-hover:text-primary-600">
                        {action.name}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">{action.description}</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Recent Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Documents</h2>
            <Link
              to="/documents"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              View all
            </Link>
          </div>
          <div className="card-body">
            {documents.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No documents yet</p>
                <Link
                  to="/upload"
                  className="inline-flex items-center mt-4 text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Upload your first document
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {documents.slice(0, 5).map((document) => {
                  const statusBadge = documentService.getStatusBadge(document)
                  return (
                    <div key={document.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <FileText className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{document.title}</p>
                          <p className="text-xs text-gray-500">
                            {format(new Date(document.createdAt), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <span className={`badge ${statusBadge.className}`}>
                        {statusBadge.text}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Biometric Status */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Biometric Security</h2>
            <Link
              to="/biometric"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Manage
            </Link>
          </div>
          <div className="card-body">
            {templates.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 text-warning-400 mx-auto mb-4" />
                <p className="text-gray-900 font-medium mb-2">Biometric Setup Required</p>
                <p className="text-gray-500 text-sm mb-4">
                  Set up fingerprint or face recognition to access your documents securely.
                </p>
                <Link
                  to="/biometric"
                  className="btn-primary"
                >
                  Setup Biometric
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center space-x-3 p-3 bg-success-50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-success-600" />
                  <div>
                    <p className="text-sm font-medium text-success-900">Biometric Enabled</p>
                    <p className="text-xs text-success-700">
                      {templates.length} authentication method{templates.length > 1 ? 's' : ''} configured
                    </p>
                  </div>
                </div>
                {templates.map((template) => (
                  <div key={template.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Fingerprint className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {biometricService.getBiometricTypeDisplayName(template.type)}
                        </p>
                        <p className="text-xs text-gray-500">
                          Quality: {biometricService.formatConfidence(template.quality)}
                        </p>
                      </div>
                    </div>
                    <span className="badge-success">Active</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage