import { axiosInstance as api, unwrap } from "./axiosInstance.js";

export const listNotifications = (params) =>
  api.get("/guest/notifications", { params }).then(unwrap);

export const getUnreadCount = () => api.get("/guest/notifications/unread-count").then(unwrap);

export const markNotificationsRead = () => api.post("/guest/notifications/read").then(unwrap);
