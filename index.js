const axios = require('axios');
const OAuthServer = require('./OAuthServer'); // OAuth 서버 로직 임포트

const AirConAccessory  = require('./accessories/AirConAccessory');
const TVAccessory      = require('./accessories/TVAccessory');
const SetTopAccessory  = require('./accessories/SetTopAccessory');
const SpeakerAccessory = require('./accessories/SpeakerAccessory');

const ACCESSORY_CLASSES = [
    TVAccessory,
    SetTopAccessory,
    AirConAccessory,
    SpeakerAccessory
];

module.exports = (api) => {
    api.registerPlatform('homebridge-smartthings-device', 'SmartThingsPlatform', SmartThingsPlatform);
};

class SmartThingsPlatform {
    constructor(log, config, api) {
        this.log    = log;
        this.config = config;
        this.api    = api;

        this.accessToken  = this.config.accessToken;
        this.refreshToken = this.config.refreshToken;

        this.oauthServer = new OAuthServer(this);
        this.log.info(`SmartThings Platform Initialized. Token status: ${this.accessToken ? 'Loaded' : 'Missing'}`);

        api.on('didFinishLaunching', () => this.initAuthentication());
    }

    initAuthentication() {
        if (this.accessToken) {
            this.log.info('Access Token이 존재합니다. 기기 로드를 시작합니다.');
            this.discoverDevices();
        } else {
            this.log.warn('Access Token이 없어 SmartThings OAuth 인증 서버를 시작합니다.');
            this.oauthServer.start();
        }
    }

    configureAccessory(accessory) {
        this.log.info(`Loading accessory from cache: ${accessory.displayName}`);
    }

    persistTokens() {
        this.config.accessToken = this.accessToken;
        this.config.refreshToken = this.refreshToken;
        this.log.info('인증 토큰 저장 완료.');
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            this.log.error('Refresh Token이 없어 토큰을 갱신할 수 없습니다. 재인증이 필요합니다.');
            throw new Error('No refresh token available.');
        }

        this.log.warn('Access Token이 만료되었습니다. Refresh Token을 사용하여 갱신을 시도합니다.');

        const tokenUrl = 'https://api.smartthings.com/oauth/token';

        try {
            const response = await axios.post(
                tokenUrl,
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`
                    }
                }
            );

            const tokenData = response.data;

            this.accessToken = tokenData.access_token;
            this.refreshToken = tokenData.refresh_token;
            this.persistTokens();

            this.log.info('토큰 갱신 성공.');
            return true;

        } catch (error) {
            this.log.error('토큰 갱신 실패! SmartThings 재인증이 필요합니다.', error.response ? error.response.data : error.message);

            this.accessToken = null;
            this.refreshToken = null;
            this.persistTokens();

            throw new Error('Token refresh failed. Manual re-authentication required.');
        }
    }

    async discoverDevices() {
        this.log.info('SmartThings API를 통해 기기 목록을 가져옵니다...');
        const url = 'https://api.smartthings.com/v1/devices';

        try {
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            const devices = response.data.items;

            const newAccessories = [];

            for (const device of devices) {
                let accessoryInstance = null;

                for (const AccessoryClass of ACCESSORY_CLASSES) {
                    const uuid = this.api.hap.uuid.generate(device.deviceId);
                    let accessory = this.api.platformAccessory.get(uuid);

                    if (!accessory) {
                        accessory = new this.api.platformAccessory(device.label, uuid);
                        this.api.registerPlatformAccessories('homebridge-smartthings-device', 'SmartThingsPlatform', [accessory]);
                        this.log.info(`새 액세서리 등록: ${device.label}`);
                    }

                    if (device.label.includes('TV')) {
                        accessoryInstance = new TVAccessory(this, accessory, device);
                        break;
                    } else if (device.label.includes('Air Conditioner')) {
                        accessoryInstance = new AirConAccessory(this, accessory, device);
                        break;
                    } else if (device.label.includes('Set-Top')) {
                        accessoryInstance = new SetTopAccessory(this, accessory, device);
                        break;
                    } else if (device.label.includes('Home mini')) {
                        accessoryInstance = new SpeakerAccessory(this, accessory, device);
                        break;
                    }
                }
            }
        } catch (error) {
            this.log.error('기기 목록 로드 실패:', error.message);
        }
    }
}