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
		this.emitter = new EventEmitter();
		this.connections = {};
		this.compressionKeys = {};
		this.compressors = {};
		this.wsServer = new WebSocket.Server({ noServer: true });
		this.connectionsMade = 0;
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
				isWebSocket: true
			});
		});

		this.createRTCPeerConnection = async (description) => {
			this.connectionsMade++;
			let clientID = Number(this.connectionsMade);
			this.connections[clientID] = new ClientConnection({
				clientID,
				connection: new WebRTC.RTCPeerConnection(),
				emitter: this.emitter,
				isWebSocket: false
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

	attachEventHandlers() {
		this.emitter.on('client_message', (client, data) => {
			let blob = decode(data);
			let event = Utils.decompressNetworkEvent(blob);

			if(event.name === SETTINGS.EVENTS.CLIENT_CONNECT_REQUEST) {
				let initialData = this.getInitialData(event.data);

				// If the client shouldn't be kicked.
				if(initialData !== false) {
					this.connections[client.id].activate();
					this.connections[client.id].sendEvent(
						SETTINGS.EVENTS.INITIAL_DATA,
						[this.getState(), initialData]
					);
					// Send client connection and client metadata
					this.serverEmitter.emit('connection', client, event.data);
				} else {
					this.connections[client.id].destroy();
				}

				return;
			} else if(event.name === SETTINGS.EVENTS.PING) {
				return;
			}

			if(!client.activated) return;

			this.serverEmitter.emit(event.name, event.data, client);
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

	addCompressor(data) {
		let keyLength = Object.keys(this.compressionKeys).length;
		this.compressionKeys[data.type] = keyLength;
		this.compressors[keyLength] = new ObjectCompressor({
			...data,
			compressionType
		});

		return this.compressors[keyLength];
	}

	sendEventToAll(name, data) {
		let connections = Object.values(this.connections);

		connections.forEach(conn => {
			if(!conn.activated) return;

			let eventData = data;
			if(typeof data === "function") eventData = data(conn);
			// console.log(eventData);

			conn.sendEvent(name, eventData);
		});

		return;
	}
}

module.exports = Networker;