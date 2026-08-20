import axios from "axios";
import { getAppState } from "../store/useAppStore.js";

/**
 * Where the API lives.
 *
 * VITE_API_BASE_URL wins when set. Otherwise the API host is derived from
 * whatever host the page was opened on, so the app works unchanged from
 * localhost and from a phone hitting the machine's LAN IP — a hardcoded
 * "localhost" would be the phone itself, and every request would fail.
 */
const API_PORT = import.meta.env.VITE_API_PORT || "5001";

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  `${window.location.protocol}//${window.location.hostname}:${API_PORT}/api/v1`;

export const axiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // sends the httpOnly refresh cookie
  headers: { "Content-Type": "application/json" },
});

// Reads the token from the store rather than localStorage, so a token that was
// just rotated by a refresh is picked up immediately.
axiosInstance.interceptors.request.use((config) => {
  const { accessToken } = getAppState();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/** Paths that must never trigger a refresh attempt (they ARE the auth flow). */
const NO_REFRESH = ["/auth/refresh", "/auth/staff/login", "/auth/guest/verify-otp"];

// Single-flight refresh: ten parallel 401s trigger one refresh, not ten.
let refreshing = null;

const runRefresh = async () => {
  const { data } = await axios.post(`${BASE_URL}/auth/refresh`, null, {
    withCredentials: true,
  });
  const { user, accessToken } = data.data;
  getAppState().setAuth({ user, accessToken });
  return accessToken;
};

const toApiError = (error) => {
  const res = error.response;
  const apiError = new Error(res?.data?.message || error.message || "Something went wrong");
  // Preserved so callers can branch on status and render per-field messages.
  // The previous implementation discarded both.
  apiError.status = res?.status;
  apiError.details = res?.data?.details || [];
  apiError.fieldErrors = Object.fromEntries(
    (res?.data?.details || []).filter((d) => d.field).map((d) => [d.field, d.message])
  );
  return apiError;
};

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthPath = NO_REFRESH.some((p) => original?.url?.includes(p));

    if (status === 401 && original && !original._retried && !isAuthPath) {
      original._retried = true;

      try {
        refreshing = refreshing || runRefresh().finally(() => {
          refreshing = null;
        });
        const token = await refreshing;

        original.headers.Authorization = `Bearer ${token}`;
        return axiosInstance(original);
      } catch {
        getAppState().logout();
        return Promise.reject(toApiError(error));
      }
    }

    return Promise.reject(toApiError(error));
  }
);

/** Unwraps the { statusCode, success, message, data } envelope. */
export const unwrap = (response) => response.data?.data;

export default axiosInstance;
