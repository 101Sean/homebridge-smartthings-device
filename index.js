const axios = require('axios')
const AirConAccessory  = require('./accessories/AirConAccessory')
const TVAccessory      = require('./accessories/TVAccessory')
const SetTopAccessory  = require('./accessories/SetTopAccessory')
const SpeakerAccessory = require('./accessories/SpeakerAccessory')

module.exports = (api) => {
    api.registerPlatform('SmartThingsPlatform', SmartThingsPlatform)
}

class SmartThingsPlatform {
    constructor(log, config, api) {
        this.log    = log
        this.config = config
        this.api    = api
        api.on('didFinishLaunching', () => this.discoverDevices())
    }

    async discoverDevices() {
        if (!this.config.token) {
            this.log.error('Missing SmartThings token')
            return
        }
        const resp = await axios.get(
            'https://api.smartthings.com/v1/devices',
            { headers: { Authorization: `Bearer ${this.config.token}` } }
        )
        for (const dev of resp.data.items) {
            const caps = dev.components[0].capabilities.map(c=>c.id)
            const cats = dev.components[0].categories?.map(c=>c.name)||[]

            if (caps.includes('airConditionerMode'))
                AirConAccessory.register(this.api, dev, this.config)
            else if (cats.includes('Television'))
                TVAccessory.register(this.api, dev, this.config)
            else if (cats.includes('SetTop'))
                SetTopAccessory.register(this.api, dev, this.config)
            else if (caps.includes('audioVolume'))
                SpeakerAccessory.register(this.api, dev, this.config)
        }
    }
}