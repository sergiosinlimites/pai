# Lectura del ladder de SECUENCIALOL.xdp

Este archivo resume lo que se puede leer desde `SECUENCIALOL.xdp` sin abrirlo manualmente en Xinje Program Tool.

El `.xdp` internamente es un archivo tipo ZIP. El ladder principal queda guardado como XML en:

```text
plc1/ladmodules.xmd
plc1/ladnodes_instlist.xmd
```

No es una imagen del ladder, sino una lista de instrucciones Xinje (`LD`, `AND`, `SET`, `RST`, `MOV`, `TMR`, etc.) con posiciones de fila/columna. Por eso se puede reconstruir la logica, aunque no exactamente el dibujo visual de XDPPro.

## PLC detectado

| Campo | Valor |
|---|---|
| Serie | `XD3` |
| Modelo | `XD3-48` |
| Proyecto | `PLC1` |
| Estacion | `1` |
| Software usado | `XDPProVersion 3.8.0` |
| Firmware mostrado | `3.4.7m` |

## Comentarios de registros encontrados

### Entradas

| Entrada | Comentario |
|---|---|
| `X0` | `REINICIO` |
| `X1` | `START` |
| `X2` | `SS_AUT_MAN` |
| `X5` | `S_A_FIN` |
| `X6` | `S_B_INI` |
| `X7` | `S_B_FIN` |
| `X10` | `S_C_INI` |
| `X11` | `S_C_FIN` |
| `X12` | `S_D_INI` |
| `X13` | `S_D_FIN` |
| `X14` | `S_E_INI` |
| `X15` | `S_E_FIN` |
| `X16` | `S_J_INI` |
| `X17` | `S_J_FIN` |
| `X22` | `S_V1` |
| `X23` | `S_V34` |
| `X24` | `S_V2` |
| `X32` | `S_PRES` |

### Salidas

| Salida | Comentario |
|---|---|
| `Y0` | `VAL_A` |
| `Y1` | `VAL_C` |
| `Y3` | `VAL_F` |
| `Y4` | `VAL_J` |
| `Y5` | `VAL_B` |
| `Y6` | `VAL_DE` |
| `Y10` | `VAL_V1` |
| `Y14` | `VAL_V2` |
| `Y15` | `VAL_34` |
| `Y20` | `motor` |

### Memorias y datos

| Registro | Comentario |
|---|---|
| `M0` | `AVANZAR` |
| `M3` | `FLAG` |
| `M100` | `ETAPA_0` |
| `M101` ... `M138` | Etapas secuenciales |
| `D0` | `BOXLIMIT` |
| `C0` | `CTR` |
| `C1` | `CTR_S` |
| `T0` | `T0_MOTOR` |
| `T1` | `T_GARRA` |

## Estructura general del ladder

El ladder esta organizado asi:

1. **Inicializacion / SCAN**
2. **Modo manual y automatico**
3. **Reinicio y paro**
4. **Etapas `ETAPA_0` a `ETAPA_38`**
5. **Acciones de activacion de salidas**
6. **Acciones de desactivacion de salidas**
7. **Contadores**
8. **Temporizadores**

## Inicializacion

Al pulso inicial `SM2`:

```text
LD SM2
SET M100
MOV K3 D0
```

Interpretacion:

- Arranca en `M100`, comentado como `ETAPA_0`.
- Carga `D0 = K3`; `D0` esta comentado como `BOXLIMIT`.

## Marcha / avance

La bobina `M0` esta comentada como `AVANZAR`.

```text
LDI X2
OUT M0
ORP X1
```

Segun comentarios del proyecto:

- `X2` es `SS_AUT_MAN`.
- `X1` es `START`.
- `M0` habilita el avance del secuencial.

## Reset / paro

Hay un bloque de reinicio/parada que incluye:

```text
LDP X0
OR X3
SBLOCK K1;0
...
LD M5 AND X12 AND X14
RST M5
SET M6
LD M6 AND X5
RST M6
SET M100
```

`X0` esta comentado como `REINICIO`. `X3` no tiene comentario en la tabla extraida.

## Etapas principales

El secuencial usa memorias `M100` a `M138`. Cada etapa se resetea cuando se cumple su condicion y luego activa la siguiente.

Ejemplos claros:

```text
ETAPA_0:
LD M0
AND M100
AND X1
RST M100
SET M103

LDI X32
RST M100
SET M101
```

Interpretacion:

