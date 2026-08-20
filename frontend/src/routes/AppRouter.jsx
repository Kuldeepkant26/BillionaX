import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ROUTES } from "../constants/routePaths.js";
import { ROLES } from "../store/slices/authSlice.js";
import { RoleRoute, PublicOnlyRoute } from "./guards.jsx";
import { Loading } from "../components/common/index.jsx";

// Eager, unlike the pages below: a lazily-loaded fallback would itself need
// loading, which is the exact problem it exists to solve. They are small.
import {
  HomeSkeleton,
  ListSkeleton,
  OffersSkeleton,
  ProfileSkeleton,
  RedeemSkeleton,
} from "../features/guest/GuestSkeletons.jsx";

import GuestLayout from "../components/layout/GuestLayout.jsx";
import LandingPage from "../pages/LandingPage.jsx";
import JoinPage from "../pages/guest/JoinPage.jsx";
import NotFoundPage from "../pages/NotFoundPage.jsx";
import StaffLoginPage from "../pages/auth/StaffLoginPage.jsx";

// Panels are lazy so a guest on a phone never downloads the admin bundles.
const HotelPanelLayout = lazy(() => import("../components/layout/HotelPanelLayout.jsx"));
const AdminPanelLayout = lazy(() => import("../components/layout/AdminPanelLayout.jsx"));

const GuestHomePage = lazy(() => import("../pages/guest/GuestHomePage.jsx"));
const RedeemPage = lazy(() => import("../pages/guest/RedeemPage.jsx"));
const HistoryPage = lazy(() => import("../pages/guest/HistoryPage.jsx"));
const OffersPage = lazy(() => import("../pages/guest/OffersPage.jsx"));
const NotificationsPage = lazy(() => import("../pages/guest/NotificationsPage.jsx"));
const ProfilePage = lazy(() => import("../pages/guest/ProfilePage.jsx"));

const HotelDashboardPage = lazy(() => import("../pages/hotel/HotelDashboardPage.jsx"));
const VerifyPage = lazy(() => import("../pages/hotel/VerifyPage.jsx"));
const MembersPage = lazy(() => import("../pages/hotel/MembersPage.jsx"));
const TransactionsPage = lazy(() => import("../pages/hotel/TransactionsPage.jsx"));
const CoinsPage = lazy(() => import("../pages/hotel/CoinsPage.jsx"));
const ContentPage = lazy(() => import("../pages/hotel/ContentPage.jsx"));
const PrivilegesPage = lazy(() => import("../pages/hotel/PrivilegesPage.jsx"));
const StaffPage = lazy(() => import("../pages/hotel/StaffPage.jsx"));
const HotelSettingsPage = lazy(() => import("../pages/hotel/HotelSettingsPage.jsx"));

const AdminDashboardPage = lazy(() => import("../pages/admin/AdminDashboardPage.jsx"));
const HotelsPage = lazy(() => import("../pages/admin/HotelsPage.jsx"));
const HotelDetailPage = lazy(() => import("../pages/admin/HotelDetailPage.jsx"));
const GuestsPage = lazy(() => import("../pages/admin/GuestsPage.jsx"));
const AdminsPage = lazy(() => import("../pages/admin/AdminsPage.jsx"));
const AdminTransactionsPage = lazy(() => import("../pages/admin/AdminTransactionsPage.jsx"));
const AdminSettingsPage = lazy(() => import("../pages/admin/AdminSettingsPage.jsx"));

const lazyEl = (node) => <Suspense fallback={<Loading />}>{node}</Suspense>;

// MAIN_ADMIN is deliberately excluded: they have no hotel of their own, so
// every /hotel/* call would 400 for want of a hotelId. They manage hotels from
// the admin panel instead, and RoleRoute redirects them there.
const HOTEL_ROLES = [ROLES.HOTEL_ADMIN, ROLES.HOTEL_STAFF];
const HOTEL_ADMIN_ONLY = [ROLES.HOTEL_ADMIN];

/**
 * Guest routes fall back to the page's OWN skeleton, not the shared spinner.
 *
 * These pages are code-split, so a cold load has two waits back to back: the
 * chunk downloading, then its first fetch. With a spinner here the guest saw a
 * spinner, then a skeleton, then content — three states for one navigation.
 * Using the same skeleton for both makes it one continuous placeholder that
 * simply fills in.
 */
const guestRoute = (element, fallback) => ({
  element: (
    <Suspense fallback={fallback}>
      <RoleRoute allow={[ROLES.GUEST]}>{element}</RoleRoute>
    </Suspense>
  ),
});

