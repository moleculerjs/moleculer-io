![LOGO](https://camo.githubusercontent.com/22a347b6cc07f98ce0ee06be66385a4cb967d4a7/687474703a2f2f6d6f6c6563756c65722e73657276696365732f696d616765732f62616e6e65722e706e67)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/tiaod/moleculer-io/master/LICENSE)
[![npm](https://img.shields.io/npm/v/moleculer-io.svg)](https://www.npmjs.com/package/moleculer-io)
# moleculer-io
An API Gateway service for Moleculer framework using Socket.io


# Features
- Call moleculer actions by emiting Socket.io events.
- Support Socket.io authorization (Default: `socket.client.user` => moleculer `ctx.meta.user`)
- Whitelist.
- Middlewares.

# Install
```shell
$ npm install moleculer-io
```

# Usage

## Handle socket events
Server:
```javascript
const IO = require('socket.io')
const { ServiceBroker } = require('moleculer')
const SocketIOService = require('moleculer-io')

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
		}
	}
})

const ioService = broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    port: 3000
  }
})

broker.start()
```
By default, `moleculer-io` handle the `call` event which will proxy to moleculer's `broker.call`
Examples:
- Call `test.hello` action without params: `socket.emit('call','test.hello', callback)`
- Call `math.add` action with params: `socket.emit('call','math.add', {a:25, b:13}, callback)`
- Get health info of node: `socket.emit('call','$node.health', callback)`
- List all actions: `socket.emit('call', '$node.list', callback)`

**Example client:**
```javascript
const io = require('socket.io-client')()
const socket = io('http://localhost:3000')
socket.emit('call','math.add',{a:123, b:456},function(err,res){
  if(err){
    console.error(err)
  }else{
    console.log('call success:', res)
  }
})
```

## Handle multiple events
You can create multiple routes with different whitelist, calling options & authorization.
```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    port: 3000,
    routes:[
      {
        namespace: '/',
        middlewares: [],
        socket: {
          middlewares: [],
          handlers: [
            {
              event: 'call',
              whitelist: [],
              callOptions:{}
            }
          ]
        }
      }
    ]
  }
})
```

## Authorization
You can implement authorization. For this you need to do 2 things.
1. Add `login` type handler
2. Define your login action in Moleculer
```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings:{
     routes:[
       {
         namespace: '/',
         socket:{
           handlers: [
             {
               event:'call'
             },
             {
               event:'login',
               type:'login', //define a login type handler
               whitelist: [
                 'accounts.login'
               ]
             }
           ]
         }
       }
     ]
  }
})

broker.createService({
  name: 'accounts',
  actions: {
    login(ctx){
      if(ctx.params.user == 'tiaod' && ctx.params.password == 'pass'){
        return {id:'tiaod'} // This will set to socket.client.user
      }
    },
    getUserInfo(ctx){
      return ctx.meta.user
    }
  }
})
```

Client:
```javascript
socket.emit('login', 'accounts.login', {user: 'tiaod', password: 'pass'}, function(err,res){
  if(err){
    alert(JSON.stringify(err))
  }else{
    console.log('Login success!')
  }
})
```
See `examples/simple`

Also you could overwrite the getMeta method to add more addition meta info. The default getMeta method is:
```javascript
getMeta(socket){
  return {
    user: socket.client.user
  }
}
```
Example to add more additional info:
```javascript
broker.createService({
  name:'io',
  mixins: [SocketIOService],
  methods:{
    getMeta(socket){ //construct the meta object.
      return {
        user: socket.authToken,
        socketId: socket.id
      }
    }
  }
})
```
## Middlewares
Register middlewares
```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings:{
     routes:[
       {
         namespace: '/'
         middlewares: [ //Namespace level middlewares, equipment to namespace.use()
           (socket, next) => {
              if (socket.request.headers.cookie) return next();
              next(new Error('Authentication error'));
            }
         ],
         socket:{
           middlewares:[ // Socket level middlewares, equipment to socket.use()
             (packet, next) => {
                if (packet.doge === true) return next();
                next(new Error('Not a doge error'));
              }
           ],
           handlers: [
             {
               event:'call'
             }
           ]
         }
       }
     ]
  }
})
```


## Calling options
The handler has a callOptions property which is passed to broker.call. So you can set timeout, retryCount or fallbackResponse options for routes.
```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings:{
     routes:[
       {
         namespace: '/',
         socket:{
           handlers: [
             {
               event:'call'
               callOptions: {
                 timeout: 500,
                 retryCount: 0,
                 fallbackResponse(ctx, err) { ... }
               }
             },
           ]
         }
       }
     ]
  }
})
```
Note: If you provie a meta field here, it replace the getMeta method's result.



## Full settings
```javascript
settings: {
  options: {}, // Socket.io options. See: https://socket.io/docs/server-api/#new-server-httpserver-options
  port: 3000, // If provied, moleculer-io will create a server to listen this port.
  routes:[
    {
      namespace: '/',
      middlewares: [], //namespace middlewares
      socket: {
        middlewares: [], // socket middlewares
        handlers: [
          {
            event: 'call',
            type: 'call', // handler type. Support: 'call', 'login'
            whitelist: [],
            callOptions:{} // Call options pass to broker.call()
          },
          {
            event: 'login',
            type: 'login',
            whitelist: [],
            callOptions:{}
          }
        ]
      }
    }
  ]
}
```

## Brocasting
TODO



# Change logs
**0.4.0**: Modify settings format.

**0.3.0**: Add login handler.

**0.2.0**: Add `initServer` method.
