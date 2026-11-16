// Admin session management - server-side via cookies
// No secrets in client code

export function getAdminSession(): { isAdmin: boolean } {
  // This is called on client, but the actual check happens via API
  // We use a simple flag stored in sessionStorage (not localStorage) for UX
  if (typeof window === "undefined") return { isAdmin: false };
  try {
    const stored = sessionStorage.getItem("goltv_admin_flag");
    return { isAdmin: stored === "true" };
  } catch {
    return { isAdmin: false };
  }
}

export function setAdminFlag(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("goltv_admin_flag", "true");
}

export function clearAdminFlag(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("goltv_admin_flag");
}

export function logoutAdmin(): void {
  clearAdminFlag();
  // Also clear the server cookie
  fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
}
