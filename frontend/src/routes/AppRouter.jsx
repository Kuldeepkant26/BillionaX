import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
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
  OfferSkeleton,
  VideoSkeleton,
  ProfileSkeleton,
  PaySkeleton,
  FeedSkeleton,
  FeedGridSkeleton,
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
const PayPage = lazy(() => import("../pages/guest/PayPage.jsx"));
const HistoryPage = lazy(() => import("../pages/guest/HistoryPage.jsx"));
const OffersPage = lazy(() => import("../pages/guest/OffersPage.jsx"));
const OfferPage = lazy(() => import("../pages/guest/OfferPage.jsx"));
const VideoPage = lazy(() => import("../pages/guest/VideoPage.jsx"));
const NotificationsPage = lazy(() => import("../pages/guest/NotificationsPage.jsx"));
const ProfilePage = lazy(() => import("../pages/guest/ProfilePage.jsx"));
const FaqPage = lazy(() => import("../pages/guest/FaqPage.jsx"));
const FeedPage = lazy(() => import("../pages/guest/FeedPage.jsx"));
const FeedPostPage = lazy(() => import("../pages/guest/FeedPostPage.jsx"));
const FeedProfilePage = lazy(() => import("../pages/guest/FeedProfilePage.jsx"));
const SavedPostsPage = lazy(() => import("../pages/guest/SavedPostsPage.jsx"));

const HotelDashboardPage = lazy(() => import("../pages/hotel/HotelDashboardPage.jsx"));
const BillPage = lazy(() => import("../pages/hotel/BillPage.jsx"));
const MembersPage = lazy(() => import("../pages/hotel/MembersPage.jsx"));
const TransactionsPage = lazy(() => import("../pages/hotel/TransactionsPage.jsx"));
const CoinsPage = lazy(() => import("../pages/hotel/CoinsPage.jsx"));
const GuestContentPage = lazy(() => import("../pages/hotel/GuestContentPage.jsx"));
const HotelFeedPage = lazy(() => import("../pages/hotel/HotelFeedPage.jsx"));
const PrivilegesPage = lazy(() => import("../pages/hotel/PrivilegesPage.jsx"));
const ServicesPage = lazy(() => import("../pages/hotel/ServicesPage.jsx"));
const StaffPage = lazy(() => import("../pages/hotel/StaffPage.jsx"));
const HotelSettingsPage = lazy(() => import("../pages/hotel/HotelSettingsPage.jsx"));

