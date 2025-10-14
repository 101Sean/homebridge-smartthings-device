const BaseAccessory = require('./BaseAccessory');

class AirConAccessory extends BaseAccessory {
    constructor(platform, accessory, device) {
        super(platform, accessory, device);

        const { Service, Characteristic } = this.platform.api.hap;

        this.thermostatService = this.accessory.getService(Service.HeaterCooler) ||
            this.accessory.addService(Service.HeaterCooler, device.label, 'thermostatService');

        // Current Heating/Cooling State
        this.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', (callback) => {
                const powerState = this.currentState.switch && this.currentState.switch.value;
                const mode = this.currentState.airConditionerMode && this.currentState.airConditionerMode.value;
                let currentState = Characteristic.CurrentHeatingCoolingState.OFF;

                if (powerState === 'on') {
                    if (mode === 'cool') {
                        currentState = Characteristic.CurrentHeatingCoolingState.COOL;
                    } else if (mode === 'auto') {
                        currentState = Characteristic.CurrentHeatingCoolingState.AUTO;
                    } else if (mode === 'heat') {
                        currentState = Characteristic.CurrentHeatingCoolingState.HEAT;
                    }
                }
                callback(null, currentState);
            });

        // Target Heating/Cooling State (COOL 모드 선택 시 전원 켜짐 로직 유지)
        this.thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .setProps({validValues: [
                    Characteristic.TargetHeatingCoolingState.OFF,
                    Characteristic.TargetHeatingCoolingState.COOL,
                    Characteristic.TargetHeatingCoolingState.AUTO,
                    // HEAT
                ]})
            .on('get', (callback) => {
                const mode = this.currentState.airConditionerMode && this.currentState.airConditionerMode.value;
                let targetState = Characteristic.TargetHeatingCoolingState.OFF;

                if (mode === 'cool') targetState = Characteristic.TargetHeatingCoolingState.COOL;
                else if (mode === 'auto') targetState = Characteristic.TargetHeatingCoolingState.AUTO;
                else if (mode === 'heat') targetState = Characteristic.TargetHeatingCoolingState.HEAT;

                callback(null, targetState);
            })
            .on('set', async (value, callback) => {
                let modeCommand = '';

                try {
                    if (value !== Characteristic.TargetHeatingCoolingState.OFF) {
                        await this.sendSmartThingsCommand('switch', 'on');
                        this.currentState.switch.value = 'on';
                    }

                    if (value === Characteristic.TargetHeatingCoolingState.COOL) modeCommand = 'cool';
                    else if (value === Characteristic.TargetHeatingCoolingState.HEAT) modeCommand = 'heat';
                    else if (value === Characteristic.TargetHeatingCoolingState.AUTO) modeCommand = 'auto';
                    else if (value === Characteristic.TargetHeatingCoolingState.OFF) {
                        await this.sendSmartThingsCommand('switch', 'off');
                        this.currentState.switch.value = 'off';
                        modeCommand = 'off';
                    }

                    if (modeCommand !== 'off') {
                        await this.sendSmartThingsCommand('airConditionerMode', 'setAirConditionerMode', [modeCommand]);
                        this.currentState.airConditionerMode.value = modeCommand;
                    }

                    this.currentState.targetHeatingCoolingState = { value: value };
                    callback(null);
                    this.updateHomeKitCharacteristics();
                } catch (e) { callback(e); }
            });

        // Current Temperature (온도 바 활성화 필수)
        this.thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({ minValue: 10, maxValue: 60, minStep: 0.1 }) // 최소 범위 명시
            .on('get', (callback) => {
                const currentTemp = this.currentState.temperature && parseFloat(this.currentState.temperature.value);
                callback(null, (currentTemp && currentTemp >= 10) ? currentTemp : 10);
            });

        // Target Temperature (Cooling Setpoint 사용)
        this.thermostatService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps({ minValue: 18, maxValue: 30, minStep: 1 })
            .on('get', (callback) => {
                const targetTemp = this.currentState.thermostatCoolingSetpoint && parseFloat(this.currentState.thermostatCoolingSetpoint.value);
                callback(null, targetTemp || 24);
            })
            .on('set', async (value, callback) => {
                try {
                    await this.sendSmartThingsCommand('thermostatCoolingSetpoint', 'setCoolingSetpoint', [value]);
                    this.currentState.thermostatCoolingSetpoint.value = String(value);
                    callback(null);
                    this.updateHomeKitCharacteristics();
                } catch (e) { callback(e); }
            });

        this.updateHomeKitCharacteristics();
    }

    updateHomeKitCharacteristics() {
        const { Characteristic } = this;

        // Current Heating/Cooling State 업데이트
        const powerState = this.currentState.switch && this.currentState.switch.value;
        const mode = this.currentState.airConditionerMode && this.currentState.airConditionerMode.value;
        let currentState = Characteristic.CurrentHeatingCoolingState.OFF;

        if (powerState === 'on') {
            if (mode === 'cool') currentState = Characteristic.CurrentHeatingCoolingState.COOL;
            else if (mode === 'auto') currentState = Characteristic.CurrentHeatingCoolingState.AUTO;
            else if (mode === 'heat') currentState = Characteristic.CurrentHeatingCoolingState.HEAT;
        }
        this.thermostatService.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentState);

        // Target Heating/Cooling State 업데이트
        const targetMode = this.currentState.airConditionerMode && this.currentState.airConditionerMode.value;
        let targetState = Characteristic.TargetHeatingCoolingState.OFF;

        if (targetMode === 'cool') targetState = Characteristic.TargetHeatingCoolingState.COOL;
        else if (targetMode === 'auto') targetState = Characteristic.TargetHeatingCoolingState.AUTO;
        else if (targetMode === 'heat') targetState = Characteristic.TargetHeatingCoolingState.HEAT;
        this.thermostatService.updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetState);

        // Current Temperature 업데이트
        const currentTemp = this.currentState.temperature && parseFloat(this.currentState.temperature.value);
        this.thermostatService.updateCharacteristic(Characteristic.CurrentTemperature, currentTemp || 10); // 최소 10도 보장

        // Target Temperature 업데이트
        const targetTemp = this.currentState.thermostatCoolingSetpoint && parseFloat(this.currentState.thermostatCoolingSetpoint.value);
        this.thermostatService.updateCharacteristic(Characteristic.CoolingThresholdTemperature, targetTemp || 24);
    }
}

module.exports = AirConAccessory;