import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (embedded Postgres for local dev) loads WASM and data files from its own
  // package directory, and pg uses optional native bindings, so both are loaded from
  // node_modules at runtime instead of being bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
