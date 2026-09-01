# open-english

> 📌 **Actualización (2026-08-27)**: Se añadió un «Rincón de desarrollo freelance» (100 idiomas, enlaces de búsqueda de empleo, traspaso al profesor de IA), una caja fuerte iframe de origen cruzado (`vault.html`) que aísla el token de GitHub y la clave de la API de Google Search de la página principal, una segunda dirección de correo de respaldo para el inicio de sesión, y un acceso directo para Chrome en modo incógnito. Se corrigieron dos errores reales (fuga de clave obsoleta, mensaje de estado engañoso en modo caja fuerte) hallados mediante pruebas en vivo. Detalles completos en las entradas del 2026-08-27 en CLAUDE.md (japonés).


*Español*: [README-Spanish.md](README-Spanish.md) ·
*Other languages*: [日本語](README.md) · [English](README-English.md) ·
[中文](README-Chinese.md) · [한국어](README-Korean.md) · [Deutsch](README-German.md) ·
[Italiano](README-Italian.md) · [Français](README-French.md) · [Русский](README-Russian.md) ·
[Українська](README-Ukrainian.md) · [עברית](README-Hebrew.md) ·
[فارسی](README-Persian.md) · [العربية](README-Arabic.md)

> 📌 **Última actualización (2026-08-24, cont.): autorreparación de DUAL DB
> (reintento automático de la bandeja de salida) + soporte TLS para PostgreSQL
> + soporte de HTTP HEAD**:
> - **Autorreparación de DUAL DB**: lo que antes se documentaba como "no
>   implementado" ahora está implementado. Una escritura en espejo que falla
>   se pone en cola en una tabla SQLite local `mirror_outbox` y se reintenta
>   automáticamente mediante una tarea en segundo plano (cada 60 s por
>   defecto). Cada fila se reintenta hasta 100 veces por defecto; las filas
>   que siguen fallando no se descartan en silencio — se marcan como
>   `give_up` y los contadores son visibles a través de `GET /v1/db/info`
>   (`mirror_outbox_pending`/`mirror_outbox_given_up`). **Límites honestos**:
>   solo se cubren las escrituras que este proceso intentó y falló él mismo —
>   las filas eliminadas directamente en el espejo, o los cambios hechos por
>   otra vía, no se pueden detectar. Los reintentos son simples INSERT, así
>   que es posible, en raras ocasiones, un duplicado por semántica
>   "al menos una vez".
> - **Soporte TLS**: se añadió `tokio-postgres-rustls` para que la conexión
>   espejo de PostgreSQL pueda usar `sslmode=require`, etc. contra una base
>   de datos gestionada (`sslmode=disable`, el valor por defecto, mantiene el
>   comportamiento en texto plano existente sin cambios).
> - **Soporte de HTTP HEAD**: el servidor de archivos estáticos ahora
>   responde correctamente a las solicitudes `HEAD` (antes devolvía 404/405,
>   lo cual importa en la práctica porque muchos clientes HTTP y
>   herramientas de comprobación de salud sondean con HEAD). Esto requirió
>   añadir `MethodRouter::head` a la fachada compartida `RPoem`
>   (`open-runo-poem-compat`) — puramente aditivo, no se cambió ninguna API
>   existente.
> - **Nuevo alias `/health`**: se añadió junto al `/healthz` existente para
>   que la forma de la comprobación de salud de esta app coincida con lo que
>   otros repositorios de este ecosistema esperan de forma genérica en su
>   patrón de registro de inquilinos "digital twin" (分身の術) (open-web-server /
>   open-easy-web).
> - `GET /v1/db/info` ahora reporta `rsync_available` (una comprobación real
>   de `rsync --version`) para que puedas verificar si rsync está disponible
>   antes de intentar `/v1/db/rsync-backup`.
> - Verificado con `cargo build`/`cargo test` (18/18 en verde) además de un
>   binario en ejecución real: `HEAD /` y `HEAD /app.js` devuelven el
>   Content-Length/Content-Type correcto con cuerpo vacío, `GET /health`
>   devuelve `{"ok":true}`, y `GET /v1/db/info` incluye `rsync_available`.

> 📌 **Última actualización (2026-08-24): una escuela virtual (educación
> superior) y una escuela virtual de formación profesional en línea**:
> - **🏫 Escuela virtual (educación superior)** te permite elegir una de
>   cuatro categorías — **escuela vocacional (senmon gakko), colegio
>   universitario de dos años, universidad (grado), posgrado** — y luego
>   instalar áreas dentro de ella. Las áreas instaladas generan **preguntas
>   de práctica originales** vagamente modeladas sobre exámenes de admisión,
>   clases y exámenes internos, y califican tus respuestas.
> - **🛠 Escuela vocacional virtual** funciona de la misma manera para áreas
>   de industria/ocupación, evaluando conocimientos básicos con **preguntas
>   originales**.
> - **Siete áreas funcionan realmente hoy, cinco preguntas cada una**:
>   universidad = humanidades y ciencias sociales / ciencias e ingeniería;
>   colegio universitario = tecnología de la información; posgrado =
>   fundamentos de investigación (planes de investigación, ética de la
>   investigación, entrevistas); formación profesional = fundamentos de TI y
>   programación / fundamentos de contabilidad / fundamentos de atención al
>   cliente.
> - **Todo lo demás dice honestamente "aún no está listo"** (administración
>   médica, cuidado de personas, belleza, cocina, construcción, **las cuatro
>   áreas del colegio universitario**, medicina y enfermería, educación,
>   especialización de posgrado en ingeniería, y más). Cada botón de
>   categoría muestra "N de M áreas disponibles" para que puedas ver la
>   cobertura antes de abrirlo.
> - Cada área lleva un enlace a una **página de resultados de búsqueda de
>   YouTube** para una palabra clave de estudio genérica. **Ningún video
>   específico se avala como correcto.**
> - **Divulgación honesta**: cada pregunta es original de esta app; nada se
>   copia de exámenes de admisión reales, libros de texto o cuadernos
>   comerciales. **Los ensayos, las entrevistas y las habilidades prácticas
>   solo se aproximan como preguntas de conocimiento de opción múltiple** y
>   no sustituyen retroalimentación real de ensayos ni práctica de
>   entrevistas. Las puntuaciones no predicen nada sobre admisiones o
>   calificaciones reales.
> - Las puntuaciones se guardan a través del endpoint de historial existente
>   (`/v1/db/history`); no se añadió ninguna API nueva.
> Consulta la entrada HANDOFF del 2026-08-24 en [CLAUDE.md](CLAUDE.md) para
> más detalles.

