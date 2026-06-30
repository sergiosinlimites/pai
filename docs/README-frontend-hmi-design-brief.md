# Brief para diseñar la interfaz HMI de la máquina de cajas predobladas

Este documento puede entregarse directamente a una IA o diseñador de interfaces. El objetivo es proponer alternativas visuales sin cambiar la lógica, las restricciones de seguridad ni el contrato funcional descrito aquí.

## 1. Contexto del sistema

La aplicación es una HMI web local para una máquina industrial que procesa cajas predobladas y forma stacks al final del proceso.

- El PLC es un Xinje XD3-48.
- La comunicación es Modbus RTU mediante USB-RS485.
- El backend FastAPI es el único maestro Modbus.
- El frontend nunca controla directamente una salida física.
- La aplicación se usa principalmente en un PC o panel táctil ubicado junto a la máquina.
- La interfaz estará en español.
- Existen dos públicos: operario y supervisor/administrador.
- No hay login en esta primera versión; las funciones se separan por vistas.

El estilo debe ser el de una HMI industrial de alto desempeño: fondo neutro, jerarquía muy clara, poca decoración y uso excepcional del color. Rojo se reserva para fallas; ámbar para advertencias; verde puede indicar confirmación o señal activa, pero no debe convertir toda la pantalla en un tablero de colores.

## 2. Objetivo de diseño

Diseñar una interfaz que permita responder en menos de cinco segundos:

1. ¿La máquina está conectada y funcionando?
2. ¿Está en automático o manual?
3. ¿Cuántas cajas lleva el stack y cuál es la meta?
4. ¿Existe una falla o una acción requerida?
5. ¿Qué mando está permitido en este momento?
6. ¿En qué etapa está detenida si no avanza?

La pantalla debe sentirse industrial, precisa y tranquila. Durante operación normal debe verse casi monocromática. Las condiciones anormales deben sobresalir inmediatamente mediante color, icono, texto y posición; nunca sólo por color.

## 3. Navegación principal

La aplicación tiene tres vistas permanentes:

### A. Operación

Pantalla principal del operario. Debe contener sólo lo necesario para producir.

### B. Supervisión

Indicadores históricos y métricas para el responsable de operaciones. Esta vista se dedica exclusivamente al análisis: no contiene formularios de comunicación ni de configuración.

### C. Consola

Diagnóstico técnico de sólo lectura: entradas, salidas, registros y log Modbus.

La navegación debe estar siempre visible y dejar claro cuál vista está activa. Una alarma activa debe seguir visible aunque el usuario cambie de apartado.

## 4. Cabecera global

Debe mostrarse en las tres vistas:

- Nombre de la máquina o proceso.
- Botón global de conexión: conectado, desconectado, conectando, error o datos desactualizados.
- Modo físico: automático o manual.
- Estado de máquina: lista, produciendo, pausada, detenida, transición de stack, manual o falla.
- Alarma activa, si existe.
- Engranaje global para abrir la configuración en un drawer lateral.

Estados y conexión deben usar texto corto, forma/icono y color redundante.

Al pulsar el botón de conexión se abre un popover disponible desde cualquier vista. Debe mostrar el error actual, detectar los puertos seriales reales del computador y permitir elegirlos de una lista. Cada opción indica nombre, descripción y tipo (`USB`, `Bluetooth`, `Virtual` u `Otro`). Bluetooth se muestra, pero nunca se recomienda automáticamente.

El sistema preselecciona el último puerto que se conectó exitosamente; si no existe, puede sugerir el único adaptador USB detectado. El operario siempre debe confirmar con “Conectar”. También se ofrecen “Actualizar” y “Desconectar”, junto al resumen fijo `19200 8E1 · esclavo 1`. El puerto no se escribe manualmente.

## 5. Vista Operación

### 5.1 Avance del stack

Elemento dominante de la pantalla:

- Cajas procesadas del stack actual.
- Objetivo activo.
- Porcentaje.
- Barra de progreso.
- Objetivo programado para el próximo stack.
- Total histórico de cajas.
- Hora de la última caja terminada.

Ejemplo:

```text
STACK ACTUAL
14 de 20 cajas
[██████████████░░░░░░] 70 %

Próximo objetivo: 25
Total histórico: 12.486
```

### 5.2 Estado de secuencia

- Número de etapa `0–38`.
- Nombre comprensible: por ejemplo, “Alimentación de banda” o “Transferencia al stack”.
- No mostrar únicamente `M123` o códigos internos.

