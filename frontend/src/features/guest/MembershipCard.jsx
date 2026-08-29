import { formatCoins } from "../../utils/format.js";
import { useAppStore } from "../../store/useAppStore.js";
import { resolveCardDesign } from "./cardDesigns/registry.jsx";

/*
 * There is deliberately no tier-progress bar here.
 *
 * Tier is earned by NIGHTS STAYED at the hotel (see the API's
 * resolveTierByNights), and the guest app has no nights figure to show
 * progress against — the card only knows coins. The bar that used to live
 * here counted lifetimeEarned, so after the switch it reported things like
 * "0 more to reach Gold" to a guest whose coins had nothing to do with their
 * tier. Wrong information is worse than none.
 *
 * If progress belongs on this card later, the membership payload needs to
 * carry lifetimeNights and the hotel's tierNightThresholds.
 */

/**
 * The guest's membership card.
 *
 * The ART is chosen by the main admin and applies network-wide — the design
 * key arrives with the memberships payload and is drawn from the cardDesigns
 * registry. This component owns only the data and the card's physical shape;
 * everything visual lives in the registry, so adding a design never touches
 * this file.
 *
 * `design` can be passed to force a specific family, which is what the admin
 * picker does. Left off, it follows whatever the platform is set to.
 */
export const MembershipCard = ({ membership, guestName, hotelName, design, className = "" }) => {
  const selected = useAppStore((s) => s.cardDesign);
  const { render } = resolveCardDesign(design || selected);

  const tier = membership?.tier || "SILVER";

  return (
    <div
      className={`relative aspect-[380/240] w-full overflow-hidden rounded-token text-white ${className}`}
      style={{
        // Matches the mockup's card shadow: a deep drop plus the two inset
        // hairlines that give the edge its thickness. The drop is layered and
        // well under full opacity — at .9 it read as a hard grey halo against
        // the light theme's white ground rather than as a cast shadow.
        boxShadow:
          "0 1px 2px rgba(0,0,0,.18),0 12px 24px -12px rgba(0,0,0,.45),0 26px 48px -22px rgba(0,0,0,.35),0 2px 0 rgba(255,255,255,.06) inset,0 -1px 0 rgba(0,0,0,.5) inset",
        // Promotes the card to its own compositing layer, which makes the
        // browser antialias the rounded clip instead of applying it as a hard
        // per-pixel mask. Without it the artwork inside is stair-stepped along
        // the corner curves — visible as a grey fringe on a light ground.
        transform: "translateZ(0)",
        isolation: "isolate",
      }}
    >
      {render({
        tier,
        coins: formatCoins(membership?.balance),
        memberNo: membership?.memberNo || "—",
        guestName: (guestName || "").toUpperCase(),
        hotelName: (hotelName || "").toUpperCase(),
      })}
    </div>
  );
};