> 📌 **Última actualización (2026-08-23, cont. 6): un curso de tutoría mucho
> más grande**:
> - **13 grados, desde preescolar/jardín de infancia hasta 3º de secundaria
>   superior**, con nuevas preguntas originales de preescolar (palabras,
>   números, formas y colores — 14 en total). **Sin restricción por edad**:
>   un estudiante de secundaria superior o un adulto puede elegir el nivel
>   de preescolar desde el principio.
> - **Refuerzo rediseñado en torno a los grados, sin límite fijo.** Si fallas
>   una pregunta, primero trabajas las versiones más fáciles disponibles
>   **dentro del mismo grado**; cuando estas se agotan, pasas a la misma
>   materia **un grado más abajo** (los grados sin preguntas se omiten).
>   **No existe un número fijo de pasos en el código** — continúa mientras
>   exista material preparado, con **preescolar como piso**, donde se
>   detiene, muestra la respuesta y te remite al entrenador. "🍼 Mucho más
>   fácil" salta directamente al grado más bajo.
> - **"🔁 Cambiar de grado"** te permite cambiar de grado en cualquier
>   momento, en mitad de la práctica.
> - **Un grado sin preguntas sigue funcionando** — el curso recurre al grado
>   inferior más cercano que las tenga e indica honestamente de qué grado
>   proviene la pregunta.
> - **Orientación para configurar primero una base de datos de historial de
>   aprendizaje** (aruaru-db **o un PostgreSQL estándar**), además de notas
>   sobre base de datos dual, respaldo con rsync, Google Drive y
>   sincronización con hosting compartido/VPS. **Divulgación honesta**:
>   escribir en dos bases de datos a la vez no está implementado (la
>   configuración dual solo es posible a través del propio
>   `DUAL_DATABASE_URL` de aruaru-db), las conexiones se hacen sin TLS, y la
>   sincronización con Drive/VPS es algo que configuras tú mismo — nada se
>   sincroniza automáticamente. Buscamos el mecanismo de rsync en
>   `open-easy-web` y **no encontramos ninguno**; el respaldo rsync
>   incorporado es lo que realmente existe. Estas notas están traducidas a
>   los otros ocho idiomas del README.

> 📌 **Última actualización (2026-08-23, cont. 5): tres acertijos, y un
> nuevo curso de tutoría grado por grado**:
> - **Tres acertijos en lugar de uno.** Junto al acertijo de "los cuatro
>   nueves" ahora están **el caracol en el pozo** (un pozo de 10 m; el
>   caracol sube 3 m de día y resbala 2 m de noche — la respuesta es
>   **el día 8**, y la pregunta viene con un diagrama) y **la gallina y el
>   huevo** (si una gallina y media ponen un huevo y medio en un día y
>   medio, ¿cuánto tarda una gallina en poner un huevo? — **un día**). Cada
>   vez se elige uno de los tres al azar. **Advertencia honesta**: los dos
>   acertijos nuevos están traducidos **solo al japonés y al inglés**; el
>   acertijo original conserva sus traducciones al es/fr/de/zh/ko.
> - **🎓 Curso de tutoría estudiantil.** Un nuevo botón pregunta **en cuál de
>   los 12 grados** te encuentras (de 1º de primaria a 3º de secundaria
>   superior), y luego te permite instalar las materias de ese grado una por
>   una o con un único botón "instalar todas las materias". La práctica
>   plantea **una pregunta elegida al azar a la vez**, con las opciones de
>   respuesta reordenadas cada vez.
> - **Apoyo de recuperación (hasta cinco pasos).** Cuando fallas una
>   pregunta que tiene una **versión más fácil**, puedes pasar directamente
>   a ella, y cada fallo adicional baja un paso más — **hasta cinco pasos
>   progresivamente más fáciles**. Si fallas el último paso, la app deja de
>   escalonar, muestra la respuesta correcta y te remite a la revisión con
>   el entrenador. **Advertencia honesta**: los pasos son preguntas
>   estáticas escritas a mano, no generadas por IA, y cuántos pasos existen
>   difiere según la pregunta — actualmente **2 preguntas tienen los 5
>   pasos, 16 tienen 2, 33 tienen 1, y 20 no tienen ninguno (71 preguntas de
>   materias)**, más 6 preguntas de fundamentos de programación de las
>   cuales 3 tienen un paso.
> - **Inglés desde 3º de primaria.** Coincidiendo con cuándo comienzan las
>   actividades de lengua extranjera en el currículo japonés, el grado 3
>   ahora tiene **inglés** (5 preguntas originales para principiantes:
>   saludos, colores, números, respuestas). Los grados 1–2 siguen teniendo
>   japonés y aritmética.
> - **Programación (nuevo, con una advertencia honesta).** "Programación"
>   ahora se ofrece desde el grado 3 en adelante. Primero muestra la
>   orientación de que **el propio motor de IA de open-english (aruaru-llm)
>   no es lo bastante potente por sí solo para la enseñanza de programación,
>   por lo que recomendamos la versión de pago de Claude Code Desktop junto
>   a él (el tiempo de uso disponible depende de tu plan)**. Además de eso,
>   open-english por sí solo ofrece **dos ejemplos listos para ejecutar
>   escritos a mano** (un juego de piedra, papel o tijera y una página de
>   autopresentación) con desafíos paso a paso de "prueba a cambiar esto",
>   más 6 preguntas básicas de HTML/CSS/JavaScript. **La IA no genera juegos
>   ni sitios web desde cero** — todo aquí es material fijo, escrito a mano.
> - **Diagramas.** Se adjuntan figuras SVG en línea donde una imagen ayuda
>   (el pozo, el área de un círculo, un prisma rectangular, fracciones, una
>   recta numérica, un triángulo rectángulo, el vértice de una parábola) —
>   **no en todas las preguntas**.
> - **Advertencia honesta.** Cada pregunta es **original** de esta app; nada
>   se copia de libros de texto, cuadernos o exámenes de admisión reales.
>   Solo **6 grados (1º/3º/6º de primaria, 1º/3º de secundaria, 1º de
>   secundaria superior) × unas pocas materias (japonés, matemáticas,
>   inglés)** tienen preguntas por ahora — cualquier otra combinación
>   informa honestamente "**aún no está lista**" en lugar de fingir estar
>   cubierta. Las puntuaciones se guardan a través del endpoint existente
>   `/v1/db/history` (SQLite local, reflejado en aruaru-db cuando se
>   establece `OPEN_ENGLISH_DATABASE_URL`), y la pantalla del curso
>   recomienda configurar **Google Search** y **aruaru-db** para la mejor
>   experiencia.