### 5.3 Programación de objetivo

- Campo numérico.
- Valor inicial: `20`.
- Máximo operativo configurable, inicialmente `100`.
- Botón “Programar”.
- Si la máquina ya forma un stack, el valor queda pendiente y se aplica al siguiente.
- Mostrar juntos “objetivo activo” y “próximo objetivo” cuando sean distintos.

### 5.4 Mandos contextuales

- Iniciar.
- Pausar.
- Reanudar.
- Parada controlada.
- Reiniciar stack actual.
- Avanzar un paso.

Reglas visuales:

- Iniciar sólo está disponible en automático y desde lista/detenida.
- Pausar sólo durante producción automática.
- Reanudar sólo desde pausa.
- Avanzar un paso sólo en modo manual.
- Reiniciar el stack no modifica el total histórico.
- Mientras un comando espera confirmación del PLC, los mandos incompatibles quedan bloqueados.
- El resultado debe decir: pendiente, confirmado, rechazado o sin respuesta.

La “parada controlada” no debe diseñarse como paro de emergencia. Debe existir una nota visible indicando que el paro de emergencia es físico e independiente.

### 5.5 Alarmas

Una alarma debe mostrar:

- Código.
- Explicación legible.
- Acción sugerida.
- Momento en que apareció, si está disponible.

Ejemplos:

- Pérdida de heartbeat.
- Paso solicitado fuera de modo manual.
- Objetivo inválido.
- Comando no permitido en el estado actual.
- Falla de conexión Modbus.

### 5.6 Trazabilidad reciente

Lista compacta de las últimas cajas:

- Número total.
- Timestamp.
- Estado “terminada” o “recuperada después de desconexión”.

## 6. Vista Supervisión

### 6.1 KPIs

- Cajas en la última hora.
- Cajas en las últimas 24 horas.
- Tiempo medio entre cajas.
- Stacks terminados.
- Total histórico.
- Tiempo en marcha y en pausa.

### 6.2 Gráficas

- Producción por hora durante las últimas 24 horas.
- Tendencia del tiempo entre cajas.
- Comparación tiempo en marcha frente a pausa.

Las gráficas deben ser sobrias, con escalas y unidades visibles. No usar gráficas circulares decorativas ni demasiadas series simultáneas.

### 6.3 Histórico

Tabla de stacks:

- ID.
- Inicio.
- Fin.
- Objetivo.
- Cajas procesadas.
- Estado activo o terminado.

Debe existir exportación CSV de eventos por caja.

Supervisión no debe incluir Comunicación ni Parámetros. Todo su ancho se reserva para los seis KPIs, las tres gráficas y el histórico.

## 7. Drawer global de Configuración

Se abre desde el engranaje de la cabecera y contiene:

- Elección entre simulador local y PLC real.
- Cambio automático/manual únicamente para el simulador.
- Periodo de poll.
- Máximo de cajas permitido por la HMI.
- Zona horaria.
- Parámetros Modbus fijos como referencia no editable: esclavo `1`, `19200 8E1`, timeout y reintentos.
- Aviso de cambios sin guardar, acciones Cancelar y Guardar.

Conectar/Desconectar no se mezcla con Guardar configuración. El drawer y el popover deben cerrarse con Escape, clic exterior y botón explícito, con foco visible para teclado.

## 8. Vista Consola

La consola es de sólo lectura y debe parecer una herramienta técnica, no una pantalla de mando.

### 8.1 Entradas físicas

Mostrar como LEDs independientes:

| Entrada | Nombre |
|---|---|
| `X0` | Reinicio |
| `X1` | Start / paso físico |
| `X2` | Selector automático/manual |
| `X3` | Parada física |
| `X4` | Sensor de proceso sin nombre |
| `X5` | Cilindro A final |
| `X6` | Cilindro B inicial |
| `X7` | Cilindro B final |
| `X10/X11` | Cilindro C inicial/final |
| `X12/X13` | Cilindro D inicial/final |
| `X14/X15` | Cilindro E inicial/final |
| `X16/X17` | Cilindro J inicial/final |
| `X22` | Sensor ventosa 1 |
| `X23` | Sensor ventosas 3/4 |
| `X24` | Sensor ventosa 2 |
| `X32` | Sensor de presencia |

Cada indicador incluye nombre, descripción, estado `ON/OFF` y dirección Modbus.

### 8.2 Salidas físicas

