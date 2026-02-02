const OAuthServer = require('./OAuthServer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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
        this.log.info('새로운 토큰을 시스템에 반영합니다.');

        const configPath = this.api.user.configPath();

        try {
            if (!fs.existsSync(configPath)) {
                throw new Error(`설정 파일을 찾을 수 없습니다: ${configPath}`);
            }

            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const platformConfig = config.platforms.find(p => p.platform === PLATFORM_NAME);

            if (platformConfig) {
                platformConfig.accessToken = this.accessToken;
                platformConfig.refreshToken = this.refreshToken;

                fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
                this.log.info(`[성공] ${configPath} 에 토큰이 자동 저장되었습니다.`);
            }
        } catch (err) {
            this.log.error('자동 저장 실패:', err.message);
            this.log.warn('우분투 권한 설정을 확인하세요: sudo chown homebridge:homebridge /var/lib/homebridge/config.json');
        }

        this.discoverDevices();
    }

    async refreshAccessToken() {
        const tokenUrl = 'https://api.smartthings.com/oauth/token';
        const authHeader = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', this.refreshToken);

        try {
            this.log.info('토큰이 만료되어 갱신을 시도합니다...');
            const response = await axios.post(tokenUrl, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${authHeader}`
                }
            });

            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;

            const configPath = this.api.user.configPath();
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const platformConfig = config.platforms.find(p => p.platform === PLATFORM_NAME);
            if (platformConfig) {
                platformConfig.accessToken = this.accessToken;
                platformConfig.refreshToken = this.refreshToken;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
            }

            this.log.info('새 토큰 저장 완료. 3초 후 브릿지를 재시작합니다.');
            setTimeout(() => {
                process.exit(1);
            }, 3000);

            return this.accessToken;
        } catch (error) {
            this.log.error('토큰 갱신 실패. 다시 로그인해야 할 수도 있습니다:', error.message);
            throw error;
        }
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
            if (error.response && error.response.status === 401 && this.refreshToken) {
                try {
                    await this.refreshAccessToken();
                    return await this.discoverDevices();
                } catch (retryError) {
                    this.log.error('갱신 후 재시도 실패');
                }
            } else {
                this.log.error('기기 목록 로드 실패:', error.message);
            }
        }
    }
}

module.exports = (api) => {
    api.registerPlatform(PLATFORM_NAME, SmartThingsPlatform);
};