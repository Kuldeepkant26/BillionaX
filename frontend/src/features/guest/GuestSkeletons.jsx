import { Skeleton, SkeletonScreen } from "../../components/common/index.jsx";

/**
 * Loading placeholders for the guest app.
 *
 * Each one mirrors the layout of the screen it stands in for, so content lands
 * in the space already reserved for it instead of shoving the page around. A
 * generic spinner cannot do that, which is why these are per-screen rather
 * than one shared block.
 */

export const HomeSkeleton = () => (
  <SkeletonScreen label="Loading your card">
    <div className="flex items-center justify-between mb-3.5">
      <span>
        <Skeleton w={90} h={11} />
        <Skeleton w={150} h={19} style={{ marginTop: 7 }} />
      </span>
    </div>

    <Skeleton h={46} radius={999} style={{ marginTop: 14 }} />
    <Skeleton h={186} radius="var(--rad)" style={{ marginTop: 14 }} />

    <div className="grid grid-cols-2 gap-[9px] mt-3.5">
      <Skeleton h={40} radius={999} />
      <Skeleton h={40} radius={999} />
    </div>

    <div className="grid grid-cols-3 gap-2 mt-3.5">
      <Skeleton h={58} />
      <Skeleton h={58} />
      <Skeleton h={58} />
    </div>

    <Skeleton h={192} radius="var(--rad)" style={{ marginTop: 16 }} />

    <Skeleton w={110} h={10} style={{ marginTop: 24 }} />
    <div className="grid grid-cols-2 gap-2 mt-2.5">
      <Skeleton h={92} />
      <Skeleton h={92} />
      <Skeleton h={92} />
      <Skeleton h={92} />
    </div>

    <Skeleton w={130} h={10} style={{ marginTop: 24 }} />
    <div className="flex flex-nowrap gap-2.5 mt-2.5 overflow-hidden">
      <span className="flex-none w-[152px]">
        <Skeleton h={94} />
        <Skeleton w="80%" h={12} style={{ marginTop: 7 }} />
        <Skeleton w="55%" h={10} style={{ marginTop: 5 }} />
      </span>
      <span className="flex-none w-[152px]">
        <Skeleton h={94} />
        <Skeleton w="70%" h={12} style={{ marginTop: 7 }} />
        <Skeleton w="45%" h={10} style={{ marginTop: 5 }} />
      </span>
    </div>
  </SkeletonScreen>
);

/** A page that is a title plus a stack of rows — Alerts, History. */
export const ListSkeleton = ({ rows = 6, label = "Loading" }) => (
  <SkeletonScreen label={label}>
    <Skeleton w={140} h={22} />
    <Skeleton w={190} h={12} style={{ marginTop: 8 }} />
    <div className="mt-[18px]">
      {Array.from({ length: rows }, (_, i) => (
        <span
          key={i}
          className="flex items-center gap-[11px] py-[13px] border-b border-hairline last:border-b-0"
        >
          <Skeleton w={34} h={34} radius={10} />
          <span className="flex-1 min-w-0">
            <Skeleton w="62%" h={12} />
            <Skeleton w="38%" h={10} style={{ marginTop: 6 }} />
          </span>
          <Skeleton w={54} h={12} />
        </span>
      ))}
    </div>
  </SkeletonScreen>
);

export const OffersSkeleton = () => (
  <SkeletonScreen label="Loading offers">
    <Skeleton w={120} h={22} />
    <Skeleton w={160} h={12} style={{ marginTop: 8 }} />
    <div className="grid gap-3.5 mt-[18px]">
      {Array.from({ length: 4 }, (_, i) => (
        <span key={i} className="block">
          <Skeleton h={104} />
          <Skeleton w="75%" h={13} style={{ marginTop: 9 }} />
          <Skeleton w="90%" h={10} style={{ marginTop: 6 }} />
        </span>
      ))}
    </div>
  </SkeletonScreen>
);

export const RedeemSkeleton = () => (
  <SkeletonScreen label="Loading your balance">
    <Skeleton w={150} h={22} />
    <Skeleton w={200} h={12} style={{ marginTop: 8 }} />
    <Skeleton h={120} radius="var(--rad)" style={{ marginTop: 16 }} />
    <Skeleton h={44} radius="var(--rad-sm)" style={{ marginTop: 16 }} />
    <div className="flex gap-[7px] mt-3">
      <Skeleton w={68} h={30} radius={999} />
      <Skeleton w={68} h={30} radius={999} />
      <Skeleton w={68} h={30} radius={999} />
    </div>
    <Skeleton h={44} radius={999} style={{ marginTop: 18 }} />
  </SkeletonScreen>
);

export const ProfileSkeleton = () => (
  <SkeletonScreen label="Loading your profile">
    <div className="flex items-center gap-[13px]">
      <Skeleton w={54} h={54} radius={16} />
      <span className="flex-1 min-w-0">
        <Skeleton w="58%" h={17} />
        <Skeleton w="40%" h={11} style={{ marginTop: 7 }} />
      </span>
    </div>
    <Skeleton h={120} radius="var(--rad)" style={{ marginTop: 18 }} />
    <Skeleton h={92} radius="var(--rad)" style={{ marginTop: 14 }} />
    <Skeleton h={140} radius="var(--rad)" style={{ marginTop: 14 }} />
  </SkeletonScreen>
);
