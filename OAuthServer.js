const http = require('http');
const url = require('url');
const axios = require('axios'); // 👈 node-fetch 대신 axios 사용

class OAuthServer {
    constructor(platform) {
        this.platform = platform;
        this.log = platform.log;
        this.config = platform.config;
        this.api = platform.api;
        this.httpServer = null;
    }

    start() {
        if (this.platform.accessToken) {
            this.log.info('Access Token이 이미 존재합니다. 서버를 시작하지 않습니다.');
            return;
        }

        const callbackPort = this.config.callbackPort || 8000;
        this.httpServer = http.createServer(this.handleRequest.bind(this));

        this.httpServer.listen(callbackPort, () => {
            this.log.info(`OAuth Callback Server running on port ${callbackPort}`);

            const authUrl = this.getAuthUrl(callbackPort);
            this.log.warn('====================================================');
            this.log.warn('!!! SmartThings OAuth 인증이 필요합니다 !!!');
            this.log.warn(`1. Redirect URI: https://${this.config.callbackIp}/oauth/callback`);
            this.log.warn(`2. 브라우저에 접속: ${authUrl}`);
            this.log.warn('====================================================');
        });
    }

    handleRequest(req, res) {
        this.log.warn('===[DEBUG] 요청이 들어온 URL:', req.url);

        if (req.url.startsWith('/oauth/callback')) {
            this.handleOAuthCallback(req, res);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }

    getAuthUrl(port) {
        // ngrok 사용 시 포트 번호 없이 HTTPS 사용
        const redirectUri = `https://${this.config.callbackIp}/oauth/callback`;
        const scope = 'r:devices:* x:devices:* r:scenes:* x:scenes:*';
        const state = 'random_state_' + Date.now();
        return `https://api.smartthings.com/oauth/authorize?response_type=code&client_id=${this.config.clientId}&scope=${scope}&state=${state}&redirect_uri=${redirectUri}`;
    }

    async handleOAuthCallback(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const code = parsedUrl.query.code;
        const state = parsedUrl.query.state;

        if (!code || !state) {
            this.log.error('OAuth 콜백 오류: code 또는 state 매개변수 누락. 등록된 Redirect URI를 확인하세요.');
            res.writeHead(500);
            return res.end('OAuth Error. Check Homebridge logs.');
        }

        try {
            const tokenData = await this.exchangeCodeForToken(code);
            this.platform.accessToken = tokenData.access_token;
            this.platform.refreshToken = tokenData.refresh_token;

            this.platform.persistTokens();

            this.httpServer.close(() => {
                this.log.info('OAuth 서버가 종료되었습니다.');
            });

            res.writeHead(200);
            res.end('<h1>SmartThings 인증 완료! Homebridge를 재시작하거나 로그를 확인하세요.</h1>');

            this.platform.discoverDevices();

        } catch (error) {
            this.log.error('토큰 교환 중 오류 발생:', error.message || error);
            res.writeHead(500);
            res.end('<h1>Token Exchange Failed. Check Homebridge logs.</h1>');
        }
    }

    async exchangeCodeForToken(code) {
        const redirectUri = `https://${this.config.callbackIp}/oauth/callback`;
        const tokenUrl = 'https://api.smartthings.com/oauth/token';

        try {
            const response = await axios.post(
                tokenUrl,
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri,
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`
                    }
                }
            );
            return response.data;

        } catch (error) {
            const status = error.response ? error.response.status : 'N/A';
            const data = error.response ? JSON.stringify(error.response.data) : error.message;

            throw new Error(`Token request failed: ${status} - ${data}`);
        }
    }
}

module.exports = OAuthServer;