> 📌 **Última actualización (2026-08-23, cont. 4): la app ahora puede
> plantear un acertijo original de su creador**: di "dame un cuestionario",
> "dame un problema" o 「問題を出して」 y obtienes un **acertijo original de
> Masahiro Ishizuka**, el creador de esta app. Usando cuatro nueves, llena
> cada círculo en `9 ◯ 9 ◯ 9 ◯ 9 = 10` con `+`, `-`, `×` o `÷` — el mismo
> símbolo se puede reutilizar, y se pueden añadir paréntesis `( )` para
> cambiar el orden de las operaciones — de modo que el resultado sea
> exactamente 10. **No es una pregunta capciosa ni un juego de palabras**:
> es aritmética pura, y puedes comprobarlo con una calculadora o un ábaco.
> La persona más joven que lo ha resuelto hasta ahora fue un alumno de
> primer grado de primaria. El intercambio es en **dos etapas** — primero
> recibes la pregunta, y la respuesta solo cuando dices "no lo sé" o
> "dime la respuesta". La salida es **japonés + inglés por defecto**; si tu
> idioma de aprendizaje seleccionado (o idioma nativo) es español, francés,
> alemán, chino o coreano, esa traducción se coloca primero. **Advertencia
> honesta**: solo esos 7 idiomas (ja/en/es/fr/de/zh/ko) están traducidos —
> hemos decidido deliberadamente *no* traducir automáticamente los 130
> idiomas soportados para aparentar estar "completamente localizados", así
> que los hablantes de los demás idiomas reciben la versión predeterminada
> en japonés + inglés. Tanto la pregunta como la respuesta son **texto fijo
> escrito a mano que nunca pasa por inferencia de IA**, por la misma razón
> que las respuestas de abajo: un GPT-2 sin adaptar produce con confianza
> operaciones aritméticas que no cuadran. No consume tu cuota diaria de uso.

> 📌 **Última actualización (2026-08-23)**: Se añadieron dos **respuestas de
> texto fijo escritas a mano, basadas en reglas** (bilingües JA/EN, sin
> inferencia de IA).
> **(1) Islam, Irán/Persia y el mundo árabe**: las preguntas sobre historia
> y raíces reciben un resumen neutral y basado en hechos — las comunidades
> cristianas de la Arabia preislámica (Najran, los gasánidas), la formación
> del Corán, que la erudición describe como **su propia tradición distinta
> e independiente**, la diferencia entre las civilizaciones iraní y árabe, y
> la influencia zoroástrica, esta última presentada explícitamente solo
> como **"una hipótesis que algunos académicos plantean"** en lugar de
> hecho establecido. Dos afirmaciones que originalmente iban a incluirse
> (que el Corán surgió de una traducción de la Biblia; que un hermano de
> Mahoma fue el traductor) se **omitieron deliberadamente por falta de
> respaldo en las fuentes que se conservan**. Cierra con la idea de que las
> barreras lingüísticas alimentan el malentendido, y que **la traducción
> automática y la conversación multilingüe pueden ayudar a construir
> comprensión mutua y paz**.
> **(2) "¿Es el 666 la marca de la bestia?"**: una pieza ligera de trivia
> bilingüe. Expone el pasaje del Apocalipsis de forma neutral, presenta el
> juego de palabras moderno **"666 = WWW"** (guematria hebrea: la letra vav
> vale 6) **explícitamente como una lectura que algunos disfrutan, no como
> doctrina**, señala la historia de "666 oculto en los códigos de barras"
> **explícitamente como una leyenda urbana** y explica la ingeniería real:
> las barras más largas en cada extremo y en el medio son **barras guía**
> que marcan el inicio, el fin y el punto medio para el escáner; solo
> *parecen* el dígito 6 pero usan una codificación distinta (3 módulos en
> lugar de 7) — verificadores de hechos como Snopes califican la afirmación
> como FALSA, así que **no hay significado oculto ni base técnica**. Luego
> aterriza en algo alegre: la Web y los escáneres de códigos de barras
> hicieron las compras convenientes **sin que nadie necesitara una marca en
> su cuerpo**. Una nota final al pie señala que el logo de Python es una
> serpiente pero el nombre viene de la serie de comedia "Monty Python's
> Flying Circus" — el parecido con la "bestia" se **declara explícitamente
> pura coincidencia y juego de palabras**, sin conexión real.
> **Añadido el 2026-08-23**: una nota adicional señala que Apocalipsis
> 13:16-17 realmente contiene un pasaje que dice que nadie sin la marca
> puede comprar o vender, y que **algunas personas notan un paralelismo
> interesante** entre esto y cómo las compras modernas dependen cada vez
> más de los códigos de barras y de sistemas de pago en línea como Amazon —
> **ofrecido estrictamente como una coincidencia que algunos encuentran
> llamativa, nunca como una afirmación de que se haya cumplido alguna
> profecía**.
> Consulta las entradas HANDOFF del 2026-08-23 en [CLAUDE.md](CLAUDE.md).

