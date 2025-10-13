const BaseAccessory = require('./BaseAccessory');

class TVAccessory extends BaseAccessory {
    constructor(platform, accessory, device) {
        super(platform, accessory, device);

        const { Service, Characteristic } = this.platform.api.hap;

        this.tvService = this.accessory.getService(Service.Television) ||
            this.accessory.addService(Service.Television, device.label, 'tvService');

        this.tvService.setCharacteristic(Characteristic.ConfiguredName, device.label);
        this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
        this.tvService.setCharacteristic(Characteristic.PictureMode, Characteristic.PictureMode.OTHER);

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
                this.currentState.mute.value = value ? 'muted' : 'unmuted';
                callback(null);
                this.updateHomeKitCharacteristics();
            });

        // 볼륨 (Characteristic.Volume) - IR 장치는 토글 명령만 가능하므로 상태만 저장
        this.speakerService.getCharacteristic(Characteristic.Volume)
            .on('get', (callback) => callback(null, parseInt(this.currentState.volume.value, 10)))
            .on('set', async (value, callback) => {
                // 실제 명령 대신 볼륨 상태만 업데이트 (토글 명령으로 절대치 설정 불가)
                this.currentState.volume.value = String(value);
                callback(null);
                this.updateHomeKitCharacteristics();
            });
    }

    updateHomeKitCharacteristics() {
        // TV 전원 상태 업데이트
        const powerState = this.currentState.switch.value === 'on' ? this.Characteristic.Active.ACTIVE : this.Characteristic.Active.INACTIVE;
        this.tvService.updateCharacteristic(this.Characteristic.Active, powerState);

        // 스피커 상태 업데이트
        this.speakerService.updateCharacteristic(this.Characteristic.Mute, this.currentState.mute.value === 'muted');
        this.speakerService.updateCharacteristic(this.Characteristic.Volume, parseInt(this.currentState.volume.value, 10));
    }
}

module.exports = TVAccessory;