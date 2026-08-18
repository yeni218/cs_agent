const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Supabase realtime-js pulls in the `ws` package which requires Node's `stream`.
// React Native has its own WebSocket — shim the problematic Node modules.
config.resolver.extraNodeModules = {
  stream: require.resolve('readable-stream'),
};

module.exports = config;
