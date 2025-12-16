const axios = require('axios');

class BaseAccessory {
    constructor(platform, accessory, device) {
        this.platform = platform;
        this.log = platform.log;
        this.accessory = accessory;
        this.device = device;
        this.axios = axios;

        this.Service = platform.api.hap.Service;
        this.Characteristic = platform.api.hap.Characteristic;
        this.Categories = platform.api.hap.Categories;

        this.currentState = {
            switch: { value: 'off' },
            mute: { value: 'unmuted' },
            volume: { value: '50' },
            thermostatCoolingSetpoint: { value: 24 },
            airConditionerMode: { value: 'cool' },
            temperature: { value: 25 }
        };

        accessory.getService(this.Service.AccessoryInformation)
            .setCharacteristic(this.Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(this.Characteristic.Model, device.presentationId)
            .setCharacteristic(this.Characteristic.SerialNumber, device.deviceId);
    }

    async sendSmartThingsCommand(capability, command, args = []) {
        const url = `https://api.smartthings.com/v1/devices/${this.device.deviceId}/commands`;
        const payload = [{
            component: 'main',
            capability: capability,
            command: command,
            arguments: args
        }];

        try {
            await this.axios.post(url, { commands: payload }, {
                headers: {
                    'Authorization': `Bearer ${this.platform.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            this.log.debug(`[${this.device.label}] Command sent: ${capability}.${command}`);
        } catch (error) {
            this.log.error(`[${this.device.label}] Command failed: ${error.message}`);
            throw error;
        }
    }

    async setPowerState(value, callback) {
        const isIrOcf = this.device.type === 'IR_OCF';

        try {
            if (isIrOcf) {
                await this.sendSmartThingsCommand('statelessPowerToggleButton', 'push');
            } else {
                const command = value ? 'on' : 'off';
                await this.sendSmartThingsCommand('switch', command);
            }
            this.currentState.switch = { value: value ? 'on' : 'off' };
            callback(null);
            this.updateHomeKitCharacteristics();
        } catch (error) {
            callback(error);
        }
    }

    updateDeviceState(newState) {
        if (newState.components && newState.components.main && newState.components.main.state) {
            this.currentState = newState.components.main.state;
        } else {
            this.currentState.switch.value = this.currentState.switch.value === 'on' ? 'off' : 'on';
        }
        this.updateHomeKitCharacteristics();
    }

    updateHomeKitCharacteristics() {}
}

module.exports = BaseAccessory;