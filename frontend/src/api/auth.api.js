import api, { unwrap } from "./axiosInstance.js";

export const staffLogin = (payload) => api.post("/auth/staff/login", payload).then(unwrap);
export const requestOtp = (identifier) =>
  api.post("/auth/guest/request-otp", { identifier }).then(unwrap);
export const verifyOtp = (payload) => api.post("/auth/guest/verify-otp", payload).then(unwrap);
export const refresh = () => api.post("/auth/refresh").then(unwrap);
export const logout = () => api.post("/auth/logout").then(unwrap);
export const me = () => api.get("/auth/me").then(unwrap);
export const publicHotel = (slug) => api.get(`/public/hotels/${slug}`).then(unwrap);
export const publicConfig = () => api.get("/public/config").then(unwrap);
