/**
 * Feed invariants that are cheap to get wrong and expensive to notice.
 *
 * Two areas, both chosen because a regression in them is SILENT:
 *
 *  - The image gate. It is the only thing standing between a client-supplied
 *    URL and every viewer's browser fetching it, and a weakened check looks
 *    exactly like a working one until someone abuses it.
 *  - The cursor. Off-by-one at a page boundary shows a reader a duplicate row
 *    or drops one entirely, which reads as "the feed is glitchy" rather than as
 *    a bug with a cause.
 *
 * No database: these exercise the pure decision functions. The service's
 * behaviour against Mongo is covered by the phase verification in the commit.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

process.env.CLOUDINARY_CLOUD_NAME ||= "testcloud";
process.env.CLOUDINARY_API_KEY ||= "test-key";
process.env.CLOUDINARY_API_SECRET ||= "test-secret";
process.env.CLOUDINARY_FOLDER ||= "billionax";

let isOwnCloudinaryUrl;

before(async () => {
  ({ isOwnCloudinaryUrl } = await import("../src/services/upload.service.js"));
});

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const ours = (name) => `https://res.cloudinary.com/${CLOUD}/image/upload/v1/billionax/feed/${name}`;

/**
 * The service's assertOwnImages, reduced to the decision it makes. Kept in step
 * with feed.service.js by hand — the real one throws ApiError, which needs the
 * whole app's error plumbing to assert against.
 */
const imagesRejectedBecause = (images) => {
  const list = Array.isArray(images) ? images : [];
  if (list.length < 1 || list.length > 10) return "count";
  for (const url of list) if (!isOwnCloudinaryUrl(url)) return "foreign";
  if (new Set(list).size !== list.length) return "duplicate";
  return null;
};

describe("feed image validation", () => {
  it("accepts one to ten images on our own account", () => {
    assert.equal(imagesRejectedBecause([ours("a.jpg")]), null);
    assert.equal(
      imagesRejectedBecause(Array.from({ length: 10 }, (_, i) => ours(`a${i}.jpg`))),
      null
    );
  });

  it("rejects an empty post and an eleventh image", () => {
    assert.equal(imagesRejectedBecause([]), "count");
    assert.equal(
      imagesRejectedBecause(Array.from({ length: 11 }, (_, i) => ours(`a${i}.jpg`))),
      "count"
    );
  });

  it("rejects a URL on any other host", () => {
    // The whole point of the gate: the browser uploads directly, so the URL we
    // are handed back is client-supplied and can name anywhere at all.
    assert.equal(imagesRejectedBecause(["https://evil.example.com/x.jpg"]), "foreign");
    assert.equal(imagesRejectedBecause(["https://res.cloudinary.com/other/image/upload/v1/x.jpg"]), "foreign");
    assert.equal(imagesRejectedBecause([ours("a.jpg"), "https://evil.example.com/x.jpg"]), "foreign");
  });

  it("rejects javascript: and data: URLs", () => {
    assert.equal(imagesRejectedBecause(["javascript:alert(1)"]), "foreign");
    assert.equal(imagesRejectedBecause(["data:image/png;base64,AAAA"]), "foreign");
  });

  it("rejects the same image twice", () => {
    // Always a client bug, and the delete sweep would try to destroy one
    // public_id twice.
    assert.equal(imagesRejectedBecause([ours("a.jpg"), ours("a.jpg")]), "duplicate");
  });
});

/**
 * The cursor's page arithmetic, as listFeed performs it: fetch limit+1, and let
 * the extra row answer "is there another page" without a count query.
 */
const paginate = (rows, limit) => {
  const fetched = rows.slice(0, limit + 1);
  const hasMore = fetched.length > limit;
  const page = hasMore ? fetched.slice(0, limit) : fetched;
  return {
    page,
    hasMore,
    nextCursor: hasMore && page.length ? page[page.length - 1].createdAt.toISOString() : null,
  };
};

const rowsAt = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: i, createdAt: new Date(2_000_000_000_000 - i * 1000) }));

describe("feed cursor pagination", () => {
  it("reports more pages and hands back the last row's timestamp", () => {
    const { page, hasMore, nextCursor } = paginate(rowsAt(50), 12);
    assert.equal(page.length, 12);
    assert.equal(hasMore, true);
    assert.equal(nextCursor, page[11].createdAt.toISOString());
  });

  it("stops with a null cursor on the final page", () => {
    // Null rather than a timestamp, so the client has an unambiguous stop
    // condition instead of inferring one from an empty page.
    const { page, hasMore, nextCursor } = paginate(rowsAt(5), 12);
    assert.equal(page.length, 5);
    assert.equal(hasMore, false);
    assert.equal(nextCursor, null);
  });

  it("does not claim another page when the last one is exactly full", () => {
    // The off-by-one that would show the reader an empty "load more".
    const { page, hasMore, nextCursor } = paginate(rowsAt(12), 12);
    assert.equal(page.length, 12);
    assert.equal(hasMore, false);
    assert.equal(nextCursor, null);
  });

  it("walks every row exactly once across pages", () => {
    // The property the cursor exists for. Pages are taken by timestamp, so a
    // row inserted at the head between two fetches cannot shift the boundary
    // and repeat a row the reader has already seen — which is what skip does.
    const all = rowsAt(31);
    const seen = [];
    let cursor = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const remaining = cursor ? all.filter((r) => r.createdAt < new Date(cursor)) : all;
      const { page, hasMore, nextCursor } = paginate(remaining, 7);
      seen.push(...page.map((r) => r.id));
      if (!hasMore) break;
      cursor = nextCursor;
    }
    assert.deepEqual(seen, all.map((r) => r.id));
    assert.equal(new Set(seen).size, 31, "no row appears twice");
  });

  it("is unaffected by rows inserted at the head mid-scroll", () => {
    const all = rowsAt(20);
    const first = paginate(all, 5);

    // Three posts published between page 1 and page 2, newer than everything.
    const intruders = Array.from({ length: 3 }, (_, i) => ({
      id: 900 + i,
      createdAt: new Date(2_000_000_500_000 + i * 1000),
    }));
    const grown = [...intruders, ...all].sort((a, b) => b.createdAt - a.createdAt);

    const remaining = grown.filter((r) => r.createdAt < new Date(first.nextCursor));
    const second = paginate(remaining, 5);

    const overlap = second.page.filter((r) => first.page.some((f) => f.id === r.id));
    assert.deepEqual(overlap, [], "page 2 must not repeat page 1");
    assert.deepEqual(second.page.map((r) => r.id), [5, 6, 7, 8, 9]);
  });
});
