# PhotoSim — depth of field calculator & simulator

**Website:** https://aleksandr-kai.github.io/photosim/ ·
**Русская версия:** https://aleksandr-kai.github.io/photosim/ru/ ·
**Android APK:** [download v1.0.0](https://github.com/Aleksandr-Kai/photosim/releases/download/v1.0.0/PhotoSim.apk)

PhotoSim is a free depth of field (DoF) calculator that draws the result to scale:
pick a real lens and sensor, set focal length, aperture and subject distance, and see
the near/far limits of sharpness, total depth of field and hyperfocal distance. Drag
the subject or the camera right in the scene. Works offline as an Android app.

- 100+ real lenses (Canon RF/EF, Nikon Z, Sony E, Fujifilm X, Micro Four Thirds, Sigma, Tamron)
- [Depth of field tables for every lens](https://aleksandr-kai.github.io/photosim/lenses/)
- Circle of confusion = sensor diagonal / 1500

## По-русски

**PhotoSim — бесплатный калькулятор ГРИП (глубины резко изображаемого пространства)** с
наглядной схемой: выберите объектив и матрицу, задайте фокусное расстояние, диафрагму и
дистанцию — и увидите ближнюю и дальнюю границы резкости, гиперфокальное расстояние.
[Калькулятор ГРИП онлайн](https://aleksandr-kai.github.io/photosim/ru/) ·
[таблицы ГРИП по объективам](https://aleksandr-kai.github.io/photosim/ru/lenses/).

## Development

The web app is `index.html` + `script.js` + `styles.css`; the Android app (`app/`) wraps
the same files in a WebView. The static SEO pages under `docs/` are generated:

```
node tools/build-seo-pages.js
```
