# README Xinje: lectura, escritura y diagrama PC-PLC

Este documento explica como leer y mandar valores usando programacion Xinje/XDPPro para la integracion con la HMI del PC.

Hay dos casos distintos:

1. **Nuestra aplicacion PC-PLC**: el PC es maestro Modbus y el PLC Xinje es esclavo. En este caso el ladder del PLC normalmente **no usa `REGR` ni `REGW`** para hablar con el PC. El PC escribe/lee registros `D`, y el programa del PLC solo debe leer o escribir esos `D`.
2. **PLC como maestro hacia otro equipo**: si el Xinje va a leer/escribir un variador, otro PLC u otro esclavo Modbus, ahi si se usan instrucciones `REGR` y `REGW`.

Para esta HMI usa el caso 1 como arquitectura principal.

## Caso simple: contador interno, entrada X1 y salida Y1

Si solo quieres estas 3 cosas:

1. Ver un contador interno en la app.
2. Ver si el boton conectado a `X1` esta activo.
3. Activar o desactivar `Y1` desde la app.

Entonces si debes programar un poco en el PLC. No necesitas `REGR/REGW` para hablar con el PC; necesitas copiar valores internos a registros `D` y leer solicitudes desde otros registros `D`.

### Registros usados para este caso

PC a PLC:

| Registro | Uso |
|---|---|
| `D204` | Solicitud para `Y1`: `0` off, `1` on |
| `D205` | Request id de `Y1`; cambia cada vez que la app manda ON/OFF |

PLC a PC:

| Registro | Uso |
|---|---|
| `D220` | Valor del contador interno que quieres ver |
| `D221` | Estado de entrada `X1`: `0` off, `1` on |
| `D222` | Estado real/feedback de salida `Y1`: `0` off, `1` on |

La app ya tiene un panel `Simple I/O` que lee `D220-D222` y botones `Y1 ON/OFF` que escriben `D204-D205`.

### Diagrama de rungs para X1, contador y Y1

Este es el bloque minimo que deberia quedar en ladder. La idea es ponerlo en una zona de comunicacion, separado de la logica principal de maquina.

**Memorias usadas**

| Elemento | Uso |
|---|---|
| `C0` | Contador interno de ejemplo |
| `X1` | Entrada fisica del boton |
| `Y1` | Salida fisica a controlar |
| `D204` | Solicitud de Y1 desde la app: `0` off, `1` on |
| `D205` | Request id de Y1 desde la app |
| `D220` | Valor publicado del contador |
| `D221` | Valor publicado de X1 |
| `D222` | Feedback publicado de Y1 |
| `D306` | Ultimo request id de Y1 procesado |
| `M306` | Pulso interno: llego orden nueva para Y1 |
| `M307` | Permiso para aceptar orden remota de Y1 |

Para una prueba en banco puedes dejar `M307` siempre encendido. En maquina real, `M307` debe ser una condicion segura.

```text
RUNG 000 - Permiso remoto de prueba

|----[ SM0 ]--------------------------------------------( SET M307 )----|

; SM0 es el contacto siempre ON en Xinje XD/XL. Usa esto solo en pruebas.
; En maquina real reemplaza M307 por tus interlocks.
```

```text
RUNG 001 - Publicar contador interno hacia la app

|----[ SM0 ]--------------------------------------------[ MOV C0 D220 ]--|

; Si tu contador no es C0 sino D50, usa MOV D50 D220.
; La app lee D220 y lo muestra como Counter D220.
```

```text
RUNG 002 - Publicar X1 hacia la app cuando esta ON

|----[ X1 ]-----------------------------------------------[ MOV K1 D221 ]--|

; Si X1 esta activo, la app vera D221 = 1.
```

```text
RUNG 003 - Publicar X1 hacia la app cuando esta OFF

|----[/X1 ]-----------------------------------------------[ MOV K0 D221 ]--|

; Si X1 esta apagado, la app vera D221 = 0.
```

