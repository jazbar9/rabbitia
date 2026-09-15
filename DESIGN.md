---
name: Consultora tech — Landing (Automatización · Software · Data · IA)
description: Landing para consultora de automatización, software y data con IA. Canon estricto fijado por el usuario: clon visual de la landing GiGi Energy Drink (paleta, fuentes, formas y animaciones).
colors:
  lime: "#AFFF00"
  lime-soft: "#befd5a"
  lemon: "#84cc16"
  flame: "#FF6B35"
  aqua: "#00D4FF"
  ink: "#121212"
  coal: "#0a0a0a"
  char: "#1a1a1a"
typography:
  sans: "Inter, ui-sans-serif, system-ui, sans-serif"
  mono: "JetBrains Mono, ui-monospace, monospace"
  display: "Inter 900, tracking -0.03em, line-height 0.9 (font-black tracking-tighter)"
  label: "JetBrains Mono, 0.68rem, tracking 0.3em, uppercase"
rounded:
  pill: "999px (botones, chips, inputs, badge, scroll mouse)"
  card: "1rem (cards) / 1.5rem (flavours) / 1.25rem (sello iconos)"
motion:
  reveal: "opacity 0→1 + translateY(40px) al entrar al viewport (IO, stagger con --rd)"
  lines: "líneas de titular suben desde translateY(112%) dentro de overflow-hidden"
  shine: "barrido de brillo white/45 tras el botón en hover (0.65s)"
  float: "6s ease-in-out infinite (logo del hero)"
  pulse-glow: "2s ease-in-out infinite (glow lima 20→40px)"
  marquee: "20s linear infinite translateX(-50%)"
  grain: "SVG feTurbulence opacity .03, 8s steps(10,end) (noise-overlay)"
---

# Design System: Consultora tech — Landing (Canon GiGi Estricto)

## Overview

**Creative North Star: "La energía de la bebida, aplicada a la consultora."**

La landing es una **adaptación estricta** —paleta, fuentes, formas y animaciones— de
https://v0-gigi-energy-drink-landing-page.vercel.app/, sobre el contenido real de RabbitIA
(automatización, software a medida y data con IA, en español). No es una interpretación
temática: se copian los tokens y los patrones de la referencia y se reemplaza solo el
contenido.

El resultado es una página que alterna **blanco** y **`#121212`**, con un único acento de
marca que es el **lima eléctrico `#AFFF00`** (theme-color), botones **pill** con barrido de
brillo, titularidad en **Inter 900 con tracking cerrado** y toda la microcopía en
**JetBrains Mono**. Las animaciones de scroll (revels, líneas que suben, shine) replican el
comportamiento de framer-motion de la referencia mediante IntersectionObserver + CSS
`transition`/`transform`, respetando `prefers-reduced-motion`.

## Colors

Paleta exacta de la referencia. Máxima: 2 negro (light + dark) + lima de marca + 2 acentos
secundarios reservados (naranja `#FF6B35`, cian `#00D4FF`) + lime-500 `#84cc16` como
acento de la sección de servicios.

- **Lima Eléctrico `#AFFF00`** — el color de marca y de conversión. theme-color del
  documento; segunda línea de los titulares; kickers sobre fondo oscuro; dots de features;
  iconos; botones primarios; hover de links del footer; glow (`pulse-glow`).
- **Lime Soft `#befd5a`** — hover de botones lima.
- **Lemon `#84cc16`** — acento del titular de Servicios ("tres frentes") y gradiente sutil
  del fondo de esa sección.
- **Flame `#FF6B35`** — card "3 · Frentes" de Beneficios (tipo Formula de la referencia).
- **Aqua `#00D4FF`** — card "24/7 · Operación" de Beneficios.
- **Ink `#121212`** — secciones oscuras, texto principal sobre blanco, targetas dark, pills
  del badge.
- **Coal `#0a0a0a`** — fondo del gradiente interno de las secciones oscuras.
- **Char `#1a1a1a`** — superficie de las cards sobre fondo oscuro (border white/10).

