const axios = require('axios')

module.exports = class TVAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const accessory = new api.platformAccessory(dev.label, uuid)
        accessory.category = Categories.TELEVISION

        const tv = accessory.addService(Service.Television, dev.label)

        // Power toggle
        tv.getCharacteristic(Characteristic.Active)
            .on('get', async (cb) => {
                const status = await TVAccessory.getStatus(config.token, dev.deviceId)
                const on = status.components.main.statelessPowerToggleButton.value === 'on'
                cb(null, on ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)
            })
            .on('set', async (value, cb) => {
                await TVAccessory.sendCommand(config.token, dev.deviceId, 'statelessPowerToggleButton', 'push', {})
                cb()
            })

        // RemoteKey: numbers and channel up/down
        tv.getCharacteristic(Characteristic.RemoteKey)
            .on('set', async (key, cb) => {
                if (key >= Characteristic.RemoteKey.NUMBER_0 && key <= Characteristic.RemoteKey.NUMBER_9) {
                    const num = key === Characteristic.RemoteKey.NUMBER_0 ? 0 : (key - 1) % 10 + 1
                    await TVAccessory.sendCommand(config.token, dev.deviceId, 'statelessChannelButton', 'push', { buttonNumber: num })
                } else if (key === Characteristic.RemoteKey.CHANNEL_UP) {
                    await TVAccessory.sendCommand(config.token, dev.deviceId, 'statelessChannelButton', 'push', { buttonNumber: 100 })
                } else if (key === Characteristic.RemoteKey.CHANNEL_DOWN) {
                    await TVAccessory.sendCommand(config.token, dev.deviceId, 'statelessChannelButton', 'push', { buttonNumber: 101 })
                }
                cb()
            })

        // VolumeSelector
        tv.addOptionalCharacteristic(Characteristic.VolumeSelector)
        tv.getCharacteristic(Characteristic.VolumeSelector)
            .on('set', async (dir, cb) => {
                const cmd = dir === 0 ? 'volumeUp' : 'volumeDown'
                await TVAccessory.sendCommand(config.token, dev.deviceId, 'statelessAudioVolumeButton', 'push', { buttonName: cmd })
                cb()
            })

        // Mute
        tv.addOptionalCharacteristic(Characteristic.Mute)
        tv.getCharacteristic(Characteristic.Mute)
            .on('set', async (mute, cb) => {
                await TVAccessory.sendCommand(config.token, dev.deviceId, 'statelessAudioMuteButton', 'push', {})
                cb()
            })

        // Channel by Name/Content
        tv.addOptionalCharacteristic(Characteristic.ActiveIdentifier)
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .on('set', async (id, cb) => {
                if (id === 11) {
                    await TVAccessory.sendCommand(config.token, dev.deviceId, 'statelessSetChannelByNameButton', 'push', {})
                } else if (id === 12) {
                    await TVAccessory.sendCommand(config.token, dev.deviceId, 'statelessSetChannelByContentButton', 'push', {})
                }
                cb()
            })

        // InputSource services
        const byName = new Service.InputSource('By Name', uuid + '-11')
        byName.setCharacteristic(Characteristic.Identifier, 11)
            .setCharacteristic(Characteristic.ConfiguredName, 'Channel By Name')
            .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
            .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
        const byContent = new Service.InputSource('By Content', uuid + '-12')
        byContent.setCharacteristic(Characteristic.Identifier, 12)
            .setCharacteristic(Characteristic.ConfiguredName, 'Channel By Content')
            .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
            .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
        tv.addLinkedService(byName)
        tv.addLinkedService(byContent)

        // Custom Button
        const customBtn = accessory.addService(Service.Switch, 'Custom Button')
        customBtn.getCharacteristic(Characteristic.On)
            .on('set', async (on, cb) => {
                if (on) {
                    await TVAccessory.sendCommand(config.token, dev.deviceId, 'statelessCustomButton', 'push', {})
                    customBtn.updateCharacteristic(Characteristic.On, false)
                }
                cb()
            })

        // Multi System Operator
        const multiOp = accessory.addService(Service.Switch, 'Multi System Operator')
        multiOp.getCharacteristic(Characteristic.On)
            .on('set', async (on, cb) => {
                if (on) {
                    await TVAccessory.sendCommand(config.token, dev.deviceId, 'custom.multiSystemOperator', 'push', {})
                    multiOp.updateCharacteristic(Characteristic.On, false)
                }
                cb()
            })

        // HealthCheck -> StatusFault
        tv.addOptionalCharacteristic(Characteristic.StatusFault)
        tv.getCharacteristic(Characteristic.StatusFault)
            .on('get', async (cb) => {
                const health = (await TVAccessory.getStatus(config.token, dev.deviceId)).components.main.healthCheck.value
                cb(null, health === 'normal' ? Characteristic.StatusFault.NO_FAULT : Characteristic.StatusFault.GENERAL_FAULT)
            })

        api.registerPlatformAccessories('homebridge-smartthings-device', 'SmartThingsPlatform', [accessory, byName, byContent, customBtn, multiOp])
    }

    static async getStatus(token, id) {
        return (await axios.get(
            `https://api.smartthings.com/v1/devices/${id}/status`,
            { headers: { Authorization: `Bearer ${token}` } }
        )).data
    }

    static async sendCommand(token, id, capability, command, args) {
        await axios.post(
            `https://api.smartthings.com/v1/devices/${id}/commands`,
            { commands: [{ component: 'main', capability, command, arguments: [args] }] },
            { headers: { Authorization: `Bearer ${token}` } }
        )
    }
}