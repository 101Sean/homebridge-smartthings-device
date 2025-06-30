const { retry, getStatusCached } = require('../utils')
const axios = require('axios')

module.exports = class AirConAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const accessory = new api.platformAccessory(dev.label, uuid)
        accessory.category = Categories.AIR_CONDITIONER

        const hc = accessory.addService(Service.HeaterCooler, dev.label)

        // Active (On/Off)
        hc.getCharacteristic(Characteristic.Active)
            .on('get', async cb => {
                const data = await getStatusCached(config.token, dev.deviceId)
                const onOff = data.components.main.switch?.switch?.value || 'off'
                cb(null, onOff === 'on' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)
            })
            .on('set', async (value, cb) => {
                const cmd = value === Characteristic.Active.ACTIVE ? 'on' : 'off'
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component: 'main', capability: 'switch', command: cmd, arguments: [] }] },
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // Current State
        hc.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .on('get', async cb => {
                const data = await getStatusCached(config.token, dev.deviceId)
                const mode = data.components.main.airConditionerMode?.mode?.value || 'off'
                const map = { off:0, heat:1, cool:2 }
                cb(null, map[mode])
            })

        // Target State
        hc.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .on('get', async cb => {
                const data = await getStatusCached(config.token, dev.deviceId)
                const mode = data.components.main.airConditionerMode?.mode?.value || 'cool'
                const map = { heat:1, cool:2 }
                cb(null, map[mode])
            })
            .on('set', async (value, cb) => {
                const mode = value === Characteristic.TargetHeaterCoolerState.HEAT ? 'heat' : 'cool'
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component:'main', capability:'airConditionerMode', command:'setAirConditionerMode', arguments:[{mode}] }] },
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // Cooling Threshold
        hc.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .on('get', async cb => {
                const data = await getStatusCached(config.token, dev.deviceId)
                const t = data.components.main.thermostatCoolingSetpoint?.coolingSetpoint?.value
                cb(null, t)
            })
            .on('set', async (value, cb) => {
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component:'main', capability:'thermostatCoolingSetpoint', command:'setCoolingSetpoint', arguments:[{coolingSetpoint:value}] }] },
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // Fan Mode
        hc.addOptionalCharacteristic(Characteristic.RotationSpeed)
        hc.getCharacteristic(Characteristic.RotationSpeed)
            .on('get', async cb => {
                const data = await getStatusCached(config.token, dev.deviceId)
                const fan = data.components.main.airConditionerFanMode?.fanMode?.value || 'auto'
                const map = { auto:0, low:33, medium:66, high:100 }
                cb(null, map[fan])
            })
            .on('set', async (value, cb) => {
                const levels = ['auto','low','medium','high']
                const mode = levels[Math.floor(value/34)]
                await retry(() =>
                    axios.post(
                        `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                        { commands: [{ component:'main', capability:'airConditionerFanMode', command:'setAirConditionerFanMode', arguments:[{fanMode:mode}] }] },
                        { headers: { Authorization: `Bearer ${config.token}` } }
                    )
                )
                cb()
            })

        // Quick Temp
        const quick = accessory.addService(Service.Switch,'Quick Temp','quick-temp')
        quick.getCharacteristic(Characteristic.On)
            .on('set', async (on, cb) => {
                if(on) {
                    await retry(() =>
                        axios.post(
                            `https://api.smartthings.com/v1/devices/${dev.deviceId}/commands`,
                            { commands:[{component:'main',capability:'statelessTemperatureButton',command:'push',arguments:[]}]} ,
                            { headers:{Authorization:`Bearer ${config.token}`}})
                    )
                    quick.updateCharacteristic(Characteristic.On,false)
                }
                cb()
            })

        // StatusFault
        hc.addOptionalCharacteristic(Characteristic.StatusFault)
        hc.getCharacteristic(Characteristic.StatusFault)
            .on('get', async cb => {
                const data = await getStatusCached(config.token, dev.deviceId)
                const health = data.components.main.healthCheck?.value || 'normal'
                cb(null, health==='normal'?Characteristic.StatusFault.NO_FAULT:Characteristic.StatusFault.GENERAL_FAULT)
            })

        api.registerPlatformAccessories('homebridge-smartthings-device','SmartThingsPlatform',[accessory])
    }
}