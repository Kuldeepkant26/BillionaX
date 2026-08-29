import * as hotelApi from "../../api/hotel.api.js";

/**
 * The three things a hotel publishes to its guests.
 *
 * Each is a genuinely different object with a different home in the app, so
 * each gets its own API quartet, its own wording and its own fields. They used
 * to overlap — a slideshow photo and a video were the same "content", and an
 * offer with a clip attached silently became a video as well — which is why
 * nobody could find the list of their own videos.
 *
 * `media` decides which pickers the form shows. That is the whole difference
 * between the three forms, so it is stated once here rather than as
 * conditionals scattered through the JSX.
 */
export const KINDS = {
  slideshow: {
    label: "Slideshow",
    singular: "photo",
    title: "Slideshow",
    subtitle: "Photos in the gallery on the guest's home screen",
    empty: "No photos yet",
    emptyHint: "Add a photo and it appears in the home-screen gallery.",
    media: "image",
    imageHint: "Shown full-width in the home-screen gallery. Landscape works best.",
    api: {
      list: hotelApi.listContents,
      create: hotelApi.createContent,
      update: hotelApi.updateContent,
      remove: hotelApi.deleteContent,
    },
  },
  offers: {
    label: "Offers",
    singular: "offer",
    title: "Offers",
    subtitle: "Promotions guests see in the Offers tab",
    empty: "No offers yet",
    emptyHint: "Add a promotion for guests to redeem during their stay.",
    media: "image",
    imageHint: "Shown on the offer card. Leave it empty for a designed card built from the discount.",
    // Which extra blocks the shared form renders. Stated here for the same
    // reason as `media`: one place says how the three kinds differ.
    offerFields: true,
    api: {
      list: hotelApi.listOffers,
      create: hotelApi.createOffer,
      update: hotelApi.updateOffer,
      remove: hotelApi.deleteOffer,
    },
  },
  videos: {
    label: "Videos",
    singular: "video",
    title: "Videos",
    subtitle: "Clips guests can watch, like and comment on",
    empty: "No videos yet",
    emptyHint: "Upload a walkthrough or a room tour for guests to watch.",
    media: "video",
    imageHint: "Optional cover image. Without one we use a frame from the video.",
    api: {
      list: hotelApi.listVideos,
      create: hotelApi.createVideo,
      update: hotelApi.updateVideo,
      remove: hotelApi.deleteVideo,
    },
  },
};

