const OAuthServer = require('./OAuthServer');
const axios = require('axios');

const TVAccessory = require('./accessories/TVAccessory');
const SetTopAccessory = require('./accessories/SetTopAccessory');
const AirConAccessory = require('./accessories/AirConAccessory');
const PlugAccessory = require('./accessories/PlugAccessory');

const ACCESSORY_CLASSES = [
    TVAccessory,
    SetTopAccessory,
    AirConAccessory,
    PlugAccessory
];

class SmartThingsPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.accessories = []; // 캐시된 액세서리 저장을 위한 배열

        this.accessToken = config.accessToken;
        this.refreshToken = config.refreshToken;

        this.log.info(`SmartThings Platform Initialized. Token status: ${this.accessToken ? 'Loaded' : 'Missing'}`);

        this.api.on('didFinishLaunching', () => {
            this.initAuthentication();
        });
    }

    initAuthentication() {
        if (this.accessToken) {
            this.log.info('Access Token이 존재합니다. 기기 로드를 시작합니다.');
            this.discoverDevices();
        } else {
            const server = new OAuthServer(this);
            server.start();
        }
    }

    configureAccessory(accessory) {
        this.log.info(`Loading accessory from cache: ${accessory.displayName}`);
        this.accessories.push(accessory);
    }

    persistTokens() {
        this.config.accessToken = this.accessToken;
        this.config.refreshToken = this.refreshToken;
        this.log.info('인증 토큰 저장 완료.');
    }

    async discoverDevices() {
        this.log.info('SmartThings API를 통해 기기 목록을 가져옵니다...');
        const url = 'https://api.smartthings.com/v1/devices';

        try {
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            const devices = response.data.items;

            for (const device of devices) {
                const uuid = this.api.hap.uuid.generate(device.deviceId);
                let accessory = this.accessories.find(acc => acc.UUID === uuid);

                const caps = device.components?.[0]?.capabilities?.map(c => c.id) || [];
                let AccessoryClass = null;

                if (caps.includes('statelessPowerToggleButton') && caps.includes('statelessChannelButton')) {
                    if (device.label.includes('TV')) {
                        AccessoryClass = TVAccessory;
                    } else if (device.label.includes('Set-Top')) {
                        AccessoryClass = SetTopAccessory;
                    }
                } else if (caps.includes('airConditionerMode') || caps.includes('thermostatCoolingSetpoint')) {
                    AccessoryClass = AirConAccessory;
                } else if (caps.includes('switch') && caps.includes('powerMeter')) {
                    AccessoryClass = PlugAccessory;
                }

                if (!AccessoryClass) {
                    this.log.debug(`Skipping unsupported device: ${device.label}`);
                    continue;
                }

                if (!device.components || !device.components.find(c => c.id === 'main')) {
                    this.log.warn(`Skipping device ${device.label} due to missing 'main' component.`);
                    continue;
                }

                if (!accessory) accessory = new this.api.platformAccessory(device.label, uuid);

                new AccessoryClass(this, accessory, device);

                if (!['TVAccessory', 'SetTopAccessory'].includes(AccessoryClass.name)) {
                    this.api.registerPlatformAccessories('homebridge-smartthings-device', 'SmartThingsPlatform', [accessory]);
                }
            }

        } catch (error) {
            this.log.error('기기 목록 로드 실패:', error.message);
        }
    }
}

module.exports = (api) => {
    //const PLUGIN_NAME = 'homebridge-smartthings-device';
    const PLATFORM_NAME = 'SmartThingsPlatform';

    api.registerPlatform(PLATFORM_NAME, SmartThingsPlatform);
};