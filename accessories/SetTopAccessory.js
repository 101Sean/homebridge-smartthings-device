const axios = require('axios')
const { retry } = require('../utils')

module.exports = class SetTopAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const acc  = new api.platformAccessory(dev.label, uuid)
        acc.category = Categories.TV_SET_TOP_BOX

        const tv = acc.addService(Service.Television, dev.label)

        // Power
        tv.getCharacteristic(Characteristic.Active)
            .on('set', async(_,cb)=>{await SetTopAccessory.sendCommand(config.token,dev.deviceId,'statelessPowerToggleButton','push',{});cb()})

        // RemoteKey
        tv.getCharacteristic(Characteristic.RemoteKey)
            .on('set',async(key,cb)=>{const num=key>=Characteristic.RemoteKey.NUMBER_0&&key<=Characteristic.RemoteKey.NUMBER_9?(key===Characteristic.RemoteKey.NUMBER_0?0:(key-1)%10+1):1;await SetTopAccessory.sendCommand(config.token,dev.deviceId,'statelessSetChannelButton','push',{buttonNumber:num});cb()})

        // Volume
        tv.addOptionalCharacteristic(Characteristic.VolumeSelector)
        tv.getCharacteristic(Characteristic.VolumeSelector)
            .on('set',async(dir,cb)=>{const c=dir===0?'volumeUp':'volumeDown';await SetTopAccessory.sendCommand(config.token,dev.deviceId,'statelessAudioVolumeButton','push',{buttonName:c});cb()})

        // Mute
        tv.addOptionalCharacteristic(Characteristic.Mute)
        tv.getCharacteristic(Characteristic.Mute)
            .on('set',async(m,cb)=>{await SetTopAccessory.sendCommand(config.token,dev.deviceId,'statelessAudioMuteButton','push',{});cb()})

        // ActiveIdentifier
        tv.addOptionalCharacteristic(Characteristic.ActiveIdentifier)
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
            .on('set',async(id,cb)=>{if(id===11)await SetTopAccessory.sendCommand(config.token,dev.deviceId,'statelessSetChannelByNameButton','push',{});else if(id===12)await SetTopAccessory.sendCommand(config.token,dev.deviceId,'statelessSetChannelByContentButton','push',{});cb()})

        // InputSource
        const srcName=new Service.InputSource('By Name',uuid+'-11')
        srcName.setCharacteristic(Characteristic.Identifier,11)
            .setCharacteristic(Characteristic.ConfiguredName,'Channel By Name')
            .setCharacteristic(Characteristic.InputSourceType,Characteristic.InputSourceType.APPLICATION)
            .setCharacteristic(Characteristic.IsConfigured,Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.CurrentVisibilityState,Characteristic.CurrentVisibilityState.SHOWN)
        const srcContent=new Service.InputSource('By Content',uuid+'-12')
        srcContent.setCharacteristic(Characteristic.Identifier,12)
            .setCharacteristic(Characteristic.ConfiguredName,'Channel By Content')
            .setCharacteristic(Characteristic.InputSourceType,Characteristic.InputSourceType.APPLICATION)
            .setCharacteristic(Characteristic.IsConfigured,Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.CurrentVisibilityState,Characteristic.CurrentVisibilityState.SHOWN)
        tv.addLinkedService(srcName)
        tv.addLinkedService(srcContent)

        // HealthCheck
        tv.addOptionalCharacteristic(Characteristic.StatusFault)
        tv.getCharacteristic(Characteristic.StatusFault)
            .on('get',async(cb)=>{const h=(await SetTopAccessory.getStatus(config.token,dev.deviceId)).components.main.healthCheck.value;cb(null,h==='normal'?0:1)})

        api.registerPlatformAccessories('homebridge-smartthings-device','SmartThingsPlatform',[acc])
    }

    static async getStatus(token,id){return retry(()=>axios.get(`https://api.smartthings.com/v1/devices/${id}/status`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.data))}
    static async sendCommand(token,id,cap,cmd,args){return retry(()=>axios.post(`https://api.smartthings.com/v1/devices/${id}/commands`,{commands:[{component:'main',capability:cap,command:cmd,arguments:[args]}]},{headers:{Authorization:`Bearer ${token}`}}))}
}