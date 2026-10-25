import api from './axios'

const base = '/admin/international/serviceability'

export const internationalServiceabilityService = {
  async list() {
    const { data } = await api.get(base)
    return data.data || []
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
