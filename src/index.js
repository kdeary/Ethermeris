const EthermerisManager = require('./EthermerisManager');
const EthermerisServer = require('./EthermerisServer');
const EthermerisClient = require('./EthermerisClient');
const EthermerisNetworker = require('./Networker');
const SETTINGS = require('./modules/SETTINGS');

const typedefs = require('./typedefs');

module.exports = {
	Manager: EthermerisManager,
	Server: EthermerisServer,
	Client: EthermerisClient,
	Networker: EthermerisNetworker,
	Defaults: SETTINGS
};