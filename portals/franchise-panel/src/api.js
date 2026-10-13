import axios from 'axios'

const defaultBaseUrl = () => {
  return 'https://shipbees2.onrender.com/api'
}

const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || defaultBaseUrl()).replace(/\/+$/, '')

export const authStorage = {
  accessKey: 'shiprayFranchiseAccessToken',
  refreshKey: 'shiprayFranchiseRefreshToken',
  profileKey: 'shiprayFranchiseProfile',
  getAccess: () => localStorage.getItem('shiprayFranchiseAccessToken'),
  getRefresh: () => localStorage.getItem('shiprayFranchiseRefreshToken'),
  getProfile: () => {
    try {
      return JSON.parse(localStorage.getItem('shiprayFranchiseProfile') || 'null')
    } catch {
      return null
    }
  },
  save: (payload) => {
    localStorage.setItem('shiprayFranchiseAccessToken', payload.token)
    localStorage.setItem('shiprayFranchiseRefreshToken', payload.refreshToken)
    localStorage.setItem('shiprayFranchiseProfile', JSON.stringify(payload.user))
  },
  clear: () => {
    localStorage.removeItem('shiprayFranchiseAccessToken')
    localStorage.removeItem('shiprayFranchiseRefreshToken')
    localStorage.removeItem('shiprayFranchiseProfile')
  },
}

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 20000,
})

let refreshPromise = null

api.interceptors.request.use((config) => {
  const token = authStorage.getAccess()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config
    const refreshToken = authStorage.getRefresh()
    if (error.response?.status !== 401 || request?._retry || !refreshToken) {
      return Promise.reject(error)
    }

    request._retry = true
    try {
      if (!refreshPromise) {
        refreshPromise = axios
          .post(
            `${apiBaseUrl}/auth/refresh-token`,
            { refreshToken },
            { headers: { 'x-refresh-token': refreshToken } },
          )
          .finally(() => {
            refreshPromise = null
          })
      }
      const response = await refreshPromise
      localStorage.setItem(authStorage.accessKey, response.data.accessToken)
      localStorage.setItem(authStorage.refreshKey, response.data.refreshToken)
      request.headers.Authorization = `Bearer ${response.data.accessToken}`
      return api(request)
    } catch (refreshError) {
      authStorage.clear()
      window.location.href = '/login'
      return Promise.reject(refreshError)
    }
  },
)

const franchiseBase = '/franchise/v1'

export const portalApi = {
  login: async (email, password) =>
    (await api.post(`${franchiseBase}/auth/login`, { email, password })).data,
  me: async () => (await api.get(`${franchiseBase}/me`)).data.data,
  dashboard: async () => (await api.get(`${franchiseBase}/dashboard`)).data.data,
  orders: async () => (await api.get(`${franchiseBase}/orders`)).data.data,
  tracking: async () => (await api.get(`${franchiseBase}/tracking`)).data.data,
  ndr: async () => (await api.get(`${franchiseBase}/ndr`)).data.data,
  rto: async () => (await api.get(`${franchiseBase}/rto`)).data.data,
  territories: async () => (await api.get(`${franchiseBase}/territories`)).data.data,
  earnings: async () => (await api.get(`${franchiseBase}/earnings`)).data.data,
  settlements: async () => (await api.get(`${franchiseBase}/settlements`)).data.data,
  reports: async () => (await api.get(`${franchiseBase}/reports`)).data.data,
  documents: async () => (await api.get(`${franchiseBase}/documents`)).data.data,
  team: async () => (await api.get(`${franchiseBase}/team`)).data.data,
  disputes: async () => (await api.get(`${franchiseBase}/disputes`)).data.data,
  createDispute: async (payload) =>
    (await api.post(`${franchiseBase}/disputes`, payload)).data.data,
}

export default api
