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
## Introducción

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

## ¿Qué es el DNS?

Cuando escribes `google.com` en tu navegador, tu computador no sabe a qué servidor conectarse. Las computadoras solo entienden números (IPs), no nombres. Entonces ocurre esto:

```
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

## Enumeración

Antes de atacar, confirmamos que el servidor DNS está activo y obtenemos su versión:

```bash
nmap -p53 -Pn -sV -sC 10.129.203.6
```

| Flag | Qué hace |
|------|----------|
| `-p53` | Solo escanea el puerto 53, que es el puerto del DNS |
| `-Pn` | No hace ping previo, asume que el host está activo |
| `-sV` | Detecta la versión del servicio (ej: ISC BIND 9.11.3) |
| `-sC` | Ejecuta scripts automáticos de Nmap para obtener más info |
![](1776287349489.webp)

Si el puerto aparece como `open`, el servidor DNS está activo. La versión del servicio puede revelar CVEs conocidos, así que conviene anotarla siempre.

> Versiones antiguas de ISC BIND tienen vulnerabilidades públicas documentadas. Busca el string de versión en `searchsploit bind` antes de continuar.
{: .prompt-tip }

---

## Explotación

### ATK-01 — Zone Transfer (AXFR)

Una empresa grande no tiene un solo servidor DNS. Tiene varios: uno principal y uno o más de respaldo, por si el principal cae. El problema es que todos deben tener la misma información. Para sincronizarse usan una **Zone Transfer**: el servidor secundario le dice al primario *"dame una copia de todos tus registros"*, y el primario se los envía.

El servidor primario debería verificar quién le hace esa petición y entregarla solo a sus propios servidores secundarios. Pero muchos administradores no configuran eso correctamente:

```
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

```bash
dig AXFR @10.129.56.120 inlanefreight.htb
```

| Parte                    | Qué hace                                                      |
| ------------------------ | ------------------------------------------------------------- |
| `dig`                    | Herramienta de Linux para hacer consultas DNS manualmente     |
| `AXFR`                   | Tipo de consulta: solicita una transferencia de zona completa |
| `@ns1.inlanefreight.htb` | El `@` indica a qué servidor DNS le preguntas directamente    |
| `inlanefreight.htb`      | El dominio del que quieres todos los registros                |

![](1776298497076.webp)

Cada línea del output se lee así:

```
[nombre del host]   [TTL en segundos]  IN  [tipo]  [IP]
admin.empresa.htb      604800          IN    A    10.129.110.21
     ↑                   ↑                   ↑         ↑
  subdominio       cuánto tiempo se      tipo A =   la IP a la
  encontrado       guarda en caché       dirección  que apunta
```

También puedes usar **Fierce**, que automatiza el intento de AXFR contra todos los nameservers del dominio y hace fuerza bruta de subdominios si falla:

```bash
fierce --domain zonetransfer.me
```

| Parte      | Qué hace                                                            |
| ---------- | ------------------------------------------------------------------- |
| `fierce`   | Busca los NS del dominio e intenta AXFR en cada uno automáticamente |
| `--domain` | El dominio objetivo                                                 |