const AdminDashboardPage = lazy(() => import("../pages/admin/AdminDashboardPage.jsx"));
const HotelsPage = lazy(() => import("../pages/admin/HotelsPage.jsx"));
const HotelDetailPage = lazy(() => import("../pages/admin/HotelDetailPage.jsx"));
const GuestsPage = lazy(() => import("../pages/admin/GuestsPage.jsx"));
const AdminsPage = lazy(() => import("../pages/admin/AdminsPage.jsx"));
const AdminTransactionsPage = lazy(() => import("../pages/admin/AdminTransactionsPage.jsx"));
const AdminSettingsPage = lazy(() => import("../pages/admin/AdminSettingsPage.jsx"));
const AdminPaymentsPage = lazy(() => import("../pages/admin/AdminPaymentsPage.jsx"));
const AdminFeedPage = lazy(() => import("../pages/admin/AdminFeedPage.jsx"));

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
      { path: "app/pay", ...guestRoute(<PayPage />, <PaySkeleton />) },
      // The Redeem tab became Pay when billing moved into the app. Kept as a
      // redirect: guests have it bookmarked, and historical notification
      // hrefs still point at it.
      { path: "app/redeem", element: <Navigate to="/app/pay" replace /> },
      {
        path: "app/history",
        ...guestRoute(<HistoryPage />, <ListSkeleton label="Loading your history" />),
      },
      { path: "app/offers", ...guestRoute(<OffersPage />, <OffersSkeleton />) },
      // Drill-down under the list it came from, so the URL reads as one.
      { path: "app/offers/:contentId", ...guestRoute(<OfferPage />, <OfferSkeleton />) },
      // Nested under the guest shell, so the bottom nav stays put while
      // watching — leaving the video is a back gesture, not a re-navigation.
      { path: "app/watch/:contentId", ...guestRoute(<VideoPage />, <VideoSkeleton />) },
      {
        path: "app/alerts",
        ...guestRoute(<NotificationsPage />, <ListSkeleton label="Loading your alerts" />),
      },
      { path: "app/profile", ...guestRoute(<ProfilePage />, <ProfileSkeleton />) },
      { path: "app/faq", ...guestRoute(<FaqPage />, <ListSkeleton label="Loading answers" />) },
      // The feed. "saved" is a literal and must not be read as a :postId, which
      // is why the post and profile drill-downs sit under /p/ and /u/ rather
      // than directly under /app/feed/.
      { path: "app/feed", ...guestRoute(<FeedPage />, <FeedSkeleton />) },
      { path: "app/feed/saved", ...guestRoute(<SavedPostsPage />, <FeedGridSkeleton />) },
      { path: "app/feed/p/:postId", ...guestRoute(<FeedPostPage />, <FeedSkeleton />) },
      { path: "app/feed/u/:userId", ...guestRoute(<FeedProfilePage />, <FeedGridSkeleton />) },
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
      { path: "bill", element: lazyEl(<BillPage />) },
      // /hotel/verify was every staff account's landing page, so it must not
      // 404 — the same reason the three content redirects below exist.
      { path: "verify", element: <Navigate to="/hotel/bill" replace /> },
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
        path: "guest-content",
        element: lazyEl(
          <RoleRoute allow={HOTEL_ADMIN_ONLY} loginPath={ROUTES.HOTEL_LOGIN}>
            <GuestContentPage />
          </RoleRoute>
        ),
      },
      // Not wrapped in RoleRoute, unlike its neighbours: staff post to the feed
      // as themselves, so the tab is theirs too. What differs by role is the
      // SCOPE of the list, and the server decides that from the token.
      { path: "feed", element: lazyEl(<HotelFeedPage />) },
      // The three used to be separate destinations (and "offers" had no nav
      // entry at all). Kept as redirects so an old bookmark still lands on
      // the right tab rather than a 404.
      { path: "content", element: <Navigate to="/hotel/guest-content?tab=slideshow" replace /> },
      { path: "offers", element: <Navigate to="/hotel/guest-content?tab=offers" replace /> },
      { path: "videos", element: <Navigate to="/hotel/guest-content?tab=videos" replace /> },
      {
        path: "privileges",
        element: lazyEl(
          <RoleRoute allow={HOTEL_ADMIN_ONLY} loginPath={ROUTES.HOTEL_LOGIN}>
            <PrivilegesPage />
          </RoleRoute>
        ),
      },
      {
        path: "services",
        element: lazyEl(
          <RoleRoute allow={HOTEL_ADMIN_ONLY} loginPath={ROUTES.HOTEL_LOGIN}>
            <ServicesPage />
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
        <StaffLoginPage
          title="Platform administration"
          subtitle="Sign in to the Billionax control panel"
          headline="The whole network, on one screen."
          blurb="Every hotel, every guest and every coin issued across Billionax — managed from a single control panel."
          points={[
            "Network-wide revenue and commission",
            "Onboard hotels and their staff",
            "Set the rules every property runs on",
          ]}
        />
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
      { path: "feed", element: lazyEl(<AdminFeedPage />) },
      { path: "admins", element: lazyEl(<AdminsPage />) },
      { path: "transactions", element: lazyEl(<AdminTransactionsPage />) },
      { path: "payments", element: lazyEl(<AdminPaymentsPage />) },
      { path: "settings", element: lazyEl(<AdminSettingsPage />) },
    ],
  },

  { path: "*", element: <NotFoundPage /> },
]);

const AppRouter = () => <RouterProvider router={router} />;

export default AppRouter;
