const _ = require('lodash');
const EventEmitter = require('eventemitter3');
const { encode, decode } = require('msgpack-lite');
const SETTINGS = require('./modules/SETTINGS');
const Utils = require('./modules/Utils');

class EthermerisClient {
	constructor(settings) {
		this.state = {};
		this.emitter = new EventEmitter();
		this.id = null;
		this.ready = false;
		this.socket = null;
		this.peerConnection = null;
		this.dataChannel = null;
		this.pingInterval = null;
		this.serverID = settings.serverID || "";
		this.verboseLogger = settings.verbose || false;
		this.responders = {};
		this.responses = {};

		this.forceWebSockets = settings.forceWebSockets || false;

		this.peerConnectionSettings = {
			ordered: settings.ordered || false
		};

		this.iceCandidateReceived = false;
		
		this.signalServerRoute = settings.signalServerRoute || "/signal";
		this.candidateServerRoute = settings.candidateServerRoute || "/ice_candidate";

		this.getInitialData = settings.getInitialData || (() => {});
	}

	async init() {
		this._log("Initiated");

		if(window.RTCPeerConnection && !this.forceWebSockets) {
			let webRTCConnected = await this.initWebRTC().catch(e => {
				console.error("Error connecting using WebRTC: ", e);
				return false;
			});

			if(!webRTCConnected) {
				console.warn("Falling back to WebSockets...");
				this.destroyPeerConnection();

				await this.initWebSockets();
			}
		} else {
			console.warn("Falling back to WebSockets...");
			await this.initWebSockets();
		}

		return this;
	}

