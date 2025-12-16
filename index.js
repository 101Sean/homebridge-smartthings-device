const OAuthServer = require('./OAuthServer');
const axios = require('axios');

const TVAccessory = require('./accessories/TVAccessory');
const SetTopAccessory = require('./accessories/SetTopAccessory');
const AirConAccessory = require('./accessories/AirConAccessory');
const PlugAccessory = require('./accessories/PlugAccessory');

const PLUGIN_NAME = 'homebridge-smartthings-device';
const PLATFORM_NAME = 'SmartThingsPlatform';

class SmartThingsPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.accessories = [];

        this.accessToken = config.accessToken || null;
        this.refreshToken = config.refreshToken || null;

        this.api.on('didFinishLaunching', () => {
            this.initAuthentication();
        });
    }

    initAuthentication() {
        if (this.accessToken) {
            this.log.info('저장된 토큰을 확인했습니다. 기기 조회를 시작합니다.');
            this.discoverDevices();
        } else {
            this.log.warn('인증 토큰이 없습니다. OAuth 서버를 실행합니다.');
            const server = new OAuthServer(this);
            server.start();
        }
    }

    configureAccessory(accessory) {
        this.accessories.push(accessory);
    }

    persistTokens() {
        this.log.info('====================================================');
        this.log.info('토큰 발급 성공! 아래 내용을 복사하여 config.json에 넣으세요:');
        this.log.info(`"accessToken": "${this.accessToken}"`);
        this.log.info(`"refreshToken": "${this.refreshToken}"`);
        this.log.info('저장 후 재시작하면 더 이상 인증 페이지가 뜨지 않습니다.');
        this.log.info('====================================================');

        this.discoverDevices();
    }

    async discoverDevices() {
        const url = 'https://api.smartthings.com/v1/devices';
        try {
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            const devices = response.data.items;

            for (const device of devices) {
                const caps = device.components?.[0]?.capabilities?.map(c => c.id) || [];
                let AccessoryClass = null;

                // 기기 유형 판별
                if (caps.includes('statelessPowerToggleButton') &&
                    device.components[0].categories.some(cat => cat.name === 'Television')) {
                    AccessoryClass = TVAccessory;
                } else if (device.components[0].categories.some(cat => cat.name === 'SetTop')) {
                    AccessoryClass = SetTopAccessory;
                } else if (caps.includes('airConditionerMode') || caps.includes('thermostatCoolingSetpoint')) {
                    AccessoryClass = AirConAccessory;
                } else if (caps.includes('switch') && caps.includes('powerMeter')) {
                    AccessoryClass = PlugAccessory;
                }

                if (!AccessoryClass) {
                    this.log.debug(`지원하지 않는 기기 스킵: ${device.label} (Caps: ${caps.join(', ')})`);
                    continue;
                }

                // External 여부 확인 (TV, Set-Top)
                const isExternal = ['TVAccessory', 'SetTopAccessory'].includes(AccessoryClass.name);

                if (isExternal) {
                    this.log.info(`[External] 발행 중: ${device.label}`);
                    new AccessoryClass(this, device);
                } else {
                    const uuid = this.api.hap.uuid.generate(device.deviceId);
                    let existingAccessory = this.accessories.find(acc => acc.UUID === uuid);

                    if (existingAccessory) {
                        this.log.info(`[Bridge] 캐시 로드: ${device.label}`);
                        new AccessoryClass(this, existingAccessory, device);
                    } else {
                        this.log.info(`[Bridge] 신규 등록: ${device.label}`);
                        const accessory = new this.api.platformAccessory(device.label, uuid);
                        new AccessoryClass(this, accessory, device);
                        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                        this.accessories.push(accessory);
                    }
                }
            }
        } catch (error) {
            this.log.error('기기 목록 로드 실패:', error.message);
        }
    }
}

module.exports = (api) => {
    api.registerPlatform(PLATFORM_NAME, SmartThingsPlatform);
};