```text
RUNG 004 - Detectar que llego una orden nueva para Y1

|----[ D205 <> D306 ]-------------------------------------( SET M306 )----|

; D205 lo cambia la app cada vez que presionas Y1 ON o Y1 OFF.
; D306 guarda el ultimo D205 ya atendido por el PLC.
; Si son diferentes, hay una orden nueva.
```

En XDPPro no pongas `D205` como contacto normal. `D205` es un registro numerico, no un bit. Debes insertar una comparacion:

```text
LD<> D205 D306
```

Es el mismo tipo de bloque/contacto de comparacion que se usa para algo como:

```text
LD= C0 K1
```

Si lo pones como contacto simple, Xinje muestra `Instruction name Error`.

```text
RUNG 005 - Si la orden nueva pide ON y hay permiso, prender Y1

|----[ M306 ]----[ D204 = K1 ]----[ M307 ]----------------( SET Y1 )------|

; D204 = 1 significa que la app pidio Y1 ON.
; M307 es el permiso/interlock.
```

`D204 = K1` tambien debe ser una comparacion, no un contacto simple `D204`.

Como esta comparacion va en serie despues de `M306`, en XDPPro suele escribirse como:

```text
AND= D204 K1
```

```text
RUNG 006 - Si la orden nueva pide OFF, apagar Y1

|----[ M306 ]----[ D204 = K0 ]----------------------------( RST Y1 )------|

; D204 = 0 significa que la app pidio Y1 OFF.
; Normalmente apagar debe permitirse aunque M307 no este activo.
```

`D204 = K0` tambien debe insertarse como comparacion.

Como esta comparacion va en serie despues de `M306`, en XDPPro suele escribirse como:

```text
AND= D204 K0
```

```text
RUNG 007 - Marcar la orden como procesada

|----[ M306 ]---------------------------------------------[ MOV D205 D306 ]|

; Despues de ejecutar ON/OFF, copiamos D205 a D306.
; Asi la misma orden no se repite en cada scan.
```

```text
RUNG 008 - Borrar pulso interno de orden nueva

|----[ M306 ]---------------------------------------------( RST M306 )----|

; M306 solo debe durar dentro de esta pasada de ladder.
```

```text
RUNG 009 - Publicar feedback de Y1 cuando esta ON

|----[ Y1 ]-----------------------------------------------[ MOV K1 D222 ]--|

; La app no muestra lo que pidio: muestra lo que el PLC reporta.
```

```text
RUNG 010 - Publicar feedback de Y1 cuando esta OFF

|----[/Y1 ]-----------------------------------------------[ MOV K0 D222 ]--|

; Si Y1 esta apagado, la app vera D222 = 0.
```

**Vista compacta**

```text
000  SM0 ---------------------------------------------- SET M307

001  SM0 ---------------------------------------------- MOV C0 D220

002  X1 -------------------------------------------------- MOV K1 D221
003  /X1 ------------------------------------------------- MOV K0 D221

004  D205 <> D306 --------------------------------------- SET M306

005  M306 ---- D204 = K1 ---- M307 ---------------------- SET Y1
006  M306 ---- D204 = K0 ------------------------------- RST Y1

007  M306 ----------------------------------------------- MOV D205 D306
008  M306 ----------------------------------------------- RST M306

009  Y1 -------------------------------------------------- MOV K1 D222
010  /Y1 ------------------------------------------------- MOV K0 D222
```

**Como insertarlo en XDPPro**

Para las rungs con `D`:

1. No uses contacto normal.
2. Usa el contacto/bloque de comparacion con `LD`, `AND` u `OR` antes del operador.
3. Para detectar orden nueva configura:
   - Instruccion: `LD<>`
   - Operando 1: `D205`
   - Operando 2: `D306`
4. Para pedir ON configura:
   - Instruccion: `AND=`
   - Operando 1: `D204`
   - Operando 2: `K1`
5. Para pedir OFF configura:
   - Instruccion: `AND=`
   - Operando 1: `D204`
   - Operando 2: `K0`

