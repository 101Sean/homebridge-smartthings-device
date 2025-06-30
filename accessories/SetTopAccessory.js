const axios = require('axios')
const { retry, getStatusCached } = require('../utils')

module.exports = class SetTopAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const accessory = new api.platformAccessory(dev.label, uuid)
        accessory.category = Categories.TV_SET_TOP_BOX

        const tv = accessory.addService(Service.Television, dev.label)

        // Power toggle
        tv.getCharacteristic(Characteristic.Active)
            .on('set', async (_, cb) => {
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component: 'main', capability: 'statelessPowerToggleButton', command: 'push', arguments: [] }] },
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // RemoteKey (channels)
        tv.getCharacteristic(Characteristic.RemoteKey)
            .on('set', async (key, cb) => {
                const num = (key >= Characteristic.RemoteKey.NUMBER_0 && key <= Characteristic.RemoteKey.NUMBER_9)
                    ? (key === Characteristic.RemoteKey.NUMBER_0 ? 0 : (key - 1) % 10 + 1)
                    : 1
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component: 'main', capability: 'statelessSetChannelButton', command: 'push', arguments: [{ buttonNumber: num }] }] },
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // VolumeSelector
        tv.addOptionalCharacteristic(Characteristic.VolumeSelector)
        tv.getCharacteristic(Characteristic.VolumeSelector)
            .on('set', async (dir, cb) => {
                const buttonName = dir === 0 ? 'volumeDown' : 'volumeUp'
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component: 'main', capability: 'statelessAudioVolumeButton', command: 'push', arguments: [{ buttonName }] }] },
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // Mute
        tv.addOptionalCharacteristic(Characteristic.Mute)
        tv.getCharacteristic(Characteristic.Mute)
            .on('set', async (_, cb) => {
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component: 'main', capability: 'statelessAudioMuteButton', command: 'push', arguments: [] }] },
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // Channel By Name/Content
        tv.addOptionalCharacteristic(Characteristic.ActiveIdentifier)
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .on('set', async (id, cb) => {
                const cap = id === 11
                    ? 'statelessSetChannelByNameButton'
                    : 'statelessSetChannelByContentButton'
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component: 'main', capability: cap, command: 'push', arguments: [] }] },
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // Input Source links
        const linkInput = (name, idx) => {
            const src = new Service.InputSource(name, uuid + '-' + idx)
            src.setCharacteristic(Characteristic.Identifier, idx)
                .setCharacteristic(Characteristic.ConfiguredName, name)
                .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
                .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
            tv.addLinkedService(src)
        }
        linkInput('Channel By Name', 11)
        linkInput('Channel By Content', 12)

        // StatusFault
        tv.addOptionalCharacteristic(Characteristic.StatusFault)
        tv.getCharacteristic(Characteristic.StatusFault)
            .on('get', async cb => {
                const data = await getStatusCached(config.token, dev.deviceId)
                const health = data.components.main.healthCheck?.value || 'normal'
                cb(null, health === 'normal' ? Characteristic.StatusFault.NO_FAULT : Characteristic.StatusFault.GENERAL_FAULT)
            })

        api.registerPlatformAccessories('homebridge-smartthings-device', 'SmartThingsPlatform', [accessory])
    }
}
