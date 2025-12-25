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

        this.client.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;

                if (error.response && error.response.status === 401 && !originalRequest._retry) {
                    originalRequest._retry = true;
                    this.log.warn(`[${this.name}] 토큰 만료 감지. 갱신을 시도합니다...`);

                    try {
                        const newToken = await this.platform.refreshAccessToken();

                        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                        this.client.defaults.headers['Authorization'] = `Bearer ${newToken}`;

                        return this.client(originalRequest);
                    } catch (refreshError) {
                        this.log.error('토큰 갱신 실패. 수동 인증이 필요할 수 있습니다.');
                    }
                }
                return Promise.reject(error);
            }
        );
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