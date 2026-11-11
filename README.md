# Dino3D

Juego de carreras infinitas en 3D inspirado en el dinosaurio de Chrome, desarrollado con Three.js y Vite.

[![Verificación y publicación](https://github.com/ramirocarrasco317-hue/Dino3D/actions/workflows/verify-and-publish.yml/badge.svg)](https://github.com/ramirocarrasco317-hue/Dino3D/actions/workflows/verify-and-publish.yml)

## Jugar en el navegador

[Abrir Dino3D](https://ramirocarrasco317-hue.github.io/Dino3D/).

El enlace se habilita después del primer despliegue correcto en GitHub Pages.

## Ejecutar en tu equipo

Se recomienda Node.js 24 y npm. El proyecto también admite Node.js 20 desde 20.19 y Node.js 22 desde 22.12.

```sh
npm ci
npm run dev
```

Abrí la dirección que muestra Vite en la terminal (por defecto, `http://localhost:5173`).

## Controles

- **A / D** o **flechas izquierda / derecha**: cambiar de carril.
- **W**, **flecha arriba** o **espacio**: saltar.
- **S** o **flecha abajo**: agacharse.
- **Esc / P**: pausar.
- **Enter**: confirmar.
- **R**: reiniciar.
- En pantallas táctiles, deslizá para moverte, saltar o agacharte; tocá para saltar.
- Usá el botón de pausa de la esquina superior derecha para detener la partida.

## Compilar para publicar

```sh
npm run build
npm run preview
```

La compilación se genera en `dist/`. Ese directorio puede publicarse en un servicio de alojamiento estático.

## Verificación completa

Instalá el navegador de pruebas una vez:

```sh
npx playwright install chromium
```

Después ejecutá:

```sh
npm run verify
```

El comando compila el juego, ejecuta las pruebas de guardado, memoria, controles, pantallas y recuperación de errores, y captura todos los escenarios de QA. Las pruebas usan la compilación de `dist/` bajo `/Dino3D/`, igual que la publicación.

Un error de consola, una excepción, un escenario fallido o un filtro sin coincidencias hacen que la verificación termine con código de error. Las capturas y el reporte quedan en `shots/`.

Para usar un Chrome ya instalado en Windows en lugar del Chromium de Playwright:

```powershell
$env:DINO_BROWSER_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run verify
```

## Capturas individuales

Con el servidor de desarrollo en ejecución:

```sh
npx playwright install chromium
node tools/qa.mjs
```

El script recorre escenarios del juego y guarda capturas e información de diagnóstico en `shots/`.

También podés revisar la compilación sin iniciar un servidor manualmente:

```sh
npm run qa:production
npm run qa:production -- --only 16-pause
```

## Publicación automática

En GitHub, seleccioná **Settings → Pages → Source → GitHub Actions** una vez. El flujo `Verify and publish` verifica cada cambio a `main` y cada pull request. Publica `dist/` únicamente cuando pasan todas las comprobaciones de `main`; los pull requests nunca publican.

Cada ejecución conserva las capturas y el reporte de QA como artefacto durante siete días. Podés volver a ejecutar el flujo desde **Actions → Verify and publish → Run workflow**.

## Comprobación en dispositivos reales

Antes de una entrega, abrí el enlace publicado en una PC y en un celular real: jugá, saltá, cambiá de carril, agachate, pausá, girá el celular, abrí los logros y comprobá que el récord sobreviva a una recarga. `F3` muestra los FPS en PC. La emulación y las pruebas con renderizado por software verifican comportamiento y recursos; sus FPS no representan el rendimiento del celular.
