const EventEmitter = require('eventemitter3');
const url = require('url');
const _ = require('lodash');
const detailedDiff = require('deep-object-diff').detailedDiff;
const Networker = require('./Networker');
const SETTINGS = require('./modules/SETTINGS');
const Utils = require('./modules/Utils');

/**
 * The Ethermeris Server. This class contains the state, networker and event emitter.
 * It is not meant to be used bare. Use the Manager to create servers instead.
 * @class EthermerisServer
 * @param {ServerSettings} settings - Ethermeris Server Settings
 */
class EthermerisServer {
	constructor(settings) {
		this.serverID = settings.serverID || Utils.makeID(5);
		this.stateSchema = settings.stateSchema;
		this._state = { ...(this.stateSchema) };
		this.settings = {
			maxMessagesPerSecond: settings.maxMessagesPerSecond || 75,
			clientTimeout: settings.clientTimeout || 20000,
			peerSettings: Utils.peerSettingsBuilder(settings.peerSettings)
		};

		this.emitter = new EventEmitter();
		this.networker = new Networker({
			emitter: this.emitter,
			getState: () => this.getState(),
			settings: this.settings
		});

		return this;
	}

	/**
	 * Obtains a cloned state.
	 * @return {Object} - The server's current state.
	 */
	getState() {
		return _.cloneDeep(this._state);
	}

	/**
	 * Obtains the server's WebSocket server
	 * @return {WebSocketServer}
	 */
	getWebSocketServer() {
		return this.networker.wsServer;
	}

	/**
	 * Returns all clients connected to the server
	 * @return {Object.<ClientID, ClientConnection>}
	 */
	getClients() {
		return this.networker.connections;
	}

	/**
	 * Work-In-Progress Method
	 * 
	 */
	addCompressor(settings) {
		return this.networker.addCompressor(settings);
	}

	/**
	 * Emits an event to all connected clients.
	 * @param  {String|Number} name - The event name
	 * @param  {...Object|EthermerisServer~clientModifierCallback} data - The event data. Can also be a callback that returns event data.
	 * @return {Boolean} Returns true on success, false on failure.
	 */
	emitToAll(name, ...data) {
		return this.networker.emitToAll(name, ...data);
	}

	/**
	 * Adds an event handler to the emitter
	 * @param  {String|Number} eventName - Name of the event to handle.
	 * @param  {Function} listener - Event listener to add.
	 * @return {EventEmitter}
	 */
	on(eventName, listener) {
		return this.emitter.on(eventName, listener);
	}

	/**
	 * Removes an event handler to the emitter
	 * @param  {String|Number} eventName - Name of the event to remove.
	 * @param  {Function} listener - Event listener to remove.
	 * @return {EventEmitter}
	 */
	off(eventName, listener) {
		return this.emitter.off(eventName, listener);
	}

	/**
	 * Adds an ephemeral event handler to the emitter that is removed once it's called.
	 * @param  {String|Number} eventName - Name of the event to handle.
	 * @param  {Function} listener - Event listener to add ephemerally.
	 * @return {EventEmitter}
	 */
	once(eventName, listener) {
		return this.emitter.once(eventName, listener);
	}

	/**
	 * Adds an event responder. It's like an event handler,
	 * except only one handler per event and that handler can return a value.
	 * @param  {String|Number} eventName - Name of the event to respond to.
	 * @param  {Function} listener - Event responder listener to add.
	 * @return {EventEmitter}
	 */
	respond(eventName, listener) {
		return this.networker.addResponder(eventName, listener);
	}

	/**
	 * Sets the state of the server using a partial state,
	 * finds the differences between the new state and the old state,
	 * then emits those differences to all clients.
	 * @param {Object} newPartialState - A partial object that gets merged into the main state to update it.
	 * @param {EthermerisServer~clientModifierCallback} [clientModifier] - An optional callback Function that is called to modify all diffs for specific clients.
	 * @param {Boolean} [shallowMerge] - If set to true, the newPartialState will be merged into the main state by just the parent object keys.
	 * Useful for optimization if you already have an entire state to set.
	 */
	setState(newPartialState, clientModifier, shallowMerge) {
		if(typeof clientModifier !== "function") clientModifier = (a, b) => b;
		let partialState;

		// If the partial state is a function, run it and get its value.
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

		/**
		 * Pre-flight per client state difference modifier callback.
		 * Its return value will be the new diff to send to the client.
		 * @callback EthermerisServer~clientModifierCallback
		 * @param {ClientConnection} client - The specific client.
		 * @param {Object} differences - The object differences to be modified.
		 */
		// Send diffs to clients
		this.networker.emitToAll(SETTINGS.EVENTS.STATE_UPDATE, client => clientModifier(client, diffs));

		return this._state;
	}
}

module.exports = EthermerisServer;