- Desde `ETAPA_0`, si hay avance y start/presencia segun condicion, salta a `M103`.
- Si `X32` no esta activo, salta a `M101`.

```text
ETAPA_1:
LD M0
AND M101
LD X32
RST M101
OR T0
SET M102
```

Interpretacion:

- `M101` activa el motor `Y20`.
- Avanza hacia `M102` por sensor `X32` o temporizador `T0`.

```text
ETAPA_3:
LD M0
AND M103
AND X10
RST M103
SET M104
```

`X10` esta comentado como `S_C_INI`.

```text
ETAPA_4:
LD M0
AND M104
AND X4
LD= C0 K1 -> SET M105
LD= C0 K2 -> SET M111
LD>= C0 K3 AND LDI M3 -> SET M117
LD M3 -> SET M124
```

`X4` no tiene comentario extraido. Esta etapa ramifica segun el contador `C0` y el flag `M3`.

## Acciones de salidas

### Activaciones

| Salida | Se activa con |
|---|---|
| `Y0` / `VAL_A` | `M104` |
| `Y1` / `VAL_C` | `M103`, `M109`, `M115`, `M122`, `M128` |
| `Y3` / `VAL_F` | `M133` |
| `Y4` / `VAL_J` | `M135`, `M137` |
| `Y5` / `VAL_B` | `M108`, `M114`, `M120`, `M127` |
| `Y6` / `VAL_DE` | `M132` |
| `Y10` / `VAL_V1` | `M105`, `M111`, `M117`, `M124` |
| `Y14` / `VAL_V2` | `M111`, `M117`, `M124` |
| `Y15` / `VAL_34` | `M117`, `M124` |
| `Y20` / `motor` | `M101` |

Ejemplo leido:

```text
LD M103
OR M109
OR M115
OR M122
OR M128
SET Y1
```

### Desactivaciones

| Salida | Se desactiva con |
|---|---|
| `Y0` / `VAL_A` | `M106`, `M112`, `M118`, `M125`, `M100`, `M6` |
| `Y1` / `VAL_C` | `M107`, `M113`, `M119`, `M126`, `M130`, `M100` |
| `Y4` / `VAL_J` | `M136`, `M138`, `M100` |
| `Y5` / `VAL_B` | `M131`, `M100` |
| `Y6` / `VAL_DE` | `M134`, `M100`, `M5` |
| `Y10` / `VAL_V1` | `M110`, `M116`, `M123`, `M129`, `M100` |
| `Y14` / `VAL_V2` | `M116`, `M123`, `M129`, `M100` |
| `Y15` / `VAL_34` | `M121`, `M129`, `M100` |

Ejemplo leido:

```text
LD M107
OR M113
OR M119
OR M126
OR M130
OR M100
RST Y1
```

## Contadores

```text
LDP M103
INC C0
```

`C0` / `CTR` incrementa con flanco positivo de `M103`.

```text
LDP M150
RST C0
ORP M100
```

`C0` se reinicia por `M150` o al volver a `M100`.

```text
LDP M121
INC C1
ORP M129
```

`C1` / `CTR_S` incrementa con `M121` o `M129`.

```text
LDP M136
RST C1
ORP M138
ORP M100
```

`C1` se reinicia con `M136`, `M138` o `M100`.

## Temporizadores

```text
LD M101
TMR T0 K100 K100
```

`T0` / `T0_MOTOR` corre en `M101`.

```text
LD M133
TMR T1 K10 K100
```

`T1` / `T_GARRA` corre en `M133`.

## Recomendacion para integrar con la app

No conviene controlar directamente `Y1` desde la app porque `Y1` ya esta controlada por el secuencial:

```text
SET Y1 con: M103, M109, M115, M122, M128
RST Y1 con: M107, M113, M119, M126, M130, M100
```

Para monitoreo, si quieres mostrar en la app valores reales del programa, usa registros de publicacion:

```text
MOV C0 D220        ; contador principal CTR
MOV C1 D223        ; contador secundario CTR_S, si quieres agregarlo
X1 -> D221         ; START
Y1 -> D222         ; VAL_C real
```

Para mando remoto, lo mas seguro es no escribir `Y1` directo, sino crear una solicitud remota, por ejemplo `M_PC_START` o `RemoteStart`, y mezclarla con la logica de arranque existente (`X1 START`, `M0 AVANZAR`, permisos y etapas). Si se activa `Y1` por fuera del secuencial, puedes pelear contra los `SET/RST` existentes.

