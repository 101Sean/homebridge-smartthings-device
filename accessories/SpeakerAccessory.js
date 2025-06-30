const axios = require('axios')

module.exports = class SpeakerAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const acc  = new api.platformAccessory(dev.label, uuid)
        acc.category = Categories.SPEAKER

        const spk = acc.addService(Service.Speaker, dev.label)

        // Volume
        spk.getCharacteristic(Characteristic.Volume)
            .on('get', async cb => {
                const v = (await SpeakerAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.audioVolume.volume.value
                cb(null, v)
            })
            .on('set', async (v, cb) => {
                await SpeakerAccessory.sendCommand(config.token, dev.deviceId, 'audioVolume', 'setVolume', { volume: v })
                cb()
            })

        // Mute
        spk.addOptionalCharacteristic(Characteristic.Mute)
        spk.getCharacteristic(Characteristic.Mute)
            .on('set', async (m, cb) => {
                await SpeakerAccessory.sendCommand(config.token, dev.deviceId, 'audioMute', 'push', { buttonName: m ? 'mute' : 'unmute' })
                cb()
            })

        // Input Source
        const input = new Service.InputSource('Media Input', uuid + '-20')
        input.setCharacteristic(Characteristic.Identifier, 20)
            .setCharacteristic(Characteristic.ConfiguredName, 'Media Input')
            .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI)
            .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
        spk.addLinkedService(input)

        // Momentary buttons
        const makeMomentary = (name, cap, args) => {
            const subtype = name.toLowerCase().replace(/\s+/g, '-')
            const svc = acc.addService(Service.Switch, name, subtype)
            svc.getCharacteristic(Characteristic.On)
                .on('set', async (on, cb) => {
                    if (on) {
                        await SpeakerAccessory.sendCommand(config.token, dev.deviceId, cap, 'push', args || {})
                        btn.updateCharacteristic(Characteristic.On, false)
                    }
                    cb()
                })
            return svc
        }

        makeMomentary('Play/Pause', 'mediaPlayback', {})
        makeMomentary('Next Track', 'mediaTrackControl', { buttonName: 'next' })
        makeMomentary('Previous Track', 'mediaTrackControl', { buttonName: 'previous' })
        makeMomentary('Shuffle', 'mediaPlaybackShuffle', {})
        makeMomentary('Repeat', 'mediaPlaybackRepeat', {})
        makeMomentary('Refresh', 'refresh', {})
        makeMomentary('Execute', 'execute', {})
        makeMomentary('TTS', 'speechSynthesis', { text: 'Hello from Homebridge' })

        api.registerPlatformAccessories('homebridge-smartthings-deivce', 'SmartThingsPlatform', [acc, input])
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