```shell
NS: nsztm1.digi.ninja. nsztm2.digi.ninja.
SOA: nsztm1.digi.ninja. (81.4.108.41)
Zone: success
{<DNS name @>: '@ 7200 IN SOA nsztm1.digi.ninja. robin.digi.ninja. 2019100801 '
               '172800 900 1209600 3600\n'
               '@ 7200 IN DNSKEY 256 3 7 AwEAAapoL+InQBYx2oi3dI424+dEDFgn '
               'VW0cOINfCY3jLrngZxBsEur8ByhMOQsx '
               'oIOYu/7b3c8tj2BwlQquqxZe79QHSW78 '
               'fK7D+bP/8AosnBG5K5gJXEvphEtJ9x8/ '
               'X0Y971XaW9lLmtJ6h4AXsrbgTr2g9KOi '
               'PSIbvDPMW8qLMaQkTm89hvPc+NuzrOEO '
               'PNhoXs/iPM+SQzrvTBfr6y0w2yPtYYdW '
               'I1kN76OQBxh0xjIdlyT0QKiohKq2bybP '
               'ROJO7K3NlDc8oaOZoXH5/RfLDQzxzXyY '
               'SV8fLwimUeulo7YA11I/AHQ7DsUsFu2S 2vxGCyR8nmx9gYbN4sBvTF2i5eM=\n'
               '@ 301 IN TXT '
               '"google-site-verification=tyP28J7JAUHA9fw2sHXMgcCC0I6XBmmoVi04VlMewxA"\n'
               '@ 7200 IN MX 0 ASPMX.L.GOOGLE.COM.\n'
               '@ 7200 IN MX 10 ALT1.ASPMX.L.GOOGLE.COM.\n'
               '@ 7200 IN MX 10 ALT2.ASPMX.L.GOOGLE.COM.\n'
               '@ 7200 IN MX 20 ASPMX2.GOOGLEMAIL.COM.\n'
               '@ 7200 IN MX 20 ASPMX3.GOOGLEMAIL.COM.\n'
               '@ 7200 IN MX 20 ASPMX4.GOOGLEMAIL.COM.\n'
               '@ 7200 IN MX 20 ASPMX5.GOOGLEMAIL.COM.\n'
               '@ 7200 IN A 5.196.105.14\n'
               '@ 7200 IN NS nsztm1.digi.ninja.\n'
               '@ 7200 IN NS nsztm2.digi.ninja.\n'
               '@ 7200 IN CERT PKIX 0 0 MIIDvTCCAqUCFHh5BGzOrlYrXo5h90ip '
               'm0aDUEz9MA0GCSqGSIb3DQEBCwUAMIGa '
               'MQswCQYDVQQGEwJHQjEYMBYGA1UECAwP '
               'U291dGggWW9ya3NoaXJlMRIwEAYDVQQH '
               'DAlTaGVmZmllbGQxEjAQBgNVBAoMCURp '
               'Z2luaW5qYTEQMA4GA1UECwwHSGFja2lu '
               'ZzEYMBYGA1UEAwwPem9uZXRyYW5zZmVy '
               'Lm1lMR0wGwYJKoZIhvcNAQkBFg56dG1A '
               'ZGlnaS5uaW5qYTAeFw0yNTA3MDIxMzU1 '
               'MTNaFw0yNjA3MDIxMzU1MTNaMIGaMQsw '
               'CQYDVQQGEwJHQjEYMBYGA1UECAwPU291 '
               'dGggWW9ya3NoaXJlMRIwEAYDVQQHDAlT '
               'aGVmZmllbGQxEjAQBgNVBAoMCURpZ2lu '
               'aW5qYTEQMA4GA1UECwwHSGFja2luZzEY '
               'MBYGA1UEAwwPem9uZXRyYW5zZmVyLm1l '
               'MR0wGwYJKoZIhvcNAQkBFg56dG1AZGln '
               'aS5uaW5qYTCCASIwDQYJKoZIhvcNAQEB '
               'BQADggEPADCCAQoCggEBALzYVM9WlBqO '
               'KU1lmnKJkKdIEZOhkscHQktEJORXCism '
               'SWV3FfbsLw7D3sfCc0h9ecZglsYvFUmE '
               'M0I0noYtuHPAlF2+FotVuoFrYuMYrEQo '
               'Zs4kuORIEx8pwHMZQUSM6KwVVLIB/FE9 '
               '56GfovgxGxWs33QaTKATAVChD9KTLf6w '
               'Vh/eC+0GI6mbvGvjqZFmmV/SYmmkdqEB '
               'WB7q3+SByfVrUohCA2GO30dwk6vUBtIj '
               '+J+i4SzKzLXIvFEfbCirMPQvdflgwPbj '
               'wp+cWG7oUBvfQZfZbaTp+9+V8FoBl0f8 '
               'fGj/Mae1n0rSV5hnuXot8d3PAoAWQtW3 '
               'HJUv1nEboAMCAwEAATANBgkqhkiG9w0B '
               'AQsFAAOCAQEAXop6ftpV2/r7tkXqFCsM '
               'wub7ZBd12U14nsBon+X7K5Nr6obrVAtn '
               'WO+XwD8x2UgvYIQBuRLK9LOX6VYoiWMV '
               'rItIN8KRSsin5eJe4tzewsNGrVtkVbbK '
               'ULViCeBtDgmImk8rkZeWU1uNOsq0t/wd '
               '3GUZe2CM9DpKVhPFhc9Uq3pYbAsidYlp '
               'SApuuj8ka3L+VruzJVwveyKTUkWAsN1i '
               'Sv7BGgEF0039WW3IEv1ZP81cAdWFy1fx '
               '+tuteM6Iz5xkx1tp0/eLtb39cnKFQnrs '
               '8itDG2j3yBc3CClYmw4NNU2nODN4COt7 '
               'uzXBez6iIFSNqQjVyFyomtPn4ae0cYRH Ew==\n'
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

> Si el servidor valida la IP solicitante, el AXFR fallará. En ese caso, pasar directamente a enumeración de subdominios con Subfinder o Subbrute.
{: .prompt-warning }

---

### ATK-02 — Subdomain Takeover

Un registro **CNAME** es un alias DNS: en lugar de apuntar a una IP, apunta a otro nombre de dominio. Ejemplo:

```
support.inlanefreight.com  →  CNAME  →  inlanefreight.s3.amazonaws.com
```

La empresa usó un bucket de AWS S3 para hospedar su página de soporte y creó ese alias. Ahora imagina que la empresa **elimina el bucket**, pero **se olvida de borrar el registro CNAME**. El DNS sigue redirigiendo tráfico hacia un recurso que ya no existe:

```
Antes (normal):
Usuario → support.inlanefreight.com → bucket AWS (empresa) → página real

