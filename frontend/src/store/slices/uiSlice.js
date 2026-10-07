let toastId = 0;

export const createUiSlice = (set, get) => ({
  toasts: [],

  // Panel sidebar collapse (desktop only — the mobile drawer ignores it).
  // Persisted (see partialize): a rail that springs back open on every
  // reload would make collapsing it pointless.
  sidebarCollapsed: false,
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

  // Whether last month still waits to be distributed — the admin panel's
  // Coin distribution badge. A count (0 or 1) because nav badges are counts.
  // Not persisted: it is re-asked on every admin-panel load, and a stale
  // "1" surviving a reload would point at a month already paid.
  distributionPending: 0,
  setDistributionPending: (n) => set({ distributionPending: n ? 1 : 0 }),

  toast: (message, variant = "info") => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, message, variant }] });
    setTimeout(() => get().dismissToast(id), 4200);
    return id;
  },

  toastSuccess: (message) => get().toast(message, "success"),
  toastError: (message) => get().toast(message, "error"),

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
});
