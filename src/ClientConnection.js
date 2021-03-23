const _ = require('lodash');
const { encode, decode } = require('msgpack-lite');
const SETTINGS = require('./modules/SETTINGS');
const Utils = require('./modules/Utils');

class ClientConnection {
	constructor({
		clientID,
		connection,
		emitter,
		getResponses,
		isWebSocket,
		settings
	}) {
		this.id = clientID;
		this.connection = connection;
		this.dataChannel = null;
		this.isWebSocket = isWebSocket;
		this.emitter = emitter;
		this.getResponses = getResponses;
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
			this.dataChannel.onclose = () => this.destroy("Data channel failure");
		};
	}

	attachSocketHandlers() {
		this.connection.on('message', message => {
			this.onMessageData(message);
		});

		this.connection.on('close', () => this.destroy("Socket failure"));
	}

	onMessageData(message) {
		// console.log("MESSAGE RECEIVED", this.id, message);
		
		this.messagesSinceLastSecond++;

		const hasSecondPastYet = Date.now() >= this.nextSecondTimestamp;
		if(
			this.messagesSinceLastSecond > this.settings.maxMessagesPerSecond &&
			!hasSecondPastYet
		) {
			this.destroy("Message threshold broken");
			return;
		}

		// console.log(hasSecondPastYet, this.messagesSinceLastSecond, this.settings.maxMessagesPerSecond);

		if(hasSecondPastYet) {
			this.nextSecondTimestamp = Date.now() + 1000;
			this.messagesSinceLastSecond = 0;
		}

		this.resetAlive();
		this.emitter.emit('client_message', this, message);
	}

	async exchangeICECandidates(candidate) {
		await this.connection.addIceCandidate(candidate);
		await Utils.waitUntil(() => this.iceCandidate);

		return this.iceCandidate;
	}

	resetAlive() {
		clearTimeout(this.lastPingTimeout);
		this.lastPingTimeout = setTimeout(() => {
			this.destroy("Timeout");
		}, this.settings.clientTimeout + 1000);
	}

	activate() {
		this.activated = true;
	}

	async destroy(reason="No reason specified.") {
		// console.log("destroying", this.id, reason);
		this.emit(SETTINGS.EVENTS.DISCONNECTION_REASON, reason);
		await Utils.wait(100);

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
		if(!this.activated) return false;

		let event = Utils.compressNetworkEvent(name, ...data);
		let b = encode(event);
		let ui32 = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

		// console.log(event);
		if(this.isWebSocket) {
			this.connection.send(ui32);
		} else {
			if(this.dataChannel.readyState !== "open") return false;
			 
			this.dataChannel.send(ui32);
		}

		return true;
	}

	async request(eventName, ...data) {
		const requestID = _.random(0, 2 ** 14);
		if(!this.emit(SETTINGS.EVENTS.REQUEST, eventName, requestID, ...data)) return;

		const responses = this.getResponses();

		await Utils.waitUntil(() => typeof responses[requestID] !== "undefined");

		const response = responses[requestID];
		delete responses[requestID];

		// console.log(requestID, response, responses);

		return response;
	}
}

module.exports = ClientConnection;