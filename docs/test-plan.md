# Plan de pruebas — HMI Xinje contrato v2

## Pruebas automáticas

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v

cd ..
npm.cmd --prefix frontend run build
.\backend\.venv\Scripts\python.exe -m compileall -q backend\app
```

Las pruebas cubren palabras de 32 bits, total monotónico, eventos recuperados, cierre de stacks, CSV, comandos confirmados, paso manual, idempotencia y cambio diferido del objetivo.

## Simulador

| Escenario | Resultado esperado |
|---|---|
| Inicio | Contrato `2`, objetivo activo `20`, máquina lista |
| Objetivo válido | HMI acepta entre `1` y el máximo configurado |
| Objetivo durante marcha | Queda pendiente hasta el próximo stack |
| Producción automática | Incrementa stack, total e histórico SQLite |
| Fin de stack | Conteo vuelve a cero y la producción continúa |
| Pausa/reanudación | No se producen cajas durante la pausa |
| Paso en automático | Rechazo `24` |
| Paso en manual | Avanza exactamente una etapa |
| Request ID repetido | No repite etapa ni conteo |
| Reinicio de stack | No reduce el total histórico |
| Reinicio del backend | Conserva SQLite y continúa el total |
| Exportación | CSV contiene cajas y timestamps |
| Consola | Entradas y salidas aparecen separadas con nombres y direcciones octales correctas |

## Banco PLC sin salidas

1. Cargar `SECUENCIALOL_MODBUS_V2_WORKING.xdp` después de aplicar la guía XDPPro.
2. Observar `D200-D219`, `D300-D303`, `M300-M309`, `T2` y `HD0-HD1`.
3. Confirmar que el backend escribe `D200-D203` en una sola transacción.
4. Confirmar que cada request termina con `D213 = D202`.
5. Repetir el mismo `D202` y comprobar que no se ejecuta de nuevo.
6. Probar `X2=1`: un flanco de `X1` y un comando `7` deben producir como máximo una transición.
7. Probar `X2=0`: inicio, pausa, reanudación y parada controlada.
8. Cambiar la meta durante un stack y confirmar que `D212` sólo cambia al comenzar el siguiente.
9. Detener el backend durante más de tres segundos: el PLC debe publicar `90` y usar la ruta controlada.
10. Apagar y encender el PLC: `HD0-HD1` y `D218-D219` deben conservar el total.
11. Comparar los LEDs físicos del PLC con la vista Consola para cada `X` y `Y` utilizada.

## Prueba supervisada de máquina

| Escenario | Evidencia |
|---|---|
| Conteo real | Comparar conteo manual, `C1`, `D211` y eventos SQLite |
| Stack completo | Verificar últimos cilindros, reinicio a cero y nuevo stack |
| Paso manual | Filmar o registrar etapa inicial/final para cada pulsación |
| Sensores no listos | El paso no debe saltar etapas |
| Pausa | Confirmar que no inicia una transición nueva |
| Parada controlada | Confirmar retorno mediante la secuencia existente |
| Pérdida USB | No debe existir arranque inesperado |
| Emergencia física | Debe funcionar sin PC, USB, Modbus ni navegador |

No habilite salidas físicas hasta completar las pruebas de banco y revisar los interlocks mecánicos y eléctricos.
