const axios = require('axios')
const { retry } = require('../utils')

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
                const data = await AirConAccessory.getStatus(config.token, dev.deviceId)
                const onOff = data.components.main.switch?.switch?.value || 'off'
                cb(null, onOff === 'on' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)
            })
            .on('set', async (value, cb) => {
                const cmd = value === Characteristic.Active.ACTIVE ? 'on' : 'off'
                await AirConAccessory.sendCommand(config.token, dev.deviceId, 'switch', cmd, {})
                cb()
            })

        // Current Heater/Cooler State
        hc.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .on('get', async cb => {
                const data = await AirConAccessory.getStatus(config.token, dev.deviceId)
                const mode = data.components.main.airConditionerMode?.mode?.value || 'off'
                const map = {
                    off: Characteristic.CurrentHeaterCoolerState.INACTIVE,
                    heat: Characteristic.CurrentHeaterCoolerState.HEATING,
                    cool: Characteristic.CurrentHeaterCoolerState.COOLING
                }
                cb(null, map[mode])
            })

        // Target Heater/Cooler State
        hc.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .on('get', async cb => {
                const data = await AirConAccessory.getStatus(config.token, dev.deviceId)
                const mode = data.components.main.airConditionerMode?.mode?.value || 'cool'
                const map = {
                    heat: Characteristic.TargetHeaterCoolerState.HEAT,
                    cool: Characteristic.TargetHeaterCoolerState.COOL
                }
                cb(null, map[mode])
            })
            .on('set', async (value, cb) => {
                const mode = value === Characteristic.TargetHeaterCoolerState.HEAT ? 'heat' : 'cool'
                await AirConAccessory.sendCommand(
                    config.token,
                    dev.deviceId,
                    'airConditionerMode',
                    'setAirConditionerMode',
                    { mode }
                )
                cb()
            })

        // Cooling Threshold
        hc.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .on('get', async cb => {
                const data = await AirConAccessory.getStatus(config.token, dev.deviceId)
                const t = data.components.main.thermostatCoolingSetpoint?.coolingSetpoint?.value
                cb(null, t)
            })
            .on('set', async (value, cb) => {
                await AirConAccessory.sendCommand(
                    config.token,
                    dev.deviceId,
                    'thermostatCoolingSetpoint',
                    'setCoolingSetpoint',
                    { coolingSetpoint: value }
                )
                cb()
            })

        // Fan Mode as RotationSpeed
        hc.addOptionalCharacteristic(Characteristic.RotationSpeed)
        hc.getCharacteristic(Characteristic.RotationSpeed)
            .on('get', async cb => {
                const data = await AirConAccessory.getStatus(config.token, dev.deviceId)
                const fan = data.components.main.airConditionerFanMode?.fanMode?.value || 'auto'
                const map = { auto: 0, low: 33, medium: 66, high: 100 }
                cb(null, map[fan])
            })
            .on('set', async (value, cb) => {
                const levels = ['auto', 'low', 'medium', 'high']
                const mode = levels[Math.floor(value / 34)]
                await AirConAccessory.sendCommand(
                    config.token,
                    dev.deviceId,
                    'airConditionerFanMode',
                    'setAirConditionerFanMode',
                    { fanMode: mode }
                )
                cb()
            })

        // Quick Temperature Button
        const quick = accessory.addService(Service.Switch, 'Quick Temp', 'quick-temp')
        quick.getCharacteristic(Characteristic.On)
            .on('set', async (on, cb) => {
                if (on) {
                    await AirConAccessory.sendCommand(
                        config.token,
                        dev.deviceId,
                        'statelessTemperatureButton',
                        'push',
                        {}
                    )
                    quick.updateCharacteristic(Characteristic.On, false)
                }
                cb()
            })

        // Health Check as StatusFault
        hc.addOptionalCharacteristic(Characteristic.StatusFault)
        hc.getCharacteristic(Characteristic.StatusFault)
            .on('get', async cb => {
                const data = await AirConAccessory.getStatus(config.token, dev.deviceId)
                const health = data.components.main.healthCheck?.value || 'normal'
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
        return retry(() =>
            axios
                .get(
                    `https://api.smartthings.com/v1/devices/${id}/status`,
                    { headers: { Authorization: `Bearer ${token}` } }
                )
                .then(r => r.data)
        )
    }

    static async sendCommand(token, id, capability, command, args) {
        return retry(() =>
            axios.post(
                `https://api.smartthings.com/v1/devices/${id}/commands`,
                { commands: [{ component: 'main', capability, command, arguments: [args] }] },
                { headers: { Authorization: `Bearer ${token}` } }
            )
        )
    }
}