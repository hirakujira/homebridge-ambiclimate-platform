import { Service, Logger, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

import { AmbiClimatePlatform } from './platform';
import { AmbiClimateHeaterCoolerAccessory } from './heaterCoolerAccessory';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AmbiClimateAirConditionAccessory {
  private temperatureService: Service;
  private humidityService: Service;
  public fanService: Service;
  public switchServcie: Service;
  private log: Logger;
  private client;
  private currentTemperature = 0.0;
  private currentRelativeHumidity = 0.0;
  public rotationSpeed = 0;
  public isFanOn = false;
  private uuid = '';
  private settings = {
    room_name: '',
    location_name: '',
  };

  constructor(
    private readonly platform: AmbiClimatePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    this.log = this.platform.log;
    this.client = this.platform.client;

    this.settings.room_name = this.accessory.context.device.roomName;
    this.settings.location_name = this.accessory.context.device.locationName;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Ambi')
      .setCharacteristic(this.platform.Characteristic.Model, 'AmbiClimate')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID.split('-')[4]);

    // get services if it exists, otherwise create a new service
    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
      this.accessory.addService(this.platform.Service.TemperatureSensor);
    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) ||
      this.accessory.addService(this.platform.Service.HumiditySensor);
    this.fanService = this.accessory.getService(this.platform.Service.Fan) || this.accessory.addService(this.platform.Service.Fan);
    this.switchServcie = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);

    // set the service name, this is what is displayed as the default name on the Home app
    const displayName = accessory.context.device.locationName + accessory.context.device.roomName;
    this.temperatureService.setCharacteristic(this.platform.Characteristic.Name, displayName);
    this.humidityService.setCharacteristic(this.platform.Characteristic.Name, displayName);
    this.fanService.setCharacteristic(this.platform.Characteristic.Name, displayName);
    this.switchServcie.setCharacteristic(this.platform.Characteristic.Name, displayName);

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

    this.uuid = this.platform.api.hap.uuid.generate(this.settings.location_name + this.settings.room_name);
    if (!this.platform.devicePair[this.uuid]) {
      this.platform.devicePair[this.uuid] = {
        'switch': this,
      };
    } else {
      this.platform.devicePair[this.uuid]['switch'] = this;
    }
  }

  temperatureServiceCurrentTemperatureGet(callback: CharacteristicGetCallback) {
    this.client.sensor_temperature(this.settings, (err, data) => {
      if (!err) {
        try {
          this.currentTemperature = data[0].value;
          this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, data[0].value);
        } catch (error) {
          if (data) {
            this.log.error('Get current tempature failed.' + JSON.stringify(data));
          } else {
            this.log.error('Get current tempature failed.' + error);
          }
        }
      }
    });
    callback(null, this.currentTemperature);
  }

  humidityServiceCurrentRelativeHumidityGet(callback: CharacteristicGetCallback) {
    this.client.sensor_humidity(this.settings, (err, data) => {
      if (!err) {
        try {
          this.currentRelativeHumidity = data[0].value;
          this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, data[0].value);
        } catch (error) {
          if (data) {
            this.log.error('Get current relative humidity failed.' + JSON.stringify(data));
          } else {
            this.log.error('Get current relative humidity failed.' + error);
          }
        }
      }
    });

    callback(null, this.currentRelativeHumidity);
  }

  fanServiceOnGet(callback: CharacteristicGetCallback) {
    this.client.mode(this.settings, (err, data) => {
      if (!err) {
        try {
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
        } catch (error) {
          if (data) {
            this.log.error('Get current fan status failed.' + JSON.stringify(data));
          } else {
            this.log.error('Get current fan status failed.' + error);
          }
        }
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
    this.updateFanRotationSpeed();

    callback(null, this.rotationSpeed);
  }

  updateFanRotationSpeed() {
    this.client.mode(this.settings, (err, data) => {
      if (!err) {
        try {
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
        } catch (error) {
          if (data) {
            this.log.error('Get current rotation speed failed.' + JSON.stringify(data));
          } else {
            this.log.error('Get current rotation speed failed.' + error);
          }
        }
      }
    });
  }

  fanServiceRotationSpeedSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // no implementation for setter
    setTimeout(() => {
      this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.rotationSpeed);
    }, 1000);

    callback(null);
  }

  switchServiceOnGet(callback: CharacteristicGetCallback) {
    this.client.mode(this.settings, (err, data) => {
      if (!err) {
        try {
          this.switchServcie.updateCharacteristic(this.platform.Characteristic.On, data.mode !== 'Off' && data.mode !== 'Manual');
        } catch (error) {
          if (data) {
            this.log.error('Get switch status failed.' + JSON.stringify(data));
          } else {
            this.log.error('Get switch status failed.' + error);
          }
        }
      }
    });

    callback(null, false);
  }

  switchServiceOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {

    if (value === true) {
      this.log.debug('Putting into comfort mode');
      this.client.comfort(this.settings, (err, data) => {
        if (!err) {
          try {
            this.switchServcie.updateCharacteristic(this.platform.Characteristic.On, true);

            // update fan status
            this.isFanOn = true;
            this.fanService.updateCharacteristic(this.platform.Characteristic.On, true);
            this.updateFanRotationSpeed();

            // update heater cooler if exists
            if (this.platform.config.heaterCoolerMode) {
              const heaterCooler = this.platform.devicePair[this.uuid]['heaterCooler'];
              heaterCooler.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState,
                this.platform.Characteristic.TargetHeaterCoolerState.AUTO);
              heaterCooler.service.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState,
                this.platform.Characteristic.CurrentHeaterCoolerState.IDLE);
              heaterCooler.service.updateCharacteristic(this.platform.Characteristic.Active,
                this.platform.Characteristic.Active.ACTIVE);
              heaterCooler.isOn = true;
            }

          } catch (error) {
            if (data) {
              this.log.error('Set switch status failed.' + JSON.stringify(data));
            } else {
              this.log.error('Set switch status failed.' + error);
            }
          }
        }
      });
    } else {
      this.log.debug('Turning off');
      this.client.off(this.settings, (err, data) => {
        if (!err) {
          try {
            this.switchServcie.updateCharacteristic(this.platform.Characteristic.On, false);

            // update fan rstatus
            this.isFanOn = false;
            this.fanService.updateCharacteristic(this.platform.Characteristic.On, false);
            this.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, 0.0);
            this.rotationSpeed = 0.0;

            // update heater cooler if exists
            if (this.platform.config.heaterCoolerMode) {
              const heaterCooler = this.platform.devicePair[this.uuid]['heaterCooler'] as AmbiClimateHeaterCoolerAccessory;
              heaterCooler.service.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState,
                this.platform.Characteristic.CurrentHeaterCoolerState.IDLE);
              heaterCooler.service.updateCharacteristic(this.platform.Characteristic.Active,
                this.platform.Characteristic.Active.INACTIVE);
              heaterCooler.isOn = false;
            }

          } catch (error) {
            if (data) {
              this.log.error('Set switch status failed.' + JSON.stringify(data));
            } else {
              this.log.error('Set switch status failed.' + error);
            }
          }
        }
      });
    }

    // you must call the callback function
    callback(null);
  }
}
