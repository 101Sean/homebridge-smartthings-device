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
            fanSpeed: 15
        };

        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings IR')
            .setCharacteristic(Characteristic.Model, device.presentationId || 'IR AC')
            .setCharacteristic(Characteristic.SerialNumber, this.deviceId);

        this.service = this.accessory.getService(Service.HeaterCooler) ||
            this.accessory.addService(Service.HeaterCooler, this.name);

        this.service.getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .onGet(() => Characteristic.TemperatureDisplayUnits.CELSIUS);

        this.service.getCharacteristic(Characteristic.Active)
            .onGet(() => this.state.active)
            .onSet(async (value) => {
                this.state.active = value;
                const command = (value === Characteristic.Active.ACTIVE) ? 'on' : 'off';
                await this.executeCommand('switch', command);
            });

        this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .onGet(() => {
                if (this.state.active === Characteristic.Active.INACTIVE) {
                    return Characteristic.CurrentHeaterCoolerState.INACTIVE;
                }
                if (this.state.mode === Characteristic.TargetHeaterCoolerState.HEAT) return Characteristic.CurrentHeaterCoolerState.HEATING;
                return Characteristic.CurrentHeaterCoolerState.COOLING;
            });

        this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .setProps({
                validValues: [
                    Characteristic.TargetHeaterCoolerState.AUTO,
                    Characteristic.TargetHeaterCoolerState.HEAT,
                    Characteristic.TargetHeaterCoolerState.COOL
                ]
            })
            .onGet(() => this.state.mode)
            .onSet(async (value) => {
                this.state.mode = value;
                let mode = 'cool';

                if (value === Characteristic.TargetHeaterCoolerState.HEAT) {
                    mode = 'dry';
                } else if (value === Characteristic.TargetHeaterCoolerState.AUTO) {
                    mode = 'auto';
                }

                await this.executeCommand('airConditionerMode', 'setAirConditionerMode', [mode]);
            });

        this.service.getCharacteristic(Characteristic.CurrentTemperature)
            .onGet(() => this.state.temp);

        const tempProps = { minStep: 1, minValue: 18, maxValue: 30 };

        this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps(tempProps)
            .onGet(() => this.state.temp)
            .onSet(async (value) => {
                this.state.temp = value;
                await this.executeCommand('thermostatCoolingSetpoint', 'setCoolingSetpoint', [value]);
            });

        this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .setProps(tempProps)
            .onGet(() => this.state.temp)
            .onSet(async (value) => {
                this.state.temp = value;
                await this.executeCommand('thermostatCoolingSetpoint', 'setCoolingSetpoint', [value]);
            });

        this.service.getCharacteristic(Characteristic.RotationSpeed)
            .setProps({ minStep: 35, minValue: 15, maxValue: 85 })
            .onGet(() => this.state.fanSpeed)
            .onSet(async (value) => {
                this.state.fanSpeed = value;
                let fanMode = 'low';
                if (value > 75) fanMode = 'high';
                else if (value > 40) fanMode = 'medium';

                await this.executeCommand('airConditionerFanMode', 'setFanMode', [fanMode]);
            });
    }
}

module.exports = AirConAccessory;