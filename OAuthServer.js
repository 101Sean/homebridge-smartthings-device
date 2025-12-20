const http = require('http');
const url = require('url');
const axios = require('axios');

class OAuthServer {
    constructor(platform) {
        this.platform = platform;
        this.log = platform.log;
        this.config = platform.config;
        this.api = platform.api;
        this.httpServer = null;

        this.redirectUri = `https://${this.config.callbackIp}/oauth/callback`;
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

            const authUrl = this.getAuthUrl();
            this.log.warn('====================================================');
            this.log.warn('!!! SmartThings OAuth 인증이 필요합니다 !!!');
            this.log.warn(`1. 등록된 Redirect URI: ${this.redirectUri}`);
            this.log.warn(`2. 아래 주소를 브라우저에 입력하세요:`);
            this.log.warn(`${authUrl}`);
            this.log.warn('====================================================');
        });
    }

    handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        if (parsedUrl.pathname === '/oauth/callback') {
            this.handleOAuthCallback(req, res);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }

    getAuthUrl() {
        const scope = 'r:devices:* x:devices:* r:scenes:* x:scenes:*';
        const state = 'st_state_' + Date.now();

        const authUrl = new URL('https://api.smartthings.com/oauth/authorize');
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', this.config.clientId);
        authUrl.searchParams.append('scope', scope);
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('redirect_uri', this.redirectUri);

        return authUrl.toString();
    }

    async handleOAuthCallback(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const code = parsedUrl.query.code;

        if (!code) {
            this.log.error('OAuth 콜백 오류: 인증 코드를 받지 못했습니다.');
            res.writeHead(400);
            return res.end('OAuth Error: No code received.');
        }

        try {
            const tokenData = await this.exchangeCodeForToken(code);

            this.platform.accessToken = tokenData.access_token;
            this.platform.refreshToken = tokenData.refresh_token;
            this.platform.persistTokens();

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>인증 완료!</h1><p>Homebridge 로그를 확인하고 플러그인을 재시작하세요.</p>');

            this.httpServer.close(() => {
                this.log.info('OAuth 서버가 성공적으로 종료되었습니다.');
            });

            this.platform.discoverDevices();

        } catch (error) {
            this.log.error('인증 과정 중 치명적 오류:', error.message);
            res.writeHead(500);
            res.end('<h1>Token Exchange Failed.</h1>');
        }
    }

    async exchangeCodeForToken(code) {
        const tokenUrl = 'https://api.smartthings.com/oauth/token';

        const authHeader = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', this.redirectUri);

        try {
            this.log.debug('토큰 교환 요청 중...');
            const response = await axios.post(tokenUrl, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${authHeader}`,
                    'Accept': 'application/json'
                }
            });

            this.log.info('토큰 교환 성공!');
            return response.data;
        } catch (error) {
            const status = error.response ? error.response.status : 'N/A';
            const errorData = error.response ? JSON.stringify(error.response.data) : 'No response data';

            this.log.error(`[${status}] 토큰 교환 실패 사유: ${errorData}`);
            throw new Error(`SmartThings API Error: ${status}`);
        }
    }
}

module.exports = OAuthServer;