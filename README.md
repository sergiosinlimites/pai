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

Abrir `http://localhost:5173/`. El simulador se conecta automáticamente.

## Conectar el PLC

1. Abra Supervisión.
2. Desactive `Usar simulador local`.
3. Configure `COM9`, esclavo `1`, `19200` baud y poll `300 ms`.
4. Pulse `Aplicar` y luego `Conectar`.

También puede iniciar directamente en modo real:

```powershell
cd backend
$env:PLC_SIMULATOR = "false"
$env:PLC_SERIAL_PORT = "COM9"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

XDPPro y el backend no pueden usar `COM9` simultáneamente.

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
| `POST /api/command` | `start`, `pause`, `resume`, `safe_stop`, `reset_counter`, `step`, `set_target` |
| `GET /api/production/summary` | KPIs y producción horaria |
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