const router = createBrowserRouter([
  // ---------- guest (Emerald Noir) ----------
  {
    path: ROUTES.HOME,
    element: <GuestLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "join/:slug", element: <JoinPage /> },
      { path: "login", element: <JoinPage /> },
      { path: "app", ...guestRoute(<GuestHomePage />, <HomeSkeleton />) },
      { path: "app/redeem", ...guestRoute(<RedeemPage />, <RedeemSkeleton />) },
      {
        path: "app/history",
        ...guestRoute(<HistoryPage />, <ListSkeleton label="Loading your history" />),
      },
      { path: "app/offers", ...guestRoute(<OffersPage />, <OffersSkeleton />) },
      {
        path: "app/alerts",
        ...guestRoute(<NotificationsPage />, <ListSkeleton label="Loading your alerts" />),
      },
      { path: "app/profile", ...guestRoute(<ProfilePage />, <ProfileSkeleton />) },
    ],
  },

  // ---------- hotel panel (Ink Minimal) ----------
  {
    path: "hotel/login",
    element: (
      <PublicOnlyRoute>
        <StaffLoginPage title="Hotel panel" subtitle="Sign in to manage your loyalty programme" />
      </PublicOnlyRoute>
    ),
  },
  {
    path: "hotel",
    element: lazyEl(
      <RoleRoute allow={HOTEL_ROLES} loginPath={ROUTES.HOTEL_LOGIN}>
        <HotelPanelLayout />
      </RoleRoute>
    ),
    errorElement: <NotFoundPage />,
    children: [
      {
        index: true,
        element: lazyEl(
          <RoleRoute allow={HOTEL_ADMIN_ONLY} loginPath={ROUTES.HOTEL_LOGIN}>
            <HotelDashboardPage />
          </RoleRoute>
        ),
      },
      { path: "verify", element: lazyEl(<VerifyPage />) },
      { path: "transactions", element: lazyEl(<TransactionsPage />) },
      {
        path: "members",
        element: lazyEl(<MembersPage canAllocate />),
      },
      {
        path: "coins",
        element: lazyEl(
          <RoleRoute allow={HOTEL_ADMIN_ONLY} loginPath={ROUTES.HOTEL_LOGIN}>
            <CoinsPage />
          </RoleRoute>
        ),
      },
      {
        path: "content",
        element: lazyEl(
          <RoleRoute allow={HOTEL_ADMIN_ONLY} loginPath={ROUTES.HOTEL_LOGIN}>
            <ContentPage kind="content" />
          </RoleRoute>
        ),
      },
      {
        path: "offers",
        element: lazyEl(
          <RoleRoute allow={HOTEL_ADMIN_ONLY} loginPath={ROUTES.HOTEL_LOGIN}>
            <ContentPage kind="offers" />
          </RoleRoute>
        ),
      },
      {
        path: "privileges",
        element: lazyEl(
          <RoleRoute allow={HOTEL_ADMIN_ONLY} loginPath={ROUTES.HOTEL_LOGIN}>
            <PrivilegesPage />
          </RoleRoute>
        ),
      },
      {
        path: "staff",
        element: lazyEl(
          <RoleRoute allow={HOTEL_ADMIN_ONLY} loginPath={ROUTES.HOTEL_LOGIN}>
            <StaffPage />
          </RoleRoute>
        ),
      },
      {
        path: "settings",
        element: lazyEl(
          <RoleRoute allow={HOTEL_ADMIN_ONLY} loginPath={ROUTES.HOTEL_LOGIN}>
            <HotelSettingsPage />
          </RoleRoute>
        ),
      },
    ],
  },

  // ---------- admin panel (Ink Minimal) ----------
  {
    path: "admin/login",
    element: (
      <PublicOnlyRoute>
        <StaffLoginPage title="Billionax" subtitle="Platform administration" />
      </PublicOnlyRoute>
    ),
  },
  {
    path: "admin",
    element: lazyEl(
      <RoleRoute allow={[ROLES.MAIN_ADMIN]} loginPath={ROUTES.ADMIN_LOGIN}>
        <AdminPanelLayout />
      </RoleRoute>
    ),
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: lazyEl(<AdminDashboardPage />) },
      { path: "hotels", element: lazyEl(<HotelsPage />) },
      { path: "hotels/:hotelId", element: lazyEl(<HotelDetailPage />) },
      { path: "guests", element: lazyEl(<GuestsPage />) },
      { path: "admins", element: lazyEl(<AdminsPage />) },
      { path: "transactions", element: lazyEl(<AdminTransactionsPage />) },
      { path: "settings", element: lazyEl(<AdminSettingsPage />) },
    ],
  },

  { path: "*", element: <NotFoundPage /> },
]);

const AppRouter = () => <RouterProvider router={router} />;

export default AppRouter;
