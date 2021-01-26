import { Service, Logger, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

import { AmbiClimatePlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AmbiClimateFeedbackAccessory {
  private feedbackServices: Array<Service> = [];
  private log: Logger;
  private client;
  private settings = {
    room_name: '',
    location_name: '',
    value: '',
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

    if (this.platform.config.showFeedbacks) {

      const feedbacks = [
        'too_hot',
        'too_warm',
        'bit_warm',
        'comfortable',
        'bit_cold',
        'too_cold',
        'freezing',
      ];

      const toTitleCase = (phrase) => {
        return phrase
          .toLowerCase()
          .replace('_', ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      };

      let i = 0;
      while (this.feedbackServices.length !== 7) {
        const name = 'feedback_' + feedbacks[i];
        const service = this.accessory.getService(name) ||
          this.accessory.addService(this.platform.Service.Switch, name, this.platform.api.hap.uuid.generate(name));

        service.setCharacteristic(this.platform.Characteristic.Name, toTitleCase(feedbacks[i]));

        this.feedbackServices.push(service);
        i += 1;
      }

      this.feedbackServices[0].getCharacteristic(this.platform.Characteristic.On)
        .on('get', this.feedbackServiceOnGet.bind(this))
        .on('set', this.feedbackServiceTooHotOnSet.bind(this));
      this.feedbackServices[1].getCharacteristic(this.platform.Characteristic.On)
        .on('get', this.feedbackServiceOnGet.bind(this))
        .on('set', this.feedbackServiceTooWarmOnSet.bind(this));
      this.feedbackServices[2].getCharacteristic(this.platform.Characteristic.On)
        .on('get', this.feedbackServiceOnGet.bind(this))
        .on('set', this.feedbackServiceBitWarmOnSet.bind(this));
      this.feedbackServices[3].getCharacteristic(this.platform.Characteristic.On)
        .on('get', this.feedbackServiceOnGet.bind(this))
        .on('set', this.feedbackServiceComfortableOnSet.bind(this));
      this.feedbackServices[4].getCharacteristic(this.platform.Characteristic.On)
        .on('get', this.feedbackServiceOnGet.bind(this))
        .on('set', this.feedbackServiceBitColdOnSet.bind(this));
      this.feedbackServices[5].getCharacteristic(this.platform.Characteristic.On)
        .on('get', this.feedbackServiceOnGet.bind(this))
        .on('set', this.feedbackServiceTooColdOnSet.bind(this));
      this.feedbackServices[6].getCharacteristic(this.platform.Characteristic.On)
        .on('get', this.feedbackServiceOnGet.bind(this))
        .on('set', this.feedbackServiceFreezingOnSet.bind(this));
    }
  }

  feedbackServiceTooHotOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (value === true) {
      this.settings.value = 'too_hot';
      this.client.feedback(this.settings, null);
      this.resetSwitches();
    }
    callback(null);
  }

  feedbackServiceTooWarmOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (value === true) {
      this.settings.value = 'too_warm';
      this.client.feedback(this.settings, null);
      this.resetSwitches();
    }
    callback(null);
  }

  feedbackServiceBitWarmOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (value === true) {
      this.settings.value = 'bit_warm';
      this.client.feedback(this.settings, null);
      this.resetSwitches();
    }
    callback(null);
  }

  feedbackServiceComfortableOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (value === true) {
      this.settings.value = 'comfortable';
      this.client.feedback(this.settings, null);
      this.resetSwitches();
    }
    callback(null);
  }

  feedbackServiceBitColdOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (value === true) {
      this.settings.value = 'bit_cold';
      this.client.feedback(this.settings, null);
      this.resetSwitches();
    }
    callback(null);
  }

  feedbackServiceTooColdOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (value === true) {
      this.settings.value = 'too_cold';
      this.client.feedback(this.settings, null);
      this.resetSwitches();
    }
    callback(null);
  }

  feedbackServiceFreezingOnSet(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (value === true) {
      this.settings.value = 'freezing';
      this.client.feedback(this.settings, null);
      this.resetSwitches();
    }
    callback(null);
  }

  feedbackServiceOnGet(callback: CharacteristicGetCallback) {
    // always false because we can't get current feedback via API
    callback(null, false);
  }

  resetSwitches() {
    // set back to off after 1 second
    setTimeout(() => {
      for (const feedback of this.feedbackServices) {
        feedback.updateCharacteristic(this.platform.Characteristic.On, false);
      }
    }, 1000);
  }
}
