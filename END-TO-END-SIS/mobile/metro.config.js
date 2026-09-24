const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @supabase/realtime-js bundles the Node `ws` package, which requires Node
 * builtins (stream, zlib, net, tls...) that don't exist in React Native.
 * RN has a global WebSocket, so intercept every `ws` request BEFORE normal
 * resolution and hand back our shim.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const wsShim = path.resolve(__dirname, 'shims/ws.js');

const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'ws' || moduleName.startsWith('ws/')) {
        return { type: 'sourceFile', filePath: wsShim };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
