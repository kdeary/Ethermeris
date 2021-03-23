const { encode, decode } = require('msgpack-lite');
const SETTINGS = require('./modules/SETTINGS');
const Utils = require('./modules/Utils');

class ClientConnection {
	constructor({
		clientID,
		connection,
		emitter,
		isWebSocket,
		settings
	}) {
		this.id = clientID;
		this.connection = connection;
		this.dataChannel = null;
		this.isWebSocket = isWebSocket;
		this.emitter = emitter;
		this.activated = false;
		this.lastPingTimeout = null;
		this.iceCandidate = null;
		this.settings = settings;
		this.messagesSinceLastSecond = 0;
		this.nextSecondTimestamp = Date.now() + 1000;

		this.resetAlive();

		this.isWebSocket ? this.attachSocketHandlers() : this.attachWebRTCHandlers();
	}

	attachWebRTCHandlers() {
		this.connection.onicecandidate = e => {
			const candidate = e.candidate;
			if(candidate && candidate.protocol === "udp" && candidate.component === "rtp") {
				this.iceCandidate = candidate;
			}
		};

		this.connection.ondatachannel = e => {
			// console.log(e.channel);
			if(this.dataChannel) return;

			this.dataChannel = e.channel;
			this.dataChannel.onmessage = event => {
				// console.log(event);
				this.onMessageData(Buffer.from(event.data));
			};

			this.dataChannel.onopen = e => {};
			this.dataChannel.onclose = () => this.destroy();
		};
	}

	attachSocketHandlers() {
		this.connection.on('message', message => {
			this.onMessageData(message);
		});

		this.connection.on('close', () => this.destroy());
	}

	onMessageData(message) {
		// console.log("MESSAGE RECEIVED", this.id, message);
		
		this.messagesSinceLastSecond++;

		const hasSecondPastYet = Date.now() >= this.nextSecondTimestamp;
		if(
			this.messagesSinceLastSecond > this.settings.maxMessagesPerSecond &&
			!hasSecondPastYet
		) {
			this.destroy();
			return;
		}

		// console.log(hasSecondPastYet, this.messagesSinceLastSecond, this.settings.maxMessagesPerSecond);

		if(hasSecondPastYet) {
			this.nextSecondTimestamp = Date.now() + 1000;
			this.messagesSinceLastSecond = 0;
		}

		this.emitter.emit('client_message', this, message);
		this.resetAlive();
	}

	async exchangeICECandidates(candidate) {
		await this.connection.addIceCandidate(candidate);
		await Utils.waitUntil(() => this.iceCandidate);

		return this.iceCandidate;
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
		if(!this.activated) return;
		clearTimeout(this.lastPingTimeout);

		if(this.isWebSocket) {
			this.connection.terminate();
		} else {
			this.dataChannel.close();
			this.connection.close();
			this.connection = null;
			this.dataChannel = null;
		}

		this.activated = false;
		this.emitter.emit('client_disconnected', this);
	}

	emit(name, ...data) {
		let event = Utils.compressNetworkEvent(name, ...data);
		let b = encode(event);
		let ui32 = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

		// console.log(event);
		if(this.isWebSocket) {
			this.connection.send(ui32);
		} else {
			this.dataChannel.send(ui32);
		}
	}
}

module.exports = ClientConnection;