const axios = require('axios');

class AirConAccessory {
    constructor(platform, accessory, device) {
        this.platform = platform;
        this.log = platform.log;
        this.accessory = accessory;
        this.device = device;
        this.deviceId = device.deviceId;
        this.name = device.label || 'Air Conditioner';
        this.state = { active: Characteristic.Active.INACTIVE, temp: 24, mode: Characteristic.TargetHeaterCoolerState.COOL };

        const { Service, Characteristic } = this.platform.api.hap;

        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings IR')
            .setCharacteristic(Characteristic.Model, device.presentationId || 'IR AC')
            .setCharacteristic(Characteristic.SerialNumber, this.deviceId);

        // HeaterCooler
        this.service = this.accessory.getService(Service.HeaterCooler) ||
            this.accessory.addService(Service.HeaterCooler, this.name);

        this.service.getCharacteristic(Characteristic.Active)
            .onGet(this.getActive.bind(this))
            .onSet(this.setActive.bind(this));

        this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .onGet(this.getCurrentState.bind(this));

        this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .onGet(this.getTargetState.bind(this))
            .onSet(this.setTargetState.bind(this));

        // 온도 설정 범위 제한
        this.service.getCharacteristic(Characteristic.CurrentTemperature)
            .onGet(this.getCurrentTemperature.bind(this));

        this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps({ minStep: 1, minValue: 18, maxValue: 30 })
            .onGet(this.getCoolingThreshold.bind(this))
            .onSet(this.setCoolingThreshold.bind(this));

        // 팬 속도
        this.service.getCharacteristic(Characteristic.RotationSpeed)
            .setProps({ minStep: 40, minValue: 10, maxValue: 90 }) // 3단계
            .onGet(this.getRotationSpeed.bind(this))
            .onSet(this.setRotationSpeed.bind(this));
    }

    async executeCommand(capability, command, args = []) {
        try {
            await axios.post(`https://api.smartthings.com/v1/devices/${this.deviceId}/commands`, {
                commands: [{ component: 'main', capability: capability, command: command, arguments: args }]
            }, {
                headers: { 'Authorization': `Bearer ${this.platform.accessToken}` }
            });
            this.log.debug(`[AC] 명령 성공: ${command}(${args})`);
        } catch (error) {
            this.log.error(`[AC] 명령 실패: ${error.message}`);
        }
    }

    async getActive() {
        // 실제 상태 조회가 안 될 경우 기본값 반환
        return this.platform.api.hap.Characteristic.Active.ACTIVE;
    }

    async setActive(value) {
        const command = (value === this.platform.api.hap.Characteristic.Active.ACTIVE) ? 'on' : 'off';
        await this.executeCommand('switch', command);
    }

    async getCurrentState() {
        // 현재 냉방 중임을 표시
        return this.platform.api.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
    }

    async getTargetState() {
        return this.platform.api.hap.Characteristic.TargetHeaterCoolerState.COOL;
    }

    async setTargetState(value) {
        const { TargetHeaterCoolerState } = this.platform.api.hap.Characteristic;

        this.state.mode = value;
        let mode = (value === TargetHeaterCoolerState.HEAT) ? 'dry' : (value === TargetHeaterCoolerState.AUTO ? 'auto' : 'cool');
        await this.executeCommand('airConditionerMode', 'setAirConditionerMode', [mode]);
    }

    async getCurrentTemperature() {
        return 24;
    }

    async getCoolingThreshold() {
        return 24;
    }

    async setCoolingThreshold(value) {
        await this.executeCommand('thermostatCoolingSetpoint', 'setCoolingSetpoint', [value]);
    }

    async getRotationSpeed() {
        return 10; // low: 10, medium: 50, high: 90
    }

    async setRotationSpeed(value) {
        let fanMode = 'low';
        if (value > 80) fanMode = 'high';
        else if (value > 40) fanMode = 'medium';

        await this.executeCommand('airConditionerFanMode', 'setFanMode', [fanMode]);
    }
}

module.exports = AirConAccessory;