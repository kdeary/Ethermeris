// Import Networker
// Create array -> key system for further compression
// Send decompression keys to client on first connection
// Create event emitter for events like players disconnecting or player key press events
const EventEmitter = require('eventemitter3');
const url = require('url');
const isPlainObject = require('is-plain-object');
const _ = require('lodash');
const detailedDiff = require('deep-object-diff').detailedDiff;
const Networker = require('./Networker');
const SETTINGS = require('./modules/SETTINGS');
const Utils = require('./modules/Utils');

class EthermerisServer {
	constructor(settings) {
		this.stateSchema = settings.stateSchema;
		this._state = { ...(this.stateSchema) };

		this.emitter = new EventEmitter();
		this.networker = new Networker({
			emitter: this.emitter,
			getState: () => this.getState()
		});
	}

	getState() {
		return _.cloneDeep(this._state);
	}

	getWebSocketServer() {
		return this.networker.wsServer;
	}

	addCompressor(settings) {
		return this.networker.addCompressor(settings);
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

	attachToServer(serverID, httpServer) {
		if(!(httpServer||{}).on) throw new Error("Invalid HTTP Server");

		httpServer.on('upgrade', (request, socket, head) => {
			const pathname = url.parse(request.url).pathname;
			// console.log("upgrade", pathname);

			if(pathname === "/" + serverID) {
				const wsServer = this.getWebSocketServer();
				wsServer.handleUpgrade(request, socket, head, ws => {
					// console.log("connection");
					wsServer.emit('connection', ws, request);
				});
			} else {
				socket.destroy();
			}
		});

		return;
	}

	setState(newPartialState, clientModifier, shallowMerge) {
		if(typeof clientModifier !== "function") clientModifier = (a, b) => b;
		let partialState;

		if(typeof newPartialState === "function") partialState = newPartialState(this.getState());

		// merge partial state
		let oldState = this.getState();
		if(shallowMerge) {
			this._state = {
				...(this._state),
				...(partialState)
			};
		} else {
			// Overwrites destination arrays with the source
			_.mergeWith(this._state, partialState, Utils.mergeModifier);
		}
		// Find diffs
		let diffs = Utils.fullDiff(oldState, this._state);

		// console.log("diff", diffs, oldState, this._state);
		
		if(Object.keys(diffs).length === 0) return this._state;

		// Send diffs to clients
		this.networker.sendEventToAll(SETTINGS.EVENTS.STATE_UPDATE, client => clientModifier(client, diffs));

		return this._state;
	}
}

// console.log("output",
// 	_.mergeWith({
// 		counter: 0,
// 		players: {
// 			'1': {
// 				name: "electro"
// 			}
// 		}
// 	}, {
// 		counter: 1,
// 		players: {
// 			'1': null
// 		}
// 	}, Utils.mergeModifier)
// );

module.exports = EthermerisServer;