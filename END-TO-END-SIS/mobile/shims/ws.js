// React Native has a global WebSocket — shim the `ws` Node package to use it.
const W = global.WebSocket;
module.exports = W;
module.exports.default = W;
