const WebSocket = require('ws');
const WebRTC = require('wrtc');
const EventEmitter = require('eventemitter3');
const { encode, decode } = require('msgpack-lite');
const ClientConnection = require('./ClientConnection');
const ObjectCompressor = require('./modules/ObjectCompressor');
const SETTINGS = require('./modules/SETTINGS');
const Utils = require('./modules/Utils');

class Networker {
	constructor(settings) {
		this.serverEmitter = settings.emitter;
		this.serverSettings = settings.settings || {};

		this.emitter = new EventEmitter();
		this.responders = {};
		this.responses = {};

		this.connections = {};
		this.connectionsMade = 0;

		this.compressionKeys = {};
		this.compressors = {};

		this.wsServer = new WebSocket.Server({ noServer: true });

		this.getState = settings.getState;
		this.getInitialData = settings.getInitialData || (() => {});
		this.createRTCPeerConnection = null;

		this.attachServerHandlers();
		this.attachEventHandlers();
	}

	attachServerHandlers() {
		this.wsServer.on('connection', ws => {
			this.connectionsMade++;
			let clientID = Number(this.connectionsMade);
			this.connections[clientID] = new ClientConnection({
				clientID,
				connection: ws,
				emitter: this.emitter,
				getResponses: () => this.responses,
				isWebSocket: true,
				settings: this.buildClientConnectionSettings()
			});
		});

		this.createRTCPeerConnection = async (description) => {
			this.connectionsMade++;
			let clientID = Number(this.connectionsMade);
			this.connections[clientID] = new ClientConnection({
				clientID,
				connection: new WebRTC.RTCPeerConnection(),
				emitter: this.emitter,
				getResponses: () => this.responses,
				isWebSocket: false,
				settings: this.buildClientConnectionSettings()
			});

			const clientConnection = this.connections[clientID].connection;

			await clientConnection.setRemoteDescription(description);
			let answer = await clientConnection.createAnswer();
			await clientConnection.setLocalDescription(answer);

			return {
				clientID: clientID,
				description: clientConnection.localDescription
			};
		};
	}

	addResponder(eventName, callback) {
		this.responders[eventName] = callback;
		return callback;
	}

	attachEventHandlers() {
		this.emitter.on('client_message', async (client, blob) => {
			let data = decode(blob);
			let event = Utils.decompressNetworkEvent(data);

			if(event.name === SETTINGS.EVENTS.CLIENT_CONNECT_REQUEST) {
				const clientRequestData = event.data[0];
				let initialData = this.getInitialData(clientRequestData);
				// console.log(clientRequestData, initialData);

				// If the client shouldn't be kicked.
				if(initialData !== false) {
					client.activate();
					client.emit(
						SETTINGS.EVENTS.INITIAL_DATA,
						this.getState(),
						initialData
					);
					// Send client connection and client metadata
					this.serverEmitter.emit('connection', client, clientRequestData);
				} else {
					client.destroy("Invalid Initial Data");
				}

				return;
			} else if(event.name === SETTINGS.EVENTS.PING) {
				return;
			} else if(event.name === SETTINGS.EVENTS.REQUEST) {
				const responderName = event.data[0];
				const responseID = event.data[1];
				if(!responderName || !responseID || !this.responders[responderName]) return;

				let response = await this.responders[responderName](client, ...(event.data.slice(2)));

				client.emit(
					SETTINGS.EVENTS.RESPONSE,
					responseID,
					response
				);

				return;
			} else if(event.name === SETTINGS.EVENTS.RESPONSE) {
				this.responses[event.data[0]] = event.data[1];

				// console.log("RESPONSE", event.data);

				return;
			}

			if(!client.activated) return;

			this.serverEmitter.emit(event.name, client, ...event.data);
		});

		this.emitter.on('client_disconnected', client => {
			this.serverEmitter.emit('disconnection', client);
			delete this.connections[client.id];
		});
	}

	async exchangeICECandiatesWithConnection(candidate, clientID) {
		// console.log(candidate, clientID);
		const connection = this.connections[clientID];
		if(!connection) throw "Invalid Client ID";
		if(connection.isWebSocket) throw "Client is using WebSockets";
		let serverCandidate = await connection.exchangeICECandidates(candidate);
		return serverCandidate;
	}

	buildClientConnectionSettings() {
		return {
			maxMessagesPerSecond: this.serverSettings.maxMessagesPerSecond,
			clientTimeout: this.serverSettings.clientTimeout
		}
	}

	addCompressor(data) {
		let keyLength = Object.keys(this.compressionKeys).length;
		this.compressionKeys[data.type] = keyLength;
		this.compressors[keyLength] = new ObjectCompressor({
			...data,
			compressionType
		});

		return this.compressors[keyLength];
	}

	emitToAll(name, data) {
		let connections = Object.values(this.connections);

		connections.forEach(conn => {
			if(!conn.activated) return;

			let eventData = data;
			if(typeof data === "function") eventData = data(conn);
			// console.log(eventData);

			conn.emit(name, eventData);
		});

		return;
	}
}

module.exports = Networker;