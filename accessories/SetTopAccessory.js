const axios = require('axios')
const { retry, getStatusCached } = require('../utils')

module.exports = class SetTopAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const accessory = new api.platformAccessory(dev.label, uuid)
        accessory.category = Categories.TV_SET_TOP_BOX

        const tv = accessory.addService(Service.Television, dev.label)

        // 전원
        tv.getCharacteristic(Characteristic.Active)
            .on('set', async (_, cb) => {
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands:[{component:'main',capability:'statelessPowerToggleButton',command:'push',arguments:[]}] },
                        { headers:{Authorization:`Bearer ${config.token}`}}
                    )
                )
                cb()
            })

        // RemoteKey
        tv.getCharacteristic(Characteristic.RemoteKey)
            .on('set', async (key, cb) => {
                const btn = key>=Characteristic.RemoteKey.NUMBER_0 && key<=Characteristic.RemoteKey.NUMBER_9
                    ? (key===Characteristic.RemoteKey.NUMBER_0?0:(key-1)%10+1)
                    : 1
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands:[{component:'main',capability:'statelessSetChannelButton',command:'push',arguments:[{buttonNumber:btn}]}] },
                        { headers:{Authorization:`Bearer ${config.token}`}}
                    )
                )
                cb()
            })

        // 볼륨
        tv.addOptionalCharacteristic(Characteristic.VolumeSelector)
        tv.getCharacteristic(Characteristic.VolumeSelector)
            .on('set', async (dir, cb) => {
                const btn = dir===0?'volumeDown':'volumeUp'
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands:[{component:'main',capability:'statelessAudioVolumeButton',command:'push',arguments:[{buttonName:btn}]}] },
                        { headers:{Authorization:`Bearer ${config.token}`}}
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
                        { commands:[{component:'main',capability:'statelessAudioMuteButton',command:'push',arguments:[]}] },
                        { headers:{Authorization:`Bearer ${config.token}`}}
                    )
                )
                cb()
            })

        // 채널 by 이름/콘텐츠
        tv.addOptionalCharacteristic(Characteristic.ActiveIdentifier)
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .on('set', async (id, cb) => {
                const cap = id===11? 'statelessSetChannelByNameButton':'statelessSetChannelByContentButton'
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands:[{component:'main',capability:cap,command:'push',arguments:[]}] },
                        { headers:{Authorization:`Bearer ${config.token}`}}
                    )
                )
                cb()
            })

        // 입력 소스 링크
        for (const [n,i] of [['Channel By Name',11],['Channel By Content',12]]) {
            const src = new Service.InputSource(n, uuid+'-'+i)
            src.setCharacteristic(Characteristic.Identifier, i)
                .setCharacteristic(Characteristic.ConfiguredName, n)
                .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
                .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN)
            tv.addLinkedService(src)
        }

        // 헬스체크
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