### Named Rules
**The Lime Is The Product Rule.** El lima es discurso de marca y CTA, y se usa con
densidad exacta a la referencia: palabras de titular, kicker solo en secciones oscuras,
iconos, botones, dots y glows. No se reparte como acento decorativo aleatorio.
**The Black/White Rhythm Rule.** Secciones blancas (hero, servicios, método, para quién)
alternando con secciones `#121212` (marquesina, beneficios, contacto, footer), como en la
referencia. Texto nunca directo sobre gris; siempre blanco↔negro con opacidades de la misma
tinta.
**The WhatsApp Carries The Contact Rule.** La conversión va por WhatsApp; el botón usa el
mismo tratamiento que el CTA "Get 25% Off" de la referencia (pill lima + shine), no el
verde de la marca WhatsApp.

## Typography

**Sans: Inter (variable 100–900).** Todo el texto corrido y los titulares. Los titulares
usan `font-black` (900) con `tracking-tighter` y `leading-[0.9]` (clase `.display`),
exacto a los `text-5xl md:text-7xl font-black` de la referencia. Uppercase free: el coping
va en caps según el mensaje (como el hero "FUEL YOUR / AMBITION"), no por CSS.

**Mono: JetBrains Mono (variable 100–800).** La voz "técnica": kickers (`0.68rem`,
tracking 0.3em, uppercase), subcopys de sección, descripciones de cards, features con dot,
tags, placeholder y copyright del footer. Es la traducción del `font-mono` de la referencia.

### Hierarchy
- **Display** (Inter 900, `text-3xl md:text-5xl` en secciones, `text-5xl md:text-7xl` en
  hero, `text-4xl md:text-6xl` en contacto; tracking -0.03em; leading 0.9): la segunda
  línea del titular va en lima.
- **Card Title** (Inter 900, `text-lg`/`text-3xl`, tracking tight): títulos de cards.
- **Mono Label** (JetBrains Mono, `0.68rem`, tracking 0.3em, uppercase): kickers y tags.
- **Body Mono** (JetBrains Mono, `text-sm`/`text-xs`, `text-ink/60` o `text-white/60`):
  subcopys y descripciones, como en la referencia.

## Layout

Contenedor `max-w-7xl` con `px-6`, idéntico a la referencia. Secciones alternan claro/oscuro
según el ritmo de referencia: **Hero (blanco) → Marquesina (ink) → Servicios (blanco,
patrón Flavours) → Método (blanco, patrón Activations) → Beneficios (ink, patrón Formula) →
Para quién (blanco, patrón Activations) → Contacto (ink, patrón "READY TO LEVEL UP?") →
Footer (ink)**.

- **Patrón Flavours**: cards blancas `rounded-3xl border-2 border-ink/10 shadow-xl` con icon
  tile lima, titular, mono sub, chips mono pill y CTA lima.
- **Patrón Activations**: cards `#121212 rounded-2xl` sobre blanco que al hover se rellenan
  de lima e invierten la tinta del contenido (iconos, títulos, texto, links).
- **Patrón Formula**: grilla 2×2 / 4 col de cards `#1a1a1a rounded-2xl border-white/10` con
  número gigante de color (`pop`), label, mono sub, glow lime al hover (`blur(8px)`) y barra
  de progreso que hace `scaleX 0→1`.
- **Patrón Contacto**: titular gigante centrado con segunda línea lima + CTA pill.
- **Patrón Footer**: blurb mono, columnas de links (títulos bold, links mono), barra final
  con wordmark (mitad blanco, mitad lima) + copyright mono, y **watermark gigante
  translúcido** del nombre en la base.

## Elevation & Depth

Plano + glow, como la referencia: las cards se elevan con `shadow-xl`/`border-2` y el único
resplandor difuso es el **glow lima** (radial `blur`/`pulse-glow`) de la consola de la
marca —en nuestro caso, el orbe y el halo detrás del **logo** en el hero, y el glow `#AFFF00`
de las cards de Beneficios al hover.

