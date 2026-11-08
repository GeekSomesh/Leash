import { defineConfig } from "drizzle-kit";

// `npm run db:generate` writes SQL migrations to ./drizzle from lib/db/schema.ts.
// They are applied automatically when the app first touches the database (lib/db/client.ts).
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
});
