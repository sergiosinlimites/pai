import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import Body, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from .config import load_runtime_config
from .models import (
    CommandRequest,
    ConfigUpdate,
    HealthResponse,
    PlcSnapshot,
    SettingsResponse,
    SettingsUpdate,
    SimulatorModeRequest,
)
from .plc_service import PlcService
from .serial_ports import discover_serial_ports

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


class WebSocketHub:
    def __init__(self) -> None:
        self._clients = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    async def broadcast(self, snapshot: PlcSnapshot) -> None:
        payload = jsonable_encoder(snapshot)
        stale_clients = []
        for websocket in list(self._clients):
            try:
                await websocket.send_json(payload)
            except Exception:
                stale_clients.append(websocket)
        for websocket in stale_clients:
            self.disconnect(websocket)


hub = WebSocketHub()
service = PlcService(load_runtime_config(), on_state=hub.broadcast)

app = FastAPI(title="PC-PLC Xinje XD3 Local HMI", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    if service.config.auto_connect:
        await service.start()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await service.shutdown()


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    snapshot = service.snapshot()
    return HealthResponse(
        ok=snapshot.connected and snapshot.last_error is None,
        service="pc-plc-xinje-xd3-hmi",
        connected=snapshot.connected,
        simulator=snapshot.simulator,
        last_error=snapshot.last_error,
    )


@app.get("/api/status", response_model=PlcSnapshot)
async def status() -> PlcSnapshot:
    return service.snapshot()


@app.post("/api/connect", response_model=PlcSnapshot)
async def connect(config: Optional[ConfigUpdate] = Body(default=None)) -> PlcSnapshot:
    try:
        if config is not None:
            await service.configure(config, reconnect=False)
        snapshot = await service.start()
        if snapshot.connected and not snapshot.simulator:
            service.store.remember_serial_port(snapshot.config.port)
        return snapshot
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/disconnect", response_model=PlcSnapshot)
async def disconnect() -> PlcSnapshot:
    return await service.stop()


@app.post("/api/config", response_model=PlcSnapshot)
async def update_config(config: ConfigUpdate) -> PlcSnapshot:
    try:
        return await service.configure(config)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/command")
async def command(request: CommandRequest):
    try:
        return await service.send_command(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/simulator/mode", response_model=PlcSnapshot)
async def simulator_mode(request: SimulatorModeRequest) -> PlcSnapshot:
    try:
        return await service.set_simulator_mode(request.manual)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/settings", response_model=SettingsResponse)
async def get_settings() -> dict:
    return service.store.settings()


@app.get("/api/serial/ports")
async def serial_ports() -> dict:
    settings = service.store.settings()
    snapshot = service.snapshot()
    return discover_serial_ports(
        configured_port=service.config.port,
        last_successful_port=settings["last_serial_port"],
        current_port_in_use=(
            service.config.port
            if snapshot.connected and not snapshot.simulator
            else None
        ),
    )


@app.put("/api/settings", response_model=SettingsResponse)
async def update_settings(request: SettingsUpdate) -> dict:
    try:
        return service.store.update_settings(
            max_stack_size=request.max_stack_size,
            timezone_name=request.timezone,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/production/summary")
async def production_summary() -> dict:
    return service.store.summary()


@app.get("/api/production/events")
async def production_events(limit: int = Query(50, ge=1, le=500)) -> dict:
    return {"entries": service.store.recent_events(limit)}


@app.get("/api/production/stacks")
async def production_stacks(limit: int = Query(50, ge=1, le=500)) -> dict:
    return {"entries": service.store.stacks(limit)}


@app.get("/api/production/export.csv")
async def production_export() -> Response:
    return Response(
        content=service.store.export_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="produccion-cajas.csv"'},
    )


@app.get("/api/debug/log")
async def debug_log():
    return {"entries": service.debug_log()}


@app.get("/api/console/io")
async def console_io() -> dict:
    try:
        return await service.read_physical_io()
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/debug/read")
async def debug_read(
    address: int = Query(204, ge=0, le=65535),
    count: int = Query(19, ge=1, le=64),
):
    try:
        return await service.debug_read_registers(address, count)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/debug/coils")
async def debug_coils(
    address: int = Query(20480, ge=0, le=65535),
    count: int = Query(8, ge=1, le=64),
    prefix: str = Query("X", min_length=1, max_length=4),
):
    try:
        return await service.debug_read_coils(address, count, prefix)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.websocket("/ws/state")
async def state_websocket(websocket: WebSocket) -> None:
    await hub.connect(websocket)
    try:
        await websocket.send_json(jsonable_encoder(service.snapshot()))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(websocket)


# In production, `npm run build` lets this same local service host the HMI.
# During development Vite continues to proxy /api and /ws to FastAPI.
frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="hmi")
