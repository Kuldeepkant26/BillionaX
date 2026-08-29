let toastId = 0;

export const createUiSlice = (set, get) => ({
  toasts: [],

  // Panel sidebar collapse (desktop only — the mobile drawer ignores it).
  // Persisted (see partialize): a rail that springs back open on every
  // reload would make collapsing it pointless.
  sidebarCollapsed: false,
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

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
