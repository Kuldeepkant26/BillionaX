import api, { unwrap } from "./axiosInstance.js";

export const dashboard = () => api.get("/admin/dashboard").then(unwrap);

export const listHotels = (params) => api.get("/admin/hotels", { params }).then(unwrap);
export const listHotelCities = () => api.get("/admin/hotels/cities").then(unwrap);
export const createHotel = (payload) => api.post("/admin/hotels", payload).then(unwrap);
export const getHotel = (id) => api.get(`/admin/hotels/${id}`).then(unwrap);
export const updateHotel = (id, payload) => api.patch(`/admin/hotels/${id}`, payload).then(unwrap);

export const createHotelAdmin = (id, payload) =>
  api.post(`/admin/hotels/${id}/admins`, payload).then(unwrap);
export const sellCoins = (id, payload) => api.post(`/admin/hotels/${id}/coins`, payload).then(unwrap);
export const hotelTransactions = (id, params) =>
  api.get(`/admin/hotels/${id}/transactions`, { params }).then(unwrap);

export const deleteHotel = (id) => api.delete(`/admin/hotels/${id}`).then(unwrap);

export const listTransactions = (params) => api.get("/admin/transactions", { params }).then(unwrap);

export const listGuests = (params) => api.get("/admin/guests", { params }).then(unwrap);
export const getGuest = (id) => api.get(`/admin/guests/${id}`).then(unwrap);
export const updateGuest = (id, payload) => api.patch(`/admin/guests/${id}`, payload).then(unwrap);
export const deleteGuest = (id) => api.delete(`/admin/guests/${id}`).then(unwrap);

export const listAdmins = (params) => api.get("/admin/admins", { params }).then(unwrap);
export const createAdmin = (payload) => api.post("/admin/admins", payload).then(unwrap);
export const updateAdmin = (id, payload) => api.patch(`/admin/admins/${id}`, payload).then(unwrap);
export const deleteAdmin = (id) => api.delete(`/admin/admins/${id}`).then(unwrap);

export const getSettings = () => api.get("/admin/settings").then(unwrap);
export const updateSettings = (payload) => api.patch("/admin/settings", payload).then(unwrap);