> 📌 **Última actualización (2026-08-22, continuación)**: Se añadieron
> **configuración persistente, un ajuste de idioma nativo, orden de
> visualización personalizable, un resumen de temas y un registro de 130
> idiomas**.
> - **Instalar / desinstalar idiomas**: en el panel "🌐 Languages", marcar
>   una casilla instala (añade) un idioma y desmarcarla lo desinstala
>   (elimina). También puedes elegir **un idioma nativo**; junto con los
>   idiomas que estás aprendiendo puedes tener **hasta 6 entradas** (inglés
>   y japonés siempre están activos, más hasta 3 más y tu idioma nativo). La
>   lista de 130 idiomas se puede **filtrar por nombre de idioma o por
>   país**, y cada fila muestra un **emoji de bandera y el nombre del
>   país**.
> - **Ordenación**: establece el orden de visualización y lectura en voz
>   alta de tres maneras interconectadas — (1) escribiendo un número, (2)
>   eligiendo un botón de radio del 1 al 6, (3) usando ▲ / ▼. Cambiar uno
>   actualiza los demás. Elegir un número que ya usa otro idioma intercambia
>   los dos, así que los números nunca colisionan.
> - **La configuración sobrevive al mantenimiento y a las actualizaciones
>   automáticas**: se escribe tanto en el localStorage del navegador como en
>   la base de datos local SQLite, y se restaura desde la base de datos si
>   se borra localStorage. `auto-update.js` ahora preserva explícitamente
>   estas claves cuando purga datos de versiones antiguas.
> - **Resumen de temas**: después de elegir tus idiomas, una pantalla de
>   progreso ("recopilando información / mantenimiento en curso") reúne
>   contexto sobre la región de tu idioma mejor clasificado. **Los titulares
>   de noticias se obtienen genuinamente de internet** (un feed RSS público
>   de Google News, solo titulares — nunca el texto del artículo). La
>   capital, ciudades principales, lugares de interés, comida, personas
>   famosas y empresas conocidas (con resúmenes de una línea) provienen de
>   datos estáticos escritos para esta app. Un botón luego entrega los
>   temas al tutor de IA para práctica de conversación.
> - **Registro de idiomas ampliado a 130** — pero **solo 40 de ellos
>   (inglés, japonés y 38 más) tienen realmente preguntas de práctica y
>   datos de contexto detallados**. Los otros 90 se listan solo con nombre,
>   bandera y país, y la interfaz lo dice claramente. Este es un despliegue
>   por etapas, **no soporte completo para 130 idiomas**. Las 130 carpetas
>   de documentación por idioma en [`docs/i18n/`](docs/i18n/) son en su
>   mayoría marcadores de posición sin traducir; no se ha pegado ninguna
>   traducción automática y presentado como una traducción terminada.

> 📌 **Última actualización (2026-08-22)**: Se añadieron **exámenes de
> práctica de idiomas del mundo, una interfaz de selección de idioma, y
> visualización/lectura en voz alta multilingüe secuencial**. El inglés y
> el japonés siguen siendo los predeterminados, pero un banner bilingüe y
> el panel "🌐 Languages" permiten habilitar conjuntos de práctica
> originales para **38 idiomas** (Europa, Oriente Medio, Asia, India,
> África). Después de la calificación, los elementos fallados fluyen hacia
> la práctica de conversación con el tutor de ese idioma, exactamente igual
> que el flujo existente de Eiken/TOEIC/TOEFL/JLPT. También puedes
> seleccionar **de 2 a 5 idiomas** (incluyendo inglés y japonés) y hacer
> que la misma frase se muestre y se lea en voz alta en orden, repetible
> tantas veces como quieras (todo a la vez o un idioma a la vez), con
> copiar/pegar, descarga en .txt, y guardado en SQLite local. Divulgación
> honesta: estas son preguntas originales escritas para esta app — no
> preguntas de exámenes pasados de, ni afiliadas ni avaladas por, ningún
> examen de certificación real (DELE, DELF, Goethe-Zertifikat, HSK, TOPIK,
> ...). Los niveles estilo MCER (A1–C2) son aproximaciones vagas solamente,
> el número de elementos es desigual (3–6 por idioma), y la lectura en voz
> alta usa la API Web Speech incorporada del navegador, así que un idioma
> sin voz instalada se muestra pero no se pronuncia. Consulta la entrada
> HANDOFF del 2026-08-22 en [CLAUDE.md](CLAUDE.md).

> 📌 **Última actualización (2026-08-20)**: Se añadieron comprobaciones
> periódicas automáticas de actualización (cada 6 horas, además de la
> comprobación al inicio) y una función de degradación manual. Si una
> versión nueva resulta tener errores después de un tiempo,
> `GET /v1/updates/history` (versión actual + versiones anteriores
> conservadas) y `POST /v1/updates/downgrade` (revertir el propio
> open-english, aruaru-llm, o aruaru-db individualmente a una versión
> específica) te permiten revertir solo ese componente. Interfaz: la
> sección "🔄 Updates & Rollback" dentro del panel "💾 Data & Model
> Storage". Divulgación honesta: solo se conservan las últimas 3
> generaciones por defecto (consideración de espacio en disco) — no puedes
> retroceder más allá, ni a una versión que nunca se aplicó realmente en
> esta máquina. Consulta la entrada HANDOFF del 2026-08-20 en
> [CLAUDE.md](CLAUDE.md).

