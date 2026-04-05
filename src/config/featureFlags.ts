export const isAdminWriteActionsEnabled =
  (import.meta.env.VITE_ADMIN_WRITE_ACTIONS_ENABLED ?? 'false').toLowerCase() === 'true';
