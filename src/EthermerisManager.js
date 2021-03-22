const url = require('url');
const EthermerisServer = require('./EthermerisServer');
const Utils = require('./modules/Utils');

class EthermerisManager {
	constructor(settings) {
		this.httpServer = settings.httpServer || null;
		this.signalServerRoute = settings.signalServerRoute || "/signal";
		this.candidateServerRoute = settings.candidateServerRoute || "/ice_candidate";

		this.servers = {};

		if(!this.httpServer) throw new Error("No HTTP server given to manager.");

		this.httpServer.on('upgrade', (request, socket, head) => {
			const pathname = url.parse(request.url).pathname;
			const serverID = pathname.replace("/ether_", "");

			if(this.servers[serverID]) {
				const wsServer = this.servers[serverID].getWebSocketServer();
				wsServer.handleUpgrade(request, socket, head, ws => {
					wsServer.emit('connection', ws, request);
				});
			} else {
				socket.destroy();
			}
		});

		this.httpServer.on('request', (request, response) => {
			const { method, url } = request;

			if(method === "POST" && url === this.signalServerRoute) {
				response.writeHead(200, {'Content-Type': 'application/json'})

				let body = [];
				request.on('error', (err) => {
					console.error("Error while signalling client:", err);
				}).on('data', (chunk) => {
					body.push(chunk);
				}).on('end', async () => {
					body = jsonTryParse(Buffer.concat(body).toString());
					if(!jsonTryParse) return response.end(`{"err": 1}`);
					if(!this.servers[body.serverID]) return response.end(`{"err": 2}`);

					let description = await this.servers[body.serverID].networker.createRTCPeerConnection(
						body.description
					).catch(err => {
						console.error("Error while trying to create RTC peer connection:", err);
						return false;
					});

					if(!description) return response.end(`{"err": 3}`);

					response.end(JSON.stringify(description));
				});
			} else if(method === "POST" && url === this.candidateServerRoute) {
				response.writeHead(200, {'Content-Type': 'application/json'})

				let body = [];
				request.on('error', (err) => {
					console.error("Error while transporting ice candidates from the client:", err);
				}).on('data', (chunk) => {
					body.push(chunk);
				}).on('end', async () => {
					body = jsonTryParse(Buffer.concat(body).toString());
					if(!jsonTryParse) return response.end(`{"err": 1}`);
					if(!this.servers[body.serverID]) return response.end(`{"err": 2}`);

					let candidate = await this.servers[body.serverID].networker.exchangeICECandiatesWithConnection(
						body.candidate,
						body.clientID
					).catch(err => {
						console.error("Error while trying to exchange ICE candidates:", err);
						return false;
					});

					if(!candidate) return response.end(`{"err": 3}`);

					response.end(JSON.stringify(candidate));
				});
			}
		});
	}

	createServer(settings) {
		let serverID = Utils.makeID(5);
		const server = new EthermerisServer({
			serverID,
			...(settings)
		});

		this.servers[server.serverID] = server;

		return server;
	}

	attach(server) {
		let serverID = server.serverID || (server.serverID = Utils.makeID(5));
		this.servers[serverID] = server;

		return serverID;
	}
}

function jsonTryParse(value) {
	try {
		return JSON.parse(value);
	} catch(e) {
		return;
	}
}

module.exports = EthermerisManager;