# TSM · Todos Somos Muslera

Juego de boxeo del grupo **KLK**. Controlas a **Muslera** (guantes rosas, guardia baja, no hace boxeo) e intentas ganarle a **Oscar** (guantes turquesa, guardia alta, sí hace boxeo). Tres asaltos de un minuto en el césped de la casa rural, con el público sentado, el perro, y la piscina para refrescarse entre asaltos.

Está pensado para que ganar sea difícil pero entretenido: en simulaciones, sin cinturones un jugador normal le gana a Oscar algo más de una de cada cuatro veces. Con cada cinturón Oscar se pone un poco más serio (con el cinturón negro, un jugador normal gana una de cada seis).

## Jugar

Abre `index.html` en un navegador (móvil o escritorio). Todo va en un solo archivo; solo carga three.js desde un CDN para el 3D (si no hay WebGL, cae al render 2D).

Para publicarlo con un enlace: activa **GitHub Pages** en este repositorio (Settings → Pages → Branch `main`, carpeta `/`), y quedará en `https://filmbyatlas.github.io/JUEGO-TSM/`.

## Controles

| Acción | Teclado | Móvil |
|---|---|---|
| Moverse (todas las direcciones) | `W` `A` `S` `D` o flechas | joystick |
| Jab | `J` o `Z` | JAB |
| Cruzado | `K` o `X` | CRUZ |
| Uppercut | `L` o `C` | UPPER |
| Saltar (y pegar en el aire: puñetazo volador) | `Espacio` | SALTO |
| Agacharse (mantener) | `Ctrl` | AGACHAR |
| Esquivar | `Q` o `V` | ESQUIVA |
| Guardia (mantener) | `Shift` | GUARDIA |
| Levantarse tras una caída | machacar cualquier golpe | machacar cualquier botón |
| Pausa | `Esc` | ⏸ |

El movimiento es relativo a la pantalla: izquierda y derecha rodean al rival, arriba y abajo acercan y alejan.

## Mecánicas

- **Muslera** lleva la guardia baja: su bloqueo tarda en subir y solo para el 55 % del golpe. A cambio el uppercut le sale muy rápido y es su golpe más fuerte.
- **Oscar** bloquea casi todo, reacciona a los golpes repetidos, remata cuando te aturde y castiga cuando quedas vendido.
- **Esquiva con timing**: si esquivas un golpe de Oscar, se queda vendido un segundo. Un golpe ahí es una CONTRA (×1,6 de daño, no se puede bloquear).
- **Agacharse** esquiva los golpes altos (jab y cruzado) y deja a Oscar vendido si pega al aire. Si te quedas agachado, te castiga con el uppercut (que además hace más daño a un agachado).
- **Saltar** te saca del alcance del uppercut. Si pegas en el aire lanzas el puñetazo volador (mucho daño y empujón), pero Oscar puede bajarte de un jab y al aterrizar estás vendido medio segundo.
- **Oscar no arrincona**: si te lleva contra la pared, da un paso atrás y rodea. Tú puedes rodearle igual.
- **Oscar vacila**: cada 15–25 s, si va ganando con claridad, baja los brazos para mirar al público. Es la mejor ventana.
- **Piscina**: entre asaltos, una sola vez por pelea, Muslera mete la cabeza en la piscina: vida al máximo, aguante al máximo y 20 s de "fresquito" (más rápido, pega más).
- **Caídas**: a la tercera caída se acaba. Para levantarte hay que machacar botones antes del 10. Si no hay KO, deciden los jueces, que son amigos de Oscar.
- **Cinturones** por victorias acumuladas (se guardan en el navegador): 1 blanco, 3 amarillo, 5 naranja, 10 verde, 25 azul, 50 marrón y 100 el cinturón negro KLK.

## Frases épicas

Durante la pelea salen bocadillos (y voz sintetizada en español, desactivable con el botón 🗣️) con frases reales de los dos:

- Muslera: "Yo te puedo hablar en francés: como tú tapel, yo llameg Musler", "Un gordo en un súper es un súper gordo", "¡Y se la metí por detrás, por el culo, anal!" (cuando tumba a Oscar), "¿Bajas tío? Eh eh eh eh ¿bajas?" (con Oscar en el suelo o tras una contra).
- Oscar: "Compra BTC, bro", "Especular e invertir no es lo mismo, bro", "Soy Dios" (cuando tumba a Muslera), "¡Meritocracia!" (uppercuts y combos), "¡Viva Trump!" (cuando vacila).

## Desarrollo

```
src/sim.js     motor de combate (lógica pura, sin render; se usa también en Node)
src/anim.js    animación procedural: poses por estado, suavizado, muelles de reacción, ciclo de pasos
src/draw3d.js  escenario 360° (carpa, público, seto, casa, árbol, piscina), luchadores con IK en 3D, cámara
src/draw.js    versión 2D de respaldo, retratos, cinturones y texturas de cara (canvas procedural)
src/audio.js   sonidos sintetizados con WebAudio
src/game.js    bucle, cámara, HUD, menús, entrada táctil y teclado, progreso
src/page.html  maquetación y estilos
build.js       genera index.html y dist/artifact.html
tools/calibrate.js   simula combates con bots de distinto nivel para medir la dificultad
tools/shot.js        recorre el juego con Playwright y hace capturas
tools/strip.js       tiras de fotogramas de cada animación (para revisar la fluidez)
```

```
node build.js
node tools/calibrate.js 200 1 0      # 200 peleas, semilla 1, dificultad 0 (sin cinturones)
node tools/calibrate.js 200 1 1      # dificultad máxima (cinturón negro)
```
