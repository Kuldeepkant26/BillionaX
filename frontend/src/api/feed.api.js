import api, { unwrap } from "./axiosInstance.js";

/**
 * The global feed.
 *
 * One module rather than additions to guest/hotel/admin, because the feed is
 * ONE resource every role reads and writes — the caller's role changes what
 * they may do to a row, not which endpoint they call. Splitting it would mean
 * three copies of listFeed and three cache keys for one dataset.
 */

/* ---- reading ---------------------------------------------------------- */

/** Cursor-paginated: pass the previous response's `nextCursor`, not a page. */
export const listFeed = (params) => api.get("/feed", { params }).then(unwrap);

export const getPost = (postId) => api.get(`/feed/posts/${postId}`).then(unwrap);

export const listUserPosts = (userId, params) =>
  api.get(`/feed/users/${userId}/posts`, { params }).then(unwrap);

export const listSavedPosts = (params) => api.get("/feed/saved", { params }).then(unwrap);

/* ---- writing ---------------------------------------------------------- */

export const createPost = (payload) => api.post("/feed/posts", payload).then(unwrap);

/** Caption only — a post's images are immutable. */
export const updatePostCaption = (postId, caption) =>
  api.patch(`/feed/posts/${postId}`, { caption }).then(unwrap);

export const deletePost = (postId) => api.delete(`/feed/posts/${postId}`).then(unwrap);

/** One-shot Cloudinary credentials for ONE image. A carousel calls this per file. */
export const createFeedImageUpload = () => api.post("/feed/upload-signature").then(unwrap);

/* ---- likes and saves -------------------------------------------------- */

export const togglePostLike = (postId) => api.post(`/feed/posts/${postId}/like`).then(unwrap);

export const listPostLikes = (postId, params) =>
  api.get(`/feed/posts/${postId}/likes`, { params }).then(unwrap);

export const togglePostSave = (postId) => api.post(`/feed/posts/${postId}/save`).then(unwrap);

/* ---- comments --------------------------------------------------------- */

export const listPostComments = (postId, params) =>
  api.get(`/feed/posts/${postId}/comments`, { params }).then(unwrap);

export const addPostComment = (postId, body, parentId = null) =>
  api.post(`/feed/posts/${postId}/comments`, { body, parentId }).then(unwrap);

export const listCommentReplies = (commentId) =>
  api.get(`/feed/comments/${commentId}/replies`).then(unwrap);

export const toggleFeedCommentLike = (commentId) =>
  api.post(`/feed/comments/${commentId}/like`).then(unwrap);

export const deleteFeedComment = (commentId) =>
  api.delete(`/feed/comments/${commentId}`).then(unwrap);

/* ---- panel lists ------------------------------------------------------ */

export const listMyPosts = (params) => api.get("/feed/mine", { params }).then(unwrap);

/** The caller's own property. The server takes the hotel from their token. */
export const listHotelPosts = (params) => api.get("/feed/hotel", { params }).then(unwrap);

/** MAIN_ADMIN only. Filters: role, hotelId, q. */
export const listModerationPosts = (params) =>
  api.get("/feed/moderation", { params }).then(unwrap);

export const listCommentInbox = (params) =>
  api.get("/feed/comments/inbox", { params }).then(unwrap);
