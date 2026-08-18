const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Supabase realtime-js pulls in `ws` which requires Node's `stream`.
// React Native has its own WebSocket — shim stream to readable-stream.
config.resolver.extraNodeModules = {
  stream: path.resolve(__dirname, 'node_modules/readable-stream'),
};

module.exports = config;
