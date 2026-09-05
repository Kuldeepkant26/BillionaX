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

export const addVideoComment = (hotelId, contentId, body, parentId = null) =>
  api
    .post(`/guest/hotels/${hotelId}/videos/${contentId}/comments`, { body, parentId })
    .then(unwrap);

export const listCommentReplies = (hotelId, commentId) =>
  api.get(`/guest/hotels/${hotelId}/comments/${commentId}/replies`).then(unwrap);

export const toggleCommentLike = (hotelId, commentId) =>
  api.post(`/guest/hotels/${hotelId}/comments/${commentId}/like`).then(unwrap);

export const deleteVideoComment = (commentId) =>
  api.delete(`/guest/comments/${commentId}`).then(unwrap);

/* ---- bills -------------------------------------------------------------- */

export const listBills = (params) => api.get("/guest/bills", { params }).then(unwrap);

export const getBill = (billId) => api.get(`/guest/bills/${billId}`).then(unwrap);

/** Opens a payment, applying the coins the guest chose. */
export const payBill = (billId, coins) =>
  api.post(`/guest/bills/${billId}/pay`, { coins }).then(unwrap);

/** Confirms a completed payment and settles the bill. */
export const confirmBill = (billId, payload) =>
  api.post(`/guest/bills/${billId}/confirm`, payload).then(unwrap);

export const cancelBill = (billId) =>
  api.post(`/guest/bills/${billId}/cancel`).then(unwrap);
