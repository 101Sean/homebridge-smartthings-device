const { Service, Characteristic, Categories, PlatformAccessory } = require('hap-nodejs');

class TVAccessory {
    constructor(platform, device) {
        this.platform = platform;
        this.log = platform.log;
        this.device = device;
        this.deviceId = device.deviceId;
        this.name = device.label || 'Smart TV';

        const uuid = platform.api.hap.uuid.generate(this.deviceId);
        this.accessory = new PlatformAccessory(this.name, uuid, Categories.TELEVISION);

        // Accessory Information
        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings IR')
            .setCharacteristic(Characteristic.Model, device.presentationId || 'IR TV')
            .setCharacteristic(Characteristic.SerialNumber, this.deviceId);

        // Television Service
        this.tvService = new Service.Television(this.name);
        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(this.getActive.bind(this))
            .onSet(this.setActive.bind(this));

        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .onSet(this.setRemoteKey.bind(this));

        // TelevisionSpeaker (Home mini 볼륨 제어)
        this.speakerService = new Service.TelevisionSpeaker();
        this.speakerService
            .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
            .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.RELATIVE);

        this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
            .onSet(this.setVolumeSelector.bind(this));

        this.speakerService.getCharacteristic(Characteristic.Mute)
            .onGet(this.getMute.bind(this))
            .onSet(this.setMute.bind(this));

        this.tvService.addLinkedService(this.speakerService);
        this.accessory.addService(this.tvService);
        this.accessory.addService(this.speakerService);

        // External Publish
        this.platform.api.publishExternalAccessories([this.accessory]);

        this.log.info(`[TV] "${this.name}" published as EXTERNAL accessory`);
    }

    async executeCommand(capability, command, args = []) {
        const payload = {
            commands: [{
                component: 'main',
                capability: capability,
                command: command,
                arguments: args
            }]
        };
        await this.platform.client.devices.executeCommand(this.deviceId, payload);
    }

    async getActive() {
        // stateless라 상태 없음 → 항상 1 반환 (켜져 있다고 가정)
        return Characteristic.Active.ACTIVE;
    }

    async setActive(value) {
        if (value === Characteristic.Active.ACTIVE) {
            await this.executeCommand('statelessPowerToggleButton', 'push');
        }
    }

    async setRemoteKey(value) {
        switch (value) {
            // case Characteristic.RemoteKey.POWER_MODE: // 전원 (보통 Active에서 처리)
            case Characteristic.RemoteKey.REWIND:
            case Characteristic.RemoteKey.FAST_FORWARD:
            case Characteristic.RemoteKey.PLAY_PAUSE:
                break;
            case Characteristic.RemoteKey.ARROW_RIGHT:
                await this.executeCommand('statelessChannelButton', 'channelUp');
                break;
            case Characteristic.RemoteKey.ARROW_LEFT:
                await this.executeCommand('statelessChannelButton', 'channelDown');
                break;
            case Characteristic.RemoteKey.ARROW_UP:
                await this.executeCommand('statelessAudioVolumeButton', 'volumeUp');
                break;
            case Characteristic.RemoteKey.ARROW_DOWN:
                await this.executeCommand('statelessAudioVolumeButton', 'volumeDown');
                break;
            // INFORMATION, SELECT, BACK 등은 custom.button으로 매핑 가능
        }
    }

    async setVolumeSelector(value) {
        // VOLUME_UP = 0, VOLUME_DOWN = 1
        const cmd = value === 0 ? 'volumeUp' : 'volumeDown';
        await this.executeCommand('statelessAudioVolumeButton', cmd);
    }

    async getMute() {
        // 상태 없음 → false 반환
        return false;
    }

    async setMute(value) {
        if (value) {
            await this.executeCommand('statelessAudioMuteButton', 'mute');
        } else {
            await this.executeCommand('statelessAudioMuteButton', 'unmute');
        }
    }
}

module.exports = TVAccessory;