const http = require('http');
const path = require('path');
const express = require('express');
const Ethermeris = require('../../src');

const PORT = 3000;

const app = express();
const httpServer = http.Server(app);

const manager = new Ethermeris.Manager({
	httpServer: httpServer
});

const server = manager.createServer({
	serverID: "main",
	stateSchema: {
		counter: 0,
		clients: {}
	}
});

server.on('connection', (client, metadata) => {
	server.setState(state => {
		state.clients[client.id] = {
			name: String(metadata.name),
			tag: ""
		};

		return state;
	});

	setTimeout(async () => {
		let tag = await client.request('tag');
		server.setState(state => {
			if(!state.clients[client.id]) return state;

			state.clients[client.id].tag = tag;

			return state;
		});
	}, 5000);
});

server.on('reset_counter', (client, data) => {
	server.setState(state => ({
		counter: 0
	}));
});

server.respond('base64', async (client, value) => {
	let str = String(value);

	return Buffer.from(str).toString('base64');
});

server.on('disconnection', client => {
	server.setState(state => {
		if(state.clients[client.id]) {
			state.clients[client.id] = null;
		}

		return state;
	});
});

setInterval(() => {
	server.setState(state => ({
		counter: state.counter + 1
	}));

	// console.log(server.getState());
}, 1000);

require('../includeEthermerisClient')(app);
app.use('/', express.static(path.join(__dirname)));

httpServer.listen(PORT, function(){
	console.log('listening on *:' + PORT);
});