	async initWebRTC() {
		this._log("Starting WebRTC peer connection");
		// Create the connection and data channel
		this.peerConnection = new RTCPeerConnection(this.peerConnectionSettings);
		this.dataChannel = this.peerConnection.createDataChannel("data");
		this.binaryType = "blob";

		// Attach the necessary handlers
		this.attachWebRTCHandlers();

		this._log("Creating connection offer");
		// Create an offer
		let offer = await this.peerConnection.createOffer();
		await this.peerConnection.setLocalDescription(offer);
		this._log("Local description has been set");

		// Signal for the servers description
		let response = await fetch(this.signalServerRoute, {
			method: "POST",
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				serverID: this.serverID,
				description: this.peerConnection.localDescription
			})
		}).then(a => a.json());

		if(response.err) throw "Error connecting to signal server. ERROR CODE: " + response.err;

		this.id = response.clientID;
		// Use the response as the description
		await this.peerConnection.setRemoteDescription(response.description);

		await Utils.waitUntil(() => this.iceCandidateReceived);

		return true;
	}

	async initWebSockets() {
		this.socket = new WebSocket(
			(location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ether_" + this.serverID
		);
		this.attachSocketHandlers();

		this._log("Initiated WebSocket Connection");

		return true;
	}

	destroy() {
		clearInterval(this.pingInterval);
		this.emitter = null;
		this.ready = false;

		this.destroyPeerConnection();
		this.destroyWebSockets();
	}

	destroyPeerConnection(){
		if(this.peerConnection){
			this.dataChannel.close();
			this.peerConnection.close();
			this.peerConnection = null;
			this.dataChannel = null;
		}
	}

	destroyWebSockets() {
		if(this.socket){
			this.socket.close();
			this.socket = null;
		}
	}

	on(...args) {
		this.emitter.on(...args);
	}

	off(...args) {
		this.emitter.off(...args);
	}

	once(...args) {
		this.emitter.once(...args);
	}

	respond(eventName, callback) {
		this.responders[eventName] = callback;
		return callback;
	}

	attachWebRTCHandlers() {
		this.dataChannel.addEventListener('open', () => this.onConnectionOpen());

		this.dataChannel.addEventListener('message', async (rawEvent) => {
			let arrayBuffer = new Uint8Array(rawEvent.data);
			await this.onMessageBlob(arrayBuffer);
		});

		// Wait for an ICE candidate and then send the correct one
		this.peerConnection.addEventListener('icecandidate', async (e) => {
			const candidate = e.candidate;
			if(candidate && candidate.protocol === "udp" && candidate.component === "rtp"){
				await Utils.waitUntil(() => this.id !== null);

				let response = await fetch(this.candidateServerRoute, {
					method: "POST",
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						serverID: this.serverID,
						clientID: this.id,
						candidate: candidate
					})
				}).then(a => a.json());

				if(response.err) throw "Error connecting to candidate server. ERROR CODE: " + response.err;

				await this.peerConnection.addIceCandidate(response);

				this._log("Exchanged ICE candidates successfully");

				this.iceCandidateReceived = true;
			}
		});

		this.dataChannel.addEventListener('close', () => this.onConnectionClose());
	}

	attachSocketHandlers() {
		this.socket.addEventListener('open', () => this.onConnectionOpen());

		this.socket.addEventListener('message', async (rawEvent) => {
			let blob = rawEvent.data;
			let blobArray = new Uint8Array(await blob.arrayBuffer());

			await this.onMessageBlob(blobArray);
		});
	}

	onConnectionOpen(){
		this._log("Connection open");
		this.ready = true;
		this.emit(SETTINGS.EVENTS.CLIENT_CONNECT_REQUEST, this.getInitialData());
		this.pingInterval = setInterval(() => {
			this.emit(SETTINGS.EVENTS.PING);
		}, SETTINGS.HEARTBEAT_PING_INTERVAL);
	}

	onConnectionClose() {
		this._log("Connection closed");
		this.destroy();
	}

	async onMessageBlob(arrayBuffer) {
		let data = decode(arrayBuffer);
		let event = Utils.decompressNetworkEvent(data);

		// console.log(event);

		if(event.name === SETTINGS.EVENTS.INITIAL_DATA) {
			this.emitStartData(event.data[0], event.data[1]);
		} else if(event.name === SETTINGS.EVENTS.STATE_UPDATE) {
			this.handlePartialState(event.data[0]);
		} else if(event.name === SETTINGS.EVENTS.REQUEST) {
			const responderName = event.data[0];
			const responseID = event.data[1];
			if(!responderName || !responseID || !this.responders[responderName]) return;

			let response = await this.responders[responderName](...(event.data.slice(2)));

			this.emit(
				SETTINGS.EVENTS.RESPONSE,
				responseID,
				response
			);
		} else if(event.name === SETTINGS.EVENTS.RESPONSE) {
			this.responses[event.data[0]] = event.data[1];
		} else {
			this.emitter.emit(event.name, ...(event.data));
		}
	}

	emitStartData(initialState, initialData) {
		this.state = initialState;
		this.emitter.emit('connected', initialState, initialData);
	}

	handlePartialState(partialState) {
		let oldState = _.cloneDeep(this.state);
		_.mergeWith(this.state, partialState, Utils.mergeModifier);

		// console.log(this.state, partialState);

		if(this.emitter) this.emitter.emit('state_update', _.cloneDeep(this.state), partialState, oldState);
	}

	emit(name, ...data) {
		if(!this.ready) return false;

		let event = Utils.compressNetworkEvent(name, ...data);
		let blob = encode(event);

		if(this.dataChannel){
			this.dataChannel.send(blob);
			return true;
		} else if(this.socket){
			this.socket.send(blob);
			return true;
		}

		return false;
	}

	async request(eventName, ...data) {
		const requestID = _.random(0, 2 ** 14);
		if(!this.emit(SETTINGS.EVENTS.REQUEST, eventName, requestID, ...data)) return;

		await Utils.waitUntil(() => typeof this.responses[requestID] !== "undefined");

		const response = this.responses[requestID];
		delete this.responses[requestID];

		return response;
	}

	_log(...args) {
		if(!this.verboseLogger) return;
		return console.log("ETHERMERIS CLIENT - ", ...args);
	}
}

module.exports = EthermerisClient;