const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // A full script-src policy needs per-request nonces; these directives are safe without them.
  { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'" },
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true }, // linting runs separately: `npm run lint` and in CI
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
