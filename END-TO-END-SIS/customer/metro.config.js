const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// @supabase/realtime-js bundles the Node `ws` package, which requires Node
// builtins (stream, zlib, net, tls...) that don't exist in React Native.
// RN has a global WebSocket, so intercept every `ws` request BEFORE normal
// resolution and hand back our shim. extraNodeModules alone doesn't work here
// because `ws` physically exists in node_modules and wins normal resolution.
const wsShim = path.resolve(__dirname, 'shims/ws.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'ws' || moduleName.startsWith('ws/')) {
    return { type: 'sourceFile', filePath: wsShim };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