> 📌 **Actualización (2026-08-19, continuación 8)**: Cuando se alcanza el
> contador de uso diario (100 por defecto, `localStorage` del lado del
> cliente), el chat ahora muestra un aviso bilingüe — "Has superado el
> límite de uso gratuito de hoy. ¿Quieres cambiar a un plan de pago?" —
> además de la información del nivel gratuito de otros proveedores de IA
> (Google Search/DeepSeek/ChatGPT/Gemini/Claude), leída dinámicamente desde
> `provider-free-tiers.json`. Divulgación honesta: esto es una
> implementación de solo aviso, del lado del cliente, sin un flujo real de
> facturación/actualización. Consulta la entrada HANDOFF del 2026-08-19
> (continuación 8) en [CLAUDE.md](CLAUDE.md).

> 📌 **Actualización (2026-08-19)**: Se añadió Claude (Anthropic) al banner
> de niveles gratuitos de IA/búsqueda como una opción de pago por defecto
> (señalado honestamente como sin un nivel gratuito continuo, solo un
> pequeño crédito de registro si lo hubiera). Consulta la entrada HANDOFF
> del 2026-08-19 (continuación 5) en [CLAUDE.md](CLAUDE.md).

> 📌 **Última actualización (2026-08-19)**: Se añadió `facebook.html`, una
> página de entrada pensada para compartirse como enlace en una página de
> Facebook o en Messenger, para usuarios cuyo plan móvil solo permite
> acceso a Facebook. Divulgación honesta: el verdadero acceso gratuito con
> tarifa cero estilo "Free Basics" de Facebook no se puede lograr sin una
> asociación oficial con Meta, que este proyecto no tiene — `facebook.html`
> funciona como una página normal accesible desde el navegador integrado en
> la app de Facebook y apunta a los instaladores existentes
> (Windows/Linux/macOS/Android); la app en sí sigue ejecutándose en un
> servidor local en tu propio dispositivo (`server/`). Consulta la entrada
> HANDOFF del 2026-08-19 en [CLAUDE.md](CLAUDE.md).

> 📌 **Última actualización (2026-08-11–12, v0.6.0)**: Android/tableta ahora
> se ejecuta de forma totalmente independiente — no requiere PC ni
> servidor Linux. El propio motor de respuesta de IA (`aruaru-llm`) ahora
> está empaquetado dentro del APK; la verificación en el dispositivo
> confirmó que ambos procesos permanecen vivos y responden a
> `/healthz`/`/v1/chat`. También se añadió: un rincón de preparación para
> exámenes de certificación (Eiken 1-5, TOEIC, TOEFL, JLPT N1-N5, Nihongo
> Kentei 1-3, 10 preguntas originales cada uno) que entrega las preguntas
> falladas al entrenador de IA después de la calificación (cambiando
> automáticamente a un modo "aula japonesa" para JLPT/Nihongo Kentei), un
> selector de "qué idioma aprender", e instaladores para Linux/macOS
> (`installer/unix/install.sh`). Divulgación honesta: los pesos del modelo
> (familia GPT-2, modelo de embeddings) no están empaquetados en el APK —
> usar el chat de IA en Android todavía requiere colocar los archivos del
> modelo manualmente en el almacenamiento interno (aún sin descarga
> automática). Consulta las entradas HANDOFF del 2026-08-11
> (continuación 7-10) en [CLAUDE.md](CLAUDE.md).

> 📌 **Última actualización (2026-08-18)**: Se comenzó a construir una base
> de datos local adecuada para el historial de conversaciones/
> configuración. **Por qué no solo SQLite** — SQLite sigue siendo la base
> local siempre disponible, pero cuando se configura `aruaru-db`
> (PostgreSQL), las escrituras también se reflejan allí automáticamente.
> Combinado con la propia función `DUAL_DATABASE_URL` de `aruaru-db`
> (reflejo autorreparable entre dos instancias de PostgreSQL), **si una
> instancia de base de datos falla, la otra la repara automáticamente y
> protege tus datos** — una configuración más segura que solo SQLite. Si no
> hay espejo configurado o la conexión falla, la app sigue funcionando solo
> con SQLite, así que la disponibilidad nunca se sacrifica. Este incremento
> implementa la persistencia SQLite para mensajes/configuración más la API
> `/v1/db/*`, verificada mediante HTTP real (ver `server/src/db.rs`).
> También se añadió: un selector de ubicación de almacenamiento
> (`/v1/db/storage-path`), respaldo con rsync (`/v1/db/rsync-backup`), y un
> endpoint genérico de importación de datos heredados
> (`/v1/db/migrate-legacy`). Si rsync no está instalado, la API responde
> con un aviso bilingüe **"¡Instalemos RSync!"**, y `/v1/db/install-rsync`
> lo instala automáticamente mediante el gestor de paquetes correcto para
> el sistema operativo (winget/choco en Windows, apt-get/dnf/pacman en
> Linux, brew en macOS, pkg en Android) y reintenta inmediatamente el
> respaldo tras el éxito. La visualización de gráfico circular de uso y la
> sincronización entre múltiples dispositivos siguen planeadas para el
> siguiente incremento.

> 📌 **Actualización anterior (2026-08-11, continuación 3)**: Se añadió una
> función de autoactualización automática (solo Windows) que comprueba
> GitHub en busca de la última versión al iniciar y, si es más nueva,
> desinstala automáticamente la versión antigua e instala la nueva.
> Divulgación honesta: aún no existe ninguna versión (Release) de GitHub,
> así que el flujo completo de desinstalación→instalación no se ha
> verificado de extremo a extremo (la lógica de comparación de versiones y
> la ruta de "no se encontró versión, continuar de forma segura" sí se
> verificaron). Consulta la entrada HANDOFF del 2026-08-11 (continuación 5)
> en [CLAUDE.md](CLAUDE.md).

> 📌 **Actualización anterior (2026-08-11, continuación 2)**: Se añadió
> detección de temas de búsqueda de empleo/cambio de carrera/turismo que
> presenta aruaru.tokyo (desarrollo impulsado por IA, Claude Code Desktop),
> audiocafe.tokyo/aruaru (empleos de TI/construcción), audiocafe.tokyo/
> aruaru-lady (empleos para mujeres), y nasa.tokyo tanto en inglés como en
> japonés — funciona tanto en el chat normal como en el modo de
> entrenamiento, verificado en vivo. Consulta la entrada HANDOFF del
> 2026-08-11 (continuación 4) en [CLAUDE.md](CLAUDE.md).

