const IO = require('socket.io')
const debug = require('debug')('moleculer-socket.io')
const _ = require('lodash')
const nanomatch = require('nanomatch')
const { ServiceNotFoundError } = require("moleculer").Errors;
const { BadRequestError } = require('./errors')

module.exports = {
  name:'io',
  settings:{
    routes:[
      {
        event: 'call', //default
        // whitelist: [],
      }
    ]
  },
  created(){
    this.routes = {} //handlers
    for(let item of this.settings.routes){ //attach new actions
      this.logger.info('Add handler:', item)
      this.routes[item.event] = this.makeHandler(item)
    }
  },
  methods: {
    listen(server){
      this.io = IO.listen(server)
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
    makeHandler:function(item){
      let eventName = item.event
      let type = item.type || 'call' // handler type. ['call', 'login']
      let whitelist = item.whitelist
      let opts = item.callOptions
      debug('MakeHandler', eventName)
      const svc = this
      return async function(data, respond){
        debug(`Handle ${eventName} event:`,data)
        if(!data || !_.isString(data.action)){
          debug(`BadRequest:`,data)
          throw new BadRequestError()
        } // validate action
        try{
          let {action, params} = data
          let meta = svc.getMeta(this)
          opts =  _.assign({meta},opts)
          let res = await svc.callAction(action, params, opts, whitelist)
          if(_.isFunction(respond)) respond(null, res)
        }catch(err){
          debug('Call action error:',err)
          if(_.isFunction(respond)) svc.onError(err, respond)
        }
      }
    },
    getMeta(socket){
      return {
        user: socket.user
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
      throw new Error('No io object.')
    }
    this.io.on('connection', client=>{
      this.logger.info('Client connected:', client.id)
      for(let event in this.routes){
        debug('Attach event:', event)
        client.on(event, this.routes[event]) //attach to socket
      }
    })
  }
}
