const IO = require('socket.io')
const debug = require('debug')('moleculer-io')
const _ = require('lodash')
const nanomatch = require('nanomatch')
const { ServiceNotFoundError } = require("moleculer").Errors;
const { Context } = require('moleculer')
const { BadRequestError } = require('./errors')

module.exports = {
  name:'io',
  settings:{
    // port: 3000,
    // options: {}, //socket.io options
    namespaces: {
      '/':{
        // middlewares:[],
        // packetMiddlewares:[],
        events:{
          'call':{
            // whitelist: [],
            // callOptions:{},
            // before: async function(ctx, socket, args){
            //   debug('before hook:', args)
            // },
            // after:async function(ctx, socket, res){
            //   debug('after hook', res)
            // }
          }
        }
      }
    }
  },
  created(){
    this.handlers = {} //
    let namespaces = this.settings.namespaces
    for(let nsp in namespaces){
      let item = namespaces[nsp]
      debug('Add route:', item)
      if(!this.handlers[nsp]) this.handlers[nsp] = {}
      let events = item.events
      for(let event in events){
        let handlerItem = events[event]
        if(typeof handlerItem === 'function'){ //custom handler
          this.handlers[nsp][event] = handlerItem
          return
        }
        this.handlers[nsp][event] = this.makeHandler(handlerItem)
      }
    }
  },
  methods: {
    initServer(srv, opts){
      if ('object' == typeof srv && srv instanceof Object && !srv.listen) {
        opts = srv;
        srv = null;
      }
      opts = opts || this.settings.options
      srv = srv || this.settings.port
      this.io = new IO(srv, opts)
    },
    checkWhitelist(action, whitelist) {
			return whitelist.find(mask => {
				if (_.isString(mask)) {
					return nanomatch.isMatch(action, mask, { unixify: false })
				}
				else if (_.isRegExp(mask)) {
					return mask.test(action)
				}
			}) != null
		},

    makeHandler:function(handlerItem){
      let whitelist = handlerItem.whitelist
      let opts = handlerItem.callOptions
      const svc = this
      debug('MakeHandler', handlerItem)
      return async function(action, params, respond){
        debug(`Call action: `,action)
        if(_.isFunction(params)){
          respond = params
          params = null
        }
        try{
          let res = await svc.actions.call({socket:this, action, params, opts, handlerItem})
          if(_.isFunction(respond)) respond(null, res)
        }catch(err){
          debug('Call action error:',err)
          if(_.isFunction(respond)) svc.onError(err, respond)
        }
      }
    },
    getMeta(socket){
      let meta = {
        $user: socket.client.user,
        $rooms: Object.keys(socket.rooms)
      }
      debug('getMeta', meta)
      return meta
    },
    onError(err, respond){
      debug('onError',err)
      const errObj = _.pick(err, ["name", "message", "code", "type", "data"]);
      return respond(errObj)
    },
    joinRooms(socket, rooms){
      debug(`socket ${socket.id} join room:`, rooms)
      return new Promise(function(resolve, reject) {
        socket.join(rooms,err=>{
          if(err){
            reject(err)
          } else {
            resolve()
          }
        })
      })
    },
    leaveRoom(socket, room){
      return new Promise(function(resolve, reject) {
        socket.leave(room,err=>{
          if(err){
            reject(err)
          } else {
            resolve()
          }
        })
      })
    },
  },
  started(){
    if(!this.io){
      this.initServer()
    }
    let namespaces = this.settings.namespaces
    for(let nsp in namespaces){
      let item = namespaces[nsp]
      let namespace = this.io.of(nsp)
      if(item.middlewares){ //Server middlewares
        for(let middleware of item.middlewares){
          namespace.use(middleware)
        }
      }
      let handlers = this.handlers[nsp]
      namespace.on('connection', socket=>{
        this.logger.info(`(nsp:'${nsp}') Client connected:`,socket.id)
        if(item.packetMiddlewares){ //socketmiddlewares
          for(let middleware of item.packetMiddlewares){
            socket.use(middleware)
          }
        }
        for(let eventName in handlers){
          debug('Attach event:', eventName)
          socket.on(eventName, handlers[eventName])
        }
      })
    }
  },
  actions: {
    call: {
      visibility: "private",
      async handler(ctx){
        let {socket, action, params, opts, handlerItem} = ctx.params
        if(!_.isString(action)){
          debug(`BadRequest:action is not string! action:`,action)
          throw new BadRequestError()
        }
        if(handlerItem.whitelist && !this.checkWhitelist(action, handlerItem.whitelist)){
          debug(`Service "${action}" not found`)
          throw new ServiceNotFoundError(action)
        }
        let meta = this.getMeta(socket)
        opts = _.assign({meta},opts)
        debug('Call action:', action, params, opts)
        const vName = this.version ? `v${this.version}.${this.name}` : this.name
        // const ctx = Context.create(this.broker, {name: vName + ".call"}, this.broker.nodeID, params, opts || {})
        let args = { action, params, callOptions:opts }
        if(handlerItem.before){
          await handlerItem.before.call(this, ctx, socket, args)
        }
        let res = await ctx.call(args.action, args.params, args.callOptions)
        if(handlerItem.after){
          await handlerItem.after.call(this, ctx, socket, res)
        }
        socket.client.user = ctx.meta.$user
        if(ctx.meta.$join){
          await this.joinRooms(socket, ctx.meta.$join)
        }
        if(ctx.meta.$leave){
          if(_.isArray(ctx.meta.$leave)){
            await Promise.all(ctx.meta.$leave.map(room=>this.leaveRoom(socket, room)))
          }else{
            await this.leaveRoom(socket, ctx.meta.$leave)
          }
        }
        return res
      }
    },
    broadcast:{
      params:{
        event: { type:'string' },
        namespace:{ type:'string', optional:true},
        args: { type:'array',optional:true},
        volatile: { type: 'boolean',optional:true},
        local: { type:'boolean',optional:true},
        rooms: { type:'array', items: 'string',optional:true}
      },
      async handler(ctx){
        debug('brocast: ', ctx.params)
        let namespace = this.io
        if(ctx.params.namespace){
          namespace = namespace.of(ctx.params.namespace)
        }
        if(ctx.params.volate) namespace = namespace.volate
        if(ctx.params.local) namespace = namespace.local
        if(ctx.params.rooms){
          for(let room of ctx.params.rooms){
            namespace = namespace.to(room)
          }
        }
        namespace.emit(ctx.params.event,...ctx.params.args)
      }
    }
  }
}