> 📌 **Actualización anterior (2026-08-11, continuación)**: Se enlazó a una
> nueva base de datos geográfica/turística (las 47 prefecturas japonesas,
> los 50 estados de EE.UU., las principales capitales del mundo con
> monumentos/comida/souvenirs) para hacer dinámico el entrenamiento de
> autopresentación. Cuando aparece el Monte Fuji, la app ahora muestra un
> aviso de seguridad bilingüe (usar ropa de esquí + casco, reservar una
> cabaña de montaña con antelación) además de información real de cabañas/
> autobuses/tiendas de equipo y una búsqueda de reserva de tours. Se
> añadió una interfaz de selección de grupo de edad/nivel/inglés de
> negocios. Verificado en vivo contra un `aruaru-llm` + servidor estático
> real en ejecución (se encontraron y corrigieron 3 errores reales en el
> proceso). Consulta las entradas HANDOFF del 2026-08-11 en
> [CLAUDE.md](CLAUDE.md).

> 📌 **Actualización anterior (2026-08-11)**: Se añadió un panel de
> configuración para guardar tu clave de API/cx de Google Search
> directamente desde el navegador (`POST /v1/settings/google-search`, solo
> en memoria, nunca escrito en disco). El instalador de Windows
> (`installer/windows/`, Inno Setup) ahora se ha construido, instalado,
> lanzado y desinstalado realmente en hardware real (no requiere
> privilegios de administrador). Consulta la entrada HANDOFF del
> 2026-08-11 en [CLAUDE.md](CLAUDE.md).

> 📌 **Actualización anterior (2026-08-10, continuación)**: (1) Se cambió el
> modelo predeterminado de `gpt2` (124M) a `distilgpt2` (82M), ~42% más
> rápido (ver `aruaru-llm/CLAUDE.md`). (2) Se decidió **en contra** de
> portar el JS del frontend a Rust/WASM (sin beneficio de rendimiento, y
> `SpeechRecognition` no tiene una vinculación estándar en web-sys) — en su
> lugar se **portó el servidor de archivos local a Rust** (nuevo crate
> `server/`, construido sobre `open-runo-poem-compat` de RPoem, eliminando
> la dependencia de `python3 -m http.server`). (3) Se mejoró el manejo de
> entrada en japonés para que las respuestas híbridas (inglés+japonés)
> siempre estén garantizadas (`ensureHybridReply` de `app.js` — si la
> respuesta del modelo no contiene japonés, el frontend añade por sí mismo
> una breve nota honesta en japonés; no finge una calidad de traducción
> automática). (4) Se añadió gestión de versiones (`version.json` ahora
> tiene un campo `version` semántico, mostrado en el pie de página) y
> limpieza automática de los rastros del lado del navegador de versiones
> antiguas (`auto-update.js` limpia el propio `localStorage` de esta app y
> hace una recarga con anulación de caché al actualizar — dado que esta es
> una app web estática sin instalador nativo, "desinstalar versiones
> antiguas" se limita solo a los residuos del lado del navegador, no a
> archivos en disco). Consulta la entrada HANDOFF del 2026-08-10
> (continuación 3) en [CLAUDE.md](CLAUDE.md) para más detalles.

> 📌 **Actualización reciente (2026-08-10)**: Se añadió soporte CORS
> (`.with_cors()` en el lado de `aruaru-llm`), se corrigió la causa raíz
> del bucle de repetición degenerado de la decodificación voraz de GPT-2
> (`GptModel::generate_with_repetition_penalty` de `open-cuda`,
> `penalty=1.3` por defecto), se ajustó el aspecto del personaje Tora-san
> (bolsa marrón claro más grande, pies estilo sandalias de paja) + se
> añadió una melodía de cambio de personaje + se corrigió su
> autopresentación, se añadió un paso de entrenamiento basado en una
> técnica real de atención al cliente de un maid cafe real de Akihabara
> (@ほぉ～むカフェ), se investigó (en japonés e inglés) y se añadió un paso
> que cubre el actual auge extranjero de la cultura japonesa (anime/manga,
> canciones de anime, videojuegos, estudiantes de idioma japonés, la
> colección de sellos goshuin, turismo de onsen ryokan, comida japonesa),
> se añadieron iconos de lanzador para Windows/Mac/Linux/Android/iPhone/
> iPad (`icons/`+`launchers/`+`manifest.json`), y se añadió un mecanismo
> de actualización automática (`auto-update.js` sondeando `version.json`).
> Consulta la entrada HANDOFF del 2026-08-10 en [CLAUDE.md](CLAUDE.md) para
> más detalles.

Una app web de aprendizaje de conversación en inglés basada en navegador
(Fase 0) para PC/tableta/smartphone. Al estilo de una "clase de inglés de
maid cafe", un personaje maid de chica mágica (diseño original, animado)
entrena a los estudiantes desde principiante absoluto hasta avanzado.

## Arquitectura (según instrucción del usuario, 2026-08-10)

