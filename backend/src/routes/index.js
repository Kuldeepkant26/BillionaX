import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import guestRoutes from "./guest.routes.js";
import hotelRoutes from "./hotel.routes.js";
import adminRoutes from "./admin.routes.js";
import publicRoutes from "./public.routes.js";
import feedRoutes from "./feed.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/public", publicRoutes);
router.use("/auth", authRoutes);
router.use("/guest", guestRoutes);
router.use("/hotel", hotelRoutes);
router.use("/admin", adminRoutes);
// The global feed. Unlike the routers above this one is not scoped to a role or
// a hotel — see feed.routes.js for why, and for what replaces requireSameHotel.
router.use("/feed", feedRoutes);

export default router;