Mostrar por separado:

| Salida | Nombre |
|---|---|
| `Y0` | Válvula A |
| `Y1` | Válvula C |
| `Y3` | Válvula F / garra |
| `Y4` | Válvula J |
| `Y5` | Válvula B |
| `Y6` | Válvulas D/E |
| `Y10` | Ventosa 1 |
| `Y14` | Ventosa 2 |
| `Y15` | Ventosas 3/4 |
| `Y20` | Motor de banda |

Una salida activa se ilumina, pero nunca debe parecer un botón. Añadir el texto “Sólo lectura”.

### 8.3 Consola técnica

- Lectura de `D200-D219`.
- Request ID confirmado.
- Heartbeat.
- Versión del contrato.
- Flags decodificados.
- Hora del último poll.
- Log de transacciones y errores Modbus.
- Actualización manual y refresco automático de I/O.

## 9. Casos de uso

### Operario inicia producción

1. Comprueba “PLC conectado”, “Automático” y “Lista”.
2. Revisa o programa el objetivo.
3. Pulsa Iniciar.
4. Ve confirmación del PLC.
5. Supervisa el progreso.

### Operario cambia el siguiente stack

1. La máquina produce el stack actual.
2. Escribe la nueva cantidad.
3. Pulsa Programar.
4. La pantalla conserva el objetivo activo y muestra el nuevo como pendiente.
5. Al cambiar de stack, el pendiente pasa a ser activo.

### Operario trabaja por pasos

1. Cambia el selector físico a manual.
2. La HMI muestra “Modo manual”.
3. Pulsa “Avanzar un paso”.
4. El botón se bloquea hasta recibir confirmación.
5. La etapa avanza como máximo una transición.

### Supervisor revisa rendimiento

1. Abre Supervisión.
2. Compara producción horaria, ciclo medio y pausas.
3. Consulta stacks.
4. Exporta CSV.

### Técnico diagnostica una detención

1. Abre Consola.
2. Revisa qué sensores X están activos.
3. Revisa qué actuadores Y reporta el PLC.
4. Comprueba etapa, heartbeat y registros.
5. Consulta el log, sin forzar salidas.

### Pérdida de conexión

- La HMI muestra datos desactualizados/desconectados.
- Todos los mandos quedan bloqueados.
- No se presenta el último valor como si fuera actual.
- El PLC gestiona localmente su respuesta segura.
- El operario abre la conexión desde cualquier vista, actualiza la lista y selecciona un puerto detectado.
- Si el puerto está ocupado, la interfaz sugiere cerrar XDPPro u otro programa que lo esté utilizando.

## 10. Estados que deben diseñarse

La propuesta visual debe incluir, como mínimo:

1. Máquina lista en automático.
2. Produciendo normalmente.
3. Pausada.
4. Manual con paso disponible.
5. Comando esperando confirmación.
6. Comando rechazado.
7. Falla activa.
8. PLC desconectado.
9. Datos desactualizados.
10. Stack casi completo y stack recién reiniciado.
11. Consola con varios sensores y salidas activas.
12. Sin histórico todavía.

## 11. Requisitos visuales y de usabilidad

- Prioridad desktop industrial de `1280×800` y `1366×768`.
- Adaptación a tablet.
- Objetivos táctiles de al menos `44×44 px`.
- Tipografía sans serif muy legible.
- Valores numéricos con dígitos tabulares.
- Contraste suficiente y foco visible para teclado.
- Evitar degradados llamativos, neón, glassmorphism y animaciones decorativas.
- No usar rojo o ámbar en estado normal.
- No depender exclusivamente del color.
- No ocultar la alarma activa detrás de un modal.
- No poner configuración técnica junto a los mandos normales.

## 12. Entrega solicitada a la IA de diseño

Generar entre dos y cuatro alternativas visuales:

1. HMI industrial clásica de alto desempeño.
2. HMI moderna y minimalista.
3. Variante optimizada para pantalla táctil.
4. Opcional: variante oscura, manteniendo el uso excepcional de colores de alarma.

Para cada alternativa entregar:

- Vista Operación completa.
- Vista Supervisión.
- Vista Consola con LEDs X/Y.
- Estados normal, manual, falla y desconectado.
- Paleta, tipografía, espaciado y componentes reutilizables.

No cambiar nombres de variables, reglas de habilitación, semántica de seguridad ni flujos funcionales sin indicarlo explícitamente.
