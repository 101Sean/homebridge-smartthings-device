const { Service, Characteristic, PlatformAccessory } = require('hap-nodejs');

class AirConAccessory {
    constructor(platform, device) {
        this.platform = platform;
        this.log = platform.log;
        this.device = device;
        this.deviceId = device.deviceId;
        this.name = device.label || 'Air Conditioner';

        const uuid = platform.api.hap.uuid.generate(this.deviceId);
        this.accessory = new PlatformAccessory(this.name, uuid);

        // Accessory Information
        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings IR')
            .setCharacteristic(Characteristic.Model, device.presentationId || 'IR AC')
            .setCharacteristic(Characteristic.SerialNumber, this.deviceId);

        // HeaterCooler Service
        this.service = new Service.HeaterCooler(this.name);
        this.service.getCharacteristic(Characteristic.Active)
            .onGet(this.getActive.bind(this))
            .onSet(this.setActive.bind(this));

        this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .onGet(this.getCurrentState.bind(this));

        this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .onGet(this.getTargetState.bind(this))
            .onSet(this.setTargetState.bind(this));

        this.service.getCharacteristic(Characteristic.CurrentTemperature)
            .onGet(this.getCurrentTemperature.bind(this));

        this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .onGet(this.getCoolingThreshold.bind(this))
            .onSet(this.setCoolingThreshold.bind(this));

        this.service.getCharacteristic(Characteristic.RotationSpeed)
            .onGet(this.getRotationSpeed.bind(this))
            .onSet(this.setRotationSpeed.bind(this));

        this.accessory.addService(this.service);

        // Bridged 등록
        this.platform.api.registerPlatformAccessories('homebridge-smartthings-device', 'SmartThingsDevice', [this.accessory]);

        this.log.info(`[AC] "${this.name}" registered as bridged accessory`);
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

    // Active (전원)
    async getActive() {
        // stateless라 상태 없음 → switch capability로 조회 필요하면 polling
        return Characteristic.Active.ACTIVE; // 기본 ON
    }

    async setActive(value) {
        if (value === Characteristic.Active.ACTIVE) {
            await this.executeCommand('switch', 'on');
        } else {
            await this.executeCommand('switch', 'off');
        }
    }

    // CurrentHeaterCoolerState (현재 상태)
    async getCurrentState() {
        // airConditionerMode로 매핑 (실제 상태 조회 API 필요)
        return Characteristic.CurrentHeaterCoolerState.COOLING;
    }

    // TargetHeaterCoolerState (모드)
    async getTargetState() {
        return Characteristic.TargetHeaterCoolerState.COOL; // 기본 냉방
    }

    async setTargetState(value) {
        let mode = 'cool';
        if (value === Characteristic.TargetHeaterCoolerState.HEAT) mode = 'heat';
        else if (value === Characteristic.TargetHeaterCoolerState.AUTO) mode = 'auto';
        else if (value === Characteristic.TargetHeaterCoolerState.OFF) mode = 'off';
        await this.executeCommand('airConditionerMode', 'setAirConditionerMode', [mode]);
    }

    // CurrentTemperature
    async getCurrentTemperature() {
        // thermostatCoolingSetpoint으로 조회 (실제 getStatus 필요)
        return 25; // placeholder
    }

    // CoolingThresholdTemperature (설정 온도)
    async getCoolingThreshold() {
        return 24; // placeholder
    }

    async setCoolingThreshold(value) {
        await this.executeCommand('thermostatCoolingSetpoint', 'setCoolingSetpoint', [value]);
    }

    // RotationSpeed (팬 속도 0-100%)
    async getRotationSpeed() {
        return 50; // placeholder
    }

    async setRotationSpeed(value) {
        let fanMode = 'medium';
        if (value > 66) fanMode = 'high';
        else if (value < 33) fanMode = 'low';
        await this.executeCommand('airConditionerFanMode', 'setFanMode', [fanMode]);
    }
}

module.exports = AirConAccessory;