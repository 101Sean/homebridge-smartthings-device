const axios = require('axios');

const OAuthServer = require('./OAuthServer');

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
            this.discoverDevices(); // 기기 로드 함수 호출
        } else {
            this.oauthServer.start();
        }
    }

    persistTokens() {
        // 이 함수는 OAuthServer.js에서 호출되어 토큰을 업데이트합니다.
        this.config.accessToken = this.accessToken;
        this.config.refreshToken = this.refreshToken;
        this.api.updatePlatformConfig(this.config);
        this.log.info('인증 토큰 저장 완료.');
    }

    async discoverDevices() {
        if (!this.accessToken) {
            this.log.error('Access Token이 없어 기기를 로드할 수 없습니다. 인증을 완료해주세요.');
            return;
        }

        this.log.info('SmartThings API를 통해 기기 목록을 가져옵니다...');

        try {
            const resp = await axios.get(
                'https://api.smartthings.com/v1/devices',
                { headers: { Authorization: `Bearer ${this.accessToken}` } } // **획득한 accessToken 사용**
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
        } catch (error) {
            // TODO: 401 오류 발생 시 refreshToken을 사용하여 갱신 로직 구현
            this.log.error('기기 로드 중 오류 발생 (API 통신 오류):', error.message);
        }
    }
}