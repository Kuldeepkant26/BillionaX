import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const getHealth = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, { uptime: process.uptime() }, "Server is healthy"));
});
