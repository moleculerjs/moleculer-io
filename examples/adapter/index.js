/* eslint-disable no-console */

const { ServiceBroker } = require("moleculer");
const SocketIOService = require("../../");
const redis = require("socket.io-redis");

const broker = new ServiceBroker();

broker.createService({
	name: "io",
	mixins: [SocketIOService],
	settings: {
		port: 3000,
		io: {
			options: {
				adapter: redis({ host: "localhost", port: 6379 })
			}
		}
	}
});

broker.start();
