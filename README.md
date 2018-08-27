![LOGO](https://camo.githubusercontent.com/22a347b6cc07f98ce0ee06be66385a4cb967d4a7/687474703a2f2f6d6f6c6563756c65722e73657276696365732f696d616765732f62616e6e65722e706e67)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/tiaod/moleculer-io/master/LICENSE)
[![npm](https://img.shields.io/npm/v/moleculer-io.svg)](https://www.npmjs.com/package/moleculer-io)
# moleculer-io
An API Gateway service for Moleculer framework using Socket.io


# Features
- Call moleculer actions by emiting Socket.io events.
- Support Socket.io authorization (Default: `socket.client.user` => moleculer `ctx.meta.$user`)
- Whitelist.
- Middlewares.
- Broadcast events.
- Joining and leaving rooms.

# Install
```shell
$ npm install moleculer-io
```

# Usage
## Init server
Using with Node http server:
```javascript
const server = require('http').Server(app)
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
        ctx.meta.$user = {id:'tiaod'} // This will save to socket.client.user
      }
    },
    getUserInfo(ctx){
      return ctx.meta.$user //Once user was logged in, you can get user here.
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
    $user: socket.client.user,
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
        $user: socket.client.user,
        $rooms: Object.keys(socket.rooms),
        socketId: socket.id
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
          (socket, next) => {
             if (socket.request.headers.cookie) return next();
             next(new Error('Authentication error'));
           }
        ],
        packetMiddlewares: [ // equipment to socket.use()
          (packet, next) => {
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

## Full settings
```javascript
settings:{
  port: 3000,
  options: {}, //socket.io options
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
