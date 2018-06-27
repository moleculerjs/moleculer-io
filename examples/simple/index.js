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

broker.createService({
  name: 'accounts',
  actions: {
    login(ctx){
      if(ctx.params.user == 'tiaod' && ctx.params.password == 'pass'){
        return {id:'tiaod'}
      }
    },
    getUserInfo(ctx){
      return ctx.meta.user
    }
  }
})

const ioService = broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings:{
    namespaces: {
      '/':{
        // middlewares:[],
        // packetMiddlewares:[],
        events:{
          'call':{
            whitelist: [
              'math.*'
            ],
            // callOptions:{}
          },
          'login':{
            type:'login',
            whitelist:[
              'accounts.login'
            ]
          },
          'upload':function(file, respond){
            console.log(file)
            respond(null, file)
          }
        }
      }
    }
  }
})

ioService.initServer(server)

broker.start()

server.listen(3000)
