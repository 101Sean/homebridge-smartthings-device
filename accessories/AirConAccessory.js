const axios = require('axios')

module.exports = class AirConAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const accessory = new api.platformAccessory(dev.label, uuid)
        accessory.category = Categories.AIR_CONDITIONER

        // HeaterCooler Service for heating and cooling control
        const hc = accessory.addService(Service.HeaterCooler, dev.label)

        // Active (On/Off)
        hc.getCharacteristic(Characteristic.Active)
            .on('get', async (cb) => {
                const status = await AirConAccessory.getStatus(config.token, dev.deviceId)
                const onOff = status.components.main.switch.switch.value
                cb(null, onOff === 'on' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)
            })
            .on('set', async (value, cb) => {
                const on = value === Characteristic.Active.ACTIVE
                await AirConAccessory.sendCommand(config.token, dev.deviceId, 'switch', 'push', {})
                cb()
            })

        // Current State (Heating/Cooling)
        hc.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .on('get', async (cb) => {
                const mode = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.airConditionerMode.mode.value
                const map = {
                    off: Characteristic.CurrentHeaterCoolerState.INACTIVE,
                    heat: Characteristic.CurrentHeaterCoolerState.HEATING,
                    cool: Characteristic.CurrentHeaterCoolerState.COOLING
                }
                cb(null, map[mode] || Characteristic.CurrentHeaterCoolerState.INACTIVE)
            })

        // Target State (Heat/Cool)
        hc.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .on('get', async (cb) => {
                const mode = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.airConditionerMode.mode.value
                const map = {
                    heat: Characteristic.TargetHeaterCoolerState.HEAT,
                    cool: Characteristic.TargetHeaterCoolerState.COOL
                }
                cb(null, map[mode] || Characteristic.TargetHeaterCoolerState.COOL)
            })
            .on('set', async (value, cb) => {
                const mode = value === Characteristic.TargetHeaterCoolerState.HEAT ? 'heat' : 'cool'
                await AirConAccessory.sendCommand(config.token, dev.deviceId, 'airConditionerMode', 'setAirConditionerMode', { mode })
                cb()
            })

        // Cooling Threshold Temperature
        hc.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .on('get', async (cb) => {
                const t = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.thermostatCoolingSetpoint.coolingSetpoint.value
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

        // Heating Threshold Temperature (optional)
        hc.getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .on('get', async (cb) => {
                // ~~
                cb(null, 20)
            })
            .on('set', async (value, cb) => {
                // ~~~
                cb()
            })

        // Fan Mode as RotationSpeed
        hc.addOptionalCharacteristic(Characteristic.RotationSpeed)
        hc.getCharacteristic(Characteristic.RotationSpeed)
            .on('get', async (cb) => {
                const fan = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.airConditionerFanMode.fanMode.value
                const map = { auto: 0, low: 33, medium: 66, high: 100 }
                cb(null, map[fan] || 0)
            })
            .on('set', async (value, cb) => {
                const arr = ['auto', 'low', 'medium', 'high']
                const mode = arr[Math.floor(value / 34)]
                await AirConAccessory.sendCommand(
                    config.token,
                    dev.deviceId,
                    'airConditionerFanMode',
                    'setAirConditionerFanMode',
                    { fanMode: mode }
                )
                cb()
            })

        // Quick Temp Button
        const quick = accessory.addService(Service.Switch, 'Quick Temp')
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

        // HealthCheck as StatusFault
        hc.addOptionalCharacteristic(Characteristic.StatusFault)
        hc.getCharacteristic(Characteristic.StatusFault)
            .on('get', async (cb) => {
                const health = (await AirConAccessory.getStatus(config.token, dev.deviceId))
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