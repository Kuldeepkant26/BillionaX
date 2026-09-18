import api, { unwrap } from "./axiosInstance.js";

export const dashboard = () => api.get("/admin/dashboard").then(unwrap);

/** Coins redeemed by month, optionally scoped to one hotel or a custom range. */
export const monthlyRedemptions = (params) =>
  api.get("/admin/reports/monthly-redemptions", { params }).then(unwrap);
export const listRebates = (params) => api.get("/admin/rebates", { params }).then(unwrap);
export const runRebate = (payload) => api.post("/admin/rebates/run", payload).then(unwrap);

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

/* ---- payments -------------------------------------------------------- */

/** Credential status and the live payment mode. Never includes a secret. */
export const getPaymentSettings = () => api.get("/admin/payments").then(unwrap);

export const savePaymentSettings = (payload) =>
  api.patch("/admin/payments", payload).then(unwrap);

export const clearPaymentSettings = () => api.delete("/admin/payments").then(unwrap);

/* ---- hotel onboarding ------------------------------------------------- */

export const saveOnboarding = (hotelId, payload) =>
  api.patch(`/admin/hotels/${hotelId}/onboarding`, payload).then(unwrap);

/** Starts a reverse penny drop; returns a UPI link for the owner to pay ₹1. */
export const verifyBank = (hotelId, payload) =>
  api.post(`/admin/hotels/${hotelId}/bank-verification`, payload).then(unwrap);

/** Creates the Route payout account from the VERIFIED bank details. */
export const createLinkedAccount = (hotelId, payload) =>
  api.post(`/admin/hotels/${hotelId}/linked-account`, payload).then(unwrap);

/* ---- support inbox ---------------------------------------------------- */

/*
 * Every call takes a `party` — "GUEST" or "HOTEL" — naming which queue it is
 * about. The server defaults to GUEST when it is absent, but these pass it
 * explicitly: the inbox always knows which tab it is on, and an implicit
 * default is how one tab ends up silently reading the other's threads.
 */

export const listSupportThreads = (params) => api.get("/admin/support", { params }).then(unwrap);

/** Both queues' counts in one call: { guest, hotel, unread }. */
export const supportUnreadCount = () => api.get("/admin/support/unread-count").then(unwrap);

export const getSupportThread = (userId, party) =>
  api.get(`/admin/support/${userId}`, { params: { party } }).then(unwrap);

/*
 * The empty object is load-bearing. Passing `null` as the body makes axios
 * send the four characters `null` under a JSON content-type, which
 * express.json() rejects as a parse error — a 400 raised before the router, so
 * the party rule never runs and the failure looks like a rejected `party`
 * rather than an unparseable body. `{}` is what every other POST here sends.
 */
export const markSupportThreadRead = (userId, party) =>
  api.post(`/admin/support/${userId}/read`, {}, { params: { party } }).then(unwrap);

export const replyToSupportThread = (userId, party, body) =>
  api.post(`/admin/support/${userId}/messages`, { body }, { params: { party } }).then(unwrap);

/* ---------------------------------------------------------- invoices ---- */

export const listInvoices = (params) => api.get("/admin/invoices", { params }).then(unwrap);

/** One invoice plus its rendered HTML: { invoice, html }. */
export const getInvoice = (invoiceId) => api.get(`/admin/invoices/${invoiceId}`).then(unwrap);

// `{}`, never null — see the note on markSupportThreadRead above.
export const resendInvoice = (invoiceId) =>
  api.post(`/admin/invoices/${invoiceId}/resend`, {}).then(unwrap);

/** The stored template plus the shipped defaults the Reset button restores. */
export const getInvoiceTemplate = () => api.get("/admin/invoices/template").then(unwrap);

export const updateInvoiceTemplate = (payload) =>
  api.patch("/admin/invoices/template", payload).then(unwrap);

/**
 * Renders the UNSAVED draft against sample data, for the editor's live
 * preview. A POST because the draft travels in the body, and it persists
 * nothing — no invoice number is consumed.
 */
export const previewInvoiceTemplate = (payload) =>
  api.post("/admin/invoices/template/preview", payload).then(unwrap);
