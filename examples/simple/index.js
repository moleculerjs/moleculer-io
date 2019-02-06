const { ServiceBroker } = require('moleculer')
const SocketIOService = require('../../')
const broker = new ServiceBroker()

broker.createService({
  name: 'io',
  mixins: [SocketIOService],
  settings: {
    port: 3000
  }
})

broker.start()
