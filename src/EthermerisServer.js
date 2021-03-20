// Import Networker
// Create array -> key system for further compression
// Send decompression keys to client on first connection
// Create event emitter for events like players disconnecting or player key press events

class EthermerisServer {
	constructor() {
		this.networker = null;
		this.state = {};
	}

	init() {

	}

	addClient() {

	}

	setState(newState) {
		// Merge new state
		// Find diffs
		// Send diffs to clients
	}


}

module.exports = EthermerisServer;