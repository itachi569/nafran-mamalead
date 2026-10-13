import type { NextConfig } from 'next'

const config: NextConfig = {
  // The API key is read on the server only. Nothing here is exposed to the browser bundle.
  reactStrictMode: true,
}

export default config
