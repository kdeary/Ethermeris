const _ = require('lodash');
const EventEmitter = require('eventemitter3');
const { encode, decode } = require('msgpack-lite');
const SETTINGS = require('./modules/SETTINGS');
const Utils = require('./modules/Utils');

class EthermerisClient {
	constructor(settings) {
		this.state = {};
		this.emitter = new EventEmitter();
		this.socket = null;
		this.socketPathname = settings.pathname || "";
		this.pingInterval = null;
		this.getInitialData = settings.getInitialData || (() => {});
	}

	init() {
		this.socket = new WebSocket(
			(location.protocol === "https:" ? "wss://" : "ws://") + location.host + this.socketPathname
		);
		this.attachHandlers();

		return this;
	}

	destroy() {
		clearInterval(this.pingInterval);
		this.emitter = null;
		this.socket.close();
		this.socket = null;
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

	attachHandlers() {
		this.socket.addEventListener('open', () => {
			this.sendEvent(SETTINGS.EVENTS.CLIENT_CONNECT_REQUEST, this.getInitialData());
			this.pingInterval = setInterval(() => {
				this.sendEvent(SETTINGS.EVENTS.PING);
			}, SETTINGS.HEARTBEAT_PING_INTERVAL);
		});

		this.socket.addEventListener('message', async (rawEvent) => {
			let blob = rawEvent.data;

			let blobArray = new Uint8Array(await blob.arrayBuffer());

			let data = decode(blobArray);
			let event = Utils.decompressNetworkEvent(data);

			if(event.name === SETTINGS.EVENTS.INITIAL_DATA) {
				this.emitStartData(event.data[0], event.data[1]);
			} else if(event.name === SETTINGS.EVENTS.STATE_UPDATE) {
				this.handlePartialState(event.data);
			} else {
				this.emitter.emit(event.name, event.data);
			}
		});
	}

	emitStartData(initialState, initialData) {
		this.state = initialState;
		this.emitter.emit('connected', initialState, initialData);
	}

	handlePartialState(partialState) {
		let oldState = _.cloneDeep(this.state);
		_.mergeWith(this.state, partialState, Utils.mergeModifier);

		// console.log(this.state, partialState);

		this.emitter.emit('state_update', _.cloneDeep(this.state), partialState, oldState);
	}

	sendEvent(name, data) {
		let event = Utils.compressNetworkEvent(name, data);
		let blob = encode(event);

		this.socket.send(blob);
	}
}

module.exports = EthermerisClient;