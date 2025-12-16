const { Service, Characteristic, Categories, PlatformAccessory } = require('hap-nodejs');

class SetTopAccessory {
    constructor(platform, device) {
        this.platform = platform;
        this.log = platform.log;
        this.device = device;
        this.deviceId = device.deviceId;
        this.name = device.label || 'Set-Top';

        const uuid = platform.api.hap.uuid.generate(this.deviceId);
        this.accessory = new PlatformAccessory(this.name, uuid, Categories.TV_SET_TOP_BOX);

        // Accessory Information
        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings IR')
            .setCharacteristic(Characteristic.Model, device.presentationId || 'IR Set-Top')
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

        this.log.info(`[Set-Top] "${this.name}" published as EXTERNAL accessory`);
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

    async getActive() { return Characteristic.Active.ACTIVE; }

    async setActive(value) {
        if (value === Characteristic.Active.ACTIVE) {
            await this.executeCommand('statelessPowerToggleButton', 'push');
        }
    }

    async setRemoteKey(value) {
        switch (value) {
            case Characteristic.RemoteKey.ARROW_UP:
                await this.executeCommand('statelessAudioVolumeButton', 'volumeUp');
                break;
            case Characteristic.RemoteKey.ARROW_DOWN:
                await this.executeCommand('statelessAudioVolumeButton', 'volumeDown');
                break;
            case Characteristic.RemoteKey.ARROW_LEFT:
                await this.executeCommand('statelessChannelButton', 'channelDown');
                break;
            case Characteristic.RemoteKey.ARROW_RIGHT:
                await this.executeCommand('statelessChannelButton', 'channelUp');
                break;
            default:
                this.log.debug(`Unsupported RemoteKey: ${value}`);
                break;
        }
    }

    async setVolumeSelector(value) {
        const cmd = value === 0 ? 'volumeUp' : 'volumeDown';
        await this.executeCommand('statelessAudioVolumeButton', cmd);
    }

    async getMute() { return false; }

    async setMute(value) {
        await this.executeCommand('statelessAudioMuteButton', value ? 'mute' : 'unmute');
    }
}

module.exports = SetTopAccessory;