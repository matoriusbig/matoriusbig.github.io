---
title: Explotación manual vs. automática
date: 2026-01-01 10:00:00 -0400
categories:
  - Write-up
tags:
description: Explicación de las diferencias entre la explotación manual y la automatizada.
image:
  path: nombre-imagen.png
  alt: Descripción breve de la imagen
featured: false
toc: true
---
# Explotación Manual 
Es un tipo de explotación que se realiza de **manera manual** y requiere que el atacante tenga un conocimiento profundo del sistema y sus vulnerabilidades. En este enfoque, el atacante utiliza herramientas y técnicas específicas para identificar y explotar vulnerabilidades en un sistema objetivo. Este enfoque es más lento y requiere más esfuerzo y habilidad por parte del atacante, pero también es más preciso y permite un mayor control sobre el proceso de explotación.
## Analogía
Es el arte de entender exactamente cómo funciona la aplicación por debajo. No dependes de que una herramienta te diga si hay un fallo, sino que tú mismo interactúas con las peticiones HTTP, analizas las respuestas, los errores y la lógica del código.
### **¿Cuándo se usa?** 
Es crucial cuando te enfrentas a un Web Application Firewall (WAF) que bloquea herramientas automáticas, cuando hay vulnerabilidades lógicas (que un escáner no entiende) o cuando estás encadenando múltiples vulnerabilidades simples para lograr un impacto crítico.
### **Herramientas clave:**
Burp Suite (específicamente los módulos Proxy y Repeater), ZAP, o simplemente el navegador web.
## Ejemplo práctico (SQLi Manual)
Imagina que despliegas el contenedor de `sqlinjection-training-app` y encuentras un formulario de login.
### **Paso 1: Reconocimiento y provocación del error**
Ingresas una comilla simple `'` en el campo de usuario para romper la consulta SQL original de la base de datos.
```sql
Usuario: admin'
Contraseña: password
```
_Si la aplicación devuelve un error de sintaxis SQL, confirmas que es vulnerable._
### **Paso 2: Elaboración del Payload (Bypass de Autenticación)** 
Sabiendo que el motor es vulnerable, inyectas lógica matemática que siempre sea verdadera (`OR 1=1`) y comentas el resto de la consulta original (con `-- -` o `#`).
```sql
Usuario: admin' OR 1=1 -- -
Contraseña: [No importa lo que pongas]
```
**Resultado**: Logras acceder como el primer usuario de la tabla (usualmente el administrador) sin conocer su contraseña real. Has explotado el sistema de forma quirúrgica y silenciosa.

# Explotación Automatizada 
Es un tipo de explotación que se realiza **automáticamente** mediante el uso de **herramientas automatizadas**, como scripts o programas diseñados específicamente para identificar y explotar vulnerabilidades en un sistema objetivo. Este enfoque es más rápido y menos laborioso que el enfoque manual, pero también puede ser menos preciso y puede generar más ruido en la red objetivo, lo que aumenta el riesgo de detección.
## Analogía
La explotación automatizada consiste en delegar el trabajo pesado a un script o programa. Estas herramientas tienen miles de _payloads_ preconfigurados y los disparan a gran velocidad contra el objetivo para ver cuál funciona.
### **¿Cuándo se usa?** 
Cuando el tiempo es un factor, en fases iniciales de reconocimiento masivo, o cuando ya confirmaste una vulnerabilidad manual muy tediosa de explotar a mano (como un _Blind SQL Injection_ basado en tiempo, donde tendrías que adivinar la base de datos letra por letra).
### **Contras:** 
Es extremadamente ruidoso. En un entorno real, los Blue Teams o los sistemas IDS/IPS detectarán cientos de miles de peticiones maliciosas por minuto y bloquearán tu IP casi al instante.
###  **Herramientas clave:** 
SQLmap, Metasploit, Nuclei, escáneres de Nessus o Burp Suite Professional (Scanner).
## Ejemplo práctico (SQLi Automatizado con SQLmap)
Usando el mismo entorno de `sqlinjection-training-app`, en lugar de probar a mano, capturas la petición del formulario de login y usas `sqlmap`.
### **Paso 1: Capturar la petición** 
Guardas la petición POST del login en un archivo de texto llamado `peticion.txt`.
### **Paso 2: Ejecutar el ataque con SQLmap** 
Le dices a la herramienta que lea la petición y extraiga todas las bases de datos disponibles.
```shell
# El parámetro -r lee el archivo y --dbs le dice que extraiga las bases de datos
sqlmap -r peticion.txt --batch --dbs
```
**Resultado:** En cuestión de segundos, la herramienta probará cientos de inyecciones (basadas en error, booleanas, basadas en tiempo) y te devolverá en la terminal los nombres de las bases de datos, pero habrá dejado un rastro gigante en los logs del servidor web.
### Cuadro Comparativo

| Característica        | Explotación Manual                                          | Explotación Automatizada                                                                         |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Velocidad**         | Lenta. Requiere análisis paso a paso.                       | Muy rápida. Ejecuta miles de pruebas por minuto.                                                 |
| **Precisión**         | Alta. El atacante controla cada byte enviado.               | Variable. Puede dar falsos positivos o romper servicios.                                         |
| **Sigilo (Ruido)**    | Silenciosa. Difícil de detectar por sistemas automatizados. | Muy ruidosa. Genera alertas inmediatas en firewalls/IDS.                                         |
| **Nivel requerido**   | Alto. Requiere entender el código y la vulnerabilidad.      | Bajo a Medio. Basta con saber usar la herramienta (Script Kiddie / Automatización de pentester). |
| **Caso de uso ideal** | Evasión de WAFs, lógica de negocio, CTFs difíciles.         | Extraer grandes volúmenes de datos (ej. volcar una BD) tras confirmar la brecha.                 |

Es importante tener en cuenta que el tipo de explotación utilizado en un ataque dependerá de los objetivos del atacante, sus habilidades y del nivel de seguridad implementado en el sistema objetivo. En general, los ataques de explotación manual son más precisos y discretos, pero también requieren más tiempo y habilidades. Por otro lado, los ataques de explotación automatizada son más rápidos y menos laboriosos, pero también pueden ser más ruidosos y menos precisos.  