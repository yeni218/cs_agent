const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// @supabase/realtime-js bundles `ws` (Node WebSocket) which pulls in Node's
// `stream`. React Native has a global WebSocket — redirect both to shims.
config.resolver.extraNodeModules = {
  ws: path.resolve(__dirname, 'shims/ws.js'),
  stream: path.resolve(__dirname, 'node_modules/readable-stream'),
};

module.exports = config;
