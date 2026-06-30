# Planeacion: stack final y plantillas procesadas

Este plan aterriza la integracion PC-PLC sobre el programa real `SECUENCIALOL.xdp` y el contrato Modbus ya usado por el backend.

Objetivos concretos:

1. La app envia la cantidad de cajas/plantillas que debe tener el stack final.
2. El PLC recibe esa cantidad, la valida y la usa como limite real del secuencial.
3. El PLC envia a la app la cantidad de plantillas/cajas procesadas.

## Punto de partida del ladder real

Del archivo `SECUENCIALOL.xdp` se identifico:

| Elemento | Comentario en el PLC | Uso en el secuencial |
|---|---|---|
| `D0` | `BOXLIMIT` | Limite de cajas/plantillas del stack final |
| `C0` | `CTR` | Contador auxiliar usado para decidir ventosas en la primera parte |
| `C1` | `CTR_S` | Contador comparado contra `D0` para el stack final |
| `M100` | `ETAPA_0` | Estado base/listo del secuencial |
| `M101`...`M138` | Etapas | Secuencia de maquina |

En el ladder actual aparece:

```text
SM2 ---------------- SET M100
                    MOV K3 D0
```

Es decir, hoy el limite del stack final queda fijo en `D0 = 3` al iniciar. Para la integracion con la app, cambia ese valor por el default operativo:

```text
SM2 ---------------- SET M100
                    MOV K20 D0
                    MOV K20 D212
```

`K20` es solo el valor inicial si la app aun no ha enviado nada. Cuando el operador cambie la cantidad en la app, la app escribira `D200` y el PLC copiara `D200` a `D0`.

Tambien en `ETAPA_34` se ven comparaciones como:

```text
C1 < D0
C1 = D0
```

Por eso `D0` es el mejor punto para cargar la cantidad que manda la app.

## Contrato Modbus usado

La app/backend ya esta preparado para este contrato:

### PC a PLC

| Registro | Uso |
|---|---|
| `D200` | Cantidad solicitada para el stack final |
| `D201` | Codigo de comando |
| `D202` | Request id, cambia en cada comando |
| `D203` | Heartbeat del PC |

### PLC a PC

| Registro | Uso |
|---|---|
| `D210` | Estado de maquina |
| `D211` | Cantidad procesada |
| `D212` | Cantidad aceptada por el PLC |
| `D213` | Ultimo request id procesado |
| `D214` | Codigo de falla |
| `D215` | Palabra de estado |
| `D216` | Etapa actual |
| `D217` | Version de contrato |

## Decision de integracion

Usaremos este mapeo:

```text
App escribe D200  ------>  PLC valida  ------>  MOV D200 D0
                                               MOV D200 D212

PLC cuenta C1     ------>  MOV C1 D211  ------>  App muestra procesadas
```

Entonces:

| Variable real | Registro app | Direccion |
|---|---|---|
| `D0` / `BOXLIMIT` | `D200` y `D212` | PC pide, PLC acepta |
| `C1` / `CTR_S` | `D211` | PLC publica a PC |

No se recomienda usar `C0` como conteo principal de la app porque `C0` esta usado para decisiones internas de ventosas. Para el stack final, el contador coherente con `D0` es `C1`.

Importante: `D200` no es el maximo permitido por la maquina. `D200` es la cantidad objetivo del grupo actual. Si el operador escribe `20`, el grupo termina en 20 plantillas; si escribe `25`, termina en 25; si escribe `10`, termina en 10.

## Donde colocar estas rungs

En XDPPro, crea una seccion nueva al final del bloque de etapas, justo despues de `ETAPA_38` y antes de `ACCIONES`.

Ubicacion recomendada:

```text
ETAPA_38
...
GROUPE

; ==============================
; COMUNICACION_PC_STACK_FINAL
; ==============================
; colocar aqui las rungs de este documento

ACCIONES
ACTIVACION
...
```

La razon es que estas rungs no deben meterse dentro de una etapa especifica. Son una capa de comunicacion y publicacion de datos.

## Registros internos nuevos sugeridos

