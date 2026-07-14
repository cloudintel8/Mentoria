import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' })

api.interceptors.request.use((config) => {
  const auth = JSON.parse(localStorage.getItem('cloudlearn-auth') || 'null')
  if (auth?.token) config.headers.Authorization = `Bearer ${auth.token}`
  return config
})

export default api

