import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach the stored JWT on every request — no need to set it manually elsewhere
api.interceptors.request.use(config => {
  const token = localStorage.getItem('votally_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear local state and redirect to login
let _onUnauthorized = null;
export function setUnauthorizedHandler(fn) { _onUnauthorized = fn; }

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && _onUnauthorized) {
      _onUnauthorized();
    }
    return Promise.reject(err);
  }
);

export default api;
