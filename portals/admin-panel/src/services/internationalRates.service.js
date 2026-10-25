import api from './axios'

export const internationalRatesService = {
  async list() {
    const { data } = await api.get('/admin/international/rates')
    return data.data || []
  },

  async update(id, payload) {
    const { data } = await api.put(`/admin/international/rates/${id}`, payload)
    return data.data
  },
}
