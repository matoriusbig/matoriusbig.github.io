---
title: "Título del Post"
date: 2026-01-01 10:00:00 -0400
categories: [Write-up]
tags: [tag1, tag2]
description: "Descripción corta del post. Máx 160 caracteres."
media_subpath: /assets/img/posts/YYYY-MM-DD-slug/
image:
  path: portada.png
featured: false
toc: true
---

<!--
════════════════════════════════════════════════════════════════
  CONFIGURACIÓN DE OBSIDIAN — hacer UNA sola vez
════════════════════════════════════════════════════════════════

  1. PLUGIN Image Converter → pestaña "Folder":
       Ubicación  →  "Carpeta específica del vault"
       Ruta       →  assets/img/posts/{notename}

     pestaña "Filename":
       Template   →  {timestamp}

  2. OBSIDIAN Settings → Files and links:
       New link format    →  "Shortest path when possible"
       Use [[Wikilinks]]  →  OFF

  Con esto:
    ▸ Pegas una imagen en el post
    ▸ Se guarda en:  assets/img/posts/2026-01-01-mi-post/1234567890.png
    ▸ Obsidian inserta:  ![](1234567890.png)
    ▸ Se ve en el preview de Obsidian ✓
    ▸ Se ve en el blog ✓  (media_subpath prepende la ruta correcta)

  PORTADA (image: path):
    ▸ Pega la imagen → renómbrala a portada.png en el explorador de Obsidian
      (Obsidian actualiza el link automáticamente)
    ▸ Escribe  path: portada.png  en el front matter

════════════════════════════════════════════════════════════════
  INSTRUCCIONES DE PUBLICACIÓN
════════════════════════════════════════════════════════════════

  ① Nombre del archivo → YYYY-MM-DD-slug.md  (sin tildes ni espacios)
  ② media_subpath      → /assets/img/posts/YYYY-MM-DD-slug/
     (el slug = el nombre exacto del archivo sin la extensión .md)
  ③ categories         → Write-up | Cheat Sheet | Proyecto
  ④ Git push:
       git add .
       git commit -m "post: Título"
       git push origin main
     GitHub Pages tarda ~2 min en publicar.

════════════════════════════════════════════════════════════════
  CALLOUTS DISPONIBLES (Chirpy prompts)
════════════════════════════════════════════════════════════════

> Texto informativo general.
{: .prompt-info }

> Consejo o tip operativo.
{: .prompt-tip }

> Advertencia, limitación o precaución.
{: .prompt-warning }

> Superficie de ataque, peligro o alerta crítica.
{: .prompt-danger }

════════════════════════════════════════════════════════════════
  ATTACK CARDS (copiar, pegar y editar)
════════════════════════════════════════════════════════════════

<div class="attack-grid">
  <div class="attack-card">
    <div class="atk-id">[ATK-01]</div>
    <h3>Nombre del vector</h3>
    <p>Descripción breve del vector de ataque.</p>
  </div>
  <div class="attack-card">
    <div class="atk-id">[ATK-02]</div>
    <h3>Nombre del vector</h3>
    <p>Descripción breve del vector de ataque.</p>
  </div>
  <div class="attack-card">
    <div class="atk-id">[ATK-03]</div>
    <h3>Nombre del vector</h3>
    <p>Descripción breve del vector de ataque.</p>
  </div>
</div>

════════════════════════════════════════════════════════════════
-->

## Introducción

Escribe aquí una introducción al post.

---

## Reconocimiento

```bash
nmap -sV -sC -oN scan.txt 10.10.10.1
```

---

## Explotación

> Consejo operativo.
{: .prompt-tip }

---

## Post-Explotación / Escalada de privilegios

```bash
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
