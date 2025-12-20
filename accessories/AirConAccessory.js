const BaseAccessory = require('./BaseAccessory');

class AirConAccessory extends BaseAccessory {
    constructor(platform, accessory, device) {
        super(platform, device);
        this.accessory = accessory;

        const hap = this.platform.api.hap;
        const { Service, Characteristic } = hap;

        this.state = {
            active: Characteristic.Active.INACTIVE,
            temp: 24,
            mode: Characteristic.TargetHeaterCoolerState.COOL,
            fanSpeed: 10
        };

        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings IR')
            .setCharacteristic(Characteristic.Model, device.presentationId || 'IR AC')
            .setCharacteristic(Characteristic.SerialNumber, this.deviceId);

        this.service = this.accessory.getService(Service.HeaterCooler) ||
            this.accessory.addService(Service.HeaterCooler, this.name);

        this.service.getCharacteristic(Characteristic.Active)
            .onGet(() => this.state.active)
            .onSet(async (value) => {
                this.state.active = value;
                const command = (value === Characteristic.Active.ACTIVE) ? 'on' : 'off';
                await this.executeCommand('switch', command);
            });

        this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .onGet(() => {
                return (this.state.active === Characteristic.Active.ACTIVE) ?
                    Characteristic.CurrentHeaterCoolerState.COOLING : Characteristic.CurrentHeaterCoolerState.INACTIVE;
            });

        this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .onGet(() => this.state.mode)
            .onSet(async (value) => {
                this.state.mode = value;
                let mode = 'cool';
                if (value === Characteristic.TargetHeaterCoolerState.HEAT) mode = 'dry'; // 난방 > 제습운전
                else if (value === Characteristic.TargetHeaterCoolerState.AUTO) mode = 'auto';

                await this.executeCommand('airConditionerMode', 'setAirConditionerMode', [mode]);
            });

        this.service.getCharacteristic(Characteristic.CurrentTemperature)
            .onGet(() => this.state.temp);

        this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps({ minStep: 1, minValue: 18, maxValue: 30 })
            .onGet(() => this.state.temp)
            .onSet(async (value) => {
                this.state.temp = value;
                await this.executeCommand('thermostatCoolingSetpoint', 'setCoolingSetpoint', [value]);
            });

        this.service.getCharacteristic(Characteristic.RotationSpeed)
            .setProps({ minStep: 40, minValue: 10, maxValue: 90 }) // 10(약), 50(중), 90(강)
            .onGet(() => this.state.fanSpeed)
            .onSet(async (value) => {
                this.state.fanSpeed = value;
                let fanMode = 'low';
                if (value > 80) fanMode = 'high';
                else if (value > 40) fanMode = 'medium';

                await this.executeCommand('airConditionerFanMode', 'setFanMode', [fanMode]);
            });
    }
}

module.exports = AirConAccessory;