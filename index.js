const axios = require('axios');
const OAuthServer = require('./OAuthServer'); // OAuth 서버 로직 임포트

const AirConAccessory  = require('./accessories/AirConAccessory');
const TVAccessory      = require('./accessories/TVAccessory');
const SetTopAccessory  = require('./accessories/SetTopAccessory');
const SpeakerAccessory = require('./accessories/SpeakerAccessory');

module.exports = (api) => {
    api.registerPlatform('SmartThingsPlatform', SmartThingsPlatform);
};

class SmartThingsPlatform {
    constructor(log, config, api) {
        this.log    = log;
        this.config = config;
        this.api    = api;

        this.accessToken  = this.config.accessToken;
        this.refreshToken = this.config.refreshToken;

        this.oauthServer = new OAuthServer(this);

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

    persistTokens() {
        this.config.accessToken = this.accessToken;
        this.config.refreshToken = this.refreshToken;
        this.api.updatePlatformConfig(this.config);
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
        if (!this.accessToken) {
            this.log.error('Access Token이 없어 기기를 로드할 수 없습니다. 인증을 완료해주세요.');
            return;
        }

        const fetchDevicesAndRegister = async () => {
            const resp = await axios.get(
                'https://api.smartthings.com/v1/devices',
                { headers: { Authorization: `Bearer ${this.accessToken}` } }
            );

            for (const dev of resp.data.items) {
                const caps = dev.components[0].capabilities.map(c => c.id);
                const cats = dev.components[0].categories?.map(c => c.name) || [];

                if (caps.includes('airConditionerMode'))
                    AirConAccessory.register(this.api, dev, this.config);
                else if (cats.includes('Television'))
                    TVAccessory.register(this.api, dev, this.config);
                else if (cats.includes('SetTop'))
                    SetTopAccessory.register(this.api, dev, this.config);
                else if (caps.includes('audioVolume'))
                    SpeakerAccessory.register(this.api, dev, this.config);
            }
        };

        try {
            this.log.info('SmartThings API를 통해 기기 목록을 가져옵니다...');
            await fetchDevicesAndRegister();
        } catch (error) {
            if (error.response && error.response.status === 401 && this.refreshToken) {
                try {
                    await this.refreshAccessToken();

                    this.log.info('토큰 갱신 성공, 기기 로드를 재시도합니다.');
                    return this.discoverDevices();

                } catch (refreshError) {
                    this.log.error('토큰 갱신에 실패하여 기기 로드를 중단합니다. 재인증이 필요합니다.');
                }
            } else {
                this.log.error('기기 로드 중 오류 발생 (API 통신 오류):', error.message);
            }
        }
    }
}