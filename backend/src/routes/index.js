import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import guestRoutes from "./guest.routes.js";
import hotelRoutes from "./hotel.routes.js";
import adminRoutes from "./admin.routes.js";
import publicRoutes from "./public.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/public", publicRoutes);
router.use("/auth", authRoutes);
router.use("/guest", guestRoutes);
router.use("/hotel", hotelRoutes);
router.use("/admin", adminRoutes);

export default router;
