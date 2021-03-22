const http = require('http');
const path = require('path');
const express = require('express');
const Ethermeris = require('../../src');

const PORT = 3000;

const app = express();
const httpServer = http.Server(app);

// const manager = new Ethermeris.Manager({
// 	httpServer: httpServer
// });

const server = new Ethermeris.Server({
	stateSchema: {
		counter: 0,
		clients: {}
	}
});
server.attachToServer('main', httpServer);

server.on('connection', (client, metadata) => {
	server.setState(state => {
		state.clients[client.id] = {
			name: String(metadata.name)
		};

		return state;
	});
});

server.on('reset_counter', (data, client) => {
	server.setState(state => ({
		counter: 0
	}));
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
}, 1000);

require('../includeEthermerisClient')(app);
app.use('/', express.static(path.join(__dirname)));

httpServer.listen(PORT, function(){
	console.log('listening on *:' + PORT);
});