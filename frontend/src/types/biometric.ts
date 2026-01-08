export interface BiometricTemplate {
  id: string
  type: 'fingerprint' | 'face'
  quality: number
  enrolledAt: string
  updatedAt: string
}

export interface BiometricChallenge {
  challenge: string
  timestamp: number
  expires: number
}

export interface BiometricEnrollRequest {
  biometricData: any // WebAuthn credential data
  type: 'fingerprint' | 'face'
}

export interface BiometricVerifyRequest {
  biometricData: any // WebAuthn assertion data
  type: 'fingerprint' | 'face'
  challenge: BiometricChallenge
}

export interface BiometricEnrollResponse {
  success: boolean
  template?: {
    id: string
    type: string
    quality: number
    enrolledAt: string
  }
  error?: string
  message?: string
}

export interface BiometricVerifyResponse {
  success: boolean
  verified?: boolean
  confidence?: number
  quality?: number
  error?: string
  message?: string
}

export interface AccessLog {
  id: string
  documentId: string
  documentTitle?: string
  documentFilename?: string
  accessType: string
  success: boolean
  failureReason?: string
  confidence?: number
  timestamp: string
}

export interface AccessLogsResponse {
  success: boolean
  logs: AccessLog[]
  pagination?: {
    limit: number
    offset: number
    total: number
  }
  error?: string
}

// WebAuthn types
export interface WebAuthnCredential {
  id: string
  rawId: ArrayBuffer
  response: AuthenticatorAttestationResponse | AuthenticatorAssertionResponse
  type: 'public-key'
}

export interface WebAuthnOptions {
  challenge: Uint8Array
  rp: {
    name: string
    id: string
  }
  user: {
    id: Uint8Array
    name: string
    displayName: string
  }
  pubKeyCredParams: Array<{
    type: 'public-key'
    alg: number
  }>
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform'
    userVerification?: 'required' | 'preferred' | 'discouraged'
  }
  timeout?: number
}