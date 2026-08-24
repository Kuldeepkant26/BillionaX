/**
 * Regression tests for Cloudinary asset identity.
 *
 * The bug these exist to prevent: avatars and logos upload to a FIXED
 * public_id, so re-uploading overwrites the file in place and the new delivery
 * URL differs from the stored one only by its version segment. Code that
 * decided "the URL changed, so delete the old asset" therefore deleted the
 * picture it had just saved, leaving the profile pointing at a 404.
 *
 * The invariant that makes that impossible: identity is the public_id.
 * Version and transformation belong to delivery, not identity.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.CLOUDINARY_CLOUD_NAME ||= "testcloud";
process.env.CLOUDINARY_API_KEY ||= "test-key";
process.env.CLOUDINARY_API_SECRET ||= "test-secret";
process.env.CLOUDINARY_FOLDER ||= "billionax";

let publicIdFromUrl, isOwnCloudinaryUrl, createUploadSignature;

before(async () => {
  ({ publicIdFromUrl, isOwnCloudinaryUrl, createUploadSignature } = await import(
    "../src/services/upload.service.js"
  ));
});

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const base = `https://res.cloudinary.com/${CLOUD}/image/upload`;
const AVATAR_ID = "billionax/avatars/guest_6a7c8af0f1af86fb543e0832";

describe("publicIdFromUrl", () => {
  it("strips the version segment", () => {
    assert.equal(publicIdFromUrl(`${base}/v1787295732/${AVATAR_ID}.jpg`), AVATAR_ID);
  });

  it("strips transformations (the delete-wrong-asset bug)", () => {
    const url = `${base}/w_160,h_160,c_fill,g_face,f_auto,q_auto/v1787295732/${AVATAR_ID}.jpg`;
    assert.equal(publicIdFromUrl(url), AVATAR_ID);
  });

  it("strips transformations with no version present", () => {
    assert.equal(publicIdFromUrl(`${base}/w_128,h_128,c_fill/${AVATAR_ID}.png`), AVATAR_ID);
  });

  it("handles a bare URL with neither version nor transformation", () => {
    assert.equal(publicIdFromUrl(`${base}/${AVATAR_ID}.jpg`), AVATAR_ID);
  });

  it("keeps a public_id that merely looks transformation-ish", () => {
    const id = "billionax/avatars/guest_abc";
    assert.equal(publicIdFromUrl(`${base}/v1/${id}.jpg`), id);
  });

  it("refuses URLs that are not on our own account", () => {
    assert.equal(publicIdFromUrl("https://evil.example.com/image/upload/v1/x.jpg"), null);
    assert.equal(publicIdFromUrl(`http://res.cloudinary.com/${CLOUD}/image/upload/v1/x.jpg`), null);
    assert.equal(publicIdFromUrl("not a url"), null);
    assert.equal(publicIdFromUrl(""), null);
    assert.equal(publicIdFromUrl(null), null);
    assert.equal(publicIdFromUrl(undefined), null);
  });
});

describe("asset identity across delivery variants", () => {
  it("treats every delivery variant of one asset as the SAME id", () => {
    const variants = [
      `${base}/${AVATAR_ID}.jpg`,
      `${base}/v1787295732/${AVATAR_ID}.jpg`,
      `${base}/v1787999999/${AVATAR_ID}.jpg`,
      `${base}/w_160,h_160,c_fill,g_face,f_auto,q_auto/v1787295732/${AVATAR_ID}.jpg`,
      `${base}/w_80,h_80,c_fill/v1787999999/${AVATAR_ID}.jpg`,
    ].map(publicIdFromUrl);

    assert.equal(new Set(variants).size, 1, "all variants must resolve to one public_id");
    assert.equal(variants[0], AVATAR_ID);
  });

  it("still distinguishes genuinely different assets", () => {
    const a = publicIdFromUrl(`${base}/v1/billionax/avatars/guest_aaa.jpg`);
    const b = publicIdFromUrl(`${base}/v1/billionax/avatars/guest_bbb.jpg`);
    assert.notEqual(a, b);
  });
});

/**
 * The exact decision the services make before calling destroyAsset. Mirrors
 * the `previousId && previousId !== nextId` guard rather than importing the
 * services, which would need a live database.
 */
const wouldDelete = (previousUrl, nextUrl) => {
  const previousId = publicIdFromUrl(previousUrl);
  return Boolean(previousId && previousId !== publicIdFromUrl(nextUrl));
};

describe("delete-on-replace decision", () => {
  it("does NOT delete when a re-upload overwrote the same public_id", () => {
    // The original bug, verbatim: same asset, new version.
    const previous = `${base}/v1787295732/${AVATAR_ID}.jpg`;
    const next = `${base}/v1787999999/${AVATAR_ID}.jpg`;
    assert.equal(wouldDelete(previous, next), false);
  });

  it("does NOT delete when the stored URL carries a transformation", () => {
    const previous = `${base}/w_160,h_160,c_fill/v1787295732/${AVATAR_ID}.jpg`;
    const next = `${base}/v1787999999/${AVATAR_ID}.jpg`;
    assert.equal(wouldDelete(previous, next), false);
  });

  it("DOES delete when the picture is removed entirely", () => {
    assert.equal(wouldDelete(`${base}/v1/${AVATAR_ID}.jpg`, undefined), true);
    assert.equal(wouldDelete(`${base}/v1/${AVATAR_ID}.jpg`, ""), true);
  });

  it("DOES delete when replaced by a genuinely different asset", () => {
    const previous = `${base}/v1/billionax/content/hotel_x_aaa.jpg`;
    const next = `${base}/v1/billionax/content/hotel_x_bbb.jpg`;
    assert.equal(wouldDelete(previous, next), true);
  });

  it("does nothing when there was no previous picture", () => {
    assert.equal(wouldDelete(undefined, `${base}/v1/${AVATAR_ID}.jpg`), false);
    assert.equal(wouldDelete(null, `${base}/v1/${AVATAR_ID}.jpg`), false);
  });
});

describe("createUploadSignature", () => {
  it("returns invalidate so the CDN drops the overwritten file", () => {
    const signed = createUploadSignature({ folder: "avatars", publicId: "guest_abc" });
    assert.equal(signed.invalidate, true);
  });

  it("exposes every signed param to the client, or the upload is rejected", () => {
    // Cloudinary recomputes the signature from what the browser sends: any
    // signed param the client cannot echo back breaks every upload.
    const signed = createUploadSignature({ folder: "avatars", publicId: "guest_abc" });
    for (const key of ["signature", "timestamp", "apiKey", "folder", "publicId", "invalidate"]) {
      assert.ok(signed[key] !== undefined, `missing ${key}`);
    }
    assert.equal(signed.folder, "billionax/avatars");
  });
});

describe("isOwnCloudinaryUrl", () => {
  it("accepts our own https delivery URLs", () => {
    assert.equal(isOwnCloudinaryUrl(`${base}/v1/x.jpg`), true);
  });

  it("rejects other hosts, other clouds and plain http", () => {
    assert.equal(isOwnCloudinaryUrl("https://evil.example.com/a.jpg"), false);
    assert.equal(isOwnCloudinaryUrl("https://res.cloudinary.com/other/image/upload/v1/x.jpg"), false);
    assert.equal(isOwnCloudinaryUrl(`http://res.cloudinary.com/${CLOUD}/image/upload/v1/x.jpg`), false);
  });
});
