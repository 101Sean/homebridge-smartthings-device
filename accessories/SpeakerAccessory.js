const axios = require('axios')
const { retry, getStatusCached } = require('../utils')

module.exports = class SpeakerAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const accessory = new api.platformAccessory(dev.label, uuid)
        accessory.category = Categories.SPEAKER

        const speaker = accessory.addService(Service.Speaker, dev.label)

        // Volume
        speaker.getCharacteristic(Characteristic.Volume)
            .on('get', async cb => {
                const data = await getStatusCached(config.token, dev.deviceId)
                cb(null, data.components.main.audioVolume.volume.value)
            })
            .on('set', async (value, cb) => {
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component: 'main', capability: 'audioVolume', command: 'setVolume', arguments: [{ volume: value }] }] },
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // Mute
        speaker.addOptionalCharacteristic(Characteristic.Mute)
            .on('get', async cb => {
                const data = await getStatusCached(config.token, dev.deviceId)
                cb(null, data.components.main.audioMute.mute.value === 'muted')
            })
            .on('set', async (value, cb) => {
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component: 'main', capability: 'audioMute', command: 'push', arguments: [{ buttonName: value ? 'mute' : 'unmute' }] }] },
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // Media Input Source
        speaker.addOptionalCharacteristic(Characteristic.ActiveIdentifier)
        speaker.addOptionalCharacteristic(Characteristic.ConfiguredName)
        const input = new Service.InputSource('Media Input', uuid + '-20')
        input.setCharacteristic(Characteristic.Identifier, 20)
            .setCharacteristic(Characteristic.ConfiguredName, 'Media Input')
            .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI)
            .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
        speaker.addLinkedService(input)
        input.getCharacteristic(Characteristic.InputSourceType)
            .on('set', async (val, cb) => {
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component: 'main', capability: 'mediaInputSource', command: 'setInputSource', arguments: [{ source: val }] }] },
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // Momentary action helper
        const makeMomentary = (name, cap, args = {}) => {
            const subtype = name.toLowerCase().replace(/\s+/g, '-')
            const svc = accessory.addService(Service.Switch, name, subtype)
            svc.getCharacteristic(Characteristic.On)
                .on('set', async (on, cb) => {
                    if (on) {
                        await retry(() =>
                            axios.post(
                                `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                                { commands: [{ component: 'main', capability: cap, command: 'push', arguments: [args] }] },
                                { headers: { Authorization: `Bearer ${config.token}` } }
                            )
                        )
                        svc.updateCharacteristic(Characteristic.On, false)
                    }
                    cb()
                })
            return svc
        }

        // Playback controls
        makeMomentary('Play/Pause', 'mediaPlayback')
        makeMomentary('Next Track', 'mediaTrackControl', { buttonName: 'next' })
        makeMomentary('Previous Track', 'mediaTrackControl', { buttonName: 'previous' })
        makeMomentary('Shuffle', 'mediaPlaybackShuffle')
        makeMomentary('Repeat', 'mediaPlaybackRepeat')

        // Notifications and Samsung-specific
        makeMomentary('Audio Notification', 'audioNotification')
        makeMomentary('TTS', 'speechSynthesis', { text: 'Hello from Homebridge' })
        makeMomentary('Bixby Content', 'samsungim.bixbyContent')
        makeMomentary('Announcement', 'samsungim.announcement')
        makeMomentary('Network Audio Mode', 'samsungim.networkAudioMode')
        makeMomentary('Network Group Info', 'samsungim.networkAudioGroupInfo')
        makeMomentary('Network Track Data', 'samsungim.networkAudioTrackData')
        makeMomentary('Refresh', 'refresh')
        makeMomentary('Execute', 'execute')

        // StatusFault
        speaker.addOptionalCharacteristic(Characteristic.StatusFault)
        speaker.getCharacteristic(Characteristic.StatusFault)
            .on('get', async cb => {
                const data = await getStatusCached(config.token, dev.deviceId)
                const health = data.components.main.healthCheck?.value || 'normal'
                cb(null, health === 'normal' ? Characteristic.StatusFault.NO_FAULT : Characteristic.StatusFault.GENERAL_FAULT)
            })

        api.registerPlatformAccessories('homebridge-smartthings-device', 'SmartThingsPlatform', [accessory])
    }
}
