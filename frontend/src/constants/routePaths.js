export const ROUTES = {
  // guest
  HOME: "/",
  JOIN: "/join/:slug",
  LOGIN: "/login",
  APP: "/app",
  APP_PAY: "/app/pay",
  APP_HISTORY: "/app/history",
  APP_OFFERS: "/app/offers",
  APP_OFFER: "/app/offers/:contentId",
  APP_VIDEO: "/app/watch/:contentId",
  APP_ALERTS: "/app/alerts",
  APP_PROFILE: "/app/profile",
  APP_FAQ: "/app/faq",
  APP_HELP: "/app/help",
  APP_HELP_CHAT: "/app/help/chat",
  APP_FEED: "/app/feed",
  APP_FEED_SAVED: "/app/feed/saved",
  APP_FEED_POST: "/app/feed/p/:postId",
  APP_FEED_PROFILE: "/app/feed/u/:userId",

  // hotel panel
  HOTEL_LOGIN: "/hotel/login",
  HOTEL: "/hotel",
  HOTEL_BILL: "/hotel/bill",
  HOTEL_TRANSACTIONS: "/hotel/transactions",
  HOTEL_MEMBERS: "/hotel/members",
  HOTEL_COINS: "/hotel/coins",
  HOTEL_CONTENT: "/hotel/guest-content",
  HOTEL_PRIVILEGES: "/hotel/privileges",
  HOTEL_SERVICES: "/hotel/services",
  HOTEL_STAFF: "/hotel/staff",
  HOTEL_SETTINGS: "/hotel/settings",
  HOTEL_FEED: "/hotel/feed",
  HOTEL_SUPPORT: "/hotel/support",

  // admin panel
  ADMIN_LOGIN: "/admin/login",
  ADMIN: "/admin",
  ADMIN_HOTELS: "/admin/hotels",
  ADMIN_HOTEL_DETAIL: "/admin/hotels/:hotelId",
  ADMIN_GUESTS: "/admin/guests",
  ADMIN_ADMINS: "/admin/admins",
  ADMIN_TRANSACTIONS: "/admin/transactions",
  ADMIN_PAYMENTS: "/admin/payments",
  ADMIN_SETTINGS: "/admin/settings",
  ADMIN_FEED: "/admin/feed",
  ADMIN_SUPPORT: "/admin/support",
  ADMIN_SUPPORT_THREAD: "/admin/support/:userId",
};

export const joinPath = (slug) => `/join/${slug}`;
export const adminHotelPath = (id) => `/admin/hotels/${id}`;
export const videoPath = (contentId) => `/app/watch/${contentId}`;
export const offerPath = (contentId) => `/app/offers/${contentId}`;
export const feedPostPath = (postId) => `/app/feed/p/${postId}`;
export const feedProfilePath = (userId) => `/app/feed/u/${userId}`;
export const supportThreadPath = (userId) => `/admin/support/${userId}`;

/** Where each role belongs after signing in. */
export const homeForRole = (role) =>
  ({
    MAIN_ADMIN: ROUTES.ADMIN,
    HOTEL_ADMIN: ROUTES.HOTEL,
    HOTEL_STAFF: ROUTES.HOTEL_BILL,
    GUEST: ROUTES.APP,
  }[role] || ROUTES.HOME);
