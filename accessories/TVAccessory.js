const axios = require('axios')
const { retry, getStatusCached } = require('../utils')

module.exports = class TVAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const accessory = new api.platformAccessory(dev.label, uuid)
        accessory.category = Categories.TELEVISION

        const tv = accessory.addService(Service.Television, dev.label)

        // Power
        tv.getCharacteristic(Characteristic.Active)
            .on('get', async cb => {
                const data = await getStatusCached(config.token, dev.deviceId)
                const on = data.components.main.statelessPowerToggleButton?.value === 'on'
                cb(null, on ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)
            })
            .on('set', async (_, cb) => {
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component:'main', capability:'statelessPowerToggleButton', command:'push', arguments:[] }] },
                        { headers:{ Authorization:`Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // RemoteKey (숫자, 채널 업/다운)
        tv.getCharacteristic(Characteristic.RemoteKey)
            .on('set', async (key, cb) => {
                let args
                if(key >= Characteristic.RemoteKey.NUMBER_0 && key <= Characteristic.RemoteKey.NUMBER_9) {
                    args = { buttonNumber: key===Characteristic.RemoteKey.NUMBER_0?0:(key-1)%10+1 }
                } else if(key===Characteristic.RemoteKey.CHANNEL_UP) {
                    args = { buttonNumber:100 }
                } else if(key===Characteristic.RemoteKey.CHANNEL_DOWN) {
                    args = { buttonNumber:101 }
                } else {
                    return cb()
                }
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands:[{ component:'main', capability:'statelessChannelButton', command:'push', arguments:[args] }] },
                        { headers:{ Authorization:`Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // 볼륨
        tv.addOptionalCharacteristic(Characteristic.VolumeSelector)
        tv.getCharacteristic(Characteristic.VolumeSelector)
            .on('set', async (dir, cb) => {
                const buttonName = dir===0?'volumeDown':'volumeUp'
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands:[{ component:'main', capability:'statelessAudioVolumeButton', command:'push', arguments:[{buttonName}] }] },
                        { headers:{ Authorization:`Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // 음소거
        tv.addOptionalCharacteristic(Characteristic.Mute)
        tv.getCharacteristic(Characteristic.Mute)
            .on('set', async (_, cb) => {
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands:[{ component:'main', capability:'statelessAudioMuteButton', command:'push', arguments:[] }] },
                        { headers:{ Authorization:`Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // 채널 이름/콘텐츠 전환
        tv.addOptionalCharacteristic(Characteristic.ActiveIdentifier)
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .on('set', async (id, cb) => {
                const cap = id===11
                    ? 'statelessSetChannelByNameButton'
                    : 'statelessSetChannelByContentButton'
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands:[{ component:'main', capability:cap, command:'push', arguments:[] }] },
                        { headers:{ Authorization:`Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // InputSource 링크
        for (const [name, idx] of [['Channel By Name',11],['Channel By Content',12]]) {
            const src = new Service.InputSource(name, uuid+'-'+idx)
            src.setCharacteristic(Characteristic.Identifier, idx)
                .setCharacteristic(Characteristic.ConfiguredName, name)
                .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
                .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
            tv.addLinkedService(src)
        }

        // 커스텀 버튼
        const makeButton = (label, capability) => {
            const subtype = label.toLowerCase().replace(/\s+/g,'-')
            const svc = accessory.addService(Service.Switch, label, subtype)
            svc.getCharacteristic(Characteristic.On)
                .on('set', async (on, cb) => {
                    if(on) {
                        await retry(() =>
                            axios.post(
                                `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                                { commands:[{ component:'main', capability, command:'push', arguments:[] }] },
                                { headers:{ Authorization:`Bearer ${config.token}` } }
                            )
                        )
                        svc.updateCharacteristic(Characteristic.On,false)
                    }
                    cb()
                })
        }
        makeButton('Custom Button','statelessCustomButton')
        makeButton('Multi System Operator','custom.multiSystemOperator')

        // HealthCheck
        tv.addOptionalCharacteristic(Characteristic.StatusFault)
        tv.getCharacteristic(Characteristic.StatusFault)
            .on('get', async cb => {
                const data = await getStatusCached(config.token, dev.deviceId)
                const health = data.components.main.healthCheck?.value || 'normal'
                cb(null, health==='normal'?Characteristic.StatusFault.NO_FAULT:Characteristic.StatusFault.GENERAL_FAULT)
            })

        api.registerPlatformAccessories('homebridge-smartthings-device','SmartThingsPlatform',[accessory])
    }
}
