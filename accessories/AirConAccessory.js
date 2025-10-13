const BaseAccessory = require('./BaseAccessory');

class AirConAccessory extends BaseAccessory {
    constructor(platform, accessory, device) {
        super(platform, accessory, device);

        const { Service, Characteristic } = this.platform.api.hap;

        // SmartThings 모드를 HomeKit 모드로 매핑 (클래스 내부에서 안전하게 정의)
        this.ST_MODE_TO_HK = {
            'cool': Characteristic.TargetHeaterCoolerState.COOL,
            'auto': Characteristic.TargetHeaterCoolerState.AUTO,
            'fanOnly': Characteristic.TargetHeaterCoolerState.FAN_ONLY
        };
        this.HK_MODE_TO_ST = {
            [Characteristic.TargetHeaterCoolerState.COOL]: 'cool',
            [Characteristic.TargetHeaterCoolerState.AUTO]: 'auto',
            [Characteristic.TargetHeaterCoolerState.FAN_ONLY]: 'fanOnly'
        };

        this.acService = this.accessory.getService(Service.HeaterCooler) ||
            this.accessory.addService(Service.HeaterCooler, device.label, 'acService');

        // 초기 상태 설정
        if (!this.currentState.thermostatCoolingSetpoint) { this.currentState.thermostatCoolingSetpoint = { value: 24 }; }
        if (!this.currentState.airConditionerMode) { this.currentState.airConditionerMode = { value: 'cool' }; }
        if (!this.currentState.temperature) { this.currentState.temperature = { value: 25 }; }

        // 1. 전원 On/Off (Characteristic.Active)
        this.acService.getCharacteristic(Characteristic.Active)
            .on('get', (callback) => callback(null, this.currentState.switch.value === 'on' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE))
            .on('set', this.setPowerState.bind(this));

        // 2. 현재 상태 (CurrentHeaterCoolerState) - 냉방만 지원한다고 가정
        this.acService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .on('get', (callback) => {
                const isActive = this.currentState.switch.value === 'on';
                callback(null, isActive ? Characteristic.CurrentHeaterCoolerState.COOLING : Characteristic.CurrentHeaterCoolerState.INACTIVE);
            });

        // 3. 타겟 모드 (TargetHeaterCoolerState)
        this.acService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .setProps({
                validValues: [Characteristic.TargetHeaterCoolerState.COOL, Characteristic.TargetHeaterCoolerState.AUTO, Characteristic.TargetHeaterCoolerState.FAN_ONLY]
            })
            .on('get', (callback) => callback(null, this.ST_MODE_TO_HK[this.currentState.airConditionerMode.value] || Characteristic.TargetHeaterCoolerState.COOL))
            .on('set', async (value, callback) => {
                const stMode = this.HK_MODE_TO_ST[value];
                await this.sendSmartThingsCommand('airConditionerMode', 'setAirConditionerMode', [stMode]);
                this.currentState.airConditionerMode.value = stMode;
                callback(null);
            });

        // 4. 타겟 온도 (Cooling Threshold)
        this.acService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps({ unit: Characteristic.Units.CELSIUS, minValue: 18, maxValue: 30, minStep: 1 })
            .on('get', (callback) => callback(null, this.currentState.thermostatCoolingSetpoint.value))
            .on('set', async (value, callback) => {
                await this.sendSmartThingsCommand('thermostatCoolingSetpoint', 'setCoolingSetpoint', [value]);
                this.currentState.thermostatCoolingSetpoint.value = value;
                callback(null);
            });

        // 5. 현재 온도 (CurrentTemperature)
        this.acService.getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', (callback) => callback(null, this.currentState.temperature.value || 25));
    }

    updateHomeKitCharacteristics() {
        const isActive = this.currentState.switch.value === 'on' ? this.Characteristic.Active.ACTIVE : this.Characteristic.Active.INACTIVE;
        this.acService.updateCharacteristic(this.Characteristic.Active, isActive);

        const targetState = this.ST_MODE_TO_HK[this.currentState.airConditionerMode.value] || this.Characteristic.TargetHeaterCoolerState.COOL;
        this.acService.updateCharacteristic(this.Characteristic.TargetHeaterCoolerState, targetState);

        this.acService.updateCharacteristic(this.Characteristic.CoolingThresholdTemperature, this.currentState.thermostatCoolingSetpoint.value);
        this.acService.updateCharacteristic(this.Characteristic.CurrentTemperature, this.currentState.temperature.value || 25);

        const currentState = isActive ? this.Characteristic.CurrentHeaterCoolerState.COOLING : this.Characteristic.CurrentHeaterCoolerState.INACTIVE;
        this.acService.updateCharacteristic(this.Characteristic.CurrentHeaterCoolerState, currentState);
    }
}

module.exports = AirConAccessory;