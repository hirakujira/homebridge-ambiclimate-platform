# Homebridge Ambi Climate Platform

Inspired by [homebridge-ambiclimate](https://github.com/alisdairjsmyth/homebridge-ambiclimate). This plugin supports these features for Ambi Climate devices:

* Show current temperature
* Show current relative humidity
* Show current fan state (High, Med, Low as percentage of rotation speed)
* Turn on and off - for comfortable mode
* Comfortable mode feedbacks
* Temperature mode

## Installation

After Homebridge has been installed:

`sudo npm i -g homebridge-ambiclimate-platform@latest`

You need to register an OAuth client in the [Ambi Dev Portal](https://api.ambiclimate.com/clients) by following the steps on the Quick Start page. Client ID and client Secret of that OAuth client are required, in order to use this plugin.

## Config

Simple config example:

```
{
    "bridge": {
    ...
    },
    "accessories": [
    ...
    ],
    "platforms": [{
        "platform": "AmbiClimatePlatform",
        "clientId": "00000000-1111-2222-3333-444444444444",
        "clientSecret": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "username": "example@gmail.com",
        "password": "password_here",
        "showFeedbacks": true,
        "accessories": [{
            "roomName": "Living Room",
            "locationName": "Taipei"
        }]
    }
    ]
}
```

## Options

| **Attributes** | **Required** | **Usage** | **Default** | **Options** |
|----------------|--------------|-----------|-------------|-------------|
| clientId | **YES** | OAuth client Id | 
| clientSecret | **YES** | OAuth client secret |
| username | **YES** | Your Ambi Climate account username | 
| password | **YES** | Your Ambi Climate account password | 
| showFeedbacks | | Show feedback options as switches. (Too Hot, Too Warm, Bit Warm, Comfortable, Bit Cold, Too Cold and Freezing) | false | true/false
| heaterCoolerMode | | Add device as heater cooler (air conditioner). <br>Notice: This would set Ambi Climate to temperature mode instead of comfort mode. Also, due to limitations of Ambi Climate APIs (which doesn't allow set to heat/cool mode manually), the status it shows may be different from your settings. | false | true/false
| experimental | | Enable experimental APIs. This can get rid off the API rate limit but may be unstable. | false | true/false
| accessories.roomName | **YES** | Device room name, must match the name within the Ambi Climate App |
| accessories.locationName | **YES** | Device location name, must match the name within the Ambi Climate App |

