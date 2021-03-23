const _ = require('lodash');
const { encode, decode } = require('msgpack-lite');
const SETTINGS = require('./modules/SETTINGS');
const Utils = require('./modules/Utils');

/**
 * A Server's Client Connection. This class represents a connection to a client on the server.
 * The server can use this class to send events and requests to the client. Not meant to be used bare.
 * @class ClientConnection
 */
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
			this.dataChannel.onclose = () => this.destroy(
				Utils.generateNetworkError(
					SETTINGS.DISCONNECTION_CODES.CONNECTION_FAILURE,
					"Data channel failure"
				)
			);
		};
	}

	attachSocketHandlers() {
		this.connection.on('message', message => {
			this.onMessageData(message);
		});

		this.connection.on('close', () => this.destroy(
			Utils.generateNetworkError(
				SETTINGS.DISCONNECTION_CODES.CONNECTION_FAILURE,
				"Socket failure"
			)
		));
	}

	onMessageData(message) {
		// console.log("MESSAGE RECEIVED", this.id, message);
		
		this.messagesSinceLastSecond++;

		const hasSecondPastYet = Date.now() >= this.nextSecondTimestamp;
		if(
			this.messagesSinceLastSecond > this.settings.maxMessagesPerSecond &&
			!hasSecondPastYet
		) {
			this.destroy(Utils.generateNetworkError(
				SETTINGS.DISCONNECTION_CODES.THROTTLER,
				"Message threshold broken"
			));
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
			this.destroy(Utils.generateNetworkError(
				SETTINGS.DISCONNECTION_CODES.TIMEOUT,
				"Timed out"
			));
		}, this.settings.clientTimeout + 1000);
	}

	activate() {
		this.activated = true;
	}

	/**
	 * Destroys this instance by closing all connections and signalling the parent server to delete it.
	 * @async
	 * @param  {String} [reason="No reason specified."] - The reason for disconnection.
	 * @return {Boolean} Returns true on success false on fail.
	 */
	async destroy(reason="No reason specified.") {
		// console.log("destroying", this.id, reason);
		let destroyReason = typeof reason === "string" ? {
			code: SETTINGS.DISCONNECTION_CODES.NO_REASON,
			text: reason
		} : reason;

		this.emit(SETTINGS.EVENTS.DISCONNECTION_REASON, destroyReason.code, destroyReason.text);
		await Utils.wait(100);

		if(!this.activated) return false;
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

		return true;
	}

	/**
	 * Emits an event to the client.
	 * @param  {String|Number} name - The event name
	 * @param  {...Object} data - The event data
	 * @return {Boolean} Returns true on success, false on failure.
	 */
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

	/**
	 * Sends a request to the client and waits for a response.
	 * @param  {String|Number} eventName - The name of the event.
	 * @param  {...Object} data - The event data
	 * @return {Promise} Returns a promise that holds the response from the client.
	 */
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