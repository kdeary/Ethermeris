const { encode, decode } = require('msgpack-lite');
const SETTINGS = require('./modules/SETTINGS');
const Utils = require('./modules/Utils');

class ClientConnection {
	constructor({
		clientID,
		connection,
		emitter,
		isWebSocket
	}) {
		this.id = clientID;
		this.connection = connection;
		this.isWebSocket = isWebSocket;
		this.emitter = emitter;
		this.activated = false;
		this.lastPingTimeout = null;

		this.resetAlive();
		this.attachHandlers();
	}

	attachHandlers() {
		this.connection.on('message', message => {
			// console.log("MESSAGE RECEIVED", this.id, message);
			this.emitter.emit('client_message', this, message);
			this.resetAlive();
		});
	}

	resetAlive() {
		clearTimeout(this.lastPingTimeout);
		this.lastPingTimeout = setTimeout(() => {
			this.destroy();
		}, SETTINGS.HEARTBEAT_PING_INTERVAL + 1000);
	}

	activate() {
		this.activated = true;
	}

	destroy() {
		this.activated = false;
		this.connection.terminate();
		this.emitter.emit('client_disconnected', this);
	}

	sendEvent(name, data) {
		let event = Utils.compressNetworkEvent(name, data);
		let b = encode(event);
		let ui32 = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

		// console.log()

		this.connection.send(ui32);
	}
}

module.exports = ClientConnection;