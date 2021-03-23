/**
 * @typedef ServerSettings
 * @type {Object}
 * @property {String|Number} [serverID] - The ID of the server. Used by the client to select a specific server. An ID is automatically generated if omitted.
 * @property {Object} stateSchema - The initial state of the server. No new keys should be added to the state after it is set.
 * @property {Number} maxMessagesPerSecond - The maximum amount of messages per second allowed. The client is automatically disconnected if this threshold is broken.
 * @property {Number} clientTimeout - The client will disconnect when this amount of time passes with no messages sent from it.
 * @property {Object} peerSettings - The RTCPeerConnection settings object.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection RTCPeerConnection} for further information on RTCPeerConnection's.
 */

exports.ServerSettings = {};

/**
 * @typedef ManagerSettings
 * @type {Object}
 * @property {NodeHTTPServer} httpServer - The Node.js HTTP Server to attach the manager to.
 * @property {String} [serverRoute="/ethermeris"] - The root route that the manager uses for all server communications.
 */

exports.ManagerSettings = {};

/**
 * @typedef ClientSettings
 * @type {Object}
 * @property {String|Number} [serverID="main"] - The ID of the server that the client is attempting to connect to.
 * @property {Boolean} [verbose=false] - If set to true, the client's operations are logged to the console.
 * @property {Boolean} [forceWebSockets=false] - Forces the client to use WebSockets.
 * @property {String} [serverRoute="/ethermeris"] - Root server route to use when signalling and exchanging candidates.
 * @property {Function} [getInitialData] - This function gets called if initial data is required to connect to the server.
 * @property {Object} peerSettings - The RTCPeerConnection settings object.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection RTCPeerConnection} for further information on RTCPeerConnection's.
 */

exports.ClientSettings = {};