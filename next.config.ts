import type { NextConfig } from "next";

/**
 * `DATA_SOURCE` is read on the server by src/lib/data/index.ts and is
 * deliberately not exposed as a `NEXT_PUBLIC_` variable. Client components that
 * need to know which provider is active receive it as a prop from a server
 * component, so swapping providers in P1 stays a server-side concern.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The OG card reads its subsetted faces off disk. Next's tracer cannot see
  // through the dynamic filename, so the directory is pinned explicitly or the
  // image route 500s on a serverless deploy while working fine locally.
  outputFileTracingIncludes: {
    "/**": ["./src/lib/fonts/**"],
  },
};

export default nextConfig;
