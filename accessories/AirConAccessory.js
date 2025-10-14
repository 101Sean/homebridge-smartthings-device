const BaseAccessory = require('./BaseAccessory');

class AirConAccessory extends BaseAccessory {
    constructor(platform, accessory, device) {
        super(platform, accessory, device);

        const { Service, Characteristic } = this.platform.api.hap;

        this.thermostatService = this.accessory.getService(Service.HeaterCooler) ||
            this.accessory.addService(Service.HeaterCooler, device.label, 'thermostatService');

        // 1. Active
        this.thermostatService.getCharacteristic(Characteristic.Active)
            .on('get', (callback) => {
                const powerState = this.currentState.switch.value === 'on' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
                callback(null, powerState);
            })
            .on('set', (value, callback) => {
                this.setPowerState(value === Characteristic.Active.ACTIVE, callback);
            });

        // 2. Current Heating/Cooling State
        this.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', (callback) => {
                const powerState = this.currentState.switch && this.currentState.switch.value;
                const mode = this.currentState.airConditionerMode && this.currentState.airConditionerMode.value;
                let currentState = Characteristic.CurrentHeatingCoolingState.OFF;

                if (powerState === 'on') {
                    if (mode === 'cool') currentState = Characteristic.CurrentHeatingCoolingState.COOL;
                    else if (mode === 'auto') currentState = Characteristic.CurrentHeatingCoolingState.AUTO;
                    else if (mode === 'heat') currentState = Characteristic.CurrentHeatingCoolingState.HEAT;
                }
                callback(null, currentState);
            });

        // 3. Target Heating/Cooling State (모드 설정)
        this.thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .setProps({validValues: [Characteristic.TargetHeatingCoolingState.OFF, Characteristic.TargetHeatingCoolingState.COOL, Characteristic.TargetHeatingCoolingState.AUTO]})
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
                    // OFF가 아니면 전원 켜기
                    if (value !== Characteristic.TargetHeatingCoolingState.OFF) {
                        await this.sendSmartThingsCommand('switch', 'on');
                        this.currentState.switch.value = 'on';
                    }

                    if (value === Characteristic.TargetHeatingCoolingState.COOL) modeCommand = 'cool';
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

        // 4. Current Temperature (온도 바 활성화)
        this.thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({ minValue: 10, maxValue: 60, minStep: 0.1 })
            .on('get', (callback) => {
                const currentTemp = this.currentState.temperature && parseFloat(this.currentState.temperature.value);
                callback(null, (currentTemp && currentTemp >= 10) ? currentTemp : 10);
            });

        // 5. Target Temperature (Cooling Setpoint 사용)
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

        const powerState = this.currentState.switch.value === 'on' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
        this.thermostatService.updateCharacteristic(Characteristic.Active, powerState);

        const mode = this.currentState.airConditionerMode && this.currentState.airConditionerMode.value;
        let currentState = Characteristic.CurrentHeatingCoolingState.OFF;
        if (powerState === Characteristic.Active.ACTIVE) {
            if (mode === 'cool') currentState = Characteristic.CurrentHeatingCoolingState.COOL;
            else if (mode === 'auto') currentState = Characteristic.CurrentHeatingCoolingState.AUTO;
            else if (mode === 'heat') currentState = Characteristic.CurrentHeatingCoolingState.HEAT;
        }
        this.thermostatService.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, currentState);

        const targetMode = this.currentState.airConditionerMode && this.currentState.airConditionerMode.value;
        let targetState = Characteristic.TargetHeatingCoolingState.OFF;
        if (targetMode === 'cool') targetState = Characteristic.TargetHeatingCoolingState.COOL;
        else if (targetMode === 'auto') targetState = Characteristic.TargetHeatingCoolingState.AUTO;
        else if (targetMode === 'heat') targetState = Characteristic.TargetHeatingCoolingState.HEAT;
        this.thermostatService.updateCharacteristic(Characteristic.TargetHeatingCoolingState, targetState);

        const currentTemp = this.currentState.temperature && parseFloat(this.currentState.temperature.value);
        this.thermostatService.updateCharacteristic(Characteristic.CurrentTemperature, currentTemp || 10);

        const targetTemp = this.currentState.thermostatCoolingSetpoint && parseFloat(this.currentState.thermostatCoolingSetpoint.value);
        this.thermostatService.updateCharacteristic(Characteristic.CoolingThresholdTemperature, targetTemp || 24);
    }
}

module.exports = AirConAccessory;