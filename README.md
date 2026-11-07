# Tala Practice

- [Carnatic Tala Practice](https://vishakadatta.github.io/tala-practice/)
- [Hindustani Tala Practice](https://vishakadatta.github.io/tala-practice/hindustani/)

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

- [Three.js](https://threejs.org/) for 3D rendering (loaded via import map from jsDelivr, with integrity hashes)
- [WebXR Input Profiles](https://github.com/nicolewen/webxr-input-profiles) hand models (MIT)
- Web Audio API for synthesized percussion sounds
- Hindustani site: tabla recordings from [Naad](https://github.com/oormicreations/naad) by Oormi Creations (MIT, see `hindustani/assets/tabla/LICENSE`)
- No frameworks and no bundler. The sites run without installing anything; `npm` is only for the checks below.

## Checks

```
npm ci --ignore-scripts
npm test
```

A GitHub Actions workflow runs lint, integrity checks, security audit and CodeQL on every push. Twice a month, a maintenance workflow updates all dependencies to their latest versions, regenerates the integrity hashes and Content-Security-Policy, runs the full test suite and a headless smoke test (hand rendering, audio output, CSP compliance), and deploys automatically if everything passes. If anything fails, a GitHub issue is opened.

To report a security problem, see [SECURITY.md](SECURITY.md).

## License

Personal, non-commercial project; all rights reserved. The code is public only because free GitHub Pages hosting requires it. See [LICENSE](LICENSE). Third-party components keep their own licenses.
