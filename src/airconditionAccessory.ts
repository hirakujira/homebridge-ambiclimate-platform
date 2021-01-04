import { Service, Logger, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

import { AmbiClimatePlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AmbiClimateAirConditionAccessory {
  private temperatureService: Service;
  private humidityService: Service;
  private fanService: Service;
  private switchServcie: Service;
  private log: Logger;
  private client;
  private currentTemperature = 0.0;
  private currentRelativeHumidity = 0.0;
  private rotationSpeed = 0;
  private isFanOn = false;
  private settings = {
    roomName: '',
    locationName: '',
  };

  constructor(
    private readonly platform: AmbiClimatePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    this.log = this.platform.log;
    this.client = this.platform.client;

    this.settings.roomName = this.accessory.context.device.roomName;
    this.settings.locationName = this.accessory.context.device.locationName;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Ambi')
      .setCharacteristic(this.platform.Characteristic.Model, 'AmbiClimate')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID.split('')[4]);

    // get services if it exists, otherwise create a new service
    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
      this.accessory.addService(this.platform.Service.TemperatureSensor);
    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) ||
      this.accessory.addService(this.platform.Service.HumiditySensor);
    this.fanService = this.accessory.getService(this.platform.Service.Fan) || this.accessory.addService(this.platform.Service.Fan);
    this.switchServcie = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);

    // set the service name, this is what is displayed as the default name on the Home app
    this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);
    this.humidityService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);
    this.fanService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);
    this.switchServcie.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

    this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', this.temperatureServiceCurrentTemperatureGet.bind(this));
    this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .on('get', this.humidityServiceCurrentRelativeHumidityGet.bind(this));
    this.fanService.getCharacteristic(this.platform.Characteristic.On)
      .on('get', this.fanServiceOnGet.bind(this))
      .on('set', this.fanServiceOnSet.bind(this));
    this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .on('get', this.fanServiceRotationSpeedGet.bind(this))
      .on('set', this.fanServiceRotationSpeedSet.bind(this));
    this.switchServcie.getCharacteristic(this.platform.Characteristic.On)
      .on('get', this.switchServiceOnGet.bind(this))
      .on('set', this.switchServiceOnSet.bind(this));
  }

  temperatureServiceCurrentTemperatureGet(callback: CharacteristicGetCallback) {
    this.client.sensor_temperature(this.client.settings, (err, data) => {
      if (!err) {
        this.currentTemperature = data[0].value;
        this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, data[0].value);
      }
    });
    callback(null, this.currentTemperature);
  }

  humidityServiceCurrentRelativeHumidityGet(callback: CharacteristicGetCallback) {
    this.client.sensor_humidity(this.client.settings, (err, data) => {
      if (!err) {
        this.currentRelativeHumidity = data[0].value;
        this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, data[0].value);
      }
    });

    callback(null, this.currentRelativeHumidity);
  }

  fanServiceOnGet(callback: CharacteristicGetCallback) {
    this.client.mode(this.settings).then(data => {
      switch (data.mode) {
        case 'Off':
        case 'Manual':
          this.isFanOn = false;
          this.fanService.updateCharacteristic(this.platform.Characteristic.On, false);
          break;
        default:
          this.isFanOn = true;
          this.fanService.updateCharacteristic(this.platform.Characteristic.On, true);
          break;
      }
    });

    callback(null, this.isFanOn);
  }

  fanServiceOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // no implementation
    setTimeout(() => {
      this.fanService.updateCharacteristic(this.platform.Characteristic.On, this.isFanOn);
    }, 1000);

    callback(null);
  }

  fanServiceRotationSpeedGet(callback: CharacteristicGetCallback) {
    this.client.mode(this.settings).then(data => {
      switch (data.mode) {
        case 'Off':
        case 'Manual':
          this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, 0);
          break;
        default:
          this.client.appliance_states(this.settings).then(data => {
            this.rotationSpeed = 0.0;
            switch (data.data[0].fan) {
              case 'High':
                this.rotationSpeed = 100.0;
                break;
              case 'Med-High':
                this.rotationSpeed = 75.0;
                break;
              case 'Auto':
              case 'Med':
                this.rotationSpeed = 50.0;
                break;
              case 'Quiet':
              case 'Med-Low':
                this.rotationSpeed = 38.0;
                break;
              case 'Low':
                this.rotationSpeed = 25.0;
                break;
              default:
                this.rotationSpeed = 0.0;
                break;
            }
            this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.rotationSpeed);
          });
          break;
      }
    });

    callback(null, this.rotationSpeed);
  }

  fanServiceRotationSpeedSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {

    // no implementation
    setTimeout(() => {
      this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.rotationSpeed);
    }, 1000);

    callback(null);
  }

  switchServiceOnGet(callback: CharacteristicGetCallback) {
    this.client.mode(this.settings, (err, data) => {
      if (!err) {
        this.switchServcie.updateCharacteristic(this.platform.Characteristic.On, data.mode !== 'Off' && data.mode !== 'Manual');
      }
    });

    callback(null, false);
  }

  switchServiceOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {

    if (value === true) {
      this.log.debug('Putting into comfort mode');
      this.client.comfort(this.settings, null);
    } else {
      this.log.debug('Turning off');
      this.client.off(null);
    }

    // you must call the callback function
    callback(null);
  }
}
