import { Service, Logger, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

import { AmbiClimatePlatform } from './platform';
import { AmbiClimateAirConditionAccessory } from './airconditionAccessory';
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
  private heatingThresholdTempature = 15;
  private coolingThresholdTempature = 25;
  private storagePath = this.platform.storagePath;
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
    const displayName = accessory.context.device.locationName + accessory.context.device.roomName;
    this.service.setCharacteristic(this.platform.Characteristic.Name, displayName);

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
      }
    });
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
      }
    });

    callback(null, this.isOn);
  }

  serviceActiveSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    
    const acswitch = this.platform.devicePair[this.uuid]['switch'] as AmbiClimateAirConditionAccessory;

    if (value === this.platform.Characteristic.Active.ACTIVE) {
      this.settings.value = this.currentTemperature;
      this.client.temperature(this.settings, null);
      
      // update basic switch 
      acswitch.switchServcie.updateCharacteristic(this.platform.Characteristic.On, true);
      acswitch.fanService.updateCharacteristic(this.platform.Characteristic.On, true);
      acswitch.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, 50.0);
      acswitch.isFanOn = true;
    } else {
      this.client.off(this.settings, null);

      // update basic switch 
      acswitch.switchServcie.updateCharacteristic(this.platform.Characteristic.On, false);
      acswitch.fanService.updateCharacteristic(this.platform.Characteristic.On, false);
      acswitch.fanService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, 0.0);
      acswitch.isFanOn = false;
    }

    callback(null);
  }

  serviceTargetHeaterCoolerStateGet(callback: CharacteristicGetCallback) {
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
      }

    });

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
    if (this.currentTemperature < value) {
      this.settings.value = value as number;
      this.client.temperature(this.settings, (err, data) => {
        if (err) {
          this.log.error('Get ac heating threshold failed.' + err + JSON.stringify(data));
        }
      });
    }

    this.heatingThresholdTempature = value as number;
    this.updateConfig();

    callback(null);
  }

  serviceCoolingThresholdTemperatureGet(callback: CharacteristicGetCallback) {
    callback(null, this.coolingThresholdTempature);
  }

  serviceCoolingThresholdTemperatureSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.currentTemperature > value) {
      this.settings.value = value as number;
      this.client.temperature(this.settings, (err, data) => {
        if (err) {
          this.log.error('Get ac heating threshold failed.' + err + JSON.stringify(data));
        }
      });
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