Usa memorias libres que no choquen con el secuencial existente:

| Elemento | Uso |
|---|---|
| `D300` | Ultimo `D202` procesado |
| `M300` | Pulso interno de comando nuevo desde PC |
| `M301` | Cantidad solicitada valida |
| `M302` | Cantidad solicitada invalida |

Antes de implementarlo, confirma que `D300`, `M300`, `M301` y `M302` no esten usados en tu proyecto.

## Rango permitido

El objetivo debe ser configurable desde la app. El default de la app/backend queda en:

```text
Stack size = 20
```

Pero el operador puede cambiarlo a `25`, `10`, etc. Para no volver a fijar el programa en `K3`, la validacion inicial del PLC debe permitir el rango operativo amplio que ya acepta el backend:

```text
Minimo: K1
Maximo tecnico: K9999
```

Si luego se define un maximo mecanico real, por ejemplo `K50`, cambia `K9999` por ese valor. Por ahora `K9999` solo evita valores invalidos, no define el tamano normal del stack.

## Constantes usadas por la app

Estos codigos ya existen en el backend y la HMI:

| Codigo | Uso |
|---:|---|
| `K0` | Sin falla / valor apagado |
| `K1` | Version de contrato `1`, comando `start` o valor verdadero segun contexto |
| `K2` | Estado `ready` en `D210` |
| `K3` | Estado `running` en `D210` |
| `K10` | Falla `invalid_stack_size` en `D214` |
| `K9999` | Maximo tecnico aceptado por el backend para `stack_size` |

`D217` viene del contrato de la app. En `backend/app/modbus_contract.py` existe:

```text
CONTRACT_VERSION = 1
```

Por eso el PLC debe publicar:

```text
MOV K1 D217
```

La app lo muestra como `Contract version`. No es una orden ni un contador; es una forma de confirmar que el programa del PLC y la app estan hablando el mismo mapa de registros.

## Diagrama de rungs

### RUNG PC-000 - Publicar version de contrato

```text
|----[ SM0 ]---------------------------------------------[ MOV K1 D217 ]--|
```

Por que:

- `SM0` es siempre ON en Xinje.
- `K1` significa version `1` del contrato.
- `D217` es el registro que la app lee como `contract_version`.
- Esto permite diagnosticar si el PLC tiene cargado el mapa correcto.

### RUNG PC-001 - Detectar comando nuevo desde la app

```text
|----[ LD<> D202 D300 ]----------------------------------( SET M300 )-----|
```

En XDPPro se inserta como comparacion:

```text
LD<> D202 D300
SET M300
```

`D202` cambia cada vez que la app manda un comando. `D300` guarda el ultimo comando ya procesado.

Por que se hace `SET M300`:

- El PLC escanea muchas veces por segundo.
- Si el comando queda escrito en `D200-D202`, sin pulso se podria procesar una y otra vez.
- `M300` es un pulso interno que significa: "hay un comando nuevo pendiente de procesar".
- Al final del bloque se hace `RST M300`, por eso solo vive durante esta pasada de ladder.

### RUNG PC-002 - Marcar cantidad valida

```text
|----[ M300 ]----[ AND>= D200 K1 ]----[ AND<= D200 K9999 ]--( SET M301 )--|
```

En lista Xinje:

```text
LD M300
AND>= D200 K1
AND<= D200 K9999
SET M301
```

Por que:

- `M300` garantiza que validamos solo cuando llego un request nuevo.
- `D200` es la cantidad objetivo que mando la app.
- `K1` evita objetivo cero o negativo.
- `K9999` coincide con el maximo tecnico permitido por el backend.
- `M301` significa: "cantidad valida, se puede copiar a `D0`".

### RUNG PC-003 - Marcar cantidad invalida por debajo del minimo

```text
|----[ M300 ]----[ AND< D200 K1 ]------------------------( SET M302 )-----|
```

En lista Xinje:

```text
LD M300
AND< D200 K1
SET M302
```

Por que:

- Si `D200 < K1`, la app mando una cantidad imposible.
- `M302` marca que se debe publicar falla y no tocar `D0`.

