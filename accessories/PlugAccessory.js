const BaseAccessory = require('./BaseAccessory');

class PlugAccessory extends BaseAccessory {
    constructor(platform, accessory, device) {
        super(platform, device);
        this.accessory = accessory;

        const { Service, Characteristic } = this.platform.api.hap;

        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings')
            .setCharacteristic(Characteristic.Model, 'Smart Plug Mini')
            .setCharacteristic(Characteristic.SerialNumber, this.deviceId);

        this.service = this.accessory.getService(Service.Outlet) ||
            this.accessory.addService(Service.Outlet, this.name);

        this.service.getCharacteristic(Characteristic.On)
            .onGet(async () => {
                try {
                    const response = await this.client.get('/status');
                    const state = response.data.components.main.switch.switch.value;
                    return state === 'on';
                } catch (error) {
                    this.log.error(`[Plug] 상태 조회 실패: ${error.message}`);
                    return false;
                }
            })
            .onSet(async (value) => {
                const command = value ? 'on' : 'off';
                await this.executeCommand('switch', command);
                this.log.info(`[Plug] ${this.name} 전원: ${command}`);

                this.service.updateCharacteristic(Characteristic.On, value);
            });

        this.service.getCharacteristic(Characteristic.OutletInUse)
            .onGet(async () => {
                try {
                    const response = await this.client.get('/status');
                    return response.data.components.main.switch.switch.value === 'on';
                } catch (e) {
                    return false;
                }
            });
    }
}

module.exports = PlugAccessory;