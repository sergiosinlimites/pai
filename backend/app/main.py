import logging
import os
from typing import Optional

from fastapi import Body, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware

from .config import load_runtime_config
from .models import CommandRequest, ConfigUpdate, HealthResponse, PlcSnapshot
from .plc_service import PlcService

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

app = FastAPI(title="PC-PLC Xinje XD3 Local HMI", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    if service.config.auto_connect:
        await service.start()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await service.stop()


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
        return await service.start()
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
