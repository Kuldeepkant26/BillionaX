import api, { unwrap } from "./axiosInstance.js";

export const updateProfile = (payload) => api.patch("/guest/profile", payload).then(unwrap);

/** One-shot Cloudinary credentials for the next avatar upload. */
export const createAvatarUpload = () =>
  api.post("/guest/profile/avatar-upload").then(unwrap);

export const listMemberships = () => api.get("/guest/memberships").then(unwrap);
export const joinHotel = (payload) => api.post("/guest/memberships/join", payload).then(unwrap);
export const getMembership = (hotelId) => api.get(`/guest/memberships/${hotelId}`).then(unwrap);

export const getTransactions = (hotelId, params) =>
  api.get(`/guest/memberships/${hotelId}/transactions`, { params }).then(unwrap);

export const createVoucher = (payload) => api.post("/guest/vouchers", payload).then(unwrap);
export const getActiveVoucher = (hotelId) =>
  api.get("/guest/vouchers/active", { params: { hotelId } }).then(unwrap);
export const cancelVoucher = (id) => api.delete(`/guest/vouchers/${id}`).then(unwrap);

export const getHotelContent = (hotelId) =>
  api.get(`/guest/hotels/${hotelId}/content`).then(unwrap);
