const { Service, Characteristic } = require('homebridge');
const axios = require('axios');

class BaseAccessory {
    constructor(platform, accessory, device) {
        this.platform = platform;
        this.log = platform.log;
        this.accessory = accessory;
        this.device = device;
        this.axios = axios;

        // SmartThings API는 실시간 상태를 제공하지 않을 수 있어 초기 상태 설정
        this.currentState = device.components.main.state || { switch: { value: 'off' } };

        accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, device.deviceTypeId)
            .setCharacteristic(Characteristic.SerialNumber, device.deviceId);

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
            // 오류 로깅 로직 (이전 코드와 동일)
            this.log.error(`[${this.device.label}] Command failed: ${error.message}`);
        }
    }

    async setPowerState(value, callback) {
        const isIrOcf = this.device.type === 'IR_OCF';

        if (isIrOcf) {
            // IR 장치: statelessPowerToggleButton: push 명령 사용
            this.log.info(`[${this.device.label}] Sending IR Power Toggle command.`);
            await this.sendSmartThingsCommand('statelessPowerToggleButton', 'push');

            // IR 장치는 상태를 알 수 없어 HomeKit에서 요청한 상태로 가정하고 추적
            this.currentState.switch = { value: value ? 'on' : 'off' };
        } else {
            // 일반 장치: switch: on/off 명령 사용
            const command = value ? 'on' : 'off';
            this.log.info(`[${this.device.label}] Setting switch state to: ${command}`);
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

    updateHomeKitCharacteristics() {}
}

module.exports = BaseAccessory;