# Planeación de integración PC–PLC para SAL-0

## 1. Objetivo

Definir la arquitectura general, el cableado, el intercambio de datos y el plan de implementación para conectar un computador al PLC Xinje XD3-48T mediante un adaptador USB–RS-485 y protocolo Modbus RTU.

La primera implementación no utiliza ESP32. El computador actúa como maestro Modbus RTU y el PLC como esclavo. El PLC conserva toda la autoridad sobre la secuencia, los interbloqueos y los actuadores de la máquina.

---

## 2. Arquitectura general

```text
                RED LOCAL OPCIONAL
          Celular / otro computador / HMI web
                       │
                 Wi-Fi o Ethernet
                 HTTP / WebSocket
                       │
                       ▼
┌──────────────────────────────────────────┐
│               COMPUTADOR                 │
│                                          │
│  Interfaz de operador                    │
│  ├─ Tamaño de stack                      │
│  ├─ Inicio                               │
│  ├─ Pausa / reanudación                  │
│  ├─ Estado de máquina                    │
│  └─ Plantillas procesadas                │
│                                          │
│  Servicio de comunicación Modbus RTU     │
│  Registro de eventos y resultados        │
└─────────────────────┬────────────────────┘
                      │ USB
                      ▼
             Adaptador USB–RS-485
                      │
                A ────┴──── A
                B ───────── B
                      │
             Modbus RTU / RS-485
                      ▼
┌──────────────────────────────────────────┐
│             PLC XINJE XD3-48T            │
│                                          │
│  Registros de comunicación D             │
│  Lógica Ladder / GRAFCET                 │
│  Interbloqueos de operación              │
│  Conteo de plantillas                    │
│  Control de secuencia                    │
└──────────────┬────────────────┬──────────┘
               │                │
        Entradas X        Salidas Y
               │                │
     Sensores, pulsadores   Relés, válvulas,
     y finales de carrera  motor y actuadores
```

### Principio de diseño

El computador no acciona directamente salidas físicas del PLC. El computador escribe solicitudes en registros internos y el PLC decide si puede aceptarlas según el estado del proceso, los sensores, el modo de operación y los interbloqueos.

---

## 3. Conexión física

### 3.1 Cableado principal

```text
Computador                Adaptador             Xinje XD3-48T
──────────                ─────────             ─────────────
Puerto USB ─────────────► Conector USB

                          Terminal A ──────────► Terminal A
                          Terminal B ──────────► Terminal B
```

En el PLC Xinje XD3:

- `A` corresponde a RS-485+.
- `B` corresponde a RS-485−.

Se debe utilizar un par trenzado para los conductores A/B y mantenerlo separado del cableado de potencia, motor, variador, contactores y bobinas de electroválvulas.

### 3.2 Alimentaciones

```text
PLC Xinje  ← alimentación propia del tablero
Adaptador  ← alimentación desde el puerto USB del computador
Computador ← batería o cargador
```

No deben conectarse los 24 V del tablero al adaptador USB–RS-485.

### 3.3 Consideración sobre aislamiento

El adaptador seleccionado tiene únicamente dos terminales RS-485 y no anuncia aislamiento galvánico. Por tanto, debe considerarse no aislado.

Para las pruebas iniciales se recomienda:

- Usar un computador portátil alimentado por batería.
- Mantener el cable RS-485 corto.
- No conectar PE, tierra de chasis o 0 V del tablero como referencia improvisada.
- Sustituir el adaptador por uno aislado si aparecen fallas de comunicación o si la conexión se dejará de forma permanente.

---

## 4. Configuración de comunicación

| Parámetro | Valor propuesto |
|---|---:|
| Puerto PLC | COM2 / Port2-RS485 |
| Protocolo | Modbus RTU |
| Rol del PLC | Esclavo |
| Rol del computador | Maestro |
| Dirección del PLC | 1 |
| Velocidad | 19200 bit/s |
| Bits de datos | 8 |
| Paridad | Par |
| Bits de parada | 1 |
| Formato abreviado | 19200, 8E1 |

### Procedimiento de configuración

1. Conectar el PLC al software de programación Xinje.
2. Abrir la configuración de puertos.
3. Seleccionar el puerto 2 RS-485.
4. Seleccionar protocolo Modbus RTU.
5. Configurar dirección de esclavo 1.
6. Configurar 19200 bit/s, 8 bits de datos, paridad par y un bit de parada.
7. Escribir la configuración al PLC.
8. Reiniciar el PLC si el software o el firmware lo requieren.
9. Configurar exactamente los mismos parámetros en el programa del computador.

---

## 5. Distribución de responsabilidades

