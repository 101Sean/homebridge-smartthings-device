const BaseAccessory = require('./BaseAccessory');
const { Service, Characteristic } = require('homebridge');

class SpeakerAccessory extends BaseAccessory {
    constructor(platform, accessory, device) {
        super(platform, accessory, device);

        this.speakerService = this.accessory.getService(Service.Speaker) ||
            this.accessory.addService(Service.Speaker, device.label, 'speakerService');

        // 음소거 (Characteristic.Mute)
        this.speakerService.getCharacteristic(Characteristic.Mute)
            .on('get', (callback) => {
                // SmartThings는 muted/unmuted 값을 사용합니다.
                const isMuted = this.currentState.mute && this.currentState.mute.value === 'muted';
                callback(null, isMuted);
            })
            .on('set', async (value, callback) => {
                const command = value ? 'mute' : 'unmute';
                await this.sendSmartThingsCommand('audioMute', command);
                callback(null);
            });

        // 볼륨 (Characteristic.Volume)
        this.speakerService.getCharacteristic(Characteristic.Volume)
            .on('get', (callback) => {
                const volume = this.currentState.volume && parseInt(this.currentState.volume.value, 10);
                callback(null, volume || 0);
            })
            .on('set', async (value, callback) => {
                // setVolume 명령은 인수로 볼륨 값을 받습니다.
                await this.sendSmartThingsCommand('audioVolume', 'setVolume', [value]);
                callback(null);
            });

        // Home Mini는 'switch' Capability가 없으므로 전원 상태는 생략합니다.
    }

    updateHomeKitCharacteristics() {
        const isMuted = this.currentState.mute && this.currentState.mute.value === 'muted';
        const volume = this.currentState.volume && parseInt(this.currentState.volume.value, 10);

        this.speakerService.updateCharacteristic(Characteristic.Mute, isMuted);
        this.speakerService.updateCharacteristic(Characteristic.Volume, volume || 0);
    }
}

module.exports = SpeakerAccessory;