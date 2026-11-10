/** The app's public URL: APP_BASE_URL, else the URL Render assigns, else localhost. */
export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
}
