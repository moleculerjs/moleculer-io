const IO = require('socket.io')
const { ServiceBroker } = require('moleculer')
const SocketIOService = require('../../')
const express = require('express')


const app = express()

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/public/index.html');
});
const server = require('http').Server(app)


const broker = new ServiceBroker({
  logger: console,
  metrics:true,
  validation: true
})

broker.createService({
	name: "math",
	actions: {
		add(ctx) {
			return Number(ctx.params.a) + Number(ctx.params.b);
		},
		sub(ctx) {
			return Number(ctx.params.a) - Number(ctx.params.b);
		}
	}
})

const ioService = broker.createService({
  name: 'socketio',
  mixins: [SocketIOService],
  settings: {
    routes:[
      {
        event: 'call',
        whitelist: [
          'math.sub'
        ]
      }
    ]
  }
})

ioService.listen(server)

broker.start()

server.listen(3000)
