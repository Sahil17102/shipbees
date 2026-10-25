import api from './axios'

const base = '/admin/international/serviceability'

export const internationalServiceabilityService = {
  async list() {
    const { data } = await api.get(base)
    return { rules: data.data || [], stats: data.stats || {} }
  },
  async listPostalCodes(params = {}, signal) {
    const { data } = await api.get(`${base}/postal-codes`, { params, signal })
    return data
  },
  async startSync() {
    const { data } = await api.post(`${base}/sync`)
    return data
  },
  async syncStatus() {
    const { data } = await api.get(`${base}/sync`)
    return data.stats || {}
  },
  async create(payload) {
    const { data } = await api.post(base, payload)
    return data.data
  },
  async update(id, payload) {
    const { data } = await api.put(`${base}/${id}`, payload)
    return data.data
  },
  async remove(id) {
    const { data } = await api.delete(`${base}/${id}`)
    return data
  },
  async check(payload) {
    const { data } = await api.post(`${base}/check`, payload)
    return data
  },
}
