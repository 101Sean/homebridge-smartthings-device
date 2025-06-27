const axios = require('axios')

module.exports = class AirConAccessory {
    static register(api, dev, config) {
        const { Service, Characteristic, Categories } = api.hap
        const uuid = api.hap.uuid.generate(dev.deviceId)
        const acc  = new api.platformAccessory(dev.label, uuid)
        acc.category = Categories.AIR_CONDITIONER

        // Thermostat
        const thermo = acc.addService(Service.Thermostat, dev.label)
        thermo.getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('get', async cb => {
                const m = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.airConditionerMode.mode.value
                cb(null, {off:0,heat:1,cool:2}[m]||0)
            })
            .on('set', async (v,cb) => {
                const mode = ['off','heat','cool'][v]
                await AirConAccessory.sendCommand(config.token, dev.deviceId, 'airConditionerMode', 'setAirConditionerMode', {mode})
                cb()
            })
        thermo.getCharacteristic(Characteristic.TargetTemperature)
            .on('get', async cb => {
                const t = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.thermostatCoolingSetpoint.coolingSetpoint.value
                cb(null, t)
            })
            .on('set', async (t,cb) => {
                await AirConAccessory.sendCommand(config.token, dev.deviceId, 'thermostatCoolingSetpoint', 'setCoolingSetpoint', {coolingSetpoint: t})
                cb()
            })

        // Fanv2
        const fan = acc.addService(Service.Fanv2, dev.label+' Fan')
        fan.getCharacteristic(Characteristic.RotationSpeed)
            .on('get', async cb => {
                const v = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.airConditionerFanMode.fanMode.value
                cb(null, {auto:0,low:33,medium:66,high:100}[v]||0)
            })
            .on('set', async (v,cb) => {
                const arr=['auto','low','medium','high'];
                const mode=arr[Math.floor(v/34)];
                await AirConAccessory.sendCommand(config.token, dev.deviceId, 'airConditionerFanMode', 'setAirConditionerFanMode', {fanMode:mode})
                cb()
            })

        // Quick Temp
        const quick = acc.addService(Service.Switch, 'Quick Temp')
        quick.getCharacteristic(Characteristic.On)
            .on('set', async (on,cb) => {
                if (on) {
                    await AirConAccessory.sendCommand(config.token, dev.deviceId, 'statelessTemperatureButton', 'push', {})
                    quick.updateCharacteristic(Characteristic.On, false)
                }
                cb()
            })

        // Power Switch
        const power = acc.addService(Service.Switch, 'Power')
        power.getCharacteristic(Characteristic.On)
            .on('get', async cb => {
                const s = (await AirConAccessory.getStatus(config.token, dev.deviceId))
                    .components.main.switch.switch.value
                cb(null, s === 'on')
            })
            .on('set', async (on,cb) => {
                await AirConAccessory.sendCommand(config.token, dev.deviceId, 'switch', on ? 'on' : 'off', {})
                cb()
            })

        api.registerPlatformAccessories(
            'homebridge-smartthings-custom', 'SmartThingsPlatform', [acc, fan, quick, power]
        )
    }

    static async getStatus(token, id) {
        return (await axios.get(
            `https://api.smartthings.com/v1/devices/${id}/status`,
            { headers: { Authorization: `Bearer ${token}` } }
        )).data
    }

    static async sendCommand(token, id, capability, command, args) {
        await axios.post(
            `https://api.smartthings.com/v1/devices/${id}/commands`,
            { commands: [{ component: 'main', capability, command, arguments: [args] }] },
            { headers: { Authorization: `Bearer ${token}` } }
        )
    }
}