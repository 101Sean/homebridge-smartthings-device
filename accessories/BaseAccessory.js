const axios = require('axios');

class BaseAccessory {
    constructor(platform, device) {
        this.platform = platform;
        this.log = platform.log;
        this.deviceId = device.deviceId;
        this.name = device.label || 'Smart Device';

        this.client = axios.create({
            baseURL: `https://api.smartthings.com/v1/devices/${this.deviceId}`,
            headers: { 'Authorization': `Bearer ${this.platform.accessToken}` }
        });
    }

    async executeCommand(capability, command, args = []) {
        try {
            await this.client.post('/commands', {
                commands: [{ component: 'main', capability, command, arguments: args }]
            });
            this.log.debug(`[${this.name}] 명령 성공: ${command}`);
        } catch (error) {
            this.log.error(`[${this.name}] 명령 실패: ${error.message}`);
        }
    }
}

module.exports = BaseAccessory;