---
# =============================================================
#  PLANTILLA DE POST — matoriusbig.github.io
#  Duplica este archivo, rellena los campos y sigue las notas.
#  Borra todos los comentarios (#) antes de publicar.
# =============================================================

title: "Título del Post"          # Aparece en la card, el navegador y SEO
date: 2026-01-01 10:00:00 -0400   # Fecha real de publicación. -0400 = hora Chile

# CATEGORÍAS — elige según la sección del blog:
#   Write-up    → [Write-up, HackTheBox]  |  [Write-up, TryHackMe]
#   Cheat Sheet → [Cheat Sheet, Reconocimiento]  |  [Cheat Sheet, Explotación]
categories: [Write-up, HackTheBox]

# TAGS — en minúsculas, sin espacios (usa guiones: sql-injection)
tags: [tag1, tag2, tag3]

# DESCRIPCIÓN — 1-2 frases. Aparece en la card y en Google. Máx 160 caracteres.
description: "Descripción corta del post que aparece en las cards y en los resultados de búsqueda."

# MINIATURA — ver instrucciones abajo en la sección [IMÁGENES]
image:
  path: /assets/img/posts/nombre-imagen.png
  alt: "Descripción breve de la imagen"

# CARRUSEL — pon true si quieres que aparezca en el carrusel del home
featured: false

# NO TOCAR (valores por defecto correctos)
toc: true
---

<!--
════════════════════════════════════════════════════════════════
  INSTRUCCIONES DE USO — leer antes de escribir, luego borrar
════════════════════════════════════════════════════════════════

  ① NOMBRE DEL ARCHIVO
  ─────────────────────
  El archivo DEBE llamarse:  YYYY-MM-DD-titulo-en-minusculas.md
  Ejemplo:  2026-04-20-htb-lame.md
  Sin tildes ni espacios en el nombre del archivo.

  ② EN QUÉ CARPETA GUARDAR
  ──────────────────────────
  Según la sección que corresponda:

    _posts/  →  TODOS los posts van aquí, sin excepción.
               (el blog los clasifica por categories automáticamente)

  En Obsidian: abre la carpeta del blog como vault,
  navega a _posts/ y crea el archivo ahí directamente.

  ③ IMÁGENES (miniatura)
  ────────────────────────
  1. Prepara una imagen de 1200×630 px (ratio 16:9).
     Formatos: .png · .jpg · .webp
  2. Cópiala a la carpeta:  assets/img/posts/
  3. En el front matter, escribe el nombre exacto:
       image:
         path: /assets/img/posts/nombre-exacto.png
  4. Si el post NO tiene imagen, borra todo el bloque "image:"
     y se mostrará un ícono de placeholder en la card.

  Imágenes dentro del contenido:
    ![Descripción](/assets/img/posts/captura.png)

  ④ PUBLICAR EN GITHUB (paso a paso)
  ─────────────────────────────────────
  Opción A — Terminal integrada de VS Code (recomendado):
    1. Abre VS Code en la carpeta del blog
    2. Presiona Ctrl+` para abrir la terminal
    3. Ejecuta los siguientes comandos uno por uno:

       git add .
       git commit -m "post: Título corto del post"
       git push origin main

    GitHub Pages construirá el sitio en ~1-2 minutos.
    Puedes ver el progreso en: github.com/matoriusbig/matoriusbig.github.io → pestaña Actions

  Opción B — Script rápido (para publicar con doble clic):
    Existe el archivo  publicar.bat  en la raíz del blog.
    Ábrelo, escribe el mensaje del commit y listo.
    (Si no existe todavía, pídele a Claude que lo cree.)

  ⑤ VERIFICACIÓN FINAL antes de hacer push
  ───────────────────────────────────────────
    ✓ Nombre del archivo: YYYY-MM-DD-titulo.md  (sin tildes, sin espacios)
    ✓ date: con el formato correcto  (2026-04-15 10:00:00 -0400)
    ✓ categories coincide con la sección del blog
    ✓ description presente (no dejarla vacía)
    ✓ Imagen copiada en assets/img/posts/ y referenciada correctamente
    ✓ Si va en el carrusel:  featured: true  + imagen definida
    ✓ Borrados todos los comentarios de esta plantilla

════════════════════════════════════════════════════════════════
-->

## Introducción

Escribe aquí una introducción al post.

---

## Reconocimiento

```bash
# Ejemplo de bloque de código con sintaxis bash
nmap -sV -sC -oN scan.txt 10.10.10.1
```

Explicación del resultado.

---

## Explotación

Describe el proceso de explotación.

> **Nota:** usa blockquotes para destacar información importante.

---

## Post-Explotación / Escalada de privilegios

```bash
# Comandos de ejemplo
whoami
id
```

---

## Flag

```
user.txt → xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
root.txt → xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Conclusión

Resumen de lo aprendido y puntos clave del laboratorio.