Los contactos normales son para bits como `X1`, `M306`, `M307`, `Y1`, `SM0`. Los registros `D` se usan con instrucciones tipo `MOV` o con comparaciones.

Regla rapida:

| Si la comparacion... | Usa |
|---|---|
| Es el primer elemento de la rama | `LD=`, `LD<>`, `LD>`, `LD<`, `LD>=`, `LD<=` |
| Va en serie despues de otro contacto | `AND=`, `AND<>`, `AND>`, `AND<`, `AND>=`, `AND<=` |
| Va en paralelo como alternativa | `OR=`, `OR<>`, `OR>`, `OR<`, `OR>=`, `OR<=` |

**Orden importante**

Deja las rungs `004` a `008` en ese orden. Si haces `MOV D205 D306` antes de usar `M306` para prender/apagar `Y1`, puedes borrar la condicion antes de ejecutar la orden.

Tambien evita controlar `Y1` desde dos lugares distintos al mismo tiempo. Si ya tienes otra rung que maneja `Y1`, no pongas otra salida directa duplicada sin integrar los permisos.

### En Xinje: publicar contador interno

Supongamos que tu contador real es `C0`. Copialo a `D220`.

```text
; Cada scan o en el momento que actualices el conteo
MOV C0 D220
```

Si tu contador esta en otro registro, por ejemplo `D50`, entonces:

```text
MOV D50 D220
```

### En Xinje: publicar entrada X1

La app no lee `X1` directamente. El PLC debe copiar el estado de `X1` a `D221`.

```text
; Si X1 esta ON, publicar 1
[ X1 ] ------------------------------ MOV K1 D221

; Si X1 esta OFF, publicar 0
[/X1 ] ------------------------------ MOV K0 D221
```

### En Xinje: recibir orden para mover Y1

La app escribe:

```text
D204 = 1 para pedir Y1 ON
D204 = 0 para pedir Y1 OFF
D205 = numero nuevo cada vez que presionas ON/OFF
```

En el PLC no debes activar `Y1` solamente porque `D204 = 1`. Primero detecta que `D205` cambio, asi sabes que llego una orden nueva.

Memorias sugeridas:

| Memoria | Uso |
|---|---|
| `D306` | Ultimo request id de Y1 procesado |
| `M306` | Pulso de orden nueva para Y1 |
| `M307` | Permiso/interlock para dejar mover Y1 desde PC |

Logica conceptual:

```text
; Detectar orden nueva de Y1
SI D205 <> D306 ENTONCES
    M306 = ON por un scan
    MOV D205 D306
FIN

; Si llego orden nueva, D204=1 y hay permiso, prender Y1
SI M306 Y D204 = K1 Y M307 ENTONCES
    SET Y1
FIN

; Si llego orden nueva y D204=0, apagar Y1
SI M306 Y D204 = K0 ENTONCES
    RST Y1
FIN

; Publicar feedback real de Y1
SI Y1 ENTONCES
    MOV K1 D222
SI NO
    MOV K0 D222
FIN
```

En ladder se veria como idea:

```text
[ D205 <> D306 ] -------------------- SET M306
[ M306 ] ---------------------------- MOV D205 D306

[ M306 ] [ D204 = K1 ] [ M307 ] ----- SET Y1
[ M306 ] [ D204 = K0 ] -------------- RST Y1

[ Y1 ] ------------------------------ MOV K1 D222
[/Y1 ] ------------------------------ MOV K0 D222
```

Para una prueba de escritorio puedes dejar `M307` siempre ON. En maquina real, `M307` debe ser tu permiso seguro: sin emergencia, modo remoto permitido, puerta/cilindros/sensores en estado valido, etc.

### En la app

Antes de abrir el backend:

1. Deten el backend para liberar `COM9`.
2. Conecta Xinje Program Tool y descarga el programa ladder completo al PLC.
3. Pulsa el boton verde `Run`.
4. Confirma en la barra inferior `Run, Scan Cycle: ...`.
5. Desconecta y cierra Xinje Program Tool. El PLC permanece en `RUN`.

