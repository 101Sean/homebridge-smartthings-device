const axios = require('axios')

module.exports = class SpeakerAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const accessory = new api.platformAccessory(dev.label, uuid)
        accessory.category = Categories.SPEAKER

        // Speaker service for volume and mute
        const speaker = accessory.addService(Service.Speaker, dev.label)

        // Volume
        speaker.getCharacteristic(Characteristic.Volume)
            .on('get', async (cb) => {
                const v = (await SpeakerAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.audioVolume.volume.value
                cb(null, v)
            })
            .on('set', async (value, cb) => {
                await SpeakerAccessory.sendCommand(
                    config.token,
                    dev.deviceId,
                    'audioVolume',
                    'setVolume',
                    { volume: value }
                )
                cb()
            })

        // Mute
        speaker.addOptionalCharacteristic(Characteristic.Mute)
        speaker.getCharacteristic(Characteristic.Mute)
            .on('get', async (cb) => {
                const m = (await SpeakerAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.audioMute.mute.value
                cb(null, m === 'muted')
            })
            .on('set', async (value, cb) => {
                await SpeakerAccessory.sendCommand(
                    config.token,
                    dev.deviceId,
                    'audioMute',
                    'push',
                    { buttonName: value ? 'mute' : 'unmute' }
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
            .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
        speaker.addLinkedService(input)
        input.getCharacteristic(Characteristic.InputSourceType)
            .on('set', async (value, cb) => {
                await SpeakerAccessory.sendCommand(
                    config.token,
                    dev.deviceId,
                    'mediaInputSource',
                    'setInputSource',
                    { source: value }
                )
                cb()
            })

        // Helper for momentary actions
        const makeMomentary = (name, capability, args = {}) => {
            // unique subtype to avoid duplicate UUIDs
            const subtype = name.toLowerCase().replace(/\s+/g, '-')
            const svc = accessory.addService(Service.Switch, name, subtype)
            svc.getCharacteristic(Characteristic.On)
                .on('set', async (on, cb) => {
                    if (on) {
                        await SpeakerAccessory.sendCommand(
                            config.token,
                            dev.deviceId,
                            capability,
                            'push',
                            args
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

        // Notification and TTS
        makeMomentary('Audio Notification', 'audioNotification')
        makeMomentary('TTS', 'speechSynthesis', { text: 'Hello from Homebridge' })

        // Samsung-specific functions
        makeMomentary('Bixby Content', 'samsungim.bixbyContent')
        makeMomentary('Announcement', 'samsungim.announcement')
        makeMomentary('Network Audio Mode', 'samsungim.networkAudioMode')
        makeMomentary('Network Group Info', 'samsungim.networkAudioGroupInfo')
        makeMomentary('Network Track Data', 'samsungim.networkAudioTrackData')

        // Refresh and execute
        makeMomentary('Refresh', 'refresh')
        makeMomentary('Execute', 'execute')

        // HealthCheck as StatusFault
        speaker.addOptionalCharacteristic(Characteristic.StatusFault)
        speaker.getCharacteristic(Characteristic.StatusFault)
            .on('get', async (cb) => {
                const health = (await SpeakerAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.healthCheck.value
                cb(
                    null,
                    health === 'normal'
                        ? Characteristic.StatusFault.NO_FAULT
                        : Characteristic.StatusFault.GENERAL_FAULT
                )
            })

        api.registerPlatformAccessories(
            'homebridge-smartthings-device',
            'SmartThingsPlatform',
            [accessory]
        )
    }

    static async getStatus(token, id) {
        return (
            await axios.get(
                `https://api.smartthings.com/v1/devices/${id}/status`,
                { headers: { Authorization: `Bearer ${token}` } }
            )
        ).data
    }

    static async sendCommand(token, id, capability, command, args) {
        await axios.post(
            `https://api.smartthings.com/v1/devices/${id}/commands`,
            { commands: [{ component: 'main', capability, command, arguments: [args] }] },
            { headers: { Authorization: `Bearer ${token}` } }
        )
    }
}