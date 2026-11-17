import type { User } from "firebase/auth";
import { auth } from "./firebase";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function api<T>(path: string, options: RequestInit = {}, user?: User | null): Promise<T> {
  const activeUser = user === undefined ? auth?.currentUser : user;
  const token = activeUser ? await activeUser.getIdToken() : undefined;
  const response = await fetch(`${apiUrl}/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `Request failed (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function submitInquiry(data: Record<string, string>) {
  return api<{ id: string; message: string }>("/public/enrollments", {
    method: "POST",
    body: JSON.stringify(data)
  }, null);
}
