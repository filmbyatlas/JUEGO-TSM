# TSM · Todos Somos Muslera

Juego de boxeo del grupo **KLK**. Controlas a **Muslera** (guantes rosas, guardia baja, no hace boxeo) e intentas ganarle a **Oscar** (guantes turquesa, guardia alta, sí hace boxeo). Tres asaltos de un minuto en el césped de la casa rural, con el público sentado, el perro, y la piscina para refrescarse entre asaltos.

Está pensado para que ganar sea muy difícil: en simulaciones, un jugador que aporrea botones no gana nunca, uno que ya controla el juego gana entre el 1 % y el 5 %, y uno muy bueno alrededor del 15 %.

## Jugar

Abre `index.html` en un navegador (móvil o escritorio). Todo va en un solo archivo; solo carga three.js desde un CDN para el 3D (si no hay WebGL, cae al render 2D).

Para publicarlo con un enlace: activa **GitHub Pages** en este repositorio (Settings → Pages → Branch `main`, carpeta `/`), y quedará en `https://filmbyatlas.github.io/JUEGO-TSM/`.

## Controles

| Acción | Teclado | Móvil |
|---|---|---|
| Moverse | `←` `→` o `A` `D` | ◀ ▶ |
| Jab | `J` o `Z` | JAB |
| Cruzado | `K` o `X` | CRUZ |
| Uppercut | `L` o `C` | UPPER |
| Esquivar | `Espacio` | ESQUIVA |
| Guardia (mantener) | `S` o `Shift` | GUARDIA |
| Levantarse tras una caída | machacar cualquier golpe | machacar cualquier botón |
| Pausa | `Esc` | ⏸ |

## Mecánicas

- **Muslera** lleva la guardia baja: su bloqueo tarda en subir y solo para el 55 % del golpe. A cambio el uppercut le sale muy rápido y es su golpe más fuerte.
- **Oscar** bloquea casi todo, reacciona a los golpes repetidos, remata cuando te aturde y castiga cuando quedas vendido.
- **Esquiva con timing**: si esquivas un golpe de Oscar, se queda vendido un segundo. Un golpe ahí es una CONTRA (×1,6 de daño, no se puede bloquear).
- **Oscar vacila**: cada 15–25 s, si va ganando con claridad, baja los brazos para mirar al público. Es la mejor ventana.
- **Piscina**: entre asaltos, una sola vez por pelea, Muslera mete la cabeza en la piscina: vida al máximo, aguante al máximo y 20 s de "fresquito" (más rápido, pega más).
- **Caídas**: a la tercera caída se acaba. Para levantarte hay que machacar botones antes del 10. Si no hay KO, deciden los jueces, que son amigos de Oscar.
- **Cinturones** por victorias acumuladas (se guardan en el navegador): 1 blanco, 3 amarillo, 5 naranja, 10 verde, 25 azul, 50 marrón y 100 el cinturón negro KLK.

## Frases épicas

Durante la pelea salen bocadillos (y voz sintetizada en español, desactivable con el botón 🗣️) con frases reales de los dos:

- Muslera: "Yo te puedo hablar en francés: como tú tapel, yo llameg Musler", "Un gordo en un súper es un súper gordo", "¡Y se la metí por detrás, por el culo, anal!" (cuando tumba a Oscar), "¿Bajas tío? Eh eh eh eh ¿bajas?" (con Oscar en el suelo o tras una contra).
- Oscar: "Compra BTC, bro", "Especular e invertir no es lo mismo, bro", "Soy Dios" (cuando tumba a Muslera), "¡Maritocracia!" (uppercuts y combos), "¡Viva Trump!" (cuando vacila).

## Desarrollo

```
src/sim.js     motor de combate (lógica pura, sin render; se usa también en Node)
src/draw3d.js  escenario, público, luchadores y piscina en 3D (three.js, low-poly, caras en textura)
src/draw.js    versión 2D de respaldo, retratos, cinturones y texturas de cara (canvas procedural)
src/audio.js   sonidos sintetizados con WebAudio
src/game.js    bucle, cámara, HUD, menús, entrada táctil y teclado, progreso
src/page.html  maquetación y estilos
build.js       genera index.html y dist/artifact.html
tools/calibrate.js   simula combates con bots de distinto nivel para medir la dificultad
tools/shot.js        recorre el juego con Playwright y hace capturas
```

```
node build.js
node tools/calibrate.js 200
```
