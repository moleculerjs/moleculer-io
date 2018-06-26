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
- Call `test.hello` action: `socket.emit('call','test.hello', callback)`
- Call `math.add` action with params: `socket.emit('call','math.add', {a:25, b:13}, callback)`
- Get health info of node: `socket.emit('call','$node.health', callback)`
- List all actions: `socket.emit('call', '$node.list', callback)`

Example client code:
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
## Full settings
```javascript
settings: {
  options: {}, // Socket.io options
  port: 3000, // If provied, moleculer-io will create a server to listen this port.
  namespaces:{
    '/': { //namespace
      middlewares: [], //server middlewares
      socket: {
        middlewares: [], //socket middlewares
        events: {
          'call': { //eventName
            whitelist: [], //event whitelists
            callOptions: {} //call options
          }
        }
      }
    }
  }
}
```



# Change logs

**0.2.0**: Add `initServer` method.
