/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // sharp ships platform-specific native binaries that must be required at
    // runtime, not bundled by webpack — without this, server actions/routes
    // that import it can fail in deployment with a "could not load the sharp
    // module" error even though local dev works fine.
    serverComponentsExternalPackages: ['sharp'],
  },
};

export default nextConfig;
