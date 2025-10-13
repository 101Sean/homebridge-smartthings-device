const BaseAccessory = require('./BaseAccessory');
const { Service, Characteristic } = require('homebridge');

class TVAccessory extends BaseAccessory {
    constructor(platform, accessory, device) {
        super(platform, accessory, device);

        // IR OCF 장치이므로 전원 상태 초기화
        if (!this.currentState.switch) { this.currentState.switch = { value: 'off' }; }
        if (!this.currentState.mute) { this.currentState.mute = { value: 'unmuted' }; }
        if (!this.currentState.volume) { this.currentState.volume = { value: '50' }; }

        this.tvService = this.accessory.getService(Service.Television) ||
            this.accessory.addService(Service.Television, device.label, 'tvService');

        // ... (ConfiguredName, SleepDiscoveryMode, PictureMode 설정 - 생략)

        // 전원 On/Off (Characteristic.Active)
        this.tvService.getCharacteristic(Characteristic.Active)
            .on('get', (callback) => callback(null, this.currentState.switch.value === 'on' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE))
            .on('set', (value, callback) => this.setPowerState(value === Characteristic.Active.ACTIVE, callback));

        // Speaker Service 추가 (볼륨 및 음소거)
        this.speakerService = this.accessory.getService(Service.Speaker) ||
            this.accessory.addService(Service.Speaker, device.label, 'speakerService');

        // 음소거 (Characteristic.Mute) - statelessAudioMuteButton: push 사용
        this.speakerService.getCharacteristic(Characteristic.Mute)
            .on('get', (callback) => callback(null, this.currentState.mute.value === 'muted'))
            .on('set', async (value, callback) => {
                await this.sendSmartThingsCommand('statelessAudioMuteButton', 'push');
                // IR 장치는 상태를 알 수 없어 HomeKit에서 요청한 상태로 가정
                this.currentState.mute.value = value ? 'muted' : 'unmuted';
                callback(null);
                this.updateHomeKitCharacteristics();
            });

        // 볼륨 (Characteristic.Volume) - statelessAudioVolumeButton (증가/감소) 매핑
        this.speakerService.getCharacteristic(Characteristic.Volume)
            .on('get', (callback) => callback(null, parseInt(this.currentState.volume.value, 10)))
            .on('set', async (value, callback) => {
                this.currentState.volume.value = String(value);
                callback(null);
            });
    }

    updateHomeKitCharacteristics() {
        // TV 전원 상태 업데이트
        const powerState = this.currentState.switch.value === 'on' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
        this.tvService.updateCharacteristic(Characteristic.Active, powerState);

        // 스피커 상태 업데이트
        this.speakerService.updateCharacteristic(Characteristic.Mute, this.currentState.mute.value === 'muted');
        this.speakerService.updateCharacteristic(Characteristic.Volume, parseInt(this.currentState.volume.value, 10));
    }
}

module.exports = TVAccessory;