`Write To PLC` dentro de `PLC Serial Port Set` solo escribe la configuracion serial; no descarga ni inicia el programa ladder. Xinje Program Tool y el backend tampoco pueden usar `COM9` simultaneamente.

Luego:

1. Corre backend y frontend.
2. Abre `http://localhost:5173/`.
3. Desmarca `Simulator mode`.
4. Pon `Serial port` en `COM9`.
5. Click `Apply config`.
6. Click `Connect`.
7. Confirma que aparezca `Connected` y `Modbus RTU`.
8. Mira el panel `Simple I/O`:
   - `Counter D220` muestra el valor que el PLC copio a `D220`.
   - `Input X1 / D221` muestra `ON` si el PLC puso `D221 = 1`.
   - `Output Y1 / D222` muestra el feedback que el PLC puso en `D222`.
9. Mantener presionado `X1` debe producir `D221 = 1`; al soltarlo debe volver a `0`.
10. Usa `Y1 ON` o `Y1 OFF` para escribir `D204-D205`. El PLC copia el request id a `D306`, actua sobre `Y1` y publica el resultado en `D222`.

Resumen corto:

```text
PLC -> App:
C0 o D50  -> D220
X1        -> D221
Y1 real   -> D222

App -> PLC:
Y1 pedido -> D204
Nueva orden -> D205
```

### Debug crudo de Modbus

La app tiene un panel `Modbus debug` para pruebas de banco.

Usa `Read D204-D222` para leer una ventana completa de registros:

| Registro | Que debe mostrar durante la prueba |
|---|---|
| `D204` | Ultima orden escrita por la app para `Y1`: `1` ON, `0` OFF |
| `D205` | Request id que sube cada vez que presionas `Y1 ON/OFF` |
| `D220` | Contador publicado por el PLC |
| `D221` | Estado publicado de `X1`: `1` al presionar, `0` al soltar |
| `D222` | Feedback publicado de `Y1`: `1` si la salida real esta ON |

Interpretacion rapida:

| Lo que ves | Significado probable |
|---|---|
| `D204/D205` cambian, pero `Y1` no cambia | La app si escribe Modbus; revisar la rung `D205 <> D306`, permisos `M307` y comparaciones `D204 = K1/K0` |
| `D221` nunca cambia aunque el LED/input `X1` si cambia | La app si lee Modbus; revisar las rungs que hacen `X1 -> MOV K1 D221` y `/X1 -> MOV K0 D221` |
| Todo queda en cero, pero `Connected` aparece | El PLC responde Modbus, pero el programa no esta publicando esos registros o no esta corriendo el bloque esperado |
| Aparecen errores de timeout/no response | Revisar cable A/B, configuracion `COM2`, estacion `1`, `19200 8E1`, y que Xinje Program Tool no tenga abierto el puerto |

Tambien puedes abrir estos endpoints directo:

```text
http://127.0.0.1:8000/api/debug/read?address=204&count=19
http://127.0.0.1:8000/api/debug/log
http://127.0.0.1:8000/api/debug/coils?address=20480&count=8&prefix=X
http://127.0.0.1:8000/api/debug/coils?address=24576&count=8&prefix=Y
```

La lectura `address=204&count=19` cubre desde `D204` hasta `D222`.

Prueba confirmada en el PLC:

- La lectura de coils desde `20480` muestra el estado fisico de `X1`.
- Con el ladder en `RUN`, `D221` sigue a `X1` y la interfaz muestra `ON/OFF`.
- `Y1 ON/OFF` escribe `D204-D205`; el ladder detecta el request nuevo mediante `D205 <> D306`.
- El PLC ejecuta `SET Y1` o `RST Y1`, y `D222` devuelve el estado a la interfaz.
- Si los coils fisicos cambian pero `D221`, `D306` y `D222` permanecen en cero, comprobar primero que el PLC este en `RUN`.

## Configuracion serial esperada

En Xinje Program Tool, para el puerto RS485 deja:

| Parametro | Valor |
|---|---|
| Comport | Puerto serial interno del PLC, normalmente `COM2`/`K2` si el RS485 esta en el puerto 2 |
| Mode | `RTU` |
| Station Num | `1` |
| Baudrate | `19200 bps` |
| Databits | `8` |
| Checkbits | `Even` |
| Stopbits | `1` |
| Send Delay Time | `3 ms` |
| Response timeout | `300 ms` |
| Retry Times | `3` |
| Frame TimeOut | `0 ms` |

Confirmado con los manuales XDXL y la foto del PLC:

- En los XD, el puerto `COM2` es el RS485 del PLC.
- Ese `COM2` sale fisicamente por los bornes `A` y `B` del bloque de terminales.
- `A` es `RS485+`.
- `B` es `RS485-`.
- En instrucciones Xinje que pidan numero de puerto, `K2` significa `COM2(RS485)`.

En la foto, los bornes correctos son los dos tornillos rotulados `A` y `B`, ubicados en el bloque superior antes de `COM0/Y0`. No uses `COM0`, `COM1`, `COM2` que aparecen junto a `Y0`, `Y1`, `Y2`: esos son comunes de salidas, no el puerto de comunicacion.

En la app del PC:

| Campo | Valor |
|---|---|
| Simulator mode | Desmarcado |
| Serial port | `COM9` |
| Slave | `1` |
| Baud | `19200` |
| Poll ms | `300` |

Nota importante: `COM9` es el puerto de Windows del adaptador USB-RS485. En instrucciones Xinje, cuando aparece `K2` como puerto de comunicacion, se refiere al puerto fisico/serial del PLC, no al `COM9` de Windows.

## COM de Windows vs COM del PLC

Hay dos numeros que se parecen, pero no siempre significan lo mismo:

| Lugar | Que significa |
|---|---|
| Windows / backend / app | Puerto del adaptador USB-RS485 conectado al PC. En esta maquina ahora es `COM9`. |
| Xinje Program Tool / PLC Serial Port Set | Puerto serial interno/configurable del PLC. En un XD3-48 no debes escoger `COM9` si el modelo no tiene tantos puertos. |

Si Windows detecta el adaptador como `COM9`, la app debe usar:

```text
Serial port = COM9
```

En cambio, dentro de `PLC Serial Port Set`, el campo `Comport` debe ser el puerto fisico del PLC donde esta conectado el RS485. En este proyecto normalmente es:

```text
Comport = COM2
```

Si el PLC muestra este mensaje:

```text
COM9 supera la cantidad de puertos seriales soportados por este modelo y fue eliminado.
```

no significa que el adaptador USB-RS485 de Windows este mal. Significa que intentaste configurar el PLC como si tuviera un puerto interno `COM9`, y el XD3-48 no lo soporta. Borra esa entrada y vuelve a agregar un puerto valido del PLC, por ejemplo `COM2` si el cable esta en el puerto RS485/Port 2.

Despues de cambiar la configuracion serial del PLC:

1. Selecciona el puerto interno correcto del PLC, normalmente `COM2`.
2. Deja `Mode = RTU`, `Station Num = 1`, `19200`, `8`, `Even`, `1`.
3. Da `Write To PLC`.
4. Reinicia/rebootea el PLC para que tome la configuracion.
5. Cierra Xinje Program Tool antes de conectar la app por `COM9`.

No uses el mismo COM al mismo tiempo desde Xinje Program Tool y desde la app. Solo un programa puede abrir el puerto serial.

## Como leer un valor que manda la app

La app escribe comandos en estos registros del PLC:

| Registro | Lo escribe | Significado |
|---|---|---|
| `D200` | PC | Tamano de pila solicitado |
| `D201` | PC | Codigo de comando |
| `D202` | PC | Request id, cambia en cada comando |
| `D203` | PC | Heartbeat, cambia cada 1 segundo |

En ladder Xinje, leer un valor del PC es simplemente usar el registro `D`.

Ejemplo: si quieres usar el tamano de pila que mando la app:

```text
; D200 llega desde el PC
; Validar rango antes de aceptarlo

SI NewRequestPulse Y D200 >= K1 Y D200 <= K9999 ENTONCES
    MOV D200 D212
FIN
```

En ladder, la idea seria:

```text
[ NewRequestPulse ] [ D200 >= K1 ] [ D200 <= K9999 ] ---- MOV D200 D212
```

`D212` queda como "tamano aceptado" y la app lo lee para confirmar que el PLC acepto el valor.

## Como mandar un valor a la app

La app lee estado desde estos registros:

| Registro | Lo escribe | Lo lee | Significado |
|---|---|---|---|
| `D210` | PLC | PC | Estado principal de maquina |
| `D211` | PLC | PC | Conteo procesado |
| `D212` | PLC | PC | Tamano de pila aceptado |
| `D213` | PLC | PC | Request id aceptado |
| `D214` | PLC | PC | Codigo de falla |
| `D215` | PLC | PC | Palabra de estado por bits |
| `D216` | PLC | PC | Etapa actual |
| `D217` | PLC | PC | Version del contrato |

Mandar un valor a la app significa moverlo a uno de esos registros.

Ejemplos:

```text
; Maquina lista
MOV K2 D210

; Conteo procesado
MOV C10 D211

; Sin falla
MOV K0 D214

; Version de contrato
MOV K1 D217
```

La app no necesita que el PLC llame una instruccion especial para "enviar". El backend del PC hace polling y lee `D210-D217` cada `250-500 ms`.

## Como detectar un comando nuevo

No ejecutes el comando solo porque `D201` tiene un valor. Ejecutalo solo cuando cambia `D202`.

Memorias sugeridas:

| Memoria | Uso |
|---|---|
| `D300` | Ultimo request id visto |
| `M300` | Pulso de comando nuevo |

Logica:

```text
SI D202 <> D300 ENTONCES
    M300 = ON por un scan
    MOV D202 D300
    MOV D202 D213
FIN
```

En ladder conceptual:

```text
[ D202 <> D300 ] -------------------- SET M300
[ M300 ] ---------------------------- MOV D202 D300
[ M300 ] ---------------------------- MOV D202 D213
```

Despues, decodifica `D201` solo con `M300`.

## Codigos de comando desde la app

| `D201` | Comando | Accion recomendada en PLC |
|---:|---|---|
| `0` | None | No hacer nada |
| `1` | Start | Validar remoto, listo, sin falla, target valido |
| `2` | Pause | Pausar en punto seguro |
| `3` | Resume | Continuar solo si estaba pausado |
| `4` | Safe stop | Parada controlada, no emergencia |
| `5` | Reset counter | Reiniciar conteo solo en estado seguro |
| `6` | Confirm stack removed | Confirmar retiro de pila terminada |

Ejemplo conceptual:

```text
[ M300 ] [ D201 = K1 ] [ RemoteAllowed ] [ Ready ] [ NoFault ] ---- StartRequest
[ M300 ] [ D201 = K2 ] [ Running ] ------------------------------- PauseRequest
[ M300 ] [ D201 = K3 ] [ Paused ] -------------------------------- ResumeRequest
[ M300 ] [ D201 = K4 ] ------------------------------------------- SafeStopRequest
[ M300 ] [ D201 = K5 ] [ StoppedOrReady ] ------------------------ ResetCounterRequest
[ M300 ] [ D201 = K6 ] [ WaitingRemoval ] ------------------------ ConfirmRemovedRequest
```

## Diagrama completo recomendado

```text
                         USB-RS485
  Navegador HMI  <-->  Backend FastAPI  <====================>  Xinje PLC
  localhost:5173       Modbus master       COM9 / RS485          Modbus slave 1
                                                19200 8E1

                 PC escribe al PLC                     PLC escribe para el PC
              D200-D203, una transaccion              D210-D217, cada scan
```

Flujo de un comando:

```text
1. Operador presiona Start en la HMI.
2. Backend escribe:
   D200 = tamano de pila
   D201 = codigo de comando, por ejemplo K1
   D202 = request id nuevo
   D203 = heartbeat actual
3. PLC detecta que D202 cambio.
4. PLC valida condiciones.
5. PLC copia D202 a D213 para confirmar que proceso el comando.
6. PLC actualiza D210-D217.
7. Backend lee D210-D217.
8. HMI muestra estado actualizado.
```

## Mapa de registros mas completo

### PC a PLC

| Registro | Nombre | Tipo | Ejemplo | Regla PLC |
|---|---|---|---|---|
| `D200` | RequestedStackSize | Entero | `25` | Validar rango mecanico antes de usar |
| `D201` | CommandCode | Entero | `1` | Decodificar solo si `D202` cambio |
| `D202` | RequestId | Entero | `17` | Usar como flanco de comando |
| `D203` | PcHeartbeat | Entero | `231` | Debe cambiar aprox. cada 1 s |

### PLC a PC

| Registro | Nombre | Tipo | Valores |
|---|---|---|---|
| `D210` | MachineState | Entero | `0` init, `1` stopped, `2` ready, `3` running, `4` paused, `5` complete, `6` wait removal, `7` fault, `8` manual |
| `D211` | ProcessedCount | Entero | Cantidad procesada |
| `D212` | AcceptedStackSize | Entero | Tamano validado por PLC |
| `D213` | AcceptedRequestId | Entero | Copia del ultimo `D202` procesado |
| `D214` | FaultCode | Entero | `0` sin falla, otros valores segun tabla de fallas |
| `D215` | StatusWord | Bits | Flags de estado |
| `D216` | CurrentStage | Entero | Etapa/GRAFCET actual |
| `D217` | ContractVersion | Entero | `1` |

### Bits de `D215`

| Bit | Significado | Cuando debe estar ON |
|---:|---|---|
| `0` | Remote enabled | PLC acepta control remoto |
| `1` | Machine ready | Lista para iniciar |
| `2` | Cycle active | Ciclo corriendo |
| `3` | Pause active | Pausada |
| `4` | Stack completed | Pila completada |
| `5` | Fault active | Hay falla |
| `6` | Manual mode | Modo manual/mantenimiento |
| `7` | Heartbeat valid | Heartbeat PC valido |

Ejemplo de armado conceptual de `D215`:

```text
MOV K0 D215

SI RemoteEnabled      ENTONCES SET bit 0 de D215
SI MachineReady       ENTONCES SET bit 1 de D215
SI CycleActive        ENTONCES SET bit 2 de D215
SI PauseActive        ENTONCES SET bit 3 de D215
SI StackCompleted     ENTONCES SET bit 4 de D215
SI FaultActive        ENTONCES SET bit 5 de D215
SI ManualMode         ENTONCES SET bit 6 de D215
SI HeartbeatValid     ENTONCES SET bit 7 de D215
```

Si en XDPPro prefieres no manipular bits dentro de `D215`, tambien puedes sumar constantes:

| Flag | Valor decimal |
|---|---:|
| Bit 0 | `1` |
| Bit 1 | `2` |
| Bit 2 | `4` |
| Bit 3 | `8` |
| Bit 4 | `16` |
| Bit 5 | `32` |
| Bit 6 | `64` |
| Bit 7 | `128` |

Ejemplo: remoto + listo + heartbeat valido = `1 + 2 + 128 = 131`, entonces `D215 = K131`.

## Heartbeat del PC

El PC escribe `D203` cada 1 segundo. El PLC debe vigilar que cambie.

Memorias sugeridas:

| Memoria | Uso |
|---|---|
| `D301` | Ultimo heartbeat visto |
| `T300` | Timer de perdida de heartbeat |
| `M301` | Heartbeat valido |

Logica conceptual:

```text
SI D203 <> D301 ENTONCES
    MOV D203 D301
    RESET T300
    SET M301
FIN

SI T300 llega a 3 segundos ENTONCES
    RESET M301
    quitar bit 7 de D215
    pedir parada controlada si aplica
FIN
```

No uses perdida de heartbeat como paro de emergencia. El paro de emergencia debe seguir siendo fisico e independiente.

## Ejemplo minimo para probar con la app

Este ejemplo permite ver comunicacion sin mover salidas:

```text
; Siempre publicar version de contrato
MOV K1 D217

; Estado inicial listo
MOV K2 D210

; Sin falla
MOV K0 D214

; Remote + Ready + Heartbeat valid
MOV K131 D215

; Si llega comando nuevo
SI D202 <> D300 ENTONCES
    MOV D202 D300
    MOV D202 D213
    MOV D200 D212
FIN

; Si comando Start
SI M300 Y D201 = K1 ENTONCES
    MOV K3 D210
    MOV K4 D215
FIN
```

Despues de esto, en la app deberias ver que `Accepted request id` cambia y que `Accepted stack` toma el valor que escribiste en `Stack size`.

## Uso de `REGW`: escribir hacia otro esclavo Modbus

Usa `REGW` si el PLC Xinje actua como maestro y necesita escribir a otro dispositivo.

Formato visto en las capturas:

```text
REGW K1 K0 D0 K2
```

Interpretacion:

| Operando | Significado |
|---|---|
| `K1` | ID del esclavo |
| `K0` | Direccion de registro destino |
| `D0` | Registro local con el valor a escribir |
| `K2` | Puerto de comunicacion del PLC |

Ejemplo:

```text
; Escribir el valor local D0 en el registro 0 del esclavo 1 por el puerto 2
REGW K1 K0 D0 K2
```

Otro ejemplo:

```text
; Escribir D1 en el registro 1 del esclavo 1 por puerto 2
REGW K1 K1 D1 K2
```

Para no saturar el bus, dispara `REGW` con un pulso o temporizador, no en todos los scans.

## Uso de `REGR`: leer desde otro esclavo Modbus

Usa `REGR` si el PLC Xinje actua como maestro y necesita leer registros de otro dispositivo.

Formato visto en las capturas:

```text
REGR K1 K6 K2 D10 K2
```

Interpretacion:

| Operando | Significado |
|---|---|
| `K1` | ID del esclavo |
| `K6` | Direccion inicial de registro |
| `K2` | Cantidad de registros a leer |
| `D10` | Primer registro local donde guardar lo leido |
| `K2` | Puerto de comunicacion del PLC |

Ejemplo:

```text
; Leer 2 registros desde el esclavo 1, direccion 6,
; y guardarlos en D10 y D11 usando puerto 2
REGR K1 K6 K2 D10 K2
```

Si la lectura trae:

```text
D10 = 600
D11 = 8
```

entonces el esclavo respondio con dos registros y quedaron almacenados localmente en el PLC.

## Patron con temporizador para `REGW/REGR`

En tus capturas se ve un contador `C0 K3` disparado por `M8012`, que genera un ciclo cada 1000 ms. La idea es repartir operaciones:

```text
M8012 ---------------- C0 K3

C0 = K1 -------------- REGW K1 K0 D0 K2
C0 = K2 -------------- REGW K1 K1 D1 K2
C0 = K3 -------------- REGR K1 K6 K2 D10 K2

C0 ------------------- RST C0
```

Esto evita lanzar todas las comunicaciones al mismo tiempo.

Para la HMI PC-PLC principal, este patron no es necesario porque el maestro es el backend del PC. Pero sirve si ademas el PLC debe hablar con un variador u otro modulo por Modbus.

## Secuencia final recomendada para el proyecto

1. Configurar RS485 del PLC como Modbus RTU slave `1`, `19200 8E1`.
2. Reservar `D200-D217`.
3. En ladder, leer comandos desde `D200-D203`.
4. Detectar comando nuevo con cambio de `D202`.
5. Validar condiciones de seguridad e interlocks antes de ejecutar.
6. Escribir estado hacia `D210-D217` en cada scan.
7. Vigilar heartbeat `D203`.
8. Probar primero sin salidas fisicas activas.
9. Conectar app en `COM9`, simulador desmarcado.
10. Confirmar que la app muestra `Connected` y `Modbus RTU`.