| Función | Responsable |
|---|---|
| Interfaz visual | Computador |
| Selección del tamaño de stack | Computador solicita; PLC valida |
| Inicio, pausa y reanudación | Computador solicita; PLC autoriza |
| Ejecución del GRAFCET | PLC |
| Lectura de sensores | PLC |
| Accionamiento de válvulas y motor | PLC |
| Conteo de unidades | PLC |
| Detección de stack completo | PLC |
| Registro histórico | Computador |
| Parada de emergencia | Circuito físico independiente |
| Interbloqueos de máquina | PLC y circuito eléctrico |
| Respuesta ante pérdida de comunicación | PLC |

---

## 6. Contrato de comunicación propuesto

Antes de implementar el mapa, se debe revisar el programa Ladder actual y confirmar que los registros `D200–D219` estén libres.

Los registros `D` del PLC son de 16 bits. Para el desarrollo se propone reservar los siguientes:

### 6.1 Datos enviados del computador al PLC

| Registro PLC | Offset Modbus | Nombre | Descripción |
|---|---:|---|---|
| `D200` | 200 | Tamaño solicitado | Número objetivo de plantillas del stack |
| `D201` | 201 | Código de comando | Solicitud enviada por el computador |
| `D202` | 202 | ID de solicitud | Número consecutivo de la orden |
| `D203` | 203 | Heartbeat | Contador que cambia periódicamente |
| `D204–D209` | — | Reservados | Futuras funciones |

### 6.2 Códigos de comando

| Valor en `D201` | Comando |
|---:|---|
| 0 | Sin comando |
| 1 | Iniciar producción |
| 2 | Pausar de forma controlada |
| 3 | Reanudar |
| 4 | Detener al llegar a una condición segura |
| 5 | Reiniciar contador, solo estando detenida |
| 6 | Confirmar retiro del stack terminado |
| 7–65535 | Reservados |

Cada orden debe enviarse con un nuevo valor de `D202`.

Ejemplo:

```text
Orden de inicio:
D200 = 25
D201 = 1
D202 = 101

Orden de pausa:
D201 = 2
D202 = 102
```

El PLC procesa una orden solo cuando el valor de `D202` es diferente del último ID confirmado.

### 6.3 Datos enviados del PLC al computador

| Registro PLC | Offset Modbus | Nombre | Descripción |
|---|---:|---|---|
| `D210` | 210 | Estado de máquina | Estado principal del sistema |
| `D211` | 211 | Conteo actual | Plantillas o ciclos completados |
| `D212` | 212 | Objetivo aceptado | Tamaño de stack validado por el PLC |
| `D213` | 213 | ID confirmado | Última solicitud procesada |
| `D214` | 214 | Código de falla | Diagnóstico general |
| `D215` | 215 | Palabra de estado | Indicadores binarios |
| `D216` | 216 | Etapa actual | Número de etapa del GRAFCET |
| `D217` | 217 | Versión de contrato | Versión del mapa Modbus |
| `D218–D219` | — | Reservados | Futuras variables |

### 6.4 Estados de máquina

| Valor en `D210` | Estado |
|---:|---|
| 0 | Inicialización |
| 1 | Detenida |
| 2 | Lista para iniciar |
| 3 | Producción en curso |
| 4 | Pausada |
| 5 | Stack completado |
| 6 | Esperando retiro o confirmación |
| 7 | Falla |
| 8 | Modo manual o mantenimiento |

### 6.5 Palabra de estado `D215`

| Bit | Significado |
|---:|---|
| 0 | Control remoto habilitado |
| 1 | Máquina lista |
| 2 | Ciclo activo |
| 3 | Pausa activa |
| 4 | Stack completado |
| 5 | Falla activa |
| 6 | Modo manual |
| 7 | Heartbeat válido |
| 8–15 | Reservados |

---

## 7. Información transmitida por cada enlace

### 7.1 Computador a adaptador, por USB

El sistema operativo crea un puerto serie virtual, por ejemplo:

```text
Windows: COM4, COM5, ...
Linux: /dev/ttyUSB0, /dev/ttyUSB1, ...
```

La aplicación del computador utiliza ese puerto para enviar y recibir las tramas seriales.

### 7.2 Adaptador a PLC, por RS-485

Por los terminales A y B circulan tramas Modbus RTU:

```text
Dirección del esclavo
Código de función
Dirección inicial
Cantidad o valor
CRC
```

Funciones recomendadas:

| Función Modbus | Uso |
|---:|---|
| `03` | Leer registros `D210–D217` |
| `06` | Escribir un único registro |
| `16` o `0x10` | Escribir varios registros consecutivos |

Para enviar una orden se recomienda escribir en una sola transacción:

```text
D200 = objetivo
D201 = comando
D202 = ID de solicitud
D203 = heartbeat
```

### 7.3 PLC a computador

El computador realiza lecturas periódicas del bloque:

```text
D210 hasta D217
```

El PLC responde con:

- Estado de la máquina.
- Conteo actual.
- Tamaño de stack aceptado.
- Confirmación de la orden.
- Código de falla.
- Palabra de estado.
- Etapa actual.
- Versión del contrato de comunicación.

---

## 8. Secuencia de operación

### 8.1 Configuración del tamaño de stack

```text
Operador introduce el tamaño
        │
        ▼
Computador escribe D200
        │
        ▼
PLC valida el rango
        │
        ├── válido: actualiza D212
        └── inválido: actualiza D214
```

El rango permitido debe definirse en el PLC. Para la configuración final conocida de SAL-0 puede establecerse inicialmente entre 1 y 25, sujeto a confirmación del programa definitivo.

### 8.2 Solicitud de inicio

```text
Computador escribe:
D201 = 1
D202 = nuevo ID
        │
        ▼
PLC verifica:
- control remoto habilitado
- máquina lista
- ausencia de fallas
- objetivo válido
- actuadores en condición inicial
        │
        ▼
PLC acepta:
D213 = D202
D210 = 3
        │
        ▼
Comienza el GRAFCET
```

### 8.3 Conteo de plantillas

El PLC debe incrementar el contador únicamente al finalizar satisfactoriamente el procesamiento de una unidad.

```text
Fin satisfactorio de unidad
          │
          ▼
      D211 = D211 + 1
          │
          ├── D211 < D212 → siguiente unidad
          └── D211 = D212 → stack terminado
```

Si no existe un sensor físico que confirme la llegada de la plantilla al apilador, el dato debe documentarse como **ciclos de procesamiento completados** y no como productos conformes confirmados.

### 8.4 Finalización de stack

```text
D211 = D212
      │
      ▼
PLC termina el movimiento seguro
D210 = 5
D215.4 = 1
      │
      ▼
Computador muestra “Stack completado”
      │
      ▼
Operador retira el stack
      │
      ▼
Computador envía comando 6
      │
      ▼
PLC reinicia el conteo y queda disponible
```

### 8.5 Pausa controlada

La orden remota corresponde a una pausa o parada controlada, no a una parada de emergencia.

El PLC debe decidir el punto seguro de detención para evitar:

- Plantillas suspendidas de forma inestable.
- Cilindros detenidos en una transición insegura.
- Válvulas en estados indeterminados.
- Movimiento de la banda sin control.

---

## 9. Heartbeat y pérdida de comunicación

El computador incrementa `D203` periódicamente.

Ejemplo:

```text
1, 2, 3, 4, 5, ...
```

El PLC verifica que el valor continúe cambiando.

Propuesta inicial:

```text
Heartbeat sin cambio durante 3 segundos
              │
              ▼
Pérdida de supervisión remota
              │
              ▼
Pausa controlada
D214 = código de pérdida de comunicación
D215.7 = 0
```

La respuesta exacta debe definirse según el estado de la secuencia y la condición más segura para la máquina.

El heartbeat no reemplaza la parada de emergencia.

---

## 10. Software del computador

La aplicación debe dividirse en cuatro niveles:

```text
┌──────────────────────────────────────┐
│ Interfaz de operador                 │
│ Botones, indicadores y configuración │
├──────────────────────────────────────┤
│ Lógica de aplicación                 │
│ Validaciones, solicitudes y estados  │
├──────────────────────────────────────┤
│ Cliente Modbus RTU                   │
│ Lecturas, escrituras, timeout y CRC  │
├──────────────────────────────────────┤
│ Puerto serie                         │
│ COMx, 19200, 8E1                     │
└──────────────────────────────────────┘
```

### 10.1 Elementos mínimos de la interfaz

- Puerto COM seleccionado.
- Estado de conexión.
- Tamaño de stack solicitado.
- Tamaño aceptado por el PLC.
- Plantillas o ciclos procesados.
- Estado de la máquina.
- Etapa actual.
- Código de falla.
- Botón iniciar.
- Botón pausar.
- Botón reanudar.
- Botón confirmar retiro del stack.

### 10.2 Parámetros iniciales del software

| Operación | Valor inicial |
|---|---:|
| Lectura de `D210–D217` | Cada 250–500 ms |
| Escritura de heartbeat | Cada 1 s |
| Envío de comando | Por evento |
| Timeout de respuesta | 500 ms |
| Reintentos | 2 |
| Transacciones simultáneas | 1 |

El software no debe ejecutar dos transacciones Modbus simultáneamente sobre el mismo puerto.

---

## 11. Servidor web opcional en el computador

El computador conectado físicamente al PLC puede abrir un servidor web para que otros dispositivos accedan al sistema.

```text
Celular / computador cliente
         │
         │ HTTP o WebSocket
         ▼
Computador conectado al PLC
Servidor web + único maestro Modbus
         │
         │ USB / RS-485
         ▼
PLC
```

