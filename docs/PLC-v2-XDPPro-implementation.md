# Implementación LADDER del contrato v2 en XDPPro

Archivo base obligatorio: `SECUENCIALOL_MODBUS_V2_WORKING.xdp`, copia de `SECUENCIALOL_MODBUS.xdp`.

Esta guía debe aplicarse desde XDPPro 3.8.0. No edite los XML internos del `.xdp`.

## 1. Hallazgos que deben corregirse

El bloque actual al final del programa:

- deja `D0 = K3`;
- no evalúa `D201`;
- no supervisa `D203`;
- no publica `D215`, `D216`, `D218` ni `D219`;
- acepta el request ID aunque no ejecuta el comando;
- usa `AND> D200 K9999` en la rama de cantidad válida, haciendo imposible aceptar valores normales.

Elimine las rungs actuales `417–438` y reconstruya el bloque v2. No duplique salidas físicas.

## 2. Memorias reservadas

El análisis del archivo base confirma que estos elementos están libres, salvo los ya usados por el bloque v1:

| Elemento | Uso |
|---|---|
| `D300` | Último request ID procesado |
| `D301` | Último heartbeat observado |
| `D303` | Objetivo pendiente |
| `M300` | Pulso de request nuevo |
| `M301` | Objetivo válido |
| `M302` | Objetivo inválido |
| `M303` | Pulso de inicio remoto |
| `M304` | Pausa latcheada |
| `M305` | Solicitud de parada controlada |
| `M306` | Pulso de paso remoto |
| `M307` | Token manual de un solo scan |
| `M308` | Heartbeat válido |
| `M309` | Ejecución automática habilitada |
| `T2` | Watchdog de heartbeat, 3 segundos |
| `HD0-HD1` | Total histórico retentivo de 32 bits |

## 3. Inicialización

Reemplace `MOV K3 D0` en el bloque `SM2`:

```text
LD SM2
SET M100
MOV K20 D0
MOV K20 D212
MOV K20 D303
MOV K2 D217
MOV K2 D210
MOV D203 D301
SET M308
RST M304
RST M309
```

No inicialice `HD0-HD1`: deben sobrevivir a un apagado.

## 4. Detección, validación e idempotencia

```text
LD<> D202 D300
SET M300

LD M300
AND> D200 K0
SET M301

LD M300
AND<= D200 K0
SET M302

LD M301
MOV D200 D303

LD M302
MOV K10 D214
```

El máximo mecánico no se fija en LADDER. El backend parte de `100` y permite que Supervisión lo cambie.

## 5. Procesamiento de `D201`

Las comparaciones siguientes deben incluir `M300` y ejecutarse antes de copiar `D202` a `D300`.

```text
; 1 - iniciar automático
M300 AND D201=K1 AND /X2 AND M308
    SET M303
    SET M309
    RST M304
    MOV K0 D214

; 2 - pausar
M300 AND D201=K2 AND M309
    SET M304
    MOV K0 D214

; 3 - reanudar
M300 AND D201=K3 AND M304 AND /X2 AND M308
    RST M304
    SET M309
    MOV K0 D214

; 4 - parada controlada
M300 AND D201=K4
    SET M305
    RST M309
    RST M304
    MOV K0 D214

; 5 - reiniciar stack sólo sin marcha
M300 AND D201=K5 AND /M309
    RST C1
    MOV K0 D214

M300 AND D201=K5 AND M309
    MOV K22 D214

; 6 - reservado
M300 AND D201=K6
    MOV K23 D214

; 7 - paso manual
M300 AND D201=K7 AND X2 AND M308
    SET M306
    MOV K0 D214

M300 AND D201=K7 AND /X2
    MOV K24 D214

; 8 - sólo programa el próximo objetivo
M300 AND D201=K8 AND M301
    MOV K0 D214
```

Para comandos desconocidos, publique `K99` en `D214`.

Al final del procesamiento:

