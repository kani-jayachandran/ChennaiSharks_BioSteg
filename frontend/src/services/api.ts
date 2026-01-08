import axios, { AxiosInstance, AxiosResponse } from 'axios'
import toast from 'react-hot-toast'

class ApiService {
  private api: AxiosInstance

  constructor() {
    this.api = axios.create({
      baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => {
        return Promise.reject(error)
      }
    )

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        return response
      },
      (error) => {
        if (error.response) {
          const { status, data } = error.response

          // Handle specific error cases
          switch (status) {
            case 401:
              // Unauthorized - clear token and redirect to login
              localStorage.removeItem('auth_token')
              if (window.location.pathname !== '/login') {
                window.location.href = '/login'
              }
              break
            case 403:
              toast.error('Access denied')
              break
            case 404:
              toast.error('Resource not found')
              break
            case 429:
              toast.error('Too many requests. Please try again later.')
              break
            case 500:
              toast.error('Server error. Please try again later.')
              break
            default:
              if (data?.error) {
                toast.error(data.error)
              } else {
                toast.error('An unexpected error occurred')
              }
          }
        } else if (error.request) {
          // Network error
          toast.error('Network error. Please check your connection.')
        } else {
          toast.error('An unexpected error occurred')
        }

        return Promise.reject(error)
      }
    )
  }

  // Generic GET request
  async get<T>(url: string, params?: any): Promise<T> {
    const response = await this.api.get(url, { params })
    return response.data
  }

  // Generic POST request
  async post<T>(url: string, data?: any, config?: any): Promise<T> {
    const response = await this.api.post(url, data, config)
    return response.data
  }

  // Generic PUT request
  async put<T>(url: string, data?: any): Promise<T> {
    const response = await this.api.put(url, data)
    return response.data
  }

  // Generic DELETE request
  async delete<T>(url: string): Promise<T> {
    const response = await this.api.delete(url)
    return response.data
  }

  // File upload with progress
  async uploadFile<T>(
    url: string,
    formData: FormData,
    onProgress?: (progress: number) => void
  ): Promise<T> {
    const response = await this.api.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(progress)
        }
      },
    })
    return response.data
  }

  // Download file
  async downloadFile(url: string, filename?: string): Promise<void> {
    const response = await this.api.get(url, {
      responseType: 'blob',
    })

    // Create blob link to download
    const blob = new Blob([response.data])
    const link = document.createElement('a')
    link.href = window.URL.createObjectURL(blob)
    link.download = filename || 'download'
    link.click()
    window.URL.revokeObjectURL(link.href)
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.get('/health')
  }
}

export const apiService = new ApiService()
export default apiService