import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import * as feedService from "../services/feed.service.js";
import * as uploadService from "../services/upload.service.js";

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

/* ---- writing -------------------------------------------------------- */

export const createPost = asyncHandler(async (req, res) => {
  const data = await feedService.createPost({
    actor: req.user,
    images: req.body.images,
    caption: req.body.caption,
  });
  res.status(201).json(new ApiResponse(201, data, "Posted"));
});

export const updatePost = asyncHandler(async (req, res) => {
  const data = await feedService.updateCaption({
    postId: req.params.postId,
    actor: req.user,
    caption: req.body.caption,
  });
  res.status(200).json(new ApiResponse(200, data, "Updated"));
});

export const deletePost = asyncHandler(async (req, res) => {
  const data = await feedService.deletePost({
    postId: req.params.postId,
    actor: req.user,
  });
  res.status(200).json(new ApiResponse(200, data, "Deleted"));
});

/**
 * A one-shot signature for ONE feed image — a ten-image carousel calls this
 * ten times.
 *
 * One-per-image rather than a batch because createUploadSignature bakes a
 * single public_id into the signature, so a batch would have to return ten of
 * them anyway; and a client that uploads three, fails, and retries would then
 * be holding seven stale signatures.
 *
 * The public_id is namespaced by the caller and carries a random suffix, the
 * same shape createContentUpload uses: a post's images are never replaced, so
 * every upload is a genuinely new asset and reusing an id would make the CDN
 * serve someone else's picture.
 */
export const createFeedImageUpload = asyncHandler(async (req, res) => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const data = uploadService.createUploadSignature({
    folder: "feed",
    publicId: `feed_${req.user._id}_${suffix}`,
  });
  res.status(200).json(new ApiResponse(200, data));
});

/* ---- likes and saves -------------------------------------------------- */

export const toggleLike = asyncHandler(async (req, res) => {
  const data = await feedService.toggleLike({
    postId: req.params.postId,
    userId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const listPostLikes = asyncHandler(async (req, res) => {
  const data = await feedService.listPostLikes({
    postId: req.params.postId,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const toggleSave = asyncHandler(async (req, res) => {
  const data = await feedService.toggleSave({
    postId: req.params.postId,
    userId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const listSavedPosts = asyncHandler(async (req, res) => {
  const data = await feedService.listSavedPosts({
    userId: req.user._id,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.status(200).json(new ApiResponse(200, data));
});

/* ---- panel lists ------------------------------------------------------ */

export const listMyPosts = asyncHandler(async (req, res) => {
  const data = await feedService.listMyPosts({
    userId: req.user._id,
    cursor: req.query.cursor,
    limit: req.query.limit,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const listHotelPosts = asyncHandler(async (req, res) => {
  // The actor, not a hotelId from the request: the hotel is always the
  // caller's own. See the rule at the top of feed.service.js.
  const data = await feedService.listHotelPosts({
    actor: req.user,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const listModerationPosts = asyncHandler(async (req, res) => {
  const data = await feedService.listModerationPosts({
    actor: req.user,
    page: req.query.page,
    limit: req.query.limit,
    role: req.query.role,
    hotelId: req.query.hotelId,
    q: req.query.q,
  });
  res.status(200).json(new ApiResponse(200, data));
});

/* ---- comments --------------------------------------------------------- */

export const listComments = asyncHandler(async (req, res) => {
  const data = await feedService.listComments({
    postId: req.params.postId,
    userId: req.user._id,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const addComment = asyncHandler(async (req, res) => {
  const data = await feedService.addComment({
    postId: req.params.postId,
    actor: req.user,
    body: req.body.body,
    parentId: req.body.parentId || null,
  });
  res.status(201).json(new ApiResponse(201, data, "Comment posted"));
});

export const listReplies = asyncHandler(async (req, res) => {
  const data = await feedService.listReplies({
    commentId: req.params.commentId,
    userId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const toggleCommentLike = asyncHandler(async (req, res) => {
  const data = await feedService.toggleCommentLike({
    commentId: req.params.commentId,
    userId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const deleteComment = asyncHandler(async (req, res) => {
  const data = await feedService.deleteComment({
    commentId: req.params.commentId,
    actor: req.user,
  });
  res.status(200).json(new ApiResponse(200, data, "Deleted"));
});

export const listCommentInbox = asyncHandler(async (req, res) => {
  const data = await feedService.listCommentInbox({
    userId: req.user._id,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.status(200).json(new ApiResponse(200, data));
});
