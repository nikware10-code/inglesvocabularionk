# Inglés Vocabulario NK

App web para aprender las 503 palabras de inglés de 3º ESO (325 del libro de texto y 178 añadidas), con repaso espaciado, ejercicios y juego. by NIKWARE.

**Web:** https://nikware10-code.github.io/inglesvocabularionk/

## Qué hace
- 20 palabras nuevas al día, en bloques de 5, con repaso espaciado (SM-2 simplificado) y autoevaluación difícil / bien / fácil.
- Ejercicios: elegir opción, escribir, escuchar y completar la frase.
- Juego: XP, niveles, racha, insignias, contrarreloj y modo de palabras difíciles.
- Un perfil por persona. El progreso se guarda en el navegador, con exportar / importar.

## Archivos
- `index.html`: la página (estilos incluidos).
- `app.js`: toda la lógica, comentada en español.
- `words.js`: las palabras, que es lo que carga la app. Funciona incluso abriendo el archivo con doble clic.
- `words.json`: las mismas palabras en JSON, para editarlas cómodamente.
- `nikware-logo.webp`: el logo de la firma "by NIKWARE" (sale en el inicio, en la elección de perfil y en Ajustes).

Si cambias `words.json`, tienes dos opciones:
- Regenera `words.js` poniendo delante `window.VOCAB=` y un `;` al final.
- O borra la línea `<script src="words.js">` de `index.html` para que la app lea `words.json` directamente. Esto solo funciona con la app publicada en un servidor, no abriendo el archivo con doble clic.

## Publicación (GitHub Pages)
La web se publica sola desde este repositorio: rama `main`, carpeta `/ (root)`.
Para actualizarla: *Add file* → *Upload files* → arrastrar el archivo cambiado con el mismo nombre → *Commit changes*. En 1-2 minutos se ve el cambio en la web.

## Cómo guarda el progreso
- Se guarda en el navegador de cada dispositivo, con un perfil por persona.
- Para cambiar de móvil o hacer copia de seguridad: *Ajustes* → *Exportar*, y en el otro dispositivo *Importar*.
- Si se borran los datos del navegador se pierde el progreso. Conviene exportar de vez en cuando.
