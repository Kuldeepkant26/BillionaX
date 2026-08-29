import { ApiError } from "../utils/ApiError.js";
import { Content } from "../models/content.model.js";
import {
  destroyAsset,
  isOwnCloudinaryUrl,
  publicIdFromUrl,
  resourceTypeFromUrl,
} from "./upload.service.js";

/**
 * Refuses an image that is not on our own Cloudinary account.
 *
 * Uploads happen in the browser, so the URL we are asked to store is
 * client-supplied — without this a hotel could point a card at any host and
 * every guest viewing it would fetch that address.
 */
const assertOwnImage = (value, field) => {
  if (!value) return;
  if (!isOwnCloudinaryUrl(value)) {
    throw new ApiError(400, "That image could not be verified", [
      { field, message: "Unrecognised image source" },
    ]);
  }
};

/** Best-effort removal — an orphaned file is cheaper than a failed save. */
const removeAsset = (url) => {
  const publicId = publicIdFromUrl(url);
  // Scoped by resource type: destroy on the wrong pipeline reports "not
  // found" and leaves the file, which for video is an expensive orphan.
  if (publicId) destroyAsset(publicId, resourceTypeFromUrl(url)).catch(() => {});
};

/**
 * Drops `previous` only when it is a genuinely different asset from `next`.
 *
 * Content uploads currently get a unique public_id each time, so the two can
 * only collide if that ever changes — but comparing ids rather than URLs is
 * what makes this safe either way. Two URLs for one asset differ by version
 * and transformation, and deleting on that difference would destroy the live
 * file, which is exactly how the avatar bug happened.
 */
const replaceAsset = (previous, next) => {
  const previousId = publicIdFromUrl(previous);
  if (previousId && previousId !== publicIdFromUrl(next)) removeAsset(previous);
};

/**
 * Returns a bare array by default so the guest-facing content route is
 * unchanged. Pass `paginate: true` for the panel, which needs { items, total }.
 */
/**
 * The clauses that decide whether a guest may see a dated, tier-targeted row.
 *
 * Exported so the offers list and the single-offer endpoint enforce the SAME
 * rule — a guest who cannot see an offer in the list must also 404 on its
 * direct URL, and two hand-written copies of this would eventually disagree.
 *
 * Rows with no window are always in-window; rows with no `tiers` key (every
 * pre-existing offer) are visible to every tier.
 */
export const offerVisibilityClauses = (tier, now = new Date()) => [
  { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
  { $or: [{ validTo: null }, { validTo: { $gte: now } }] },
  { $or: [{ tiers: { $exists: false } }, { tiers: { $size: 0 } }, { tiers: tier }] },
];

export const listContent = async ({
  hotelId,
  kind,
  activeOnly = false,
  isActive,
  currentlyValid,
  expired,
  scheduled,
  tier,
  paginate = false,
  page = 1,
  limit = 25,
}) => {
  const filter = { hotelId };
  if (kind) filter.kind = kind;
  if (activeOnly) filter.isActive = true;
  else if (isActive != null) filter.isActive = isActive;

  // "Currently valid" is what a hotel actually wants to know: which offers are
  // guests seeing right now. Rows with no window set are always valid.
  if (currentlyValid) {
    const now = new Date();
    filter.$and = (filter.$and || []).concat([
      { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
      { $or: [{ validTo: null }, { validTo: { $gte: now } }] },
    ]);
  }

  // The two other halves of the panel's state filter. Both require a date to
  // match at all: an offer with no deadline is neither expired nor scheduled,
  // it is simply always on.
  if (expired) {
    filter.$and = (filter.$and || []).concat([{ validTo: { $lt: new Date() } }]);
  }
  if (scheduled) {
    filter.$and = (filter.$and || []).concat([{ validFrom: { $gt: new Date() } }]);
  }

  // Tier gate for privileges. A row is visible when it is untargeted — the
  // field is absent (every pre-existing row) or an empty array — or when it
  // names this tier.
  //
  // Pushed into $and rather than assigned as a second top-level $or, so it
  // composes with the window above instead of one clobbering the other.
  if (tier) {
    filter.$and = (filter.$and || []).concat([
      {
        $or: [{ tiers: { $exists: false } }, { tiers: { $size: 0 } }, { tiers: tier }],
      },
    ]);
  }

  const sort = { sortOrder: 1, createdAt: -1 };
  if (!paginate) return Content.find(filter).sort(sort);

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Content.find(filter).sort(sort).skip(skip).limit(limit),
    Content.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

export const createContent = async ({ hotelId, ...payload }) => {
  assertOwnImage(payload.imageUrl, "imageUrl");
  assertOwnImage(payload.videoUrl, "videoUrl");
  return Content.create({ ...payload, hotelId });
};

export const updateContent = async ({ id, hotelId, patch }) => {
  // kind and hotelId are set once, at creation. Left in the patch, a client
  // could move a row between the Content/Offers/Privileges screens, or hand it
  // to another hotel outright — the filter below scopes which document is
  // FOUND, not what the update is allowed to write.
  const { kind, hotelId: _hotelId, _id, ...safePatch } = patch;

  const existing = await Content.findOne({ _id: id, hotelId });
  if (!existing) throw new ApiError(404, "Content not found");

  // Only validate what the caller is actually setting, so editing a title on a
  // legacy row with a pasted URL does not fail on an image nobody touched.
  //
  // videoUrl is checked here too: the PATCH routes run no body validators, so
  // without this a hotel could point a card's video at any host on the
  // internet by editing an existing row — the create path has always checked.
  if (safePatch.imageUrl !== undefined && safePatch.imageUrl !== existing.imageUrl) {
    assertOwnImage(safePatch.imageUrl, "imageUrl");
  }
  if (safePatch.videoUrl !== undefined && safePatch.videoUrl !== existing.videoUrl) {
    assertOwnImage(safePatch.videoUrl, "videoUrl");
  }

  // An empty string means "remove it". $unset rather than undefined: Mongoose
  // silently drops undefined keys, so the old value would survive.
  const unset = {};
  // duration rides along: removing a video must clear its badge too, and an
  // empty string left in the $set would be stored as a meaningless "".
  // The offer text fields ride along: clearing a discount or a set of terms in
  // the panel must remove the field, not store an empty string that every
  // render site then has to treat as "absent".
  for (const field of [
    "imageUrl",
    "videoUrl",
    "duration",
    "discountLabel",
    "terms",
    "howToRedeem",
  ]) {
    if (safePatch[field] === "") {
      delete safePatch[field];
      unset[field] = "";
    }
  }

  const update = Object.keys(unset).length ? { $set: safePatch, $unset: unset } : safePatch;

  const content = await Content.findOneAndUpdate({ _id: id, hotelId }, update, {
    new: true,
    runValidators: true,
  });

  // Drop whatever the row no longer points at, so replacing a picture does not
  // leave the previous one paid for and unreferenced.
  replaceAsset(existing.imageUrl, content.imageUrl);
  replaceAsset(existing.videoUrl, content.videoUrl);

  return content;
};

export const deleteContent = async ({ id, hotelId }) => {
  const content = await Content.findOneAndDelete({ _id: id, hotelId });
  if (!content) throw new ApiError(404, "Content not found");

  // The row is gone, so its media has nothing left referencing it.
  removeAsset(content.imageUrl);
  removeAsset(content.videoUrl);

  return content;
};
