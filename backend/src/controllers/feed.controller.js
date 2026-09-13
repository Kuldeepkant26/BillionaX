import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as feedService from "../services/feed.service.js";

/**
 * The global feed.
 *
 * Thin by the same rule as every other controller here: build the arguments,
 * call the service, wrap the result. No logic, no queries, and no realtime
 * emits — those live in the service, next to the write they describe.
 *
 * Note what is passed down. Reads take `userId` because all they need is whose
 * like and save state to attach. Writes that can be authorised take the whole
 * `actor` (req.user, a Mongoose document), because the service decides what
 * they may touch from their role as well as their id.
 */

export const listFeed = asyncHandler(async (req, res) => {
  const data = await feedService.listFeed({
    userId: req.user._id,
    cursor: req.query.cursor,
    limit: req.query.limit,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const getPost = asyncHandler(async (req, res) => {
  const data = await feedService.getPost({
    postId: req.params.postId,
    userId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const listUserPosts = asyncHandler(async (req, res) => {
  const data = await feedService.listUserPosts({
    targetUserId: req.params.userId,
    userId: req.user._id,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.status(200).json(new ApiResponse(200, data));
});
