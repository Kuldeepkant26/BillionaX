import api, { unwrap } from "./axiosInstance.js";

export const dashboard = () => api.get("/hotel/dashboard").then(unwrap);

/** This hotel's coins redeemed by month, with the rebate credited against each. */
export const monthlyRedemptions = (params) =>
  api.get("/hotel/reports/monthly-redemptions", { params }).then(unwrap);
export const listRebates = () => api.get("/hotel/rebates").then(unwrap);
export const listMembers = (params) => api.get("/hotel/members", { params }).then(unwrap);
export const allocate = (payload) => api.post("/hotel/members/allocate", payload).then(unwrap);


export const listTransactions = (params) => api.get("/hotel/transactions", { params }).then(unwrap);

export const creditMember = (membershipId, payload) =>
  api.post(`/hotel/members/${membershipId}/credit`, payload).then(unwrap);
export const recordStay = (membershipId, payload) =>
  api.post(`/hotel/members/${membershipId}/stay`, payload).then(unwrap);

export const coinBalance = () => api.get("/hotel/coins/balance").then(unwrap);
export const listPurchases = () => api.get("/hotel/coins/purchases").then(unwrap);
export const listPacks = () => api.get("/hotel/coins/packs").then(unwrap);
export const buyCoins = (payload) => api.post("/hotel/coins/buy", payload).then(unwrap);

// All the list functions forward `params`: usePaginatedList calls
// fetcher(params), so a signature that ignores its argument silently drops the
// page, limit and filters on the floor — which is what contents and offers
// used to do, leaving their filter dropdown and pager inert.
export const listContents = (params) => api.get("/hotel/contents", { params }).then(unwrap);
export const createContent = (payload) => api.post("/hotel/contents", payload).then(unwrap);
export const updateContent = (id, payload) => api.patch(`/hotel/contents/${id}`, payload).then(unwrap);
export const deleteContent = (id) => api.delete(`/hotel/contents/${id}`).then(unwrap);

export const listOffers = (params) => api.get("/hotel/offers", { params }).then(unwrap);
export const createOffer = (payload) => api.post("/hotel/offers", payload).then(unwrap);
export const updateOffer = (id, payload) => api.patch(`/hotel/offers/${id}`, payload).then(unwrap);
export const deleteOffer = (id) => api.delete(`/hotel/offers/${id}`).then(unwrap);

export const listVideos = (params) => api.get("/hotel/videos", { params }).then(unwrap);
export const createVideo = (payload) => api.post("/hotel/videos", payload).then(unwrap);
export const updateVideo = (id, payload) => api.patch(`/hotel/videos/${id}`, payload).then(unwrap);
export const deleteVideo = (id) => api.delete(`/hotel/videos/${id}`).then(unwrap);

/**
 * The hotel's billable services and the coin cap on each.
 *
 * The list is readable by staff as well as managers — the bill composer needs
 * it to populate its per-line dropdown.
 */
export const listServices = (params) => api.get("/hotel/services", { params }).then(unwrap);
export const createService = (payload) => api.post("/hotel/services", payload).then(unwrap);
export const updateService = (id, payload) =>
  api.patch(`/hotel/services/${id}`, payload).then(unwrap);
export const deleteService = (id) => api.delete(`/hotel/services/${id}`).then(unwrap);

export const listPrivileges = (params) => api.get("/hotel/privileges", { params }).then(unwrap);
export const createPrivilege = (payload) => api.post("/hotel/privileges", payload).then(unwrap);
export const updatePrivilege = (id, payload) =>
  api.patch(`/hotel/privileges/${id}`, payload).then(unwrap);
export const deletePrivilege = (id) => api.delete(`/hotel/privileges/${id}`).then(unwrap);

export const listStaff = () => api.get("/hotel/staff").then(unwrap);
export const createStaff = (payload) => api.post("/hotel/staff", payload).then(unwrap);
export const setStaffActive = (id, isActive) =>
  api.patch(`/hotel/staff/${id}`, { isActive }).then(unwrap);

