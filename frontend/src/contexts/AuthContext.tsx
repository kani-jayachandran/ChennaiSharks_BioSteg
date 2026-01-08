import React, { createContext, useContext, useEffect, useState } from 'react'
import { User } from '../types/auth'
import { authService } from '../services/authService'
import toast from 'react-hot-toast'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<boolean>
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<boolean>
  logout: () => void
  refreshToken: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token')
        if (token) {
          // Verify token and get user profile
          const profile = await authService.getProfile()
          if (profile) {
            setUser(profile)
          } else {
            // Token is invalid, clear it
            localStorage.removeItem('auth_token')
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        localStorage.removeItem('auth_token')
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()
  }, [])

  // Auto-refresh token before expiration
  useEffect(() => {
    if (!user) return

    const refreshInterval = setInterval(async () => {
      try {
        await refreshToken()
      } catch (error) {
        console.error('Token refresh failed:', error)
        logout()
      }
    }, 23 * 60 * 60 * 1000) // Refresh every 23 hours (token expires in 24h)

    return () => clearInterval(refreshInterval)
  }, [user])

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setLoading(true)
      const response = await authService.login(email, password)
      
      if (response.success) {
        localStorage.setItem('auth_token', response.token)
        setUser(response.user)
        toast.success('Login successful!')
        return true
      } else {
        toast.error(response.error || 'Login failed')
        return false
      }
    } catch (error: any) {
      console.error('Login error:', error)
      toast.error(error.message || 'Login failed')
      return false
    } finally {
      setLoading(false)
    }
  }

  const register = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ): Promise<boolean> => {
    try {
      setLoading(true)
      const response = await authService.register(email, password, firstName, lastName)
      
      if (response.success) {
        localStorage.setItem('auth_token', response.token)
        setUser(response.user)
        toast.success('Registration successful!')
        return true
      } else {
        toast.error(response.error || 'Registration failed')
        return false
      }
    } catch (error: any) {
      console.error('Registration error:', error)
      toast.error(error.message || 'Registration failed')
      return false
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    setUser(null)
    toast.success('Logged out successfully')
  }

  const refreshToken = async (): Promise<boolean> => {
    try {
      const currentToken = localStorage.getItem('auth_token')
      if (!currentToken) return false

      // For now, we'll just verify the current token
      // In a full implementation, you'd use a refresh token
      const profile = await authService.getProfile()
      if (profile) {
        setUser(profile)
        return true
      } else {
        logout()
        return false
      }
    } catch (error) {
      console.error('Token refresh error:', error)
      logout()
      return false
    }
  }

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    refreshToken,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}