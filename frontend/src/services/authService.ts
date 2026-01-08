import { apiService } from './api'
import {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  ChangePasswordRequest,
} from '../types/auth'

class AuthService {
  // Login user
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await apiService.post<AuthResponse>('/api/auth/login', {
        email,
        password,
      })
      return response
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed',
      }
    }
  }

  // Register new user
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ): Promise<AuthResponse> {
    try {
      const response = await apiService.post<AuthResponse>('/api/auth/register', {
        email,
        password,
        firstName,
        lastName,
      })
      return response
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Registration failed',
      }
    }
  }

  // Get current user profile
  async getProfile(): Promise<User | null> {
    try {
      const response = await apiService.get<{ success: boolean; user: User }>('/api/auth/profile')
      return response.success ? response.user : null
    } catch (error) {
      return null
    }
  }

  // Change password
  async changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    try {
      const response = await apiService.post<{ success: boolean }>('/api/auth/change-password', {
        currentPassword,
        newPassword,
      })
      return response.success
    } catch (error) {
      return false
    }
  }

  // Logout (client-side only for JWT)
  logout(): void {
    localStorage.removeItem('auth_token')
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    const token = localStorage.getItem('auth_token')
    if (!token) return false

    try {
      // Basic JWT expiration check
      const payload = JSON.parse(atob(token.split('.')[1]))
      const currentTime = Date.now() / 1000
      return payload.exp > currentTime
    } catch (error) {
      return false
    }
  }

  // Get auth token
  getToken(): string | null {
    return localStorage.getItem('auth_token')
  }

  // Set auth token
  setToken(token: string): void {
    localStorage.setItem('auth_token', token)
  }

  // Clear auth token
  clearToken(): void {
    localStorage.removeItem('auth_token')
  }
}

export const authService = new AuthService()
export default authService