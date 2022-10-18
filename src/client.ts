import { Logger, PlatformConfig } from 'homebridge';

import { AmbiClimatePlatform } from './platform';

import FormData from 'form-data';
import axios from 'axios';

export interface DeviceInfo {
  device_id: string;
  location_name: string;
  room_name: string;
  temperature: number;
  humidity: number;
  fan: string;
  appliance_mode: string;
  mode: string;
}

export class AmbiClimateClient {
  private readonly baseUrl = 'https://rest.ambiclimate.com/';
  private log: Logger;
  private config: PlatformConfig;

  private lastUpdateTime = 0;
  private credentials = {
    user_id: '',
    token_id: '',
  };

  public devices: { [device_name: string]: DeviceInfo } = {};

  constructor(
    private readonly platform: AmbiClimatePlatform,
  ) {
    this.log = platform.log;
    this.config = platform.config;
  }

  async start() {
    await this.login();
    await this.fetchStatus();

    // Re-login every 3 days
    setInterval(() => {
      this.login();
    }, 1000 * 60 * 60 * 24 * 3);

    // Update every 5 minutes
    setInterval(() => {
      this.fetchStatus();
    }, 1000 * 60 * 5);
  }

  async login() {
    const formData = new FormData();
    formData.append('email', this.config.username);
    formData.append('pwd', this.config.password);

    await axios.request({
      method: 'post',
      url: 'UserCredential',
      baseURL: this.baseUrl,
      data: formData,
    }).then(response => {
      try {
        this.credentials.user_id = response.data.user_id;
        this.credentials.token_id = response.data.token_id;

        this.log.info('Login success');
      } catch (error) {
        if (error instanceof Error) {
          this.log.error(error.message);
        } else {
          this.log.error(error as string);
        }
      }
    }).catch(error => {
      if (error.response.status === 401) {
        this.log.error('Invalid password, please check.');
      } else if (error.response.status === 404) {
        this.log.error('Invalid email, please check.');
      } else {
        this.log.error(error);
      }
    });
  }

  async fetchStatus(force = false) {
    // Allow Update every 4 minutes and 30 seconds
    if (Date.now() - this.lastUpdateTime < 1000 * 60 * 4.5 && !force) {
      this.log.error('Skip fetching status');
      return;
    }

    await axios.request({
      method: 'get',
      url: 'User',
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.credentials.token_id}`,
      },
      params: {
        expand: 'appliance,device,location',
        user_id: this.credentials.user_id,
      },
    }).then(response => {
      const data = response.data;
      try {
        for (const device of data.devices) {
          if (device.operational && device.is_online) {
            const device_name = `${device.location.name} ${device.room_name}`;
            this.devices[device_name] = {
              device_id: device.device_id,
              location_name: device.location.name,
              room_name: device.room_name,
              temperature: device.sensors.temperature.data[0].value,
              humidity: device.sensors.humidity.data[0].value,
              fan: device.appliances[0].appliance_state.data[0].fan,
              appliance_mode: device.appliances[0].appliance_state.data[0].mode,
              mode: device.control_target.quantity,
            };
          }
        }

        this.lastUpdateTime = Date.now();
        this.log.error('Fetching status success');
      } catch (error) {
        if (error instanceof Error) {
          this.log.error(error.message);
        } else {
          this.log.error(error as string);
        }
      }
    }).catch(error => {
      this.log.error(error);
    });
  }

  getDeviceInfo(device_name: string) {
    if (!this.devices[device_name]) {
      this.devices[device_name] = {
        device_id: '',
        location_name: '',
        room_name: '',
        temperature: 0.0,
        humidity: 0.0,
        fan: 'Quiet',
        appliance_mode: '',
        mode: 'Off',
      };
    }
    return this.devices[device_name];
  }

  async setDeviceSwitch(device_name: string, on: boolean) {
    const mode = on ? 'Climate' : 'Off';
    const formData = new FormData();
    formData.append('device_id', this.devices[device_name].device_id);
    formData.append('quantity', mode);
    formData.append('value', '1.0');

    axios.request({
      method: 'put',
      url: 'AbsoluteApplianceControlTarget',
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.credentials.token_id}`,
      },
      data: formData,
    }).then(response => {
      try {
        this.devices[device_name].mode = response.data.quantity;
      } catch (error) {
        if (error instanceof Error) {
          this.log.error(error.message);
        } else {
          this.log.error(error as string);
        }
      }
    }).catch(error => {
      this.log.error(error);
    });
  }

  async setUserFeedBack(device_name: string, feedback: string) {
    let feedbackValue = 0;
    switch (feedback) {
      case 'too_hot':
        feedbackValue = 3;
        break;
      case 'too_warm':
        feedbackValue = 2;
        break;
      case 'bit_warm':
        feedbackValue = 1;
        break;
      case 'comfortable':
        feedbackValue = 0;
        break;
      case 'bit_cold':
        feedbackValue = -1;
        break;
      case 'too_cold':
        feedbackValue = -2;
        break;
      case 'freezing':
        feedbackValue = -3;
        break;
      default:
        break;
    }

    const formData = new FormData();
    formData.append('device_id', this.devices[device_name].device_id);
    formData.append('feedback', feedbackValue);
    formData.append('user_id', this.credentials.user_id);

    axios.request({
      method: 'put',
      url: 'UserFeedback',
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.credentials.token_id}`,
      },
      data: formData,
    }).then(response => {
      try {
        this.devices[device_name].mode = response.data.quantity;
      } catch (error) {
        if (error instanceof Error) {
          this.log.error(error.message);
        } else {
          this.log.error(error as string);
        }
      }
    }).catch(error => {
      this.log.error(error);
    });
  }

  async setDeviceTemperature(device_name: string, temperature: number) {
    const formData = new FormData();
    formData.append('device_id', this.devices[device_name].device_id);
    formData.append('quantity', 'Temperature');
    formData.append('value', temperature);

    axios.request({
      method: 'put',
      url: 'AbsoluteApplianceControlTarget',
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.credentials.token_id}`,
      },
      data: formData,
    }).then(response => {
      try {
        this.devices[device_name].mode = response.data.quantity;
      } catch (error) {
        if (error instanceof Error) {
          this.log.error(error.message);
        } else {
          this.log.error(error as string);
        }
      }
    }).catch(error => {
      this.log.error(error);
    });
  }
}
