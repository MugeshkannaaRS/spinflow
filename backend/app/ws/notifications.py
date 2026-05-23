from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from typing import Set, Dict
import json
import asyncio
from datetime import datetime

from app.core.security import decode_token

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_to_user(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            for ws in self.active_connections[user_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass

    async def broadcast(self, message: dict):
        for user_id in list(self.active_connections.keys()):
            await self.send_to_user(user_id, message)


manager = ConnectionManager()


@router.websocket("/ws/notifications")
async def notification_websocket(websocket: WebSocket, token: str = Query(...)):
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001)
        return
    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=4001)
        return
    await manager.connect(websocket, user_id)
    try:
        await websocket.send_json({"type": "connected", "message": "Notification channel active"})
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)


async def notify_machine_breakdown(machine_code: str, reason: str):
    await manager.broadcast({
        "type": "machine.breakdown",
        "machine_code": machine_code,
        "reason": reason,
        "timestamp": datetime.now().isoformat(),
    })


async def notify_low_stock(item_name: str, stock: float, min_stock: float):
    await manager.broadcast({
        "type": "stock.low",
        "item": item_name,
        "stock": stock,
        "min_stock": min_stock,
        "timestamp": datetime.now().isoformat(),
    })


async def notify_quality_rejected(lot_no: str, reason: str):
    await manager.broadcast({
        "type": "quality.rejected",
        "lot_no": lot_no,
        "reason": reason,
        "timestamp": datetime.now().isoformat(),
    })


async def notify_dispatch_pending(dispatch_no: str, customer: str):
    await manager.broadcast({
        "type": "dispatch.pending",
        "dispatch_no": dispatch_no,
        "customer": customer,
        "timestamp": datetime.now().isoformat(),
    })
