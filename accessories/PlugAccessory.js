const { Service, Characteristic, PlatformAccessory } = require('hap-nodejs');

class PlugAccessory {
    constructor(platform, device) {
        this.platform = platform;
        this.log = platform.log;
        this.device = device;
        this.deviceId = device.deviceId;
        this.name = device.label || 'Plug Mini';

        const uuid = platform.api.hap.uuid.generate(this.deviceId);
        this.accessory = new PlatformAccessory(this.name, uuid);

        // Accessory Information
        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'GOQUAL')
            .setCharacteristic(Characteristic.Model, device.viper.modelName || 'EP2-H')
            .setCharacteristic(Characteristic.SerialNumber, this.deviceId);

        // Outlet Service
        this.service = new Service.Outlet(this.name);
        this.service.getCharacteristic(Characteristic.On)
            .onGet(this.getOn.bind(this))
            .onSet(this.setOn.bind(this));

        this.service.getCharacteristic(Characteristic.OutletInUse)
            .onGet(this.getInUse.bind(this));

        this.accessory.addService(this.service);

        // Bridged 등록
        this.platform.api.registerPlatformAccessories('homebridge-smartthings-device', 'SmartThingsDevice', [this.accessory]);

        this.log.info(`[Plug] "${this.name}" registered as bridged accessory`);
    }

    async executeCommand(capability, command, args = []) {
        const payload = {
            commands: [{
                component: 'main',
                capability: capability,
                command: command,
                arguments: args
            }]
        };
        await this.platform.client.devices.executeCommand(this.deviceId, payload);
    }

    async getOn() {
        // switch 상태 조회 (실제 getStatus 필요)
        return true; // placeholder
    }

    async setOn(value) {
        await this.executeCommand('switch', value ? 'on' : 'off');
    }

    async getInUse() {
        // powerMeter.power > 0 일 때 true (실제 getStatus 필요)
        return true; // placeholder
    }
}

module.exports = PlugAccessory;