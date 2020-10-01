import { ServiceBroker } from 'moleculer'
import SocketIOService from '../../'

const broker = new ServiceBroker()

const ioService = broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    port: 3000,
    io:{
      options: {
        // adapter: redisAdapter({ host: 'localhost', port: 6379 })
      },
      namespaces: {
        '/':{
          authorization: true,
          middlewares:[function(socket, next){
            console.log('namespace middleware') //point to service instance.
            next()
          }],
          // packetMiddlewares:[],
          events:{
            'call':{
              whitelist: [
                'math.*',
                'say.*',
                'accounts.*',
                'rooms.*',
                'io.*'
              ],
              onBeforeCall: async function(ctx, socket, action, params, callOptions){
                console.log('before hook:', { action, params, callOptions })
              },
              onAfterCall:async function(ctx, socket, res){
                console.log('after hook', res)
              }
              // callOptions:{}
            },
            'upload':async function({name, type}, file, respond){
              let stream = new Duplex()
              stream.push(file)
              stream.push(null)
              await this.$service.broker.call('file.save', stream, { meta: {
                filename: name
              }})
              respond(null, name)
            },
          }
        }
      }
    },
  },
  methods: {
    socketAuthorize(socket, handler){
      console.log('Login using token:', socket.handshake.query.token)
      let accessToken = socket.handshake.query.token
      if (accessToken) {
        if (accessToken === "12345") {
        // valid credential
          return Promise.resolve({ id: 1, detail: "You are authorized using token.", name: "John Doe" })
        } else {
        // invalid credentials
          return Promise.reject()
        }
      } else {
      // anonymous user
        return Promise.resolve()
      }
    }
  }
})
ioService.initSocketIO(3000)



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
  name: 'say',
  actions: {
    hello:{
      params: {
        name: { type: 'string', min: 2 },
      },
      handler(ctx){
        return `${ctx.params.name} hello`
      }
    }
  }
})

broker.createService({
  name: 'rooms',
  actions: {
    join: {
      params: {
        join: { type: 'string', min: 2 },
      },
      handler(ctx) {
        ctx.meta.$join = ctx.params.join
      }
    },
    leave:{
      params: {
        leave: { type: 'string', min: 2 },
      },
      handler(ctx){
        ctx.meta.$leave = ctx.params.leave
      }
    },
    get(ctx){
      return ctx.meta.$rooms
    }
  }
})

export default broker
