# Dino3D

Juego de carreras infinitas en 3D inspirado en el dinosaurio de Chrome, desarrollado con Three.js y Vite.

## Ejecutar en tu equipo

Necesitás Node.js 20.19 o superior (o Node.js 22.12 o superior) y npm.

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

## Compilar para publicar

```sh
npm run build
npm run preview
```

La compilación se genera en `dist/`. Ese directorio puede publicarse en un servicio de alojamiento estático.

## Capturas y verificación

Con el servidor de desarrollo en ejecución:

```sh
npx playwright install chromium
node tools/qa.mjs
```

El script recorre escenarios del juego y guarda capturas e información de diagnóstico en `shots/`.
