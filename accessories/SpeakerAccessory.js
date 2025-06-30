const axios = require('axios')
const { retry } = require('../utils')

module.exports = class SpeakerAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const accessory = new api.platformAccessory(dev.label, uuid)
        accessory.category = Categories.SPEAKER

        const speaker = accessory.addService(Service.Speaker, dev.label)

        speaker.getCharacteristic(Characteristic.Volume)
            .on('get', async cb => {
                const v = (await SpeakerAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.audioVolume.volume.value
                cb(null, v)
            })
            .on('set', async (value, cb) => {
                await SpeakerAccessory.sendCommand(config.token, dev.deviceId,'audioVolume','setVolume',{volume:value})
                cb()
            })

        speaker.addOptionalCharacteristic(Characteristic.Mute)
        speaker.getCharacteristic(Characteristic.Mute)
            .on('get', async cb => {
                const m = (await SpeakerAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.audioMute.mute.value
                cb(null, m==='muted')
            })
            .on('set', async (value, cb) => {
                await SpeakerAccessory.sendCommand(config.token, dev.deviceId,'audioMute','push',{buttonName:value?'mute':'unmute'})
                cb()
            })

        speaker.addOptionalCharacteristic(Characteristic.ActiveIdentifier)
        speaker.addOptionalCharacteristic(Characteristic.ConfiguredName)
        const input=new Service.InputSource('Media Input',uuid+'-20')
        input.setCharacteristic(Characteristic.Identifier,20)
            .setCharacteristic(Characteristic.ConfiguredName,'Media Input')
            .setCharacteristic(Characteristic.InputSourceType,Characteristic.InputSourceType.HDMI)
            .setCharacteristic(Characteristic.IsConfigured,Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.CurrentVisibilityState,Characteristic.CurrentVisibilityState.SHOWN)
        speaker.addLinkedService(input)
        input.getCharacteristic(Characteristic.InputSourceType)
            .on('set',async(value,cb)=>{await SpeakerAccessory.sendCommand(config.token,dev.deviceId,'mediaInputSource','setInputSource',{source:value});cb()})

        const makeMomentary=(name,cap,args={})=>{const subtype=name.toLowerCase().replace(/\s+/g,'-');const svc=accessory.addService(Service.Switch,name,subtype);svc.getCharacteristic(Characteristic.On).on('set',async(on,cb)=>{if(on){await SpeakerAccessory.sendCommand(config.token,dev.deviceId,cap,'push',cap==='speechSynthesis'?{text:'Hello from Homebridge'}:args);svc.updateCharacteristic(Characteristic.On,false);}cb()});return svc}

        makeMomentary('Play/Pause','mediaPlayback')
        makeMomentary('Next Track','mediaTrackControl',{buttonName:'next'})
        makeMomentary('Previous Track','mediaTrackControl',{buttonName:'previous'})
        makeMomentary('Shuffle','mediaPlaybackShuffle')
        makeMomentary('Repeat','mediaPlaybackRepeat')
        makeMomentary('Audio Notification','audioNotification')
        makeMomentary('TTS','speechSynthesis',{text:'Hello from Homebridge'})
        makeMomentary('Bixby Content','samsungim.bixbyContent')
        makeMomentary('Announcement','samsungim.announcement')
        makeMomentary('Network Audio Mode','samsungim.networkAudioMode')
        makeMomentary('Network Group Info','samsungim.networkAudioGroupInfo')
        makeMomentary('Network Track Data','samsungim.networkAudioTrackData')
        makeMomentary('Refresh','refresh')
        makeMomentary('Execute','execute')

        // HealthCheck as StatusFault
        speaker.addOptionalCharacteristic(Characteristic.StatusFault)
        speaker.getCharacteristic(Characteristic.StatusFault)
            .on('get', async (cb) => {
                const data = await SpeakerAccessory.getStatus(config.token, dev.deviceId)
                const health = data.components.main.healthCheck?.value
                cb(
                    null,
                    health === 'normal'
                        ? Characteristic.StatusFault.NO_FAULT
                        : Characteristic.StatusFault.GENERAL_FAULT
                )
            })

        api.registerPlatformAccessories('homebridge-smartthings-device','SmartThingsPlatform',[accessory])
    }

    static async getStatus(token,id){return retry(()=>axios.get(`https://api.smartthings.com/v1/devices/${id}/status`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.data))}
    static async sendCommand(token,id,cap,cmd,args){return retry(()=>axios.post(`https://api.smartthings.com/v1/devices/${id}/commands`,{commands:[{component:'main',capability:cap,command:cmd,arguments:[args]}]},{headers:{Authorization:`Bearer ${token}`}}))}
}