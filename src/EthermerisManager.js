const fs = require('fs');
const path = require('path');
const url = require('url');
const EthermerisServer = require('./EthermerisServer');
const Utils = require('./modules/Utils');

let ethermerisClientScript = fs.readFileSync(path.join(__dirname, '..', 'dist', 'ethermeris.js'));

class EthermerisManager {
	constructor(settings) {
		this.httpServer = settings.httpServer || null;
		this.serverRoute = settings.serverRoute || "/ethermeris";

		this.servers = {};

		if(!this.httpServer) throw new Error("No HTTP server given to manager.");

		this.httpServer.on('upgrade', (request, socket, head) => {
			const pathname = url.parse(request.url).pathname;
			const serverID = pathname.replace(this.serverRoute + "/ether_", "");

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

			if(method === "POST" && url === this.serverRoute + "/signal") {
				response.writeHead(200, {'Content-Type': 'application/json'});

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
			} else if(method === "POST" && url === this.serverRoute + "/ice_candidate") {
				response.writeHead(200, {'Content-Type': 'application/json'});

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
			} else if(method === "GET" && url === this.serverRoute + "/ethermeris.js") {
				response.writeHead(200, {'Content-Type': 'text/javascript'});
				response.end(ethermerisClientScript);
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