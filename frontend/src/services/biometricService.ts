import { apiService } from './api'
import {
  BiometricTemplate,
  BiometricChallenge,
  BiometricEnrollRequest,
  BiometricVerifyRequest,
  BiometricEnrollResponse,
  BiometricVerifyResponse,
  AccessLog,
  AccessLogsResponse,
  WebAuthnCredential,
  WebAuthnOptions,
  DocumentAccessResponse,
} from '../types/biometric'

class BiometricService {
  // Check WebAuthn support
  isWebAuthnSupported(): boolean {
    return !!(navigator.credentials && navigator.credentials.create && navigator.credentials.get)
  }

  // Check if platform authenticator is available
  async isPlatformAuthenticatorAvailable(): Promise<boolean> {
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    } catch (error) {
      return false
    }
  }

  // Generate WebAuthn registration options
  generateRegistrationOptions(userId: string, userEmail: string): WebAuthnOptions {
    const challenge = new Uint8Array(32)
    crypto.getRandomValues(challenge)

    const userIdBuffer = new TextEncoder().encode(userId)

    return {
      challenge,
      rp: {
        name: 'BioSteg-Locker',
        id: window.location.hostname,
      },
      user: {
        id: userIdBuffer,
        name: userEmail,
        displayName: userEmail,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
      timeout: 60000,
    }
  }

  // Generate WebAuthn authentication options
  generateAuthenticationOptions(): { challenge: Uint8Array } {
    const challenge = new Uint8Array(32)
    crypto.getRandomValues(challenge)
    return { challenge }
  }

  // Create WebAuthn credential (enrollment)
  async createCredential(options: WebAuthnOptions): Promise<WebAuthnCredential | null> {
    try {
      const credential = await navigator.credentials.create({
        publicKey: options,
      }) as PublicKeyCredential

      if (!credential) return null

      return {
        id: credential.id,
        rawId: credential.rawId,
        response: credential.response as AuthenticatorAttestationResponse,
        type: credential.type as 'public-key',
      }
    } catch (error) {
      console.error('WebAuthn credential creation failed:', error)
      return null
    }
  }

  // Get WebAuthn assertion (authentication)
  async getAssertion(challenge: Uint8Array): Promise<WebAuthnCredential | null> {
    try {
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'required',
        },
      }) as PublicKeyCredential

      if (!credential) return null

      return {
        id: credential.id,
        rawId: credential.rawId,
        response: credential.response as AuthenticatorAssertionResponse,
        type: credential.type as 'public-key',
      }
    } catch (error) {
      console.error('WebAuthn assertion failed:', error)
      return null
    }
  }

  // Convert ArrayBuffer to base64
  arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  // Convert base64 to ArrayBuffer
  base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }

  // Serialize WebAuthn credential for API
  serializeCredential(credential: WebAuthnCredential): any {
    return {
      id: credential.id,
      rawId: this.arrayBufferToBase64(credential.rawId),
      response: {
        clientDataJSON: this.arrayBufferToBase64(credential.response.clientDataJSON),
        attestationObject: credential.response instanceof AuthenticatorAttestationResponse
          ? this.arrayBufferToBase64(credential.response.attestationObject)
          : undefined,
        authenticatorData: credential.response instanceof AuthenticatorAssertionResponse
          ? this.arrayBufferToBase64(credential.response.authenticatorData)
          : undefined,
        signature: credential.response instanceof AuthenticatorAssertionResponse
          ? this.arrayBufferToBase64(credential.response.signature)
          : undefined,
        userHandle: credential.response instanceof AuthenticatorAssertionResponse && credential.response.userHandle
          ? this.arrayBufferToBase64(credential.response.userHandle)
          : undefined,
      },
      type: credential.type,
    }
  }

  // Get biometric challenge from server
  async getChallenge(): Promise<BiometricChallenge | null> {
    try {
      const response = await apiService.post<{ success: boolean; challenge: BiometricChallenge }>(
        '/api/biometric/challenge'
      )
      return response.success ? response.challenge : null
    } catch (error) {
      return null
    }
  }

  // Enroll biometric template
  async enrollBiometric(
    userId: string,
    userEmail: string,
    type: 'fingerprint' | 'face' = 'fingerprint'
  ): Promise<BiometricEnrollResponse> {
    try {
      // Generate WebAuthn options
      const options = this.generateRegistrationOptions(userId, userEmail)

      // Create credential
      const credential = await this.createCredential(options)
      if (!credential) {
        return {
          success: false,
          error: 'Failed to create biometric credential',
        }
      }

      // Serialize and send to server
      const serializedCredential = this.serializeCredential(credential)
      const response = await apiService.post<BiometricEnrollResponse>('/api/biometric/enroll', {
        biometricData: serializedCredential,
        type,
      })

      return response
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Biometric enrollment failed',
      }
    }
  }

  // Verify biometric and access document
  async verifyBiometricAndAccessDocument(
    documentId: string,
    type: 'fingerprint' | 'face' = 'fingerprint'
  ): Promise<DocumentAccessResponse> {
    try {
      // Get challenge from server
      const challenge = await this.getChallenge()
      if (!challenge) {
        return {
          success: false,
          error: 'Failed to get biometric challenge',
        }
      }

      // Generate authentication options
      const authOptions = this.generateAuthenticationOptions()

      // Get assertion
      const credential = await this.getAssertion(authOptions.challenge)
      if (!credential) {
        return {
          success: false,
          error: 'Biometric authentication failed',
        }
      }

      // Serialize and send to server
      const serializedCredential = this.serializeCredential(credential)
      const response = await apiService.post<DocumentAccessResponse>(
        `/api/biometric/verify/${documentId}`,
        {
          biometricData: serializedCredential,
          type,
          challenge,
        }
      )

      return response
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Biometric verification failed',
      }
    }
  }

  // Get user's biometric templates
  async getTemplates(): Promise<BiometricTemplate[]> {
    try {
      const response = await apiService.get<{ success: boolean; templates: BiometricTemplate[] }>(
        '/api/biometric/templates'
      )
      return response.success ? response.templates : []
    } catch (error) {
      return []
    }
  }

  // Delete biometric template
  async deleteTemplate(templateId: string): Promise<boolean> {
    try {
      const response = await apiService.delete<{ success: boolean }>(
        `/api/biometric/templates/${templateId}`
      )
      return response.success
    } catch (error) {
      return false
    }
  }

  // Get access logs
  async getAccessLogs(
    documentId?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<AccessLogsResponse> {
    try {
      const params: any = { limit, offset }
      if (documentId) params.documentId = documentId

      const response = await apiService.get<AccessLogsResponse>('/api/biometric/access-logs', params)
      return response
    } catch (error: any) {
      return {
        success: false,
        logs: [],
        error: error.response?.data?.error || 'Failed to fetch access logs',
      }
    }
  }

  // Download document after successful verification
  downloadDocument(documentData: string, filename: string, mimeType: string): void {
    try {
      // Convert base64 to blob
      const byteCharacters = atob(documentData)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: mimeType })

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Document download failed:', error)
      throw new Error('Failed to download document')
    }
  }

  // Get biometric type display name
  getBiometricTypeDisplayName(type: string): string {
    switch (type) {
      case 'fingerprint':
        return 'Fingerprint'
      case 'face':
        return 'Face Recognition'
      default:
        return type
    }
  }

  // Format confidence score
  formatConfidence(confidence: number): string {
    return `${Math.round(confidence * 100)}%`
  }

  // Get confidence level description
  getConfidenceLevel(confidence: number): { level: string; className: string } {
    if (confidence >= 0.9) {
      return { level: 'Very High', className: 'text-success-600' }
    } else if (confidence >= 0.8) {
      return { level: 'High', className: 'text-success-500' }
    } else if (confidence >= 0.7) {
      return { level: 'Medium', className: 'text-warning-500' }
    } else {
      return { level: 'Low', className: 'text-error-500' }
    }
  }
}

export const biometricService = new BiometricService()
export default biometricService