- **Lado de Linux (VPS)**: solo un servidor de distribución de descargas
  (no es donde esta app realmente se ejecuta). La gestión de la app la
  maneja [`open-easy-web`](https://github.com/aon-co-jp/open-easy-web).
- **Lado del dispositivo del usuario (PC/tableta/teléfono)**: el frontend
  web estático de este repositorio (HTML/CSS/JS, se ejecuta en el
  navegador) + un servidor nativo ejecutado localmente de
  [`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm) (que internamente
  usa el motor de inferencia de `open-directx`/`open-cuda`), que el usuario
  descarga y ejecuta por sí mismo. El navegador se conecta a
  `http://localhost:4600` (puerto predeterminado de aruaru-llm) localmente,
  en línea o sin conexión — un diseño "híbrido".

## Alcance actual (Fase 0) — divulgación honesta

- **Calidad de la respuesta de IA**: `/v1/generate` de `aruaru-llm` realiza
  generación de texto autorregresiva mediante GPT-2 (124M-1.5B, centrado en
  inglés, sin ajuste fino para diálogo). No se garantiza que la calidad de
  la respuesta sea fluida o adecuada al nivel — esto se divulga en
  pantalla, no se exagera. Desde el 2026-08-10, una penalización de
  repetición (por defecto 1.3, variable de entorno
  `ARUARU_LLM_REPETITION_PENALTY`) corrige el error de repetición infinita
  degenerada reportado anteriormente (por ejemplo, un interminable
  "Student: Hello").
- **CORS**: corregido desde el 2026-08-10 — el servidor HTTP de
  `aruaru-llm` ahora envía cabeceras `Access-Control-*` a través de
  `.with_cors()` de `open-runo-poem-compat`, así que este frontend se
  puede abrir de origen cruzado (o mediante `file://`) y aun así alcanzar
  `http://localhost:4600`.
- **Selección de nivel**: el selector de nivel de principiante a avanzado
  existe en la interfaz, pero la aplicación real del nivel se limita a una
  breve instrucción en el prompt — no se garantiza que GPT-2 la respete.
- **Voz**: la API Web Speech real (SpeechSynthesis para la salida,
  SpeechRecognition para la entrada del micrófono) está conectada, con
  ajuste de tono/velocidad por personaje (maid vs. el asistente Tora-san) y
  una corrección de extracción de idioma (2026-08-10) para que las líneas
  mixtas de inglés/japonés ya no suenen entrecortadas al hablarse.
- **Modo de entrenamiento**: un guion determinista de autopresentación (no
  generado por IA) que ahora también incluye una técnica real de
  conversación basada en palabras de un maid cafe real de Akihabara
  (@ほぉ～むカフェ) (por ejemplo, "¿De dónde eres?" -> "¡Australia!" ->
  "¡Canguro!!"), y un paso que resume el actual auge extranjero de la
  cultura japonesa (investigado tanto en japonés como en inglés):
  anime/manga (Demon Slayer, Attack on Titan), eventos en vivo de canciones
  de anime (Animelo Summer Live), videojuegos japoneses, ~3.79 millones de
  estudiantes de japonés en todo el mundo, la colección de goshuin (sellos
  de templos/santuarios) entre turistas, turismo de onsen ryokan y de
  santuarios/templos, y comida japonesa.
- **Iconos de lanzador**: `icons/` + `manifest.json` (PWA) + `launchers/`
  (script de creación de `.lnk` para Windows, archivo `.desktop` para
  Linux, script de construcción de `.app` para macOS, y una guía de
  "Añadir a la pantalla de inicio" para PWA móvil) permiten a los usuarios
  lanzar esta app desde un icono de escritorio de Windows/Mac/Linux o un
  icono de pantalla de inicio de Android/iPhone/iPad.
- **Actualización automática**: `auto-update.js` sondea `version.json` cada
  5 segundos y recarga la página cuando cambia el ID de compilación.
  **Limitación conocida**: algunos navegadores bloquean el `fetch()` de
  archivos locales bajo el esquema `file://` por razones de seguridad —
  esta función está garantizada para funcionar cuando se sirve a través de
  un servidor HTTP local (ver `launchers/mobile/README.md` para un ejemplo
  de una línea con `python3 -m http.server`), y no hace nada en silencio
  (sin romper nada) si está bloqueada bajo `file://`.

## Instaladores requeridos (añadido 2026-08-17)

Para ejecutar open-english, necesitas descargar e instalar las dos
siguientes piezas de software (no se requiere compilar desde el código
fuente, cerca de una instalación de un solo toque).

| # | Qué | Windows | Linux | Android/tableta |
|---|---|---|---|---|
| 1 | **open-english mismo** (este repositorio — frontend estático + servidor de entrega) | [open-english-install.exe](https://github.com/aon-co-jp/open-english/releases/latest/download/open-english-install.exe) | [tar.gz](https://github.com/aon-co-jp/open-english/releases/latest) | [APK](https://github.com/aon-co-jp/open-english/releases/latest) (elige el recurso `.apk`) |
| 2 | **aruaru-llm** (el motor de respuesta de IA — requerido, el chat no funcionará sin él) | [aruaru-llm-installer.exe](https://github.com/aon-co-jp/aruaru-llm/releases/latest/download/aruaru-llm-installer.exe) | [tar.gz](https://github.com/aon-co-jp/aruaru-llm/releases/latest) | Ya incluido (empaquetado dentro del APK de open-english, no se necesita instalación aparte) |

**Divulgación honesta**: los enlaces "latest" (última versión) de arriba
siempre apuntan a la versión (Release) más reciente de GitHub (usa la
[página de Releases](https://github.com/aon-co-jp/open-english/releases)
directamente si quieres una versión fija específica). Todavía no hay un
binario precompilado de macOS para `aruaru-llm` (open-english en sí
distribuye un tar.gz para macOS, pero `aruaru-llm` solo distribuye para
Linux/Windows) — en macOS necesitarás compilar `aruaru-llm` desde el
código fuente.

En Windows/Linux/macOS, tras la instalación, la función de
autoactualización incorporada de la app (`server/src/self_update.rs`,
extendida a Linux el 2026-08-19 y a macOS el mismo día) comprueba las
Releases de GitHub al iniciar y, si existe una versión más nueva, se
actualiza automáticamente (Windows: desinstalar→instalar; Linux/macOS: el
binario en ejecución se reemplaza a sí mismo en el lugar) — no se requiere
ninguna acción del usuario. Antes de aplicar una actualización, se hace una
copia de seguridad del binario actual; después de que la nueva versión se
inicia, una comprobación de salud contra el nuevo endpoint `/healthz` debe
tener éxito dentro de un breve período de gracia, o la app automáticamente
retrocede (degrada) a la versión anterior respaldada. **Divulgación
honesta**: Android/iPhone/iPad quedan excluidos de este mecanismo de
autoactualización/reversión automática, ya que el sistema operativo no
permite una instalación de APK completamente silenciosa — las
notificaciones de actualización todavía requieren que el usuario toque
manualmente para instalar (y tampoco hay una ruta de degradación allí).

*(Nota de traducción automática: este párrafo y la nota de abajo fueron
traducidos por el propio agente de IA, sin revisión de un hablante
nativo.)*

También hay una nueva página de entrada, `facebook.html`, para usuarios
cuyo plan móvil solo permite acceso a Facebook — consulta el banner del
2026-08-19 arriba para más detalles y su divulgación honesta sobre los
límites de este enfoque.

## Cómo ejecutarlo

1. Ejecuta [`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm) con
   `cargo run --release` (por defecto `http://localhost:4600`, el modelo
   predeterminado ahora es `distilgpt2`).
2. En `server/`, ejecuta `cargo run --release` para servir el frontend
   estático de este repositorio en `http://127.0.0.1:4601/` (basado en
   RPoem — `python3 -m http.server` ya no es necesario; anula el puerto
   con la variable de entorno `OPEN_ENGLISH_SERVER_BIND`).
3. Abre `http://127.0.0.1:4601/` en un navegador. Abrir `index.html`
   directamente mediante `file://` sigue funcionando, pero algunos
   navegadores bloquean `fetch()` allí y desactivan la actualización
   automática — se recomienda el servidor del paso 2.

## Próximos pasos

1. ~~Soporte CORS en el lado de `aruaru-llm`~~ **Hecho (2026-08-10)**.
2. ~~Bucle de repetición de decodificación voraz de GPT-2~~ **Causa raíz
   corregida (2026-08-10, penalización de repetición)**.
3. ~~Acelerar el modelo predeterminado~~ **Hecho (2026-08-10, cambiado a
   distilgpt2, ~42% más rápido)**.
4. ~~Garantizar respuestas híbridas para entrada en japonés~~ **Hecho
   (2026-08-10)**.
5. ~~Portar a Rust el servidor de archivos local~~ **Hecho (2026-08-10,
   crate `server/`)**. Portar el propio JS del frontend a Rust/WASM se
   evaluó y se descartó (sin beneficio de rendimiento — ver `CLAUDE.md`).
6. Añadir mejoras de pulido de TTS/sincronización labial.
7. Implementar un currículo por nivel (gramática, listas de vocabulario,
   etc.).
8. **(según instrucción del usuario, 2026-08-10)** Una idea futura de
   ejecutar `open-directx`/`open-cuda`/`aruaru-llm` en el navegador
   (WASM/WebGPU) e integrarlo con `RPoem` (una plataforma de GraphQL
   Federation). Esta es una dirección arquitectónica grande y separada de
   la Fase 0 actual (servidor local residente + conexión a localhost),
   aplazada hasta después de completar el MVP y delimitada como su propio
   esfuerzo.
9. Investigar si las técnicas de Toshiba SBM o de la familia DeepSeek
   tienen alguna aplicación genuina aquí (aún sin comenzar).


---

## Actualización 2026-08-23 — `GET /v1/cpu-runtime` extendido con información
de *combinación* de ISA

Anteriormente el endpoint devolvía una lista plana de booleanos de
características de CPU. Dado que las CPU reales llevan varios conjuntos de
instrucciones simultáneamente (AVX2+FMA3, AVX-512F+BW+VNNI, …), una lista
plana no revela las condiciones reales de despacho. Usando la nueva API de
combinación en `open-cpu`, la respuesta ahora también incluye:

- `isa_profile` / `isa_profile_raw` — el nivel de combinación satisfecho
- `float_impl` / `bit_impl` — la implementación elegida por cada núcleo
- `combination_examples` — si se cumplen `avx2+fma3`, `avx512f+bw+vl`,
  `avx512f+bw+vnni`, `ssse3+pclmulqdq` y `gfni+avx2`
- `cpu_vendor`, `cpu_family`, `fast_bmi2`
- `detected_but_unused` — características detectadas pero no explotadas
- detección de `gfni` y `vpclmulqdq`

Verificado de extremo a extremo iniciando el servidor y ejecutando
`curl http://127.0.0.1:4601/v1/cpu-runtime`. En la máquina de desarrollo
(Ryzen 9 3950X, Zen 2): `isa_profile: "avx2+fma3"`, `fast_bmi2: false`,
`detected_but_unused: "aes sha"`.

### ⚠️ Divulgación honesta: esto sigue siendo solo informativo

Buscamos en `server/src` algo que valiera la pena acelerar con SIMD y no
encontramos **ningún bucle intensivo en CPU**: las respuestas del chat son
llamadas HTTP a `aruaru-llm`, y las funciones de aprendizaje son consultas
de datos estáticos sin cálculo pesado de similitud de texto. En lugar de
inventar un uso teórico, la respuesta ahora lleva campos `disclosure_ja` /
`disclosure_en` que indican que los consumidores genuinamente acelerados
son `open-raid-z` (GF(2^8)), `open-cuda` / `aruaru-llm` (inferencia en
CPU) y `open-cg-cad` (derivada de sección transversal).

## Actualizaciones recientes (2026-08-27)

Despliegue real en el VPS (easy-web.tokyo/open-english), explorador de
carpetas para rutas de copia de seguridad, insignia permanente de estado
de red (público/privado) con soporte DuckDNS, paneles de interfaz
plegables, prueba real de extremo a extremo de escritura vía
GitHub/VPS, carga de planos + comentario textual de IA junto con el
nuevo servidor open-cg-cad, examen de práctica multilingüe para la
certificación estadounidense "Data Scientist", y un nuevo tema de
opinión sobre el ahorro para la jubilación. Detalles completos solo en
la versión japonesa.