## Shapes

**Pill es la forma dominante** (botones, badge, chips, inputs, scroll mouse). Cards
`rounded-2xl` (1rem), flavours `rounded-[1.5rem]`, icon tiles `rounded-xl`. Bordes:
`border-2` en outline buttons/inputs; `border-white/10` sobre oscuro; `border-ink/10` sobre
blanco.

## Components

### Buttons
- Pill (`rounded-full`), `px-6 py-3`, Inter 700 `text-sm`, tracking 0. `btn-lime` (lima,
  texto ink, hover lime-soft) y `btn-outline` (border-2 ink, hover rellena ink y blanquea el
  texto). Sobre oscuro: `btn-lime` igual. **Shine**: `::after` gradiente white/45 que barre
  el botón en hover (0.65s). Flecha que se desplaza `translateX(1)` en hover.
- Estados activos: `translateY(1px)`.

### Badge pill del hero
Pill `bg-ink text-white`, mono `0.68rem` tracking widest, con **dot lima** animado:
"CONSULTORA TECNOLÓGICA · IA APLICADA".

### Features del hero
Items mono `text-ink/60` precedidos de un **dot lima** cuadrado del color; entran con
`translateX(-20px)` como en la referencia.

### Marquesina
Franja `bg-ink py-4` con palabras Inter-black `text-white/70` separadas por **rombos lima**
rotados 45°; loop `marquee` 20s hacia `-50%` con duplicado del contenido.

### Cards dark (Activations y Audiences)
`relative overflow-hidden rounded-2xl bg-ink p-6`, capa absoluta `bg-lime/0` que en hover
pasa a `bg-lime` (300ms); el contenido (que vive en `z-10`) invierte tinta con
`transition-colors duration-300`. Icon tile `h-11 w-11 rounded-xl bg-lime text-ink` → hover
`bg-ink text-lime`.

### Cards Formula (Beneficios)
Número `text-3xl font-black` de color (`#AFFF00 | #FF6B35 | #00D4FF`) con reveal `pop`
(scale 0.5→1). Hover: glow `linear-gradient(135deg, <accent>40, transparent, <accent>40)`
blur 8px; tile rellena con el accent y el icono pasa a ink; barra `h-[2px]` accent que hace
`scaleX(0→1)` desde la izquierda.

### Header
Fijo `fixed top-0`, **empieza oculto** (`translateY(-100%)`) y baja al scrollear 24px con
fondo `white/90 backdrop-blur`. Links: Inter 500 `text-ink/80`, underline **lima** que hace
`scaleX(0→1)` al hover. CTA pill lima + shine ("Cotizar por WhatsApp"). Logo imagen.

### Footer
Wordmark de texto "Rabbit**IA**" (blanco + lima, Inter black). Watermark gigante del nombre,
`text-white/[0.02]`, centrado en la base, con reveal.

## Do's and Don'ts

### Do:
- **Do** usar solo las tintas de la paleta de referencia (whites, ink/coal/char, lime,
  lemon/flame/aqua) y los radios pill/2xl/xl.
- **Do** titular en Inter 900 + tracking cerrado, kicker y microcopía en JetBrains Mono.
- **Do** respetar `prefers-reduced-motion`: reveals muestran el estado final directo, sin
  marquesina ni float (ver media query global).
- **Do** mantener nav fija que aparece al scroll, pills con shine y cards con el patrón de
  hover de la referencia.
- **Do** escribir en español de LATAM, directo; WhatsApp como conversión.

### Don't:
- **Don't** usar colores ajenos a la paleta (cian, magenta, verdes de marca) ni fuentes
  ajenas a Inter/JetBrains Mono (la anterior pareja Anton/Archivo quedó descartada por
  decisión estricta del usuario).
- **Don't** inventar métricas de clientes, precios o resultados.
- **Don't** romper la alternancia blanca/oscura ni meter gradientes sobre texto.
- **Don't** quitar el shine, el reveal o el grano: son parte del canon pedido.