Después de eliminar el bucket (vulnerable):
Usuario → support.inlanefreight.com → bucket AWS (TUYO) → lo que tú quieras
```

Basta con crear un bucket de S3 con ese mismo nombre en tu cuenta para tomar control del subdominio. La URL en el navegador sigue diciendo `support.inlanefreight.com`, el dominio legítimo de la empresa, pero sirve tu contenido.

**Paso 1 — Enumerar subdominios con Subfinder** (requiere Internet):

Para instalar la herramienta se usa el siguiente comando:

```bash
sudo apt install subfinder
```

Para ejecutarla es así:

```bash
subfinder -d inlanefreight.com -v
```

| Flag | Qué hace                                                    |
| ---- | ----------------------------------------------------------- |
| `-d` | El dominio que quieres enumerar                             |
| `-v` | Verbose: muestra de qué fuente OSINT obtuvo cada subdominio |
|      |                                                             |

![](1776290202505.webp)

Subfinder no hace fuerza bruta. Consulta bases de datos públicas donde ya están registrados esos subdominios: certificados SSL, motores de búsqueda, DNSdumpster, AlienVault, etc.l

**Paso 1 alternativo — Subbrute** (para redes internas sin Internet):herd 

```bash
git clone https://github.com/TheRook/subbrute.git
cd subbrute
echo "10.129.56.120" > resolvers.txt
python3 subbrute.py inlanefreight.com -s names.txt -r ./resolvers.txt
```

| Flag | Qué hace |
|------|----------|
| `-s ./names.txt` | Diccionario de nombres a probar: `admin`, `vpn`, `mail`, `dev`, etc. |
| `-r ./resolvers.txt` | El servidor DNS interno que usará para resolver |

![](1776297799509.webp)

> Subbrute es ideal para pivoting: apunta `-r` a un DNS interno y descubres hosts que nunca serían visibles desde fuera de la red.
{: .prompt-tip }

**Paso 2 — Verificar si algún subdominio apunta a un servicio expirado:**

```bash
host support.inlanefreight.com
```

| Parte                       | Qué hace                                        |
| --------------------------- | ----------------------------------------------- |
| `host`                      | Herramienta de resolución DNS desde la terminal |
| `support.inlanefreight.com` | El subdominio que quieres verificar             |

![](1776291198901.webp)

Si ves un alias CNAME apuntando a un servicio de terceros (AWS, GitHub, Heroku, etc.), visitas la URL en el navegador. Si ves el error `NoSuchBucket` o equivalente, el recurso está expirado y el subdominio es vulnerable.

![](1776291226613.webp)

> El repositorio [can-i-take-over-xyz](https://github.com/EdOverflow/can-i-take-over-xyz) lista todos los servicios vulnerables a subdomain takeover con guías específicas para cada proveedor.
{: .prompt-info }

---

## Post-Explotación / Escalada de privilegios

### ATK-03 — DNS Cache Poisoning con Ettercap

Cada vez que tu computador resuelve un dominio, guarda la respuesta temporalmente en memoria. Esto se llama **caché DNS**:

```
Primera vez:
Tu PC → "¿cuál es la IP de google.com?" → DNS → "142.250.80.46"
Tu PC guarda en caché: google.com = 142.250.80.46

Segunda vez:
Tu PC → revisa caché → "ya sé que es 142.250.80.46" → se conecta directo
```

El ataque consiste en **meter una respuesta falsa en ese caché**. Si logramos que la víctima guarde `inlanefreight.com = NUESTRA_IP`, cada vez que intente visitarlo llegará a nuestro servidor. Para hacer esto, primero nos posicionamos como **MITM** entre la víctima y el router con ARP Poisoning:

```
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

```
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

## Resumen

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

## Conclusión

El DNS es un protocolo fundamental que, cuando está mal configurado o no se monitorea adecuadamente, se convierte en una de las fuentes de información más ricas para un atacante. Una zone transfer expone toda la infraestructura interna con una sola consulta, un subdomain takeover permite servir contenido malicioso bajo un dominio de confianza, y el cache poisoning redirige el tráfico de cualquier host en la red local.

Entender estos vectores es esencial tanto para atacar como para defender: restringir las transferencias de zona a IPs autorizadas, auditar periódicamente los registros CNAME activos y monitorear el tráfico DNS son contramedidas básicas que muchas organizaciones aún no implementan correctamente.