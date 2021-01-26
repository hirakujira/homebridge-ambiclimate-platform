import { Service, Logger, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

import { AmbiClimatePlatform } from './platform';
import fs from 'fs';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AmbiClimateHeaterCoolerAccessory {
  private service: Service;
  private log: Logger;
  private client;
  private currentTemperature = 0.0;
  private isOn = false;
  private targetHeaterCoolerState = this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
  private currentHeaterCoolerState = this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
  private heatingThresholdTempature = 15;
  private coolingThresholdTempature = 25;
  private storagePath = this.platform.storagePath;
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
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.UUID.split('')[4]);

    // get services if it exists, otherwise create a new service
    this.service = this.accessory.getService(this.platform.Service.HeaterCooler) ||
      this.accessory.addService(this.platform.Service.HeaterCooler);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

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

  }

  serviceCurrentTemperatureGet(callback: CharacteristicGetCallback) {
    this.client.sensor_temperature(this.client.settings, (err, data) => {
      if (!err) {
        this.currentTemperature = data[0].value;
        this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, data[0].value);
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
    this.client.mode(this.settings).then(data => {
      this.isOn = data.mode !== 'Off' && data.mode !== 'Manual';
      const state = this.isOn ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE;
      this.service.updateCharacteristic(this.platform.Characteristic.Active, state);
    });

    callback(null, this.isOn);
  }

  serviceActiveSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {

    if (value === this.platform.Characteristic.Active.ACTIVE) {
      this.settings.value = this.currentTemperature;
      this.client.temperature(this.settings, null);
    } else {
      this.client.off(null);
    }

    // you must call the callback function
    callback(null);
  }

  serviceTargetHeaterCoolerStateGet(callback: CharacteristicGetCallback) {
    this.client.mode(this.settings).then(data => {
      if (data.mode !== 'Off' && data.mode !== 'Manual') {
        this.client.appliance_states(this.settings).then(data => {
          this.log.debug(data.data[0].mode);
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
      this.client.temperature(this.settings);
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
      this.client.temperature(this.settings);
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