Solo el computador conectado al adaptador actúa como maestro Modbus.

Ejemplo de orden:

```json
{
  "command": "start",
  "stack_size": 25
}
```

Ejemplo de estado:

```json
{
  "machine_state": "running",
  "processed": 14,
  "target": 25,
  "fault": 0
}
```

---

## 12. Seguridad

La parada de emergencia debe permanecer completamente independiente de:

- Computador.
- Puerto USB.
- Adaptador RS-485.
- Modbus.
- Red local.
- Interfaz web.

```text
Parada de emergencia física
          │
          ▼
Circuito eléctrico cableado
          │
          ▼
Deshabilitación segura de actuadores
```

El computador puede visualizar una parada de emergencia únicamente si el PLC dispone de una señal de realimentación, pero nunca debe ser responsable de ejecutarla.

---

## 13. Plan de implementación

### Fase 1. Preparación

1. Revisar el programa Ladder actual.
2. Confirmar que `D200–D219` estén libres.
3. Crear una tabla oficial del contrato Modbus.
4. Identificar físicamente COM2, A y B.
5. Instalar el controlador del adaptador USB–RS-485.
6. Registrar la configuración actual del puerto del PLC.

### Fase 2. Prueba básica de comunicación

1. Configurar el PLC como esclavo Modbus.
2. Conectar A–A y B–B.
3. Abrir un programa maestro Modbus de prueba.
4. Leer un registro de prueba.
5. Escribir un valor en `D200`.
6. Verificar el valor desde el monitor de XDPPro.
7. Repetir al menos 100 ciclos de lectura sin errores.

En esta fase los registros no deben estar vinculados a movimientos de la máquina.

### Fase 3. Integración con Ladder

1. Validar el rango de `D200`.
2. Detectar cambios del ID `D202`.
3. Decodificar `D201`.
4. Crear estados en `D210`.
5. Vincular el conteo a `D211`.
6. Implementar confirmación en `D213`.
7. Implementar códigos de falla en `D214`.
8. Implementar la palabra de estado `D215`.
9. Implementar el heartbeat.
10. Probar inicialmente con salidas deshabilitadas.

### Fase 4. Aplicación de computador

1. Abrir y cerrar correctamente el puerto COM.
2. Implementar lectura periódica.
3. Implementar escritura por bloques.
4. Implementar una sola transacción a la vez.
5. Registrar fecha, comando, respuesta y errores.
6. Diseñar la interfaz del operador.
7. Probar desconexión y reconexión del cable.
8. Verificar que una orden duplicada no se ejecute dos veces.

### Fase 5. Pruebas sobre la máquina

1. Ensayo sin presión neumática.
2. Ensayo con actuadores deshabilitados.
3. Ensayo en modo manual.
4. Inicio desde computador.
5. Pausa y reanudación.
6. Cambio de tamaño de stack estando detenida.
7. Rechazo de cambios durante un ciclo, si corresponde.
8. Desconexión del USB durante operación.
9. Repetición accidental de un mismo ID.
10. Prueba de stack completo.
11. Comparación entre conteo digital y conteo manual.

---

## 14. Criterios mínimos de aceptación

| Prueba | Resultado esperado |
|---|---|
| Lectura continua | Sin errores en 100 transacciones consecutivas |
| Tamaño inválido | Rechazado por el PLC |
| Inicio sin condiciones | No se inicia y se entrega código de falla |
| Orden duplicada | No se ejecuta dos veces |
| Desconexión USB | Se genera una respuesta controlada |
| Conteo | Coincide con los ciclos o unidades verificadas |
| Stack completo | Se detiene en el tamaño programado |
| Programa del PC cerrado | No se genera arranque inesperado |
| Parada de emergencia | Funciona independientemente del computador |
| Modo manual | No acepta órdenes remotas incompatibles |

---

## 15. Arquitectura adoptada

### Primera implementación

```text
Computador maestro
        │ USB
Adaptador USB–RS-485
        │ A/B
PLC Xinje XD3-48T esclavo
```

### Posible ampliación futura

En una ampliación posterior, el computador podría reemplazarse por una ESP32 con transceptor UART–RS-485 compatible con 3,3 V.

No deben conectarse simultáneamente un computador y una ESP32 como dos maestros activos sobre el mismo bus RS-485.

---

## 16. Pendientes antes de implementación

- Confirmar que `D200–D219` no estén ocupados.
- Definir el rango final permitido para el tamaño del stack.
- Confirmar qué evento incrementará el contador.
- Definir la respuesta segura ante pérdida de comunicación.
- Definir los códigos de falla.
- Confirmar la versión del firmware y software Xinje.
- Verificar la configuración física y lógica actual del puerto COM2.
- Confirmar si el computador operará solo en pruebas o quedará conectado permanentemente.
