// Single source of truth for the backend base URL.
// Set NEXT_PUBLIC_API_URL in the deploy environment (e.g. Render URL).
// Falls back to localhost for local development.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