```text
LD M300
MOV D202 D213
MOV D202 D300
RST M300
RST M301
RST M302
```

## 6. Objetivo activo y cambio de stack

Si no hay cajas en el stack, el objetivo pendiente puede hacerse activo:

```text
LD= C1 K0
MOV D303 D0
MOV D303 D212
```

En las ramas donde hoy `M136`, `M138` o el retorno a `M100` reinician `C1`, agregue inmediatamente después:

```text
MOV D303 D0
MOV D303 D212
```

Así un cambio recibido durante producción no altera el stack que ya se está formando.

## 7. Automático, inicio y paso manual

Reemplace la generación actual de `M0` por:

```text
; X1 inicia cuando X2 está en automático
LDP X1
ANI X2
SET M309

; El comando remoto de inicio equivale al inicio físico
LD M303
SET M309

; Avance automático, bloqueado por pausa o heartbeat inválido
LD M309
ANI X2
ANI M304
AND M308
OUT M0

; Token manual desde botón físico o app
LDP X1
AND X2
SET M307

LD M306
AND X2
AND M308
SET M307
```

En cada transición `M100…M138` que empieza con:

```text
LD M0
AND Mxxx
```

agregue `OR M307` antes del contacto de etapa:

```text
LD M0
OR M307
AND Mxxx
...
RST Mxxx
SET Myyy
RST M307
MOV Kyy D216
```

El `RST M307` debe estar después de la primera transición ejecutada. Agregue también al final del programa:

```text
LD M307
RST M307
LD M303
RST M303
LD M306
RST M306
```

Esto hace que un pulso no utilizado expire al final del scan y evita que una pulsación atraviese varias etapas.

## 8. Parada controlada y heartbeat

Integre `M305` como una alternativa a `X3` en la ruta existente `REINICIO_Y_PARO`. No use `M305` para hacer `RST` directo de salidas.

Watchdog:

```text
LD<> D203 D301
MOV D203 D301
RST T2
SET M308

LD= D203 D301
TMR T2 K30 K100

LDP T2
RST M308
SET M305
RST M309
MOV K90 D214
```

Valide en banco que `K30 K100` corresponda a tres segundos en el firmware cargado.

## 9. Conteos y publicación

En la rung existente que incrementa `C1` por flanco de `M121` o `M129`, agregue `DINC HD0` bajo la misma condición:

```text
LDP M121
ORP M129
INC C1
DINC HD0
```

Publique en cada scan:

```text
LD SM0
MOV C1 D211
MOV D0 D212
MOV HD0 D218
MOV HD1 D219
MOV K2 D217
```

## 10. Estado y flags

Actualice `D216` junto a cada `SET M100…M138`. La etapa `M100` publica `K0`, `M101` publica `K1`, etc.

Construya `D210` en este orden de prioridad:

```text
SM0                         MOV K1 D210
M100 AND /X2               MOV K2 D210
M0                          MOV K3 D210
M304                        MOV K4 D210
X2                          MOV K8 D210
D214 = K90                 MOV K7 D210
```

Publique los bits:

```text
M308       OUT D215.0
M100       OUT D215.1
M0         OUT D215.2
M304       OUT D215.3
/X2        OUT D215.4
D214=K90   OUT D215.5
X2         OUT D215.6
M308       OUT D215.7
```

## 11. Comprobación antes de movimiento

1. Compile el proyecto en XDPPro sin errores.
2. Observe `D200-D219`, `D300-D303`, `M300-M309`, `T2` y `HD0-HD1`.
3. Pruebe con salidas desconectadas.
4. Repita un `D202` y confirme que no cambia etapa ni contador.
5. Pulse `X1` en manual y confirme una sola transición.
6. Envíe comando `7` y confirme el mismo comportamiento.
7. Desconecte el backend y confirme la parada controlada por watchdog.
8. Apague el PLC y confirme que `HD0-HD1` conserva el total.
9. Sólo entonces habilite las salidas físicas para la prueba supervisada.
