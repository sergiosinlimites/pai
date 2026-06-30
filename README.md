# HMI local para apilado — Xinje XD3

Aplicación web local para operar y supervisar la máquina de cajas predobladas mediante Modbus RTU. El backend FastAPI es el único maestro Modbus; el navegador nunca se conecta directamente al PLC.

## Funciones

- HMI en español con vistas separadas de Operación, Supervisión y Consola.
- Objetivo inicial de `20` cajas y máximo HMI configurable, inicialmente `100`.
- Automático, pausa, reanudación, parada controlada y avance de una etapa en manual.
- Conteo del stack actual y total histórico retentivo de 32 bits.
- SQLite con timestamps por caja, stacks, estados, fallas y exportación CSV.
- Simulador local para validar toda la interfaz sin movimiento real.
- Diagnóstico de sólo lectura; no se exponen mandos directos sobre salidas `Y`.
- LEDs en vivo para las entradas `X` y salidas `Y` utilizadas por el secuencial.
- Selector global de puertos seriales detectados, disponible desde las tres vistas.
- Configuración separada en un panel lateral; Supervisión queda dedicada a producción.

## Ejecutar en Windows

Instalar el backend:

```powershell
cd C:\Users\sergi\Desktop\Universidad\PAI\pai
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Iniciar FastAPI:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

En otra terminal:

```powershell
cd C:\Users\sergi\Desktop\Universidad\PAI\pai
npm.cmd --prefix frontend install
npm.cmd --prefix frontend run dev
```

Abrir `http://localhost:5173/`. La aplicación no se conecta automáticamente: el usuario confirma la conexión desde la cabecera.

## Conectar el PLC

1. Pulse el indicador de conexión de la esquina superior.
2. Actualice la lista si acaba de conectar el adaptador USB-RS485.
3. Seleccione uno de los puertos detectados y pulse `Conectar`.

La interfaz recuerda el último puerto que se conectó correctamente y lo sugiere en el siguiente arranque. Los puertos Bluetooth se muestran para diagnóstico, pero no se recomiendan. Los parámetros del PLC permanecen fijos en `19200 8E1`, esclavo `1`; el periodo de poll y las preferencias están en el engranaje global.

XDPPro y el backend no pueden usar el mismo puerto simultáneamente. Si está ocupado, la HMI indica que debe cerrar XDPPro u otra aplicación serial.

## Contrato v2

| Dirección | Contenido |
|---|---|
| PC → PLC | `D200-D203`: objetivo, comando, request ID y heartbeat |
| PLC → PC | `D210-D219`: estado, conteos, confirmación, falla, flags, etapa, versión y total |

La especificación completa está en [docs/modbus-contract.md](docs/modbus-contract.md). La copia `SECUENCIALOL_MODBUS_V2_WORKING.xdp` debe completarse desde XDPPro siguiendo [docs/PLC-v2-XDPPro-implementation.md](docs/PLC-v2-XDPPro-implementation.md).

La aplicación espera `D217 = 2`. No habilite movimiento real hasta terminar y verificar ese bloque LADDER.

## API principal

| Endpoint | Uso |
|---|---|
| `GET /api/status` | Estado decodificado del PLC |
| `GET /api/serial/ports` | Puertos detectados, disponibilidad y sugerencia |
| `POST /api/command` | `start`, `pause`, `resume`, `safe_stop`, `reset_counter`, `step`, `set_target` |
| `GET /api/production/summary` | KPIs, producción horaria y tendencia de ciclo |
| `GET /api/production/events` | Eventos de cajas |
| `GET /api/production/stacks` | Histórico de stacks |
| `GET /api/production/export.csv` | Exportación CSV |
| `GET/PUT /api/settings` | Máximo operativo y zona horaria |
| `POST /api/simulator/mode` | Alternar automático/manual en el simulador |
| `GET /api/console/io` | Entradas y salidas físicas utilizadas, sólo lectura |
| `WS /ws/state` | Actualizaciones en tiempo real |

SQLite se crea en `backend/data/hmi.db`. Puede cambiar la ubicación con `PLC_DATABASE_PATH`.

## Producción sin XDPPro

El PLC conserva el programa y vuelve a RUN al recuperar alimentación; el operario no necesita el software de programación. La puesta en servicio, el ciclo de energía y el arranque automático de Windows están documentados en [docs/README-produccion-arranque-plc.md](docs/README-produccion-arranque-plc.md).

Después de compilar el frontend, FastAPI sirve toda la aplicación desde `http://127.0.0.1:8000/`:

```powershell
.\scripts\start-hmi-production.ps1
```

El brief autónomo para solicitar otros diseños visuales está en [docs/README-frontend-hmi-design-brief.md](docs/README-frontend-hmi-design-brief.md).

## Verificación

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v

cd ..
npm.cmd --prefix frontend run build
.\backend\.venv\Scripts\python.exe -m compileall -q backend\app
```

## Seguridad

La parada de la HMI es controlada, no de emergencia. El paro de emergencia debe permanecer cableado y ser independiente del PC, navegador, USB, Modbus y red.
