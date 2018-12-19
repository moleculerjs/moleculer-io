![LOGO](https://raw.githubusercontent.com/tiaod/moleculer-io/master/examples/assets/logo.png)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/tiaod/moleculer-io/master/LICENSE)
[![npm](https://img.shields.io/npm/v/moleculer-io.svg)](https://www.npmjs.com/package/moleculer-io)

<!-- TOC depthFrom:1 depthTo:6 withLinks:1 updateOnSave:1 orderedList:0 -->

- [Moleculer-io](#moleculer-io)
- [Features](#features)
- [Install](#install)
- [Usage](#usage)
	- [Init server](#init-server)
	- [Handle socket events](#handle-socket-events)
	- [Handle multiple events](#handle-multiple-events)
	- [Custom handler](#custom-handler)
	- [Handler hooks](#handler-hooks)
	- [Calling options](#calling-options)
	- [Middlewares](#middlewares)
	- [Authorization](#authorization)
		- [Make authorization on connection](#make-authorization-on-connection)
	- [Joining and leaving rooms](#joining-and-leaving-rooms)
	- [Broadcast](#broadcast)
	- [Using multiple instances](#using-multiple-instances)
	- [Full settings](#full-settings)
- [Change logs](#change-logs)
- [License](#license)

<!-- /TOC -->

# Moleculer-io

The `moleculer-io` is the API gateway service for [Moleculer](https://github.com/moleculerjs/moleculer) using `socket.io`. Use it to publish your services.

# Features

-   Call moleculer actions by emiting Socket.io events.
-   Support Socket.io authorization (Default: `socket.client.user` => moleculer `ctx.meta.user`)
-   Whitelist.
-   Middlewares.
-   Broadcast events.
-   Joining and leaving rooms.

# Install

```shell
$ npm install moleculer-io
```

# Usage

## Init server

Using with Node http server:

```javascript
const server = require('http').Server(app)
const SocketIOService = require("moleculer-io")
const ioService = broker.createService({
  name: 'io',
  mixins: [SocketIOService]
})

ioService.initServer(server)
// Once the initServer() was called, you can access the io object from ioService.io
broker.start()
server.listen(3000)
```

Or let moleculer-io create a server for you:

```javascript
const ioService = broker.createService({
  name: 'io',
  mixins: [SocketIOService]
})
ioService.initServer(3000)
broker.start()
```

More simple:

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings:{
    port:3000 //will call initServer() on broker.start()
  }
})
broker.start()
```

Or maybe you want to use it with `moleculer-web`

```js
const ApiService = require("moleculer-web");
const SocketIOService = require("moleculer-io")
broker.createService({
  name: 'gw',
  mixins: [ApiService,SocketIOService], //Should after moleculer-web
	settings: {
		port: 3000
	}
})
broker.start()
```

`moleculer-io` will use the server created by `moleculer-web` automatically.

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

-   Call `test.hello` action without params: `socket.emit('call','test.hello', callback)`
-   Call `math.add` action with params: `socket.emit('call','math.add', {a:25, b:13}, callback)`
-   Get health info of node: `socket.emit('call','$node.health', callback)`
-   List all actions: `socket.emit('call', '$node.list', callback)`

**Example client:**

```javascript
const io = require('socket.io-client')
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
    namespaces: {
      '/':{
        events: {
          'call':{
            whitelist: [
              'math.add'
            ],
            callOptions: {}
          },
          'adminCall': {
            whitelist: [
              'users.*',
              '$node.*'
            ]
          }
        }
      }
    }
  }
})
```

## Custom handler

You can make use of custom functions within the declaration of event handler.

```javascript
broker.createService({
  name:'io',
  mixins: [SocketIOService],
  settings: {
    port:3000,
    namespaces: {
      '/':{
        events:{
          'call':{},
          'myCustomEventHandler': function(data, ack){ // write your handler function here.
            let socket = this
            socket.emit('hello', 'world')
          }
        }
      }
    }
  }
})
```

## Handler hooks

The event handler has before & after call hooks. You can use it to set ctx.meta, access socket object or modify the response data.

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    namespaces: {
      '/':{
        events:{
          'call':{
            whitelist: [
              'math.*'
            ],
            before: async function(ctx, socket, args){ //before hook
              //args: An object includes { action, params, callOptions }
              console.log('before hook:', args)
            },
            after:async function(ctx, socket, res){ //after hook
              console.log('after hook', res)
              // res: The respose data.
            }
          }
        }
      }
    }
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
    namespaces:{
      '/':{
        events:{
          'call':{
            callOptions:{
              timeout: 500,
              retryCount: 0,
              fallbackResponse(ctx, err) { ... }
            }
          }
        }
      }
    }
  }
})
```

Note: If you provie a meta field here, it replace the getMeta method's result.

## Middlewares

Register middlewares. Both namespace middlewares and packet middlewares are supported.

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings:{
    namespaces: {
      '/': {
        middlewares:[ //Namespace level middlewares, equipment to namespace.use()
          function(socket, next) {
             if (socket.request.headers.cookie) return next();
             next(new Error('Authentication error'));
           }
        ],
        packetMiddlewares: [ // equipment to socket.use()
          function(packet, next) {
             if (packet.doge === true) return next();
             next(new Error('Not a doge error'));
           }
        ],
        events:{
          'call': {}
        }
      }
    }
  }
})
```

**Note:** In middlewares the `this` is always pointed to the Service instance.

## Authorization

You can implement authorization. For this you need to add an handler.

```javascript
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    namespaces: {
      '/':{
        events:{
          'call':{
            whitelist: [
              'math.*',
              'accounts.*'
            ]
          }
        }
      }
    }
  }
})

broker.createService({
  name: 'accounts',
  actions: {
    login(ctx){
      if(ctx.params.user == 'tiaod' && ctx.params.password == 'pass'){
        ctx.meta.user = {id:'tiaod'} // This will save to socket.client.user
      }
    },
    getUserInfo(ctx){
      return ctx.meta.user //Once user was logged in, you can get user here.
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
    user: socket.client.user,
    $rooms: Object.keys(socket.rooms)
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
        user: socket.client.user,
        $rooms: Object.keys(socket.rooms),
        socketId: socket.id
      }
    }
  }
})
```

By default, `ctx.meta.user` will save to `socket.client.user`, you can also overwrite it.
The default `saveUser` method is:

```javascript
saveUser(socket,ctx){
	socket.client.user = ctx.meta.user
}
```

### Make authorization on connection

If you don't want to emit an event to login, you can use query to pass your token:

```js
// server
broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    namespaces: {
      '/': {
        middlewares: [
          async function(socket, next) {
            if (socket.handshake.query.token) {
              let token = socket.handshake.query.token
              try {
                let res = await this.broker.call("account.verifyToken", {
                  token
                })
                if (res.token) socket.emit('setToken', res.token) //Update your token
                socket.client.user = res.user
              } catch (e) {
                socket.emit('setToken', null) // verify failed, clear client token
                return next()
              }
            }
            next()
          }
        ]
      }
    }
  }
})
```

```js
// client
let token = localStorage.getItem('myToken')
const socket = io(process.env.SERVER_ADDR, {
  query: token ? { token } : {}
})

socket.on('setToken', (token) => {
  // Save your token here
  if (token) {
    localStorage.setItem('myToken', token)
  } else {
    localStorage.removeItem('myToken')
  }
})

socket.on('reconnect_attempt', () => {
  let token = localStorage.getItem('myToken')
  if (token) {
    socket.io.opts.query.token = token
  } else {
    delete socket.io.opts.query.token
  }
})
```

## Joining and leaving rooms

In your action, set ctx.meta.$join or ctx.meta.$leave to the rooms you want to join or leave.

eg.

```javascript
ctx.meta.$join = 'room1' //Join room1
ctx.meta.$join = ['room1', 'room2'] // Join room1 and room2

ctx.meta.$leave = 'room1' //Leave room1
ctx.meta.$leave = ['room1', 'room2'] // Leave room1 and room2
```

After the action finished, `moleculer-io` will join or leave the room you specified.

Example room management service:

```javascript
broker.createService({
  name: 'rooms',
  actions: {
    join(ctx){
      ctx.meta.$join = ctx.params.room
    },
    leave(ctx){
      ctx.meta.$leave = ctx.params.room
    },
    list(ctx){
      return ctx.meta.$rooms
    }
  }
})
```

## Broadcast

If you want to broadcast event to socket.io from moleculer service:

```javascript
broker.call('io.broadcast', {
  namespace:'/', //optional
  event:'hello',
  args: ['my', 'friends','!'], //optional
  volatile: true, //optional
  local: true, //optional
  rooms: ['room1', 'room2'] //optional
})
```

Note: You should change the 'io' to the service name you created.

## Using multiple instances

If you plan for a highly available setup (launching multiple instances of this service behind a Load Balancer), 
you will have to take some extra steps. Due to the nature of WebSockets these instances will need a PubSub capable broker
to connect to, in order to broadcast messages to sockets which are connected to other instances. For a more
in depth explanation of this concept, and additional steps that have to be taken (such as Load Balancer configuration), refere to the [Socket.io Documentation](https://socket.io/docs/using-multiple-nodes/).

In order to interconnect this service with other services, start the service with an adapter:

```javascript
broker.createService({
    name: 'io',
    mixins: [SocketIOService],
    settings:{
        port:3000, //will call initServer() on broker.start()
        adapter: {
            module: require("socket.io-redis"),
            options: { 
                host: 'redis', 
                port: 6379 
            } 
        }
    }
})
```

## Full settings

```javascript
settings:{
  port: 3000,
  io: {}, //socket.io options
  adapter: {
  	module: require('socket.io-...') // socket.io adapter module
  	options: {} // socket.io adapter options
  },
  namespaces: {
    '/':{
      middlewares:[],
      packetMiddlewares:[],
      events:{
        'call':{
          whitelist: [],
          callOptions:{},
          before: async function(ctx, socket, args){},
          after:async function(ctx, socket, res){}
        }
      }
    }
  }
}
```

# Change logs

**0.13.2**: Added socket.io adapter options for intercommunication of multiple instances

**0.13.1**: Add request logger.

**0.13.0**: `moleculer-io` can now get alone well with `moleculer-web`, you can use them together!
	\- Note that `settings.options` now become to `settings.io`.

**0.12.1**: CustomHandler context now bind to the service instance.

**0.12.0**: Change `ctx.meta.$user` to `ctx.meta.user`, add `saveUser` method.

**0.11.0**: Bind middlewares context to service instance.

**0.10.0**: Add action visibility support. See [Action visibility](https://moleculer.services/docs/0.13/actions.html#Action-visibility)

**0.9.1**: Fix `ServiceNotFoundError` message.

**0.9.0**: Upgrade to `moleculer@0.13`, no breaking changes.

**0.8.1**: Fix io.broadcast error.

**0.8.0**: Add ctx.meta.$rooms, and ctx.meta.$join ctx.meta.$leave

**0.7.0**: Add hooks.

**0.6.0**: Modify settings format. again :)

**0.5.0**: Add broadcast to socket.io rooms

**0.4.0**: Modify settings format.

**0.3.0**: Add login handler.

**0.2.0**: Add `initServer` method.

# License

Moleculer-io is available under the MIT license.
