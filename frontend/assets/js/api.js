/**
 * API Client - Central fetch wrapper injecting JWT Authorization headers,
 * handling 401 redirects, JSON parsing, and unified error handling.
 */

import { showToast } from './toast.js';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const token = localStorage.getItem('token');

  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Only set JSON Content-Type if there is a body that is not FormData
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const isLoginPage = window.location.pathname.endsWith('/login.html') || window.location.pathname === '/login.html';
      if (!isLoginPage) {
        window.location.href = '/login.html?expired=1';
      }
      throw new ApiError('Session expired. Please log in again.', 401, 'UNAUTHORIZED');
    }

    // Check for response content type
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
      let errorCode = 'REQUEST_FAILED';
      let details = null;

      if (contentType.includes('application/json')) {
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errorMessage = errData.error.message || errorMessage;
            errorCode = errData.error.code || errorCode;
            details = errData.error.details || null;
          }
        } catch {
          // ignore json parse error
        }
      }

      throw new ApiError(errorMessage, response.status, errorCode, details);
    }

    if (contentType.includes('application/json')) {
      return await response.json();
    }

    return response;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(err.message || 'Network error occurred', 0, 'NETWORK_ERROR');
  }
}

export const api = {
  get(endpoint, params = {}) {
    let url = endpoint;
    const query = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        query.append(key, val);
      }
    }
    const qStr = query.toString();
    if (qStr) {
      url += (url.includes('?') ? '&' : '?') + qStr;
    }
    return request(url, { method: 'GET' });
  },

  post(endpoint, data = {}) {
    return request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  patch(endpoint, data = {}) {
    return request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete(endpoint) {
    return request(endpoint, { method: 'DELETE' });
  },

  upload(endpoint, formData) {
    return request(endpoint, {
      method: 'POST',
      body: formData,
    });
  },

  async getBlob(endpoint) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html?expired=1';
      }
      throw new ApiError(`Failed to fetch file: ${response.statusText}`, response.status);
    }
    return await response.blob();
  },

  getToken() {
    return localStorage.getItem('token');
  },
};

export default api;

