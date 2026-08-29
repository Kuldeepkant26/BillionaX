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

/* ---- offers ---------------------------------------------------------- */

export const getOffer = (hotelId, contentId) =>
  api.get(`/guest/hotels/${hotelId}/offers/${contentId}`).then(unwrap);

/* ---- videos ---------------------------------------------------------- */

export const listVideos = (hotelId, params) =>
  api.get(`/guest/hotels/${hotelId}/videos`, { params }).then(unwrap);

export const getVideo = (hotelId, contentId) =>
  api.get(`/guest/hotels/${hotelId}/videos/${contentId}`).then(unwrap);

export const toggleVideoLike = (hotelId, contentId) =>
  api.post(`/guest/hotels/${hotelId}/videos/${contentId}/like`).then(unwrap);

export const listVideoComments = (hotelId, contentId, params) =>
  api.get(`/guest/hotels/${hotelId}/videos/${contentId}/comments`, { params }).then(unwrap);

export const addVideoComment = (hotelId, contentId, body) =>
  api.post(`/guest/hotels/${hotelId}/videos/${contentId}/comments`, { body }).then(unwrap);

export const deleteVideoComment = (commentId) =>
  api.delete(`/guest/comments/${commentId}`).then(unwrap);
