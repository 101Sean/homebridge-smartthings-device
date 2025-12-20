const axios = require('axios');

class SetTopAccessory {
    constructor(platform, device) {
        this.platform = platform;
        this.log = platform.log;
        this.device = device;
        this.deviceId = device.deviceId;
        this.name = device.label || 'Set-Top Box';

        const { Service, Characteristic, Categories } = this.platform.api.hap;
        this.isOn = false;

        // 외부 액세서리 객체 생성
        const uuid = this.platform.api.hap.uuid.generate(this.deviceId);
        this.accessory = new this.platform.api.platformAccessory(this.name, uuid);
        this.accessory.category = Categories.TV_SET_TOP_BOX;

        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings IR')
            .setCharacteristic(Characteristic.Model, device.presentationId || 'IR Set-Top')
            .setCharacteristic(Characteristic.SerialNumber, this.deviceId);

        this.tvService = this.accessory.addService(Service.Television, this.name);
        this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);

        // 전원 제어
        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(() => Characteristic.Active.ACTIVE)
            .onSet(this.setActive.bind(this));

        // 리모컨 버튼 제어
        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .onSet(this.setRemoteKey.bind(this));

        // TelevisionSpeaker (볼륨 제어)
        this.speakerService = this.accessory.addService(Service.TelevisionSpeaker, `${this.name} Volume`);
        this.speakerService
            .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
            .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.RELATIVE);

        this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
            .onSet(this.setVolumeSelector.bind(this));

        this.speakerService.getCharacteristic(Characteristic.Mute)
            .onGet(() => false)
            .onSet(this.setMute.bind(this));

        this.tvService.addLinkedService(this.speakerService);

        // 외부 발행
        this.platform.api.publishExternalAccessories('homebridge-smartthings-device', [this.accessory]);
    }

    // SmartThings API 명령 실행 함수
    async executeCommand(capability, command, args = []) {
        const url = `https://api.smartthings.com/v1/devices/${this.deviceId}/commands`;
        try {
            await axios.post(url, {
                commands: [{
                    component: 'main',
                    capability: capability,
                    command: command,
                    arguments: args
                }]
            }, {
                headers: { 'Authorization': `Bearer ${this.platform.accessToken}` }
            });
            this.log.debug(`[Set-Top] 명령 성공: ${command}`);
        } catch (error) {
            this.log.error(`[Set-Top] 명령 실패: ${error.message}`);
        }
    }

    async setActive(value) {
        const { Characteristic } = this.platform.api.hap;
        this.isOn = (value === Characteristic.Active.ACTIVE);

        await this.executeCommand('statelessPowerToggleButton', 'setButton', ['powerToggle']);
        this.tvService.updateCharacteristic(Characteristic.Active, value);
    }

    async setRemoteKey(value) {
        const { Characteristic } = this.platform.api.hap;
        switch (value) {
            case Characteristic.RemoteKey.ARROW_UP:
                await this.executeCommand('statelessAudioVolumeButton', 'setButton', ['volumeUp']);
                break;
            case Characteristic.RemoteKey.ARROW_DOWN:
                await this.executeCommand('statelessAudioVolumeButton', 'setButton', ['volumeDown']);
                break;
            case Characteristic.RemoteKey.ARROW_LEFT:
                await this.executeCommand('statelessChannelButton', 'setButton', ['channelDown']);
                break;
            case Characteristic.RemoteKey.ARROW_RIGHT:
                await this.executeCommand('statelessChannelButton', 'setButton', ['channelUp']);
                break;
            case Characteristic.RemoteKey.BACK:
                await this.executeCommand('statelessCustomButton', 'setButton', ['back']);
                break;
            case Characteristic.RemoteKey.INFORMATION:
                await this.executeCommand('statelessCustomButton', 'setButton', ['menu']);
                break;
            default:
                this.log.debug(`[Set-Top] 지원하지 않는 리모컨 키: ${value}`);
                break;
        }
    }

    async setVolumeSelector(value) {
        // 0: 볼륨 업, 1: 볼륨 다운
        const cmd = value === 0 ? 'volumeUp' : 'volumeDown';
        await this.executeCommand('statelessAudioVolumeButton', 'setButton', [cmd]);
    }

    async setMute(value) {
        await this.executeCommand('statelessAudioMuteButton', 'setButton', ['muteToggle']);
    }
}

module.exports = SetTopAccessory;