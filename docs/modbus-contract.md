# Contrato Modbus v2 — HMI Xinje XD3

La aplicación PC es el único maestro Modbus RTU. El PLC es el único responsable de validar comandos, secuenciar movimientos y accionar salidas físicas.

## Comunicación

| Parámetro | Valor |
|---|---:|
| Esclavo | `1` |
| Serial | `19200 8E1` |
| Timeout | `500 ms` |
| Reintentos | `2` |
| Poll | `250–500 ms` |
| Heartbeat | `1000 ms` |

## PC → PLC

El backend escribe `D200-D203` mediante una sola función Modbus 16.

| Registro | Uso |
|---|---|
| `D200` | Objetivo positivo solicitado para el siguiente stack |
| `D201` | Código de comando |
| `D202` | Request ID; cada solicitud nueva usa otro valor |
| `D203` | Heartbeat del backend |

| Código | Comando | Regla |
|---:|---|---|
| `1` | Iniciar | Sólo automático, máquina lista y permisos válidos |
| `2` | Pausar | Sólo durante producción automática |
| `3` | Reanudar | Sólo desde pausa automática |
| `4` | Parada controlada | Utiliza la ruta de parada del secuencial |
| `5` | Reiniciar stack actual | Nunca modifica el total retentivo |
| `6` | Reservado | Código legado, no ejecutar |
| `7` | Avanzar un paso | Sólo manual; máximo una transición |
| `8` | Programar objetivo | Se aplica en el próximo límite de stack |

Un mismo `D202` nunca puede ejecutarse dos veces. El PLC copia el ID a `D213` después de validar y procesar la solicitud.

## PLC → PC

El backend lee `D210-D219` en un solo bloque.

| Registro | Uso |
|---|---|
| `D210` | Estado de máquina |
| `D211` | Cajas del stack actual |
| `D212` | Objetivo activo |
| `D213` | Último request ID procesado |
| `D214` | Falla o motivo de rechazo |
| `D215` | Palabra de estado |
| `D216` | Etapa activa `0–38` |
| `D217` | Versión de contrato, siempre `2` |
| `D218` | Palabra baja del total retentivo |
| `D219` | Palabra alta del total retentivo |

El total se decodifica como:

```text
total = D218 + (D219 << 16)
```

`HD0-HD1` son la fuente retentiva del PLC y se publican en `D218-D219`.

### Estados `D210`

| Valor | Estado |
|---:|---|
| `0` | Inicializando |
| `1` | Detenida |
| `2` | Lista |
| `3` | Produciendo |
| `4` | Pausada |
| `5` | Transición entre stacks |
| `7` | Falla |
| `8` | Manual/mantenimiento |

### Bits `D215`

| Bit | Estado |
|---:|---|
| `0` | Remoto habilitado |
| `1` | Máquina lista |
| `2` | Ciclo activo |
| `3` | Pausa activa |
| `4` | Modo automático |
| `5` | Falla activa |
| `6` | Modo manual |
| `7` | Heartbeat válido |

### Fallas y rechazos `D214`

| Código | Significado |
|---:|---|
| `0` | Sin falla |
| `10` | Objetivo inválido |
| `20` | Comando no permitido durante marcha |
| `21` | Comando no permitido en el estado actual |
| `22` | Reinicio requiere máquina detenida |
| `23` | Comando legado reservado |
| `24` | Paso requiere modo manual |
| `25` | Paso bloqueado por interlocks |
| `90` | Heartbeat remoto perdido |
| `99` | Comando desconocido |

Los rechazos de operación no deben accionar salidas. La falla `90` bloquea nuevos mandos y solicita la parada controlada definida por el PLC.

## Seguridad

- La HMI no escribe salidas `Y` ni expone el antiguo mando directo `Y1`.
- El endpoint de escritura Modbus arbitraria está eliminado.
- El paro de emergencia permanece físico e independiente del PC, USB, Modbus y red.
