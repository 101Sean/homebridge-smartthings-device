const BaseAccessory = require('./BaseAccessory');

class SpeakerAccessory extends BaseAccessory {
    constructor(platform, accessory, device) {
        super(platform, accessory, device);

        const { Service, Characteristic } = this.platform.api.hap;

        this.speakerService = this.accessory.getService(Service.Speaker) ||
            this.accessory.addService(Service.Speaker, device.label, 'speakerService');

        // 음소거 (Characteristic.Mute)
        this.speakerService.getCharacteristic(Characteristic.Mute)
            .on('get', (callback) => {
                const isMuted = this.currentState.mute && this.currentState.mute.value === 'muted';
                callback(null, isMuted);
            })
            .on('set', async (value, callback) => {
                const command = value ? 'mute' : 'unmute';
                await this.sendSmartThingsCommand('audioMute', command);
                this.currentState.mute.value = command === 'mute' ? 'muted' : 'unmuted';
                callback(null);
                this.updateHomeKitCharacteristics();
            });

        // 볼륨 (Characteristic.Volume)
        this.speakerService.getCharacteristic(Characteristic.Volume)
            .on('get', (callback) => {
                const volume = this.currentState.volume && parseInt(this.currentState.volume.value, 10);
                callback(null, volume || 0);
            })
            .on('set', async (value, callback) => {
                await this.sendSmartThingsCommand('audioVolume', 'setVolume', [value]);
                this.currentState.volume.value = String(value);
                callback(null);
                this.updateHomeKitCharacteristics();
            });
    }

    updateHomeKitCharacteristics() {
        const isMuted = this.currentState.mute && this.currentState.mute.value === 'muted';
        const volume = this.currentState.volume && parseInt(this.currentState.volume.value, 10);

        this.speakerService.updateCharacteristic(this.Characteristic.Mute, isMuted);
        this.speakerService.updateCharacteristic(this.Characteristic.Volume, volume || 0);
    }
}

module.exports = SpeakerAccessory;