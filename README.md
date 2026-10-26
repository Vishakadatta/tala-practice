# Tala Practice

A browser-based Carnatic tala practice tool with animated hand models, synthesized audio, and support for Adi, Rupaka, Misra Chapu, and Khanda Chapu talas.

## Features

- 3D hand models showing correct tala gestures (clap, finger counts, wave)
- Synthesized clap/finger/wave sounds with adjustable tempo and volume
- Nadai subdivisions (3, 4, 5, 7, 9) and 2-kalai support for Adi
- Beat-position display with anga grouping
- No build step required: plain HTML, CSS, and ES modules

## Usage

Serve the directory over HTTP and open in a browser:

```
python3 -m http.server 8090
```

Then open `http://localhost:8090`.

Select a tala from the sidebar and press Start. Use the controls to adjust tempo, nadai, volume, or hide the hand models.

## Tech

- [Three.js](https://threejs.org/) r162 for 3D rendering (loaded via import map from jsDelivr)
- [WebXR Input Profiles](https://github.com/nicolewen/webxr-input-profiles) hand models (MIT)
- Web Audio API for synthesized percussion sounds
- No frameworks, no bundler, no dependencies to install

## License

MIT
