import React, { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { biometricService } from '../services/biometricService'
import { BiometricTemplate, AccessLog } from '../types/biometric'
import {
  Fingerprint,
  Shield,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  Activity,
  Eye,
  Clock,
} from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const BiometricPage: React.FC = () => {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<BiometricTemplate[]>([])
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [hasWebAuthn, setHasWebAuthn] = useState(false)
  const [platformAuthAvailable, setPlatformAuthAvailable] = useState(false)

  useEffect(() => {
    loadBiometricData()
    checkWebAuthnSupport()
  }, [])

  const checkWebAuthnSupport = async () => {
    const webAuthnSupported = biometricService.isWebAuthnSupported()
    setHasWebAuthn(webAuthnSupported)

    if (webAuthnSupported) {
      const platformAvailable = await biometricService.isPlatformAuthenticatorAvailable()
      setPlatformAuthAvailable(platformAvailable)
    }
  }

  const loadBiometricData = async () => {
    try {
      setLoading(true)
      
      // Load templates and access logs in parallel
      const [templatesData, logsResponse] = await Promise.all([
        biometricService.getTemplates(),
        biometricService.getAccessLogs(undefined, 20, 0),
      ])

      setTemplates(templatesData)
      
      if (logsResponse.success) {
        setAccessLogs(logsResponse.logs)
      }
    } catch (error) {
      console.error('Failed to load biometric data:', error)
      toast.error('Failed to load biometric data')
    } finally {
      setLoading(false)
    }
  }

  const handleEnrollBiometric = async (type: 'fingerprint' | 'face') => {
    if (!user || !hasWebAuthn) return

    try {
      setEnrolling(true)
      
      const response = await biometricService.enrollBiometric(user.id, user.email, type)
      
      if (response.success) {
        toast.success(`${biometricService.getBiometricTypeDisplayName(type)} enrolled successfully!`)
        await loadBiometricData() // Reload data
      } else {
        toast.error(response.error || 'Biometric enrollment failed')
      }
    } catch (error: any) {
      console.error('Biometric enrollment error:', error)
      toast.error(error.message || 'Biometric enrollment failed')
    } finally {
      setEnrolling(false)
    }
  }

  const handleDeleteTemplate = async (templateId: string, type: string) => {
    if (!confirm(`Are you sure you want to delete your ${biometricService.getBiometricTypeDisplayName(type)} template?`)) {
      return
    }

    try {
      const success = await biometricService.deleteTemplate(templateId)
      if (success) {
        setTemplates(templates.filter(t => t.id !== templateId))
        toast.success('Biometric template deleted successfully')
      } else {
        toast.error('Failed to delete biometric template')
      }
    } catch (error) {
      console.error('Delete template error:', error)
      toast.error('Failed to delete biometric template')
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <LoadingSpinner size="lg" text="Loading biometric settings..." />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Biometric Security</h1>
        <p className="text-gray-600 mt-1">
          Manage your biometric authentication methods for secure document access
        </p>
      </div>

      {/* WebAuthn Support Check */}
      {!hasWebAuthn && (
        <div className="card">
          <div className="card-body">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-6 h-6 text-error-600" />
              <div>
                <h3 className="text-lg font-medium text-error-900">WebAuthn Not Supported</h3>
                <p className="text-error-700 mt-1">
                  Your browser doesn't support WebAuthn biometric authentication. Please use a modern browser 
                  like Chrome, Firefox, Safari, or Edge with biometric capabilities.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Platform Authenticator Check */}
      {hasWebAuthn && !platformAuthAvailable && (
        <div className="card">
          <div className="card-body">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-6 h-6 text-warning-600" />
              <div>
                <h3 className="text-lg font-medium text-warning-900">Platform Authenticator Not Available</h3>
                <p className="text-warning-700 mt-1">
                  Your device doesn't have a built-in biometric authenticator (fingerprint reader, Face ID, etc.). 
                  You may still be able to use external security keys.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Biometric Templates */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Enrolled Biometric Methods</h2>
        </div>
        <div className="card-body">
          {templates.length === 0 ? (
            <div className="text-center py-8">
              <Fingerprint className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Biometric Methods Enrolled</h3>
              <p className="text-gray-600 mb-6">
                Set up fingerprint or face recognition to securely access your documents.
              </p>
              {hasWebAuthn && (
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => handleEnrollBiometric('fingerprint')}
                    disabled={enrolling}
                    className="btn-primary"
                  >
                    {enrolling ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <>
                        <Fingerprint className="w-4 h-4 mr-2" />
                        Enroll Fingerprint
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleEnrollBiometric('face')}
                    disabled={enrolling}
                    className="btn-secondary"
                  >
                    {enrolling ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <>
                        <Eye className="w-4 h-4 mr-2" />
                        Enroll Face ID
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map((template) => {
                const confidenceLevel = biometricService.getConfidenceLevel(template.quality)
                return (
                  <div key={template.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center">
                        <Fingerprint className="w-6 h-6 text-success-600" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {biometricService.getBiometricTypeDisplayName(template.type)}
                        </h4>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <span>
                            Quality: <span className={confidenceLevel.className}>
                              {biometricService.formatConfidence(template.quality)} ({confidenceLevel.level})
                            </span>
                          </span>
                          <span>
                            Enrolled: {format(new Date(template.enrolledAt), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="badge-success">Active</span>
                      <button
                        onClick={() => handleDeleteTemplate(template.id, template.type)}
                        className="p-2 text-gray-400 hover:text-error-600 hover:bg-error-50 rounded-lg transition-colors"
                        title="Delete template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Add More Templates */}
              {hasWebAuthn && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-3">Add Additional Methods</p>
                  <div className="flex space-x-4">
                    {!templates.some(t => t.type === 'fingerprint') && (
                      <button
                        onClick={() => handleEnrollBiometric('fingerprint')}
                        disabled={enrolling}
                        className="btn-secondary"
                      >
                        {enrolling ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Fingerprint
                          </>
                        )}
                      </button>
                    )}
                    {!templates.some(t => t.type === 'face') && (
                      <button
                        onClick={() => handleEnrollBiometric('face')}
                        disabled={enrolling}
                        className="btn-secondary"
                      >
                        {enrolling ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Face ID
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Security Information */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">How Biometric Security Works</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Shield className="w-5 h-5 text-primary-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Local Processing</p>
                  <p className="text-sm text-gray-600">
                    Your biometric data is processed locally on your device and never sent to our servers.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Fingerprint className="w-5 h-5 text-primary-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Template Storage</p>
                  <p className="text-sm text-gray-600">
                    Only encrypted biometric templates are stored, not your actual biometric data.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-primary-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">WebAuthn Standard</p>
                  <p className="text-sm text-gray-600">
                    Uses industry-standard WebAuthn protocol for secure authentication.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Clock className="w-5 h-5 text-primary-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Time-Based Access</p>
                  <p className="text-sm text-gray-600">
                    Combined with time windows for additional security layers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Access Logs */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900">Recent Access Attempts</h2>
        </div>
        <div className="card-body">
          {accessLogs.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No access attempts yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {accessLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${
                      log.success ? 'bg-success-500' : 'bg-error-500'
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {log.documentTitle || 'Unknown Document'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {log.success ? 'Successful access' : `Failed: ${log.failureReason}`}
                        {log.confidence && ` • Confidence: ${biometricService.formatConfidence(log.confidence)}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {format(new Date(log.timestamp), 'MMM d, h:mm a')}
                    </p>
                    <span className={`badge ${log.success ? 'badge-success' : 'badge-error'}`}>
                      {log.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BiometricPage