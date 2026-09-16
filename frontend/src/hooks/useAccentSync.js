/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { publicConfig } from "../api/auth.api.js";
import { useAppStore } from "../store/useAppStore.js";

/**
 * Syncs the admin-chosen colour preset and typeface from the server, once per
 * shell mount.
 *
 * The persisted store value paints the first frame; this call catches the
 * case where the main admin changed the theme since this browser last saw
 * it. Guests get the same key piggybacked on the memberships call, so for
 * them this is belt and braces — but the panels and the login page make no
 * such bootstrap call and rely on this one.
 */
export const useAccentSync = () => {
  const setAccent = useAppStore((s) => s.setAccent);
  const setFont = useAppStore((s) => s.setFont);
  const setFeedEnabled = useAppStore((s) => s.setFeedEnabled);

  useEffect(() => {
    let cancelled = false;
    publicConfig()
      .then((data) => {
        if (cancelled) return;
        if (data?.themePreset) setAccent(data.themePreset, data.themeCustomColor);
        // The typeface rides on the same call for the same reason.
        if (data?.fontPreset) setFont(data.fontPreset);
        // Not guarded on truthiness, unlike the presets above: `false` is a
        // meaningful value here, and `if (data.feedEnabled)` would make the
        // switch impossible to turn OFF.
        if (data && "feedEnabled" in data) setFeedEnabled(data.feedEnabled);
      })
      .catch(() => {
        // The persisted (or default) accent already painted the app; a failed
        // config fetch must never block anything.
      });

    return () => {
      cancelled = true;
    };
  }, []);
};
