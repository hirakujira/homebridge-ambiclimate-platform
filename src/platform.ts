import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { AmbiClimateClient } from './client';
import { AmbiClimateAirConditionerAccessory } from './airConditionerAccessory';
import { AmbiClimateFeedbackAccessory } from './feedbackAccessory';
import { AmbiClimateHeaterCoolerAccessory } from './heaterCoolerAccessory';
import ambiclimate from 'node-ambiclimate';

export interface Device {
  roomName: string;
  locationName: string;
}

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class AmbiClimatePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  public client;
  public storagePath = '';
  public devicePair = {};
  public experimental = false;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      this.storagePath = api.user.storagePath() + '/' + 'ambiclimate_settings.json';

      if (!this.checkConfigValid()) {
        this.log.error('Config file is not valid, please check.');
        return;
      }

      if (this.config.experimental) {
        this.log.info('Experimental mode enabled');
        this.experimental = true;
        this.client = new AmbiClimateClient(this);
        this.client.start();
      } else {
        this.startClient();
      }

      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  checkConfigValid() {
    return this.config.clientId && this.config.clientSecret && this.config.username && this.config.password;
  }

  startClient() {
    this.client = new ambiclimate(
      this.config.clientId,
      this.config.clientSecret,
      this.config.username,
      this.config.password,
    );
    
    // Re-login every 6 hours
    setInterval(() => {
      this.client = null;
      this.client = new ambiclimate(
        this.config.clientId,
        this.config.clientSecret,
        this.config.username,
        this.config.password,
      );
      this.log.debug('Re-login');
    }, 1000 * 60 * 60 * 6);

    if (this.client) {
      this.log.debug('Login successful!');
    }
  }

  discoverDevices() {

    const devices = this.config.accessories ? this.config.accessories : [];

    // Cleanup removed accessories
    for (const existingAccessory of this.accessories) {
      let accessoryFound = false;

      for (const device of devices as Array<Device>) {
        const uuid = this.api.hap.uuid.generate(device.locationName + device.roomName);
        const feedbackUuid = this.api.hap.uuid.generate(device.locationName + device.roomName + 'feedback');
        const heaterCoolerUuid = this.api.hap.uuid.generate(device.locationName + device.roomName + 'heatercooler');
        if (existingAccessory.UUID === uuid ||
          (this.config.showFeedbacks && existingAccessory.UUID === feedbackUuid) ||
          (this.config.heaterCoolerMode && existingAccessory.UUID === heaterCoolerUuid)
        ) {
          accessoryFound = true;
        }
      }

      if (!accessoryFound) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      }
    }

    for (const device of devices as Array<Device>) {

      const uuid = this.api.hap.uuid.generate(device.locationName + device.roomName);
      const feedbackUuid = this.api.hap.uuid.generate(device.locationName + device.roomName + 'feedback');
      const heaterCoolerUuid = this.api.hap.uuid.generate(device.locationName + device.roomName + 'heatercooler');
      this.log.debug(uuid);
      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        // the accessory already exists
        if (device) {
          // create the accessory handler for the restored accessory
          new AmbiClimateAirConditionerAccessory(this, existingAccessory);

          // update accessory cache with any changes to the accessory details and information
          this.api.updatePlatformAccessories([existingAccessory]);
        }
      } else {

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.locationName + device.roomName, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        new AmbiClimateAirConditionerAccessory(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      if (this.config.showFeedbacks) {

        // copy above code
        const existingFeedback = this.accessories.find(accessory => accessory.UUID === feedbackUuid);

        if (existingFeedback) {

          if (device) {
            new AmbiClimateFeedbackAccessory(this, existingFeedback);
            this.api.updatePlatformAccessories([existingFeedback]);
          }
        } else {
          const accessory = new this.api.platformAccessory(device.locationName + device.roomName + ' Feedbacks', feedbackUuid);
          accessory.context.device = device;

          this.log.info(accessory.UUID);

          new AmbiClimateFeedbackAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }

      if (this.config.heaterCoolerMode) {

        // copy above code
        const existingCoolerHeater = this.accessories.find(accessory => accessory.UUID === heaterCoolerUuid);

        if (existingCoolerHeater) {

          if (device) {
            new AmbiClimateHeaterCoolerAccessory(this, existingCoolerHeater);
            this.api.updatePlatformAccessories([existingCoolerHeater]);
          }
        } else {
          const accessory = new this.api.platformAccessory(device.locationName + device.roomName + ' CoolerHeater', heaterCoolerUuid);
          accessory.context.device = device;

          this.log.info(accessory.UUID);

          new AmbiClimateHeaterCoolerAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    }
  }
}
