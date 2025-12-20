const BaseAccessory = require('./BaseAccessory');

class TVAccessory extends BaseAccessory {
    constructor(platform, device) {
        super(platform, device);

        const hap = this.platform.api.hap;
        const { Service, Characteristic, Categories } = hap;

        this.isOn = false;

        const uuid = hap.uuid.generate(this.deviceId);
        this.accessory = new hap.platformAccessory(this.name, uuid);
        this.accessory.category = Categories.TELEVISION;

        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'SmartThings IR')
            .setCharacteristic(Characteristic.SerialNumber, this.deviceId);

        this.tvService = this.accessory.getService(Service.Television) ||
            this.accessory.addService(Service.Television, this.name);

        this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
        this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(() => this.isOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)
            .onSet(async (value) => {
                this.isOn = (value === Characteristic.Active.ACTIVE);
                await this.executeCommand('statelessPowerToggleButton', 'setButton', ['powerToggle']);
                this.tvService.updateCharacteristic(Characteristic.Active, value);
            });

        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .onSet(async (value) => {
                const cmdMap = {
                    [Characteristic.RemoteKey.ARROW_UP]: ['statelessAudioVolumeButton', 'volumeUp'],
                    [Characteristic.RemoteKey.ARROW_DOWN]: ['statelessAudioVolumeButton', 'volumeDown'],
                    [Characteristic.RemoteKey.ARROW_LEFT]: ['statelessChannelButton', 'channelDown'],
                    [Characteristic.RemoteKey.ARROW_RIGHT]: ['statelessChannelButton', 'channelUp'],
                    [Characteristic.RemoteKey.BACK]: ['statelessCustomButton', 'back'],
                    [Characteristic.RemoteKey.INFORMATION]: ['statelessCustomButton', 'menu']
                };

                if (cmdMap[value]) {
                    await this.executeCommand(cmdMap[value][0], 'setButton', [cmdMap[value][1]]);
                }
            });

        this.speakerService = this.accessory.getService(Service.TelevisionSpeaker) ||
            this.accessory.addService(Service.TelevisionSpeaker, `${this.name} Volume`);

        this.speakerService
            .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
            .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.RELATIVE);

        this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
            .onSet(async (value) => {
                const cmd = value === 0 ? 'volumeUp' : 'volumeDown';
                await this.executeCommand('statelessAudioVolumeButton', 'setButton', [cmd]);
            });

        this.speakerService.getCharacteristic(Characteristic.Mute)
            .onGet(() => false)
            .onSet(async () => {
                await this.executeCommand('statelessAudioMuteButton', 'setButton', ['muteToggle']);
            });

        this.tvService.addLinkedService(this.speakerService);

        this.platform.api.publishExternalAccessories('homebridge-smartthings-device', [this.accessory]);
    }
}

module.exports = TVAccessory;