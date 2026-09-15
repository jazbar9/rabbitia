---
version: 1
slug: "src-pages-index-astro"
primary_target: "src/pages/index.astro"
related_targets: []
---

# Surface brief — Landing page (/) — consultora tech LATAM

## Scope

Landing de página única, español LATAM, web (desktop + mobile). Modo: **Persuade**.

## Audience & job

Mix de pymes y corporativos LATAM que quieren modernizar operaciones con tecnología. Job: entender rápido qué hace la consultora (automatización + software + data con IA, un solo socio), ver evidencia concreta, y actuar con contacto directo por WhatsApp.

## Action & proof

- Acción primaria: contacto por WhatsApp.
- Proof: la referencia visual explícita del usuario (landing GiGi Energy Drink, canon a fidelidad total); contenido autorado con etiqueta sintética donde aplique; ningún claim comercial inventado (sin stats de clientes, precios ni resultados).

## Direction contract

- THESIS: la landing es un letrero de bodega encendido — la energía y oscuridad de la referencia GiGi (fondo casi negro, display condensado en caps gigantes, kickers, chips) ejecutada al nivel de acabado de esa página de referencia, sobre contenido real de consultora. Se niega el look "consultora corporativa gris" y el cliché "startup dark" genérico: cada sección lleva un sello propio, numerales y líneas hairline.
- OWN-WORLD: base casi negra (#07090C), texto cálido claro, un acento cian eléctrico (#38E1E6) como color de marca, verde WhatsApp (#25D366) exclusivo en botones de contacto, kickers caps con lacito de color, displays Anton en caps, hairline borders, chips pill con dot, tarjetas oscuras #10161C. Identificable con todo el contenido borrado: negro + cian + caps gigantes + "console" de workflow.
- STORY: el visitante entiende en 5 segundos que es una consultora integral (automatización, software, data, IA) → ve el método y para quién → cierra en WhatsApp. Evidencia: una consola de operación viva en el hero que demuestra la automatización (Live Proof), servicio a servicio con su sello, pasos del método, audiencias.
- FIRST VIEWPORT: header delgado (logo.png izq, nav, CTA "Cotizar por WhatsApp" en verde) → kicker caps con tag → display Anton "AUTOMATIZAMOS TU EMPRESA" en dos líneas (línea 2 con palabra delineada) → subcopy → CTAs (sólido verde "Hablemos por WhatsApp" + fantasma "Ver cómo trabajamos") → fila de chips (Automatización / Software / Data / IA) → derecha: consola de operación SVG viva (pipeline de nodos, mini-chart, contador) como placa de producto.
- FORM: dirección heredada por pin del usuario (canon GiGi); posición en lista ordenada: referencia de usuario (standing exit), seed 246a243e.
- FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Constraints

- Sin claims comerciales fabricados. Contenido de demostración etiquetado como sintético.
- Logo real en `public/logo.png` (header + footer). Nombre de empresa sin confirmar → usar logo + placeholder claro para CTA/comunicación.
- CTA WhatsApp con número por rellenar: centralizado en una constante.
- Accesibilidad: contraste AA, landmarks, reduced-motion, alt descriptivos.
- Sin generación de imágenes: world construido con SVG/CSS autorado a mano.

## Unresolved

- Número de WhatsApp / links de nav (placeholder).
- Nombre o tagline exacto del brand (placeholder neutro).
- Email de contacto (placeholder).
