const IO = require('socket.io')
const { ServiceBroker } = require('moleculer')
const SocketIOAdapter = require('socket.io-redis')
const SocketIOService = require('../../')
const express = require('express')
const fs = require('fs')
const path = require('path')
const Duplex = require('stream').Duplex;
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
    add:{
      visibility: "published",
      handler(ctx) {
  			return Number(ctx.params.a) + Number(ctx.params.b);
  		},
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
        ctx.meta.user = {id:'tiaod'}
      }
    },
    getUserInfo(ctx){
      return ctx.meta.user
    }
  }
})

broker.createService({
  name: 'rooms',
  actions: {
    join(ctx){
      ctx.meta.$join = ctx.params.join
    },
    leave(ctx){
      ctx.meta.$leave = ctx.params.leave
    },
    get(ctx){
      return ctx.meta.$rooms
    }
  }
})

broker.createService({
  name: 'file',
  actions: {
    save: {
			handler(ctx) {
				return new this.Promise((resolve, reject) => {
					const filePath = path.join(__dirname, ctx.meta.filename);
					const f = fs.createWriteStream(filePath);
					f.on("close", () => {
						this.logger.info(`Uploaded file stored in '${filePath}'`);
						resolve(filePath);
					});
					f.on("error", err => reject(err));

					ctx.params.pipe(f);
				});
			}
		}
  }
})

const ioService = broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings:{
  	adapter: {
  		module: SocketIOAdapter,
		options: {
			host: 'redis',
			port: 6379
		}
	},
    namespaces: {
      '/':{
        middlewares:[function(socket, next){
          //console.log(this) //point to service instance.
          next()
        }],
        // packetMiddlewares:[],
        events:{
          'call':{
            whitelist: [
              'math.*',
              'accounts.*',
              'rooms.*'
            ],
            before: async function(ctx, socket, args){
              console.log('before hook:', args)
            },
            after:async function(ctx, socket, res){
              console.log('after hook', res)
            }
            // callOptions:{}
          },
          'upload':async function({name, type}, file, respond){
            let stream = new Duplex()
            stream.push(file)
            stream.push(null)
            await this.broker.call('file.save', stream, { meta: {
              filename: name
            }})
            respond(null, file)
          },
        }
      }
    }
  }
})

ioService.initServer(server)

broker.start()

server.listen(3000)
