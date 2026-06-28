const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("torito_token");
}

export function getStoredUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("torito_user");
  return raw ? JSON.parse(raw) : null;
}

export function saveSession(accessToken: string, user: SessionUser) {
  localStorage.setItem("torito_token", accessToken);
  localStorage.setItem("torito_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("torito_token");
  localStorage.removeItem("torito_user");
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new Error(message || "No se pudo completar la operacion");
  }

  return response.json();
}
