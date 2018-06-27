const IO = require('socket.io')
const debug = require('debug')('moleculer-io')
const _ = require('lodash')
const nanomatch = require('nanomatch')
const { ServiceNotFoundError } = require("moleculer").Errors;
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
            // type: 'call',
            // whitelist: [],
            // callOptions:{}
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
      this.logger.info('Add route:', item)
      if(!this.handlers[nsp]) this.handlers[nsp] = {}
      let events = item.events
      for(let event in events){
        let handlerItem = events[event]
        if(typeof handlerItem === 'function'){ //custom handler
          this.handlers[nsp][event] = handlerItem
          return
        }
        switch (handlerItem.type || 'call') {
          case 'call':
            this.handlers[nsp][event] = this.makeHandler(handlerItem)
            break
          case 'login':
            this.handlers[nsp][event] = this.makeLoginHandler(handlerItem)
            break
          default:
            throw new Error(`Unknow handler type: ${handlerItem.type}`)
        }
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
    async callAction(action, params, opts, whitelist){
      if(whitelist && !this.checkWhitelist(action, whitelist)){//check whitelist
        debug(`Service "${action}" not found`)
        throw new ServiceNotFoundError(action)
      }
      debug('Call action:', action, params, opts)
      return await this.broker.call(action, params, opts)
    },
    makeHandler:function(handlerItem){
      let eventName = handlerItem.event
      let whitelist = handlerItem.whitelist
      let opts = handlerItem.callOptions
      const svc = this
      debug('MakeHandler', eventName)
      return async function(action, params, respond){
        debug(`Handle ${eventName} event:`,action)
        if(!_.isString(action)){
          debug(`BadRequest:action is not string! action:`,action)
          throw new BadRequestError()
        }
        if(_.isFunction(params)){
          respond = params
          params = null
        }
        try{
          let meta = svc.getMeta(this)
          let res = await svc.callAction(action, params, _.assign({meta},opts), whitelist)
          if(_.isFunction(respond)) respond(null, res)
        }catch(err){
          debug('Call action error:',err)
          if(_.isFunction(respond)) svc.onError(err, respond)
        }
      }
    },
    makeLoginHandler:function(handlerItem){
      let handler = this.makeHandler(handlerItem)
      return async function(action, params, respond){
        let socket = this
        handler.call(socket, action, params, (err, res)=>{
          if(err) return respond(err)
          socket.client.user = res
          respond(err,res)
        })
      }
    },
    getMeta(socket){
      debug('getMeta', socket.client.user)
      return {
        user: socket.client.user
      }
    },
    onError(err, respond){
      debug('onError',err)
      const errObj = _.pick(err, ["name", "message", "code", "type", "data"]);
      return respond(errObj)
    }
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
        namespace.emit(event,...ctx.params.args)
      }
    }
  }
}
