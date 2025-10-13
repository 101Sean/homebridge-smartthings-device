const BaseAccessory = require('./BaseAccessory');
const { Service, Characteristic } = require('homebridge');

// SmartThings 모드를 HomeKit 모드로 매핑
const ST_MODE_TO_HK = {
    'cool': Characteristic.TargetHeaterCoolerState.COOL,
    'auto': Characteristic.TargetHeaterCoolerState.AUTO,
    'fanOnly': Characteristic.TargetHeaterCoolerState.FAN_ONLY
    // 'heat' 모드는 HeaterCooler 서비스에 필요하지만 SmartThings 에어컨 Capability에 없으므로 생략
};
const HK_MODE_TO_ST = {
    [Characteristic.TargetHeaterCoolerState.COOL]: 'cool',
    [Characteristic.TargetHeaterCoolerState.AUTO]: 'auto',
    [Characteristic.TargetHeaterCoolerState.FAN_ONLY]: 'fanOnly'
};

class AirConAccessory extends BaseAccessory {
    constructor(platform, accessory, device) {
        super(platform, accessory, device);

        this.acService = this.accessory.getService(Service.HeaterCooler) ||
            this.accessory.addService(Service.HeaterCooler, device.label, 'acService');

        // 초기 상태 설정 (API에서 상태를 가져와야 함)
        if (!this.currentState.thermostatCoolingSetpoint) { this.currentState.thermostatCoolingSetpoint = { value: 24 }; }
        if (!this.currentState.airConditionerMode) { this.currentState.airConditionerMode = { value: 'cool' }; }
        if (!this.currentState.temperature) { this.currentState.temperature = { value: 25 }; } // 현재 온도 (임시)

        // 1. 전원 On/Off (Characteristic.Active)
        this.acService.getCharacteristic(Characteristic.Active)
            .on('get', (callback) => callback(null, this.currentState.switch.value === 'on' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE))
            .on('set', this.setPowerState.bind(this)); // BaseAccessory의 setPowerState 사용

        // 2. 현재 상태 (CurrentHeaterCoolerState)
        this.acService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .setProps({
                // Homebridge는 이 값을 자체적으로 계산해야 합니다. (켜짐/꺼짐/가열/냉방 중)
                // 여기서는 Active 상태와 연동하여 단순화
                validValues: [Characteristic.CurrentHeaterCoolerState.INACTIVE, Characteristic.CurrentHeaterCoolerState.COOLING]
            })
            .on('get', (callback) => {
                const isActive = this.currentState.switch.value === 'on';
                if (!isActive) return callback(null, Characteristic.CurrentHeaterCoolerState.INACTIVE);

                // SmartThings airConditionerMode 값을 HomeKit 상태로 변환 (냉방만 가정)
                callback(null, Characteristic.CurrentHeaterCoolerState.COOLING);
            });

        // 3. 타겟 모드 (TargetHeaterCoolerState)
        this.acService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .setProps({
                validValues: [Characteristic.TargetHeaterCoolerState.COOL, Characteristic.TargetHeaterCoolerState.AUTO, Characteristic.TargetHeaterCoolerState.FAN_ONLY]
            })
            .on('get', (callback) => callback(null, ST_MODE_TO_HK[this.currentState.airConditionerMode.value] || Characteristic.TargetHeaterCoolerState.COOL))
            .on('set', async (value, callback) => {
                const stMode = HK_MODE_TO_ST[value];
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

        // 5. 현재 온도 (CurrentTemperature) - SmartThings API의 temperature Capability가 있으면 사용
        this.acService.getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({ unit: Characteristic.Units.CELSIUS, minValue: -50, maxValue: 100 })
            .on('get', (callback) => callback(null, this.currentState.temperature.value || 25)); // 기본값 25
    }

    updateHomeKitCharacteristics() {
        const isActive = this.currentState.switch.value === 'on' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
        this.acService.updateCharacteristic(Characteristic.Active, isActive);

        const targetState = ST_MODE_TO_HK[this.currentState.airConditionerMode.value] || Characteristic.TargetHeaterCoolerState.COOL;
        this.acService.updateCharacteristic(Characteristic.TargetHeaterCoolerState, targetState);

        this.acService.updateCharacteristic(Characteristic.CoolingThresholdTemperature, this.currentState.thermostatCoolingSetpoint.value);
        this.acService.updateCharacteristic(Characteristic.CurrentTemperature, this.currentState.temperature.value || 25);

        const currentState = isActive ? Characteristic.CurrentHeaterCoolerState.COOLING : Characteristic.CurrentHeaterCoolerState.INACTIVE;
        this.acService.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, currentState);
    }
}

module.exports = AirConAccessory;