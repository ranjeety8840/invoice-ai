const BASE_URL =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_URL) ||
  "";

export { BASE_URL };

import axios from "axios";

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 120000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.detail || err.message || "Request failed";
    return Promise.reject(
      new Error(typeof msg === "string" ? msg : JSON.stringify(msg)),
    );
  },
);

export { api };

export const invoiceApi = {
  upload: (file: File, userId?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post("/invoices/upload", fd, {
      params: userId ? { user_id: userId } : {},
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  uploadBatch: (files: File[], userId?: string) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return api.post("/invoices/upload/batch", fd, {
      params: userId ? { user_id: userId } : {},
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  list: (params?: {
    skip?: number;
    limit?: number;
    vendor?: string;
    currency?: string;
    status?: string;
    search?: string;
  }) => api.get("/invoices/", { params }),
  get: (id: string) => api.get(`/invoices/${id}`),
  retry: (id: string) => api.post(`/invoices/${id}/retry`),
  delete: (id: string) => api.delete(`/invoices/${id}`),
  normalizeVendors: () => api.post("/invoices/normalize-vendors"),
};

export const analyticsApi = {
  summary: (params?: {
    start_date?: string;
    end_date?: string;
    currency?: string;
  }) => api.get("/analytics/summary", { params }),
  vendorGroups: () => api.get("/analytics/vendor-groups"),
  duplicates: () => api.get("/analytics/duplicates"),
  formats: () => api.get("/analytics/formats"),
  spendByVendor: (currency?: string) =>
    api.get("/analytics/spend-by-vendor", {
      params: currency ? { currency } : {},
    }),
};

export const healthApi = {
  check: () => api.get("/health"),
};

export default api;