const axios = require('axios');

class PlugAccessory {
    constructor(platform, accessory, device) {
        this.platform = platform;
        this.log = platform.log;
        this.accessory = accessory;
        this.deviceId = device.deviceId;
        this.name = device.label || 'Smart Plug';

        const { Service, Characteristic } = this.platform.api.hap;

        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'Smart Plug Mini')
            .setCharacteristic(Characteristic.SerialNumber, this.deviceId);

        this.service = this.accessory.getService(Service.Outlet) ||
            this.accessory.addService(Service.Outlet, this.name);

        this.service.getCharacteristic(Characteristic.On)
            .onGet(this.getOnState.bind(this))
            .onSet(this.setOnState.bind(this));

        this.service.getCharacteristic(Characteristic.OutletInUse)
            .onGet(this.getInUse.bind(this));
    }

    async executeCommand(capability, command, args = []) {
        try {
            await axios.post(`https://api.smartthings.com/v1/devices/${this.deviceId}/commands`, {
                commands: [{ component: 'main', capability: capability, command: command, arguments: args }]
            }, {
                headers: { 'Authorization': `Bearer ${this.platform.accessToken}` }
            });
        } catch (error) {
            this.log.error(`[Plug] 명령 실패: ${error.message}`);
        }
    }

    async getOnState() {
        try {
            const response = await axios.get(`https://api.smartthings.com/v1/devices/${this.deviceId}/status`, {
                headers: { 'Authorization': `Bearer ${this.platform.accessToken}` }
            });
            const state = response.data.components.main.switch.switch.value; // 'on' 또는 'off'
            this.log.debug(`[Plug] 현재 상태 조회: ${state}`);
            return state === 'on';
        } catch (error) {
            this.log.error(`[Plug] 상태 조회 실패: ${error.message}`);
            return false;
        }
    }

    async setOnState(value) {
        const command = value ? 'on' : 'off';
        await this.executeCommand('switch', command);
        this.log.info(`[Plug] ${this.name} 전원: ${command}`);

        this.service.updateCharacteristic(this.platform.api.hap.Characteristic.On, value);
    }

    async getInUse() {
        return await this.getOnState();
    }
}

module.exports = PlugAccessory;