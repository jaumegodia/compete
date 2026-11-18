import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Panel interno: siempre datos frescos de Supabase
  poweredByHeader: false,
  // El repositorio tiene otro package-lock (scrapers) en la raíz: la app vive en web/
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
