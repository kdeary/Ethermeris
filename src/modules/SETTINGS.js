const SETTINGS = {
	EVENTS: {
		INITIAL_DATA: 1,
		STATE_UPDATE: 2,
		CLIENT_CONNECT_REQUEST: 3,
		PING: 4,
		REQUEST: 5,
		RESPONSE: 6,
		DISCONNECTION_REASON: 7
	},
	HEARTBEAT_PING_INTERVAL: 20000,
	ICE_SERVERS: [
		{
			urls: [
				"stun:stun.l.google.com:19302",
				"stun:stun1.l.google.com:19302",
				"stun:stun2.l.google.com:19302",
				"stun:stun3.l.google.com:19302",
				"stun:stun4.l.google.com:19302"
			]
		}
	]
};

module.exports = SETTINGS;