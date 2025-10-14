const BaseAccessory = require('./BaseAccessory');

class SetTopAccessory extends BaseAccessory {
    constructor(platform, accessory, device) {
        super(platform, accessory, device);

        const { Service, Characteristic } = this.platform.api.hap;

        // 1. Television Service
        this.tvService = this.accessory.getService(Service.Television) ||
            this.accessory.addService(Service.Television, device.label, 'setTopService');

        this.tvService.setCharacteristic(Characteristic.ConfiguredName, device.label);
        this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
        this.tvService.setCharacteristic(Characteristic.PictureMode, Characteristic.PictureMode.OTHER);

        // 전원 On/Off (Characteristic.Active)
        this.tvService.getCharacteristic(Characteristic.Active)
            .on('get', (callback) => callback(null, this.currentState.switch.value === 'on' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE))
            .on('set', (value, callback) => this.setPowerState(value === Characteristic.Active.ACTIVE, callback));

        // 2. Speaker Service
        this.speakerService = this.accessory.getService(Service.Speaker) ||
            this.accessory.addService(Service.Speaker, device.label, 'speakerService');

        // 음소거, 볼륨 로직
        this.speakerService.getCharacteristic(Characteristic.Mute)
            .on('get', (callback) => callback(null, this.currentState.mute.value === 'muted'))
            .on('set', async (value, callback) => {
                await this.sendSmartThingsCommand('statelessAudioMuteButton', 'push');
                this.currentState.mute.value = value ? 'muted' : 'unmuted';
                callback(null);
                this.updateHomeKitCharacteristics();
            });

        this.speakerService.getCharacteristic(Characteristic.Volume)
            .setProps({ minValue: 0, maxValue: 100, minStep: 1 }) // 볼륨 범위 설정
            .on('get', (callback) => callback(null, parseInt(this.currentState.volume.value, 10)))
            .on('set', async (value, callback) => {
                this.currentState.volume.value = String(value);
                callback(null);
                this.updateHomeKitCharacteristics();
            });

        // 3. InputSource Service (Set-Top 아이콘 유도 및 기능 활성화)
        this.inputService = this.accessory.getService(Service.InputSource) ||
            this.accessory.addService(Service.InputSource, 'Set-Top Input', 'input1');

        this.inputService
            .setCharacteristic(Characteristic.Identifier, 1)
            .setCharacteristic(Characteristic.ConfiguredName, 'Set-Top Input')
            .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
            .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TUNER); // Set-Top에 적합한 유형

        // 4. 필수 연결 (Linking)
        this.tvService.addLinkedService(this.speakerService);
        this.tvService.addLinkedService(this.inputService);

        // 5. ActiveIdentifier (입력 소스 제어 활성화)
        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
            .on('get', (callback) => callback(null, 1));

        this.updateHomeKitCharacteristics();
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

module.exports = SetTopAccessory;