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

        // device.components.main 객체가 존재하는지 먼저 확인
        const mainComponent = device.components.find(c => c.id === 'main');
        const currentStateFromDevice = mainComponent && mainComponent.state ? mainComponent.state : {};

        this.currentState = {
            switch: { value: 'off' },
            mute: { value: 'unmuted' },
            volume: { value: '50' },
        };

        // Accessory Information Service 설정
        accessory.getService(this.Service.AccessoryInformation)
            .setCharacteristic(this.Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(this.Characteristic.Model, device.presentationId)
            .setCharacteristic(this.Characteristic.SerialNumber, device.deviceId);

        this.updateHomeKitCharacteristics();
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
        }
    }

    async setPowerState(value, callback) {
        const isIrOcf = this.device.type === 'IR_OCF';

        if (isIrOcf) {
            // IR 장치: statelessPowerToggleButton: push 명령 사용 (토글)
            await this.sendSmartThingsCommand('statelessPowerToggleButton', 'push');

            // IR 장치는 상태를 알 수 없어 HomeKit에서 요청한 상태로 가정하고 추적
            this.currentState.switch = { value: value ? 'on' : 'off' };
        } else {
            // 일반 장치: switch: on/off 명령 사용
            const command = value ? 'on' : 'off';
            await this.sendSmartThingsCommand('switch', command);
            this.currentState.switch = { value: command };
        }

        callback(null);
        this.updateHomeKitCharacteristics();
    }

    updateDeviceState(newState) {
        this.currentState = newState.components.main.state;
        this.updateHomeKitCharacteristics();
    }
}

module.exports = BaseAccessory;