export const getSettings = () => api.get("/hotel/settings").then(unwrap);
export const createLogoUpload = () => api.post("/hotel/settings/logo-upload").then(unwrap);
export const createContentUpload = () => api.post("/hotel/content/image-upload").then(unwrap);
export const createContentVideoUpload = () =>
  api.post("/hotel/content/video-upload").then(unwrap);
export const updateSettings = (payload) => api.patch("/hotel/settings", payload).then(unwrap);

/* ---- video comments (panel preview + moderation) ---------------------- */

/** The full thread on one of this hotel's videos, replies nested. */
export const videoComments = (contentId) =>
  api.get(`/hotel/videos/${contentId}/comments`).then(unwrap);

/** Moderation: remove a comment posted on this hotel's video. */
export const deleteVideoComment = (commentId) =>
  api.delete(`/hotel/comments/${commentId}`).then(unwrap);

/* ---- bills -------------------------------------------------------------- */

/** Guests at this hotel, matched on name or email. Emails come back masked. */
export const searchGuests = (params) =>
  api.get("/hotel/guests/search", { params }).then(unwrap);

/** The full email, for the identity check before sending a bill. */
export const revealGuestEmail = (guestId) =>
  api.get(`/hotel/guests/${guestId}/email`).then(unwrap);

/** Running total for the composer, priced by the same code that stores it. */
export const priceBill = (payload) => api.post("/hotel/bills/price", payload).then(unwrap);

export const createBill = (payload) => api.post("/hotel/bills", payload).then(unwrap);

/**
 * This hotel's bills. `status` may be a string or an array — the history view
 * asks for the three terminal states at once.
 */
export const listBills = (params) => api.get("/hotel/bills", { params }).then(unwrap);

/** One bill in full, for the detail dialog. */
export const getBill = (billId) => api.get(`/hotel/bills/${billId}`).then(unwrap);

/**
 * Voids a pending bill from the panel.
 *
 * The server decides whether this user may — an admin any bill at their hotel,
 * a staff member only one they sent — so a 403 here is a real answer to show,
 * not a bug to hide.
 */
export const cancelBill = (billId) =>
  api.post(`/hotel/bills/${billId}/cancel`).then(unwrap);

/* ---- support: this account's thread with the platform team ------------- */

/*
 * No id in any of these: a thread is keyed on the signed-in account, and the
 * property comes from the token. See the backend's hotel.routes.js.
 */

export const listSupportMessages = () => api.get("/hotel/support/messages").then(unwrap);

export const supportUnreadCount = () => api.get("/hotel/support/unread-count").then(unwrap);

export const markSupportRead = () => api.post("/hotel/support/read").then(unwrap);

export const sendSupportMessage = (body) =>
  api.post("/hotel/support/messages", { body }).then(unwrap);

/* ---- support: this property's queue of guest conversations ------------ */

/*
 * The other direction from the block above — here the hotel answers rather
 * than asks. The guest's id is in the path; the PROPERTY still is not, because
 * it comes from the token and must never be something a caller can pass.
 */

export const listGuestThreads = (params) =>
  api.get("/hotel/support/guests", { params }).then(unwrap);

export const guestThreadUnreadCount = () =>
  api.get("/hotel/support/guests/unread-count").then(unwrap);

export const getGuestThread = (userId) =>
  api.get(`/hotel/support/guests/${userId}`).then(unwrap);

// `{}`, never null: axios serialises a null body to the four characters
// "null" under a JSON content-type, which express.json() rejects with a 400
// before the route is reached. See admin.api.js.
export const markGuestThreadRead = (userId) =>
  api.post(`/hotel/support/guests/${userId}/read`, {}).then(unwrap);

export const replyToGuestThread = (userId, body) =>
  api.post(`/hotel/support/guests/${userId}/messages`, { body }).then(unwrap);

/* ---------------------------------------------------------- invoices ---- */

export const listInvoices = (params) => api.get("/hotel/invoices", { params }).then(unwrap);

/** One invoice plus its rendered HTML: { invoice, html }. Scoped server-side. */
export const getInvoice = (invoiceId) => api.get(`/hotel/invoices/${invoiceId}`).then(unwrap);
