const axios = require('axios')
const { retry } = require('../utils')

module.exports = class AirConAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const accessory = new api.platformAccessory(dev.label, uuid)
        accessory.category = Categories.AIR_CONDITIONER

        const hc = accessory.addService(Service.HeaterCooler, dev.label)

        // Active
        hc.getCharacteristic(Characteristic.Active)
            .on('get', async cb => {
                const data = await AirConAccessory.getStatus(config.token, dev.deviceId)
                const onOff = data.components.main.switch.switch.value
                cb(null, onOff==='on'?Characteristic.Active.ACTIVE:Characteristic.Active.INACTIVE)
            })
            .on('set', async (v,cb)=>{
                await AirConAccessory.sendCommand(config.token, dev.deviceId,'switch','push',{})
                cb()
            })

        // Current State
        hc.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .on('get', async cb => {
                const mode = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.airConditionerMode.mode.value
                const m = {off:0,heat:1,cool:2}[mode]
                cb(null, m||0)
            })

        // Target State
        hc.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .on('get', async cb => {
                const mode = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.airConditionerMode.mode.value
                const m = {heat:1,cool:2}[mode]
                cb(null, m||2)
            })
            .on('set', async (v,cb)=>{
                const mode = v===Characteristic.TargetHeaterCoolerState.HEAT?'heat':'cool'
                await AirConAccessory.sendCommand(config.token, dev.deviceId,'airConditionerMode','setAirConditionerMode',{mode})
                cb()
            })

        // Cooling Threshold
        hc.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .on('get', async cb => {
                const t = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.thermostatCoolingSetpoint.coolingSetpoint.value
                cb(null, t)
            })
            .on('set', async (v,cb)=>{
                await AirConAccessory.sendCommand(config.token, dev.deviceId,'thermostatCoolingSetpoint','setCoolingSetpoint',{coolingSetpoint:v})
                cb()
            })

        // Fan Mode
        hc.addOptionalCharacteristic(Characteristic.RotationSpeed)
        hc.getCharacteristic(Characteristic.RotationSpeed)
            .on('get', async cb => {
                const fan = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.airConditionerFanMode.fanMode.value
                const m = {auto:0,low:33,medium:66,high:100}[fan]
                cb(null, m||0)
            })
            .on('set', async (v,cb)=>{
                const arr=['auto','low','medium','high'];
                const mode=arr[Math.floor(v/34)]
                await AirConAccessory.sendCommand(config.token, dev.deviceId,'airConditionerFanMode','setAirConditionerFanMode',{fanMode:mode})
                cb()
            })

        // Quick Temp
        const quick = accessory.addService(Service.Switch,'Quick Temp','quick-temp')
        quick.getCharacteristic(Characteristic.On)
            .on('set', async (on,cb)=>{
                if(on) {
                    await AirConAccessory.sendCommand(config.token, dev.deviceId,'statelessTemperatureButton','push',{})
                    quick.updateCharacteristic(Characteristic.On,false)
                }
                cb()
            })

        // HealthCheck
        hc.addOptionalCharacteristic(Characteristic.StatusFault)
        hc.getCharacteristic(Characteristic.StatusFault)
            .on('get', async cb => {
                const health = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.healthCheck.value
                cb(null, health==='normal'?0:1)
            })

        api.registerPlatformAccessories('homebridge-smartthings-device','SmartThingsPlatform',[accessory])
    }

    static async getStatus(token,id) {
        return retry(()=>axios.get(`https://api.smartthings.com/v1/devices/${id}/status`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.data))
    }
    static async sendCommand(token,id,cap,cmd,args) {
        return retry(()=>axios.post(`https://api.smartthings.com/v1/devices/${id}/commands`,{commands:[{component:'main',capability:cap,command:cmd,arguments:[args]}]},{headers:{Authorization:`Bearer ${token}`}}))
    }
}