### RUNG PC-004 - Marcar cantidad invalida por encima del maximo

```text
|----[ M300 ]----[ AND> D200 K9999 ]---------------------( SET M302 )-----|
```

En lista Xinje:

```text
LD M300
AND> D200 K9999
SET M302
```

Por que:

- Evita valores fuera del rango que el backend permite.
- Si luego defines un maximo mecanico, cambia `K9999` por ese maximo real.

### RUNG PC-005 - Cargar cantidad aceptada al limite real del secuencial

```text
|----[ M301 ]--------------------------------------------[ MOV D200 D0 ]---|
```

Esto es lo mas importante:

```text
D200  -> cantidad pedida por la app
D0    -> BOXLIMIT usado por el ladder real
```

Por que:

- El ladder existente ya compara `C1` contra `D0`.
- No cambiamos la logica principal del secuencial.
- Solo cambiamos de donde sale el limite: antes era `K3`, ahora viene de la app por `D200`.

### RUNG PC-006 - Publicar cantidad aceptada

```text
|----[ M301 ]--------------------------------------------[ MOV D200 D212 ]-|
```

La app lee `D212` para saber que el PLC acepto esa cantidad.

Por que:

- `D200` es lo que el operador pidio.
- `D212` es lo que el PLC acepto realmente.
- Si la cantidad fue invalida, `D212` no se actualiza con un valor malo.

### RUNG PC-007 - Limpiar falla si la cantidad fue valida

```text
|----[ M301 ]--------------------------------------------[ MOV K0 D214 ]---|
```

`D214 = 0` significa sin falla.

Por que:

- `D214` es el codigo de falla que la app muestra.
- `K0` significa `none` / sin falla en el backend.

### RUNG PC-008 - Publicar falla si la cantidad fue invalida

```text
|----[ M302 ]--------------------------------------------[ MOV K10 D214 ]--|
```

`K10` coincide con el backend como `invalid_stack_size`.

Por que:

- El backend ya traduce falla `10` como `invalid_stack_size`.
- La app puede mostrar que el PLC rechazo la cantidad.

### RUNG PC-009 - Confirmar request id procesado

```text
|----[ M300 ]--------------------------------------------[ MOV D202 D213 ]-|
```

La app ve `D213` y sabe que el PLC proceso ese request.

Por que:

- `D202` es el id enviado por la app.
- `D213` es el id confirmado por el PLC.
- Sirve para diagnosticar si la orden llego y fue evaluada.

### RUNG PC-010 - Guardar ultimo request id

```text
|----[ M300 ]--------------------------------------------[ MOV D202 D300 ]-|
```

Esto evita procesar el mismo comando una y otra vez.

Por que:

- Al copiar `D202` a `D300`, la comparacion `D202 <> D300` deja de cumplirse.
- El PLC queda esperando el siguiente id nuevo.

### RUNG PC-011 - Publicar cantidad procesada

```text
|----[ SM0 ]---------------------------------------------[ MOV C1 D211 ]---|
```

Esta es la segunda parte clave:

```text
C1    -> contador real comparado contra BOXLIMIT
D211  -> cantidad procesada que lee la app
```

Por que:

- En el ladder real `C1` se compara contra `D0`.
- Por eso `C1` representa mejor el avance del grupo final que `C0`.
- `D211` ya esta definido en la app como `processed_count`.

### RUNG PC-012 - Publicar limite aceptado actual

```text
|----[ SM0 ]---------------------------------------------[ MOV D0 D212 ]---|
```

Esto mantiene `D212` actualizado aunque `D0` cambie por otra parte del programa.

Por que:

- La app debe mostrar el objetivo actualmente activo.
- Si el PLC arranca con `D0 = 20`, la app puede ver `D212 = 20` aunque aun no haya enviado comando.

### RUNG PC-013 - Publicar estado listo

```text
|----[ M100 ]--------------------------------------------[ MOV K2 D210 ]---|
```

`K2` significa `ready` para la app.

Por que:

- `M100` es `ETAPA_0`, la etapa base/lista del secuencial.
- En el backend `D210 = 2` se interpreta como `ready`.

### RUNG PC-014 - Publicar estado corriendo sin hacer 38 ORs

No hagas una rung con `M101 OR M102 OR ... OR M138`. Es larga, facil de escribir mal y dificil de mantener.

En este programa, `M100` es `ETAPA_0`, la etapa base/lista. Entonces una forma mas eficiente es:

```text
|----[ M0 ]----[/M100 ]----------------------------------[ MOV K3 D210 ]---|
```

En lista Xinje:

```text
LD M0
ANI M100
MOV K3 D210
```

`K3` significa `running`.

Por que:

- `M0` es `AVANZAR`, la habilitacion del secuencial.
- `M100` es la etapa lista/base.
- Si `M0` esta activo y `M100` no esta activo, el secuencial esta fuera de reposo y se puede publicar como `running`.
- Evitamos 38 ramas `OR`.

Si quieres que tambien marque `running` aun cuando `M0` este apagado pero alguna etapa siga latcheada, usa esta variante:

```text
|----[/M100 ]--------------------------------------------[ MOV K3 D210 ]---|
```

En lista Xinje:

```text
LDI M100
MOV K3 D210
```

Esta variante es mas simple, pero puede mostrar `running` durante estados intermedios aunque `AVANZAR` este deshabilitado. Para la primera integracion recomiendo `M0 AND NOT M100`.

### RUNG PC-015 - Publicar etapa actual sin escanear 39 memorias

No hagas una rung separada por cada `M100`...`M138`. Es mejor actualizar `D216` en el mismo lugar donde el secuencial hace `SET` de la nueva etapa.

La idea:

```text
Cuando el ladder hace SET M101  -> tambien MOV K1 D216
Cuando el ladder hace SET M102  -> tambien MOV K2 D216
Cuando el ladder hace SET M103  -> tambien MOV K3 D216
...
Cuando el ladder hace SET M138  -> tambien MOV K38 D216
```

Eso no escanea todas las etapas en cada ciclo. Solo actualiza `D216` cuando cambia la etapa.

Ejemplos sobre rungs reales del programa:

```text
; Inicializacion
LD SM2
SET M100
MOV K0 D216
```

```text
; Donde hoy pasas a ETAPA_3
LD M0
AND M100
AND X1
RST M100
SET M103
MOV K3 D216
```

```text
; Donde hoy pasas a ETAPA_1
LDI X32
RST M100
SET M101
MOV K1 D216
```

```text
; Donde hoy pasas a ETAPA_4
LD M0
AND M103
AND X10
RST M103
SET M104
MOV K4 D216
```

Por que:

- `D216` ayuda a depurar desde la HMI sin mirar XDPPro.
- Si la maquina se queda esperando un sensor, puedes ver en que etapa quedo.
- Actualizar `D216` durante la transicion evita 39 rungs extras.
- El valor queda guardado hasta la siguiente transicion.

Si no quieres tocar todas las transiciones ahora, puedes hacer una version minima:

```text
SM2 / inicio  -> MOV K0 D216
SET M100      -> MOV K0 D216
SET M101      -> MOV K1 D216
SET M103      -> MOV K3 D216
SET M134      -> MOV K34 D216
SET M138      -> MOV K38 D216
```

Eso ya da trazabilidad util sin instrumentar las 39 etapas desde el primer dia.

### RUNG PC-016 - Borrar pulsos internos

```text
|----[ M300 ]--------------------------------------------( RST M300 )------|
|----[ M301 ]--------------------------------------------( RST M301 )------|
|----[ M302 ]--------------------------------------------( RST M302 )------|
```

Estos bits son pulsos auxiliares; no deben quedar prendidos permanentemente.

Por que:

- `M300`, `M301` y `M302` son bits de trabajo del bloque de comunicacion.
- Si no se resetean, el PLC podria repetir movimientos de datos o mantener una falla latcheada por el auxiliar.

## Vista compacta para copiar

```text
PC-000  SM0 --------------------------------------------- MOV K1 D217

PC-001  LD<> D202 D300 ---------------------------------- SET M300

PC-002  M300 -- D200 >= K1 -- D200 <= K9999 ------------- SET M301
PC-003  M300 -- D200 < K1 ------------------------------- SET M302
PC-004  M300 -- D200 > K9999 ---------------------------- SET M302

PC-005  M301 -------------------------------------------- MOV D200 D0
PC-006  M301 -------------------------------------------- MOV D200 D212
PC-007  M301 -------------------------------------------- MOV K0 D214

PC-008  M302 -------------------------------------------- MOV K10 D214

PC-009  M300 -------------------------------------------- MOV D202 D213
PC-010  M300 -------------------------------------------- MOV D202 D300

PC-011  SM0 --------------------------------------------- MOV C1 D211
PC-012  SM0 --------------------------------------------- MOV D0 D212

PC-013  M100 -------------------------------------------- MOV K2 D210
PC-014  M0 -- /M100 ------------------------------------- MOV K3 D210

PC-015  Integrar en transiciones:
        SET M100 ---------------------------------------- MOV K0 D216
        SET M101 ---------------------------------------- MOV K1 D216
        SET M102 ---------------------------------------- MOV K2 D216
        ...
        SET M138 ---------------------------------------- MOV K38 D216

PC-016  M300 -------------------------------------------- RST M300
        M301 -------------------------------------------- RST M301
        M302 -------------------------------------------- RST M302
```

## Como queda el flujo completo

```text
Operador en app escribe Stack size = 20
        |
        v
Backend escribe D200=20, D201=comando, D202=id nuevo
        |
        v
PLC detecta D202 <> D300
        |
        v
PLC valida D200 entre K1 y K9999
        |
        +-- valido --> MOV D200 D0
        |              MOV D200 D212
        |              MOV K0 D214
        |
        +-- invalido -> MOV K10 D214
        |
        v
PLC publica MOV C1 D211
        |
        v
App muestra cantidad procesada
```

## Cambios necesarios en la app/backend

El backend ya cumple con lo necesario y queda con default de stack `20`:

| Necesidad | Ya implementado |
|---|---|
| Enviar cantidad objetivo | `D200` desde `stack_size` |
| Enviar comando con id | `D201-D202` |
| Leer procesadas | `D211` como `processed_count` |
| Leer objetivo aceptado | `D212` |
| Leer etapa | `D216` |

Por tanto, el trabajo pendiente principal esta en el ladder: agregar el bloque anterior al final de las etapas.

## Como activar el backend

### En simulador

Usa esto para probar la app sin PLC:

```powershell
cd C:\Users\sergi\Desktop\Universidad\PAI\pai\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

En otra terminal:

```powershell
cd C:\Users\sergi\Desktop\Universidad\PAI\pai
npm.cmd --prefix frontend run dev
```

Abre:

```text
http://localhost:5173/
```

### Con PLC real

Cierra Xinje Program Tool o desconectalo del puerto, porque `COM9` solo puede usarlo un programa a la vez.

```powershell
cd C:\Users\sergi\Desktop\Universidad\PAI\pai\backend
$env:PLC_SIMULATOR = "false"
$env:PLC_SERIAL_PORT = "COM9"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

En otra terminal:

```powershell
cd C:\Users\sergi\Desktop\Universidad\PAI\pai
npm.cmd --prefix frontend run dev
```

En la HMI:

1. Abrir `http://localhost:5173/`.
2. Desmarcar `Simulator mode`.
3. Poner `Serial port = COM9`.
4. Click `Apply config`.
5. Click `Connect`.

## Advertencias importantes

1. No reemplaces `D0` directamente desde la app por Modbus. La app escribe `D200`; el PLC decide si copia `D200` a `D0`.
2. No uses `C0` como conteo principal de stack final. En este programa `C0` participa en la seleccion de ventosas; `C1` es el que se compara contra `D0`.
3. El objetivo normal no queda fijo en `3`; viene de la app por `D200`. El default operativo es `20`.
4. Confirma que `D300`, `M300`, `M301` y `M302` esten libres antes de usarlos.
5. Este bloque no debe accionar salidas fisicas. Solo configura objetivo y publica estado.
