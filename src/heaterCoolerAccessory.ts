import { Service, Logger, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

import { AmbiClimatePlatform } from './platform';
import { AmbiClimateAirConditionerAccessory } from './airConditionerAccessory';
import fs from 'fs';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AmbiClimateHeaterCoolerAccessory {
  public service: Service;
  private log: Logger;
  private client;

  private currentTemperature = 0.0;
  public isOn = false;
  private targetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
  private currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
  private heatingThresholdTempature = 18;
  private coolingThresholdTempature = 25;
  private storagePath = this.platform.storagePath;
  private experimental = false;
  private displayName = '';
  private uuid = '';
  private settings = {
    room_name: '',
    location_name: '',
    value: 20,
  };

  constructor(
    private readonly platform: AmbiClimatePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    this.log = this.platform.log;
    this.client = this.platform.client;
    this.experimental = this.platform.experimental;

    this.settings.room_name = this.accessory.context.device.roomName;
    this.settings.location_name = this.accessory.context.device.locationName;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Ambi')
      .setCharacteristic(this.platform.Characteristic.Model, 'AmbiClimate')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID.split('-')[4]);

    // get services if it exists, otherwise create a new service
    this.service = this.accessory.getService(this.platform.Service.HeaterCooler) ||
      this.accessory.addService(this.platform.Service.HeaterCooler);

    // set the service name, this is what is displayed as the default name on the Home app
    this.displayName = `${accessory.context.device.locationName} ${accessory.context.device.roomName}`;
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.displayName);

    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .on('get', this.serviceActiveGet.bind(this))
      .on('set', this.serviceActiveSet.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', this.serviceCurrentTemperatureGet.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .on('get', this.serviceCurrentHeaterCoolerStateGet.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .on('get', this.serviceTargetHeaterCoolerStateGet.bind(this))
      .on('set', this.serviceTargetHeaterCoolerStateSet.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature) // 0~25
      .on('get', this.serviceHeatingThresholdTemperatureGet.bind(this))
      .on('set', this.serviceHeatingThresholdTemperatureSet.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature) // 10~35
      .on('get', this.serviceCoolingThresholdTemperatureGet.bind(this))
      .on('set', this.serviceCoolingThresholdTemperatureSet.bind(this));

    this.setupConfig();

    this.uuid = this.platform.api.hap.uuid.generate(this.settings.location_name + this.settings.room_name);
    if (!this.platform.devicePair[this.uuid]) {
      this.platform.devicePair[this.uuid] = {
        'heaterCooler': this,
      };
    } else {
      this.platform.devicePair[this.uuid]['heaterCooler'] = this;
    }

    setInterval(() => {
      this.client = this.platform.client;
    }, 1000 * 60 * 60);
  }

  serviceCurrentTemperatureGet(callback: CharacteristicGetCallback) {
    if (!this.experimental) {
      this.client.sensor_temperature(this.settings, (err, data) => {
        if (!err && typeof data === 'object') {
          try {
            this.currentTemperature = data[0].value;
            this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, data[0].value);
          } catch (error) {
            if (data) {
              this.log.error('Get ac current temperature failed.' + JSON.stringify(data));
            } else {
              this.log.error('Get ac current temperature failed.' + error);
            }
          }
        } else {
          if (typeof data === 'string' && data.includes('Just a moment...')) {
            this.log.warn('Get ac current temperature API is busy, please try again later.');
          } else {
            this.log.error('Get ac current temperature failed.' + err);
          }
        }
      });
    } else {
      const deviceInfo = this.client.getDeviceInfo(this.displayName);
      this.currentTemperature = deviceInfo.temperature;
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, deviceInfo.temperature);
    }

    callback(null, this.currentTemperature);
  }

  serviceCurrentHeaterCoolerStateGet(callback: CharacteristicGetCallback) {
    switch (this.targetHeaterCoolerState) {
      case this.platform.Characteristic.TargetHeaterCoolerState.AUTO:
        this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.HEAT:
        this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
        break;
      default:
        break;
    }

    callback(null, this.currentHeaterCoolerState);
  }

  serviceActiveGet(callback: CharacteristicGetCallback) {
    if (!this.experimental) {
      this.client.mode(this.settings, (err, data) => {
        if (!err && typeof data === 'object') {
          try {
            this.isOn = data.mode !== 'Off' && data.mode !== 'Manual';
            const state = this.isOn ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE;
            this.service.updateCharacteristic(this.platform.Characteristic.Active, state);
          } catch (error) {
            if (data) {
              this.log.error('Get ac current active failed.' + JSON.stringify(data));
            } else {
              this.log.error('Get ac current active failed.' + error);
            }
          }
        } else {
          if (typeof data === 'string' && data.includes('Just a moment...')) {
            this.log.warn('Get ac current active status API is busy, please try again later.');
          } else {
            this.log.error('Get ac current active status failed.' + err);
          }
        }
      });
    } else {
      const deviceInfo = this.client.getDeviceInfo(this.displayName);
      this.isOn = deviceInfo.mode !== 'Off' && deviceInfo.mode !== 'Manual';
      const state = this.isOn ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE;
      this.service.updateCharacteristic(this.platform.Characteristic.Active, state);
    }

    callback(null, this.isOn);
  }

  serviceActiveSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    const acSwitch = this.platform.devicePair[this.uuid]['switch'] as AmbiClimateAirConditionerAccessory;
    if (value === this.platform.Characteristic.Active.ACTIVE) {
      this.settings.value = this.currentTemperature;

      if (!this.experimental) {
        this.client.temperature(this.settings, null);
      } else {
        this.client.setDeviceTemperature(this.displayName, this.settings.value);
      }

      // update basic switch 
      acSwitch.switchServcie.updateCharacteristic(this.platform.Characteristic.On, true);
      acSwitch.fanService.updateCharacteristic(this.platform.Characteristic.On, true);
      acSwitch.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, 50.0);
      acSwitch.isFanOn = true;
    } else {
      if (!this.experimental) {
        this.client.off(this.settings, null);
      } else {
        this.client.setDeviceSwitch(this.displayName, false).then(() => {
          this.client.fetchStatus(true);
        });
      }

      // update basic switch 
      acSwitch.switchServcie.updateCharacteristic(this.platform.Characteristic.On, false);
      acSwitch.fanService.updateCharacteristic(this.platform.Characteristic.On, false);
      acSwitch.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, 0.0);
      acSwitch.isFanOn = false;
    }

    callback(null);
  }

  serviceTargetHeaterCoolerStateGet(callback: CharacteristicGetCallback) {
    if (!this.experimental) {
      this.client.mode(this.settings, (err, data) => {
        if (!err && typeof data === 'object') {
          try {
            if (data.mode !== 'Off' && data.mode !== 'Manual') {
              this.client.appliance_states(this.settings).then(data => {
                switch (data.data[0].mode) {
                  case 'Heat':
                    this.targetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
                    this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
                    break;
                  case 'Cool':
                    this.targetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.COOL;
                    this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
                    break;
                  default:
                    this.targetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
                    this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
                    break;
                }

                this.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, this.targetHeaterCoolerState);
              });
            }
          } catch (error) {
            if (data) {
              this.log.error('Get ac target status failed.' + JSON.stringify(data));
            } else {
              this.log.error('Get ac target status failed.' + error);
            }
          }
        } else {
          if (typeof data === 'string' && data.includes('Just a moment...')) {
            this.log.warn('Get target heater cooler status API is busy, please try again later.');
          } else {
            this.log.error('Get target heater cooler status failed.' + err);
          }
        }
      });
    } else {
      const deviceInfo = this.client.getDeviceInfo(this.displayName);
      if (deviceInfo.mode !== 'Off' && deviceInfo.mode !== 'Manual') {
        switch (deviceInfo.appliance_mode) {
          case 'Heat':
            this.targetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
            this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
            break;
          case 'Cool':
            this.targetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.COOL;
            this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
            break;
          default:
            this.targetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
            this.currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
            break;
        }

        this.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, this.targetHeaterCoolerState);
      }
    }

    callback(null, this.targetHeaterCoolerState);
  }

  serviceTargetHeaterCoolerStateSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // Ambi Climate API doesn't provide a way to set heat or cool mode. 
    this.targetHeaterCoolerState = value as number;
    callback(null);
  }

  serviceHeatingThresholdTemperatureGet(callback: CharacteristicGetCallback) {
    callback(null, this.heatingThresholdTempature);
  }

  serviceHeatingThresholdTemperatureSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // Ambi Climate API doesn't support temperature > 32C.
    if (value > 32.0) {
      value = 32.0;
    }
    if (this.currentTemperature < value) {
      this.settings.value = value as number;

      if (!this.experimental) {
        this.client.temperature(this.settings, (err, data) => {
          if (err) {
            this.log.error('Set ac heating threshold failed.' + err + JSON.stringify(data));
          }
        });
      } else {
        this.client.setDeviceTemperature(this.displayName, this.settings.value).then(() => {
          this.client.fetchStatus(true);
        });
      }
    }

    this.heatingThresholdTempature = value as number;
    this.updateConfig();

    callback(null);
  }

  serviceCoolingThresholdTemperatureGet(callback: CharacteristicGetCallback) {
    callback(null, this.coolingThresholdTempature);
  }

  serviceCoolingThresholdTemperatureSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // Ambi Climate API doesn't support temperature < 18C.
    if (value < 18.0) {
      value = 18.0;
    }
    if (this.currentTemperature > value) {
      this.settings.value = value as number;

      if (!this.experimental) {
        this.client.temperature(this.settings, (err, data) => {
          if (err) {
            this.log.error('Set ac heating threshold failed.' + err + JSON.stringify(data));
          }
        });
      } else {
        this.client.setDeviceTemperature(this.displayName, this.settings.value).then(() => {
          this.client.fetchStatus(true);
        });
      }
    }

    this.coolingThresholdTempature = value as number;
    this.updateConfig();

    callback(null);
  }

  setupConfig() {
    if (fs.existsSync(this.storagePath)) {
      try {

        let data = fs.readFileSync(this.storagePath, 'utf8');
        data = JSON.parse(data);

        if (data[this.accessory.UUID]) {
          this.heatingThresholdTempature = data[this.accessory.UUID].heatingThresholdTempature;
          this.coolingThresholdTempature = data[this.accessory.UUID].coolingThresholdTempature;
        } else {
          data[this.accessory.UUID] = {};
          data[this.accessory.UUID].heatingThresholdTempature = this.heatingThresholdTempature;
          data[this.accessory.UUID].coolingThresholdTempature = this.coolingThresholdTempature;
        }

      } catch (error) {
        this.log.error('Cannot read file from data. Please check content of ' +
          this.storagePath +
          ' ,or remove it to create a new one automatically.');
      }
    } else {
      this.log.info('Cannot found config file, create a new one');

      try {
        const data = {
          [this.accessory.UUID]: {
            'heatingThresholdTempature': this.heatingThresholdTempature,
            'coolingThresholdTempature': this.coolingThresholdTempature,
          },
        };

        fs.writeFile(this.storagePath, JSON.stringify(data), (error) => {
          if (error) {
            this.log.error('Cannot create new file to path: ' + this.storagePath);
          } else {
            this.log.info('Created new file to path: ' + this.storagePath);
          }
        });
      } catch (error) {
        this.log.error('Cannot create new file to path: ' + this.storagePath + error);
      }
    }
  }

  updateConfig() {
    try {
      const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
      data[this.accessory.UUID].heatingThresholdTempature = this.heatingThresholdTempature;
      data[this.accessory.UUID].coolingThresholdTempature = this.coolingThresholdTempature;

      fs.writeFileSync(this.storagePath, JSON.stringify(data), 'utf8');

    } catch (error) {
      this.log.error('Cannot write file from data. Please check content of ' +
        this.storagePath +
        ' ,or remove it to create a new one automatically.' + error);
    }
  }
}
