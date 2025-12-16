const axios = require('axios');

class TVAccessory {
    constructor(platform, device) {
        this.platform = platform;
        this.log = platform.log;
        this.device = device;
        this.deviceId = device.deviceId;
        this.name = device.label || 'Smart TV';

        const { Service, Characteristic, Categories } = this.platform.api.hap;

        // 외부 액세서리 객체 생성
        const uuid = this.platform.api.hap.uuid.generate(this.deviceId);
        this.accessory = new this.platform.api.platformAccessory(this.name, uuid);
        this.accessory.category = Categories.TELEVISION;

        // 정보 서비스
        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings IR')
            .setCharacteristic(Characteristic.SerialNumber, this.deviceId);

        // TV 서비스
        this.tvService = this.accessory.addService(Service.Television, this.name);
        this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
        this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.ACTIVE)
            .onSet(this.setActive.bind(this));

        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .onSet(this.setRemoteKey.bind(this));

        // 스피커 서비스 (볼륨 조절용)
        this.speakerService = this.accessory.addService(Service.TelevisionSpeaker, `${this.name} Volume`);
        this.speakerService
            .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
            .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.RELATIVE);

        this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
            .onSet(this.setVolumeSelector.bind(this));

        this.tvService.addLinkedService(this.speakerService);

        // 외부 발행 (PLUGIN_NAME과 배열 형태 확인)
        this.platform.api.publishExternalAccessories('homebridge-smartthings-device', [this.accessory]);
    }

    async executeCommand(capability, command, args = []) {
        try {
            await axios.post(`https://api.smartthings.com/v1/devices/${this.deviceId}/commands`, {
                commands: [{ component: 'main', capability: capability, command: command, arguments: args }]
            }, {
                headers: { 'Authorization': `Bearer ${this.platform.accessToken}` }
            });
        } catch (error) {
            this.log.error(`[TV] 명령 실패: ${error.message}`);
        }
    }

    async setActive(value) {
        // IR 방식 Toggle 명령 전송s
        await this.executeCommand('statelessPowerToggleButton', 'push');
    }

    async setRemoteKey(value) {
        const { Characteristic } = this.platform.api.hap;
        switch (value) {
            case Characteristic.RemoteKey.ARROW_UP: await this.executeCommand('statelessAudioVolumeButton', 'volumeUp'); break;
            case Characteristic.RemoteKey.ARROW_DOWN: await this.executeCommand('statelessAudioVolumeButton', 'volumeDown'); break;
            case Characteristic.RemoteKey.ARROW_LEFT: await this.executeCommand('statelessChannelButton', 'channelDown'); break;
            case Characteristic.RemoteKey.ARROW_RIGHT: await this.executeCommand('statelessChannelButton', 'channelUp'); break;
            case Characteristic.RemoteKey.SELECT:
            case Characteristic.RemoteKey.PLAY_PAUSE:
                await this.executeCommand('statelessPowerToggleButton', 'push'); break;
        }
    }

    async setVolumeSelector(value) {
        const cmd = value === 0 ? 'volumeUp' : 'volumeDown';
        await this.executeCommand('statelessAudioVolumeButton', cmd);
    }
}

module.exports = TVAccessory;