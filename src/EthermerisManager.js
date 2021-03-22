const url = require('url');
const EthermerisServer = require('./EthermerisServer');
const Utils = require('./modules/Utils');

class EthermerisManager {
	constructor(settings) {
		this.httpServer = settings.httpServer;
		this.servers = {};

		if(!this.httpServer) throw new Error("No HTTP server given to manager.");

		this.httpServer.on('upgrade', (request, socket, head) => {
			const pathname = url.parse(request.url).pathname;
			const serverID = pathname.replace("/", "");

			if(this.servers[serverID]) {
				const wsServer = this.servers[serverID].getWebSocketServer();
				wsServer.handleUpgrade(request, socket, head, ws => {
					wsServer.emit('connection', ws, request);
				});
			} else {
				socket.destroy();
			}
		});
	}

	createServer(settings) {
		let serverID = Utils.makeID(5);
		this.servers[serverID] = new EthermerisServer(settings);

		return serverID;
	}

	attach(server) {
		let serverID = Utils.makeID(5);
		this.servers[serverID] = server;

		return serverID;
	}
}

module.exports = EthermerisManager;