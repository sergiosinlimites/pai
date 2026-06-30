# Puesta en producción: arranque permanente del PLC y de la HMI

## Respuesta corta

El operario no necesita XDPPro para poner el PLC en RUN todos los días.

El programa se descarga al PLC durante la puesta en marcha y permanece almacenado. El manual oficial indica que los XD/XL usan FlashROM para conservación y que, después de una pérdida prolongada de energía, las salidas se apagan y el PLC vuelve a ejecutar automáticamente cuando regresa la alimentación.

Fuentes:

- [Manual oficial Xinje XD/XL, especificaciones y conservación en FlashROM](https://cdn-en.xinje.com/XDXL%20hardware%20manual.pdf), página 54.
- [Manual oficial Xinje XD/XL, comportamiento al regresar la alimentación](https://cdn-en.xinje.com/XDXL%20hardware%20manual.pdf), página 94.
- [Página oficial del controlador XD3 y manuales vigentes](https://www.xinje.com/web/productInfo/index?indexGroup=0&seriesId=78).

## Qué significa realmente “RUN”

`RUN` significa que el PLC está escaneando el LADDER. No debe significar que la máquina comience a moverse inmediatamente.

Al energizar:

1. El PLC entra en ejecución.
2. `SM2` ejecuta la inicialización del primer scan.
3. El secuencial debe quedar en `M100 / etapa 0`.
4. El latch de marcha automática debe quedar apagado.
5. Las salidas deben estar en el estado inicial definido.
6. La máquina espera el Start físico o el comando validado de la HMI.

Ésta es la diferencia entre “PLC siempre disponible” y “máquina arrancando sola”.

## Procedimiento recomendado de puesta en servicio

Este procedimiento se realiza una vez por versión aprobada:

1. Abrir el `.xdp` final en XDPPro.
2. Compilar y revisar que no existan errores.
3. Descargar programa, parámetros seriales y configuración necesaria.
4. Poner el PLC en RUN.
5. Cerrar XDPPro y desconectar el cable de programación si no es necesario.
6. Cortar completamente la energía del PLC durante al menos diez segundos.
7. Volver a energizar.
8. Confirmar que los LEDs `PWR` y `RUN` quedan encendidos y `ERR` apagado.
9. Confirmar que ninguna salida produce movimiento inesperado.
10. Confirmar que la máquina queda en etapa 0 y exige Start.
11. Probar un ciclo y registrar la versión del `.xdp` instalada.

Después de esta prueba, el operario sólo usa los pulsadores físicos y la aplicación web.

## Casos en los que podría no entrar en RUN

- El PLC fue dejado explícitamente en STOP.
- Se utilizó la función especial “Stop PLC when reboot”.
- Existe un error de firmware, memoria o programa y el LED `ERR` está encendido.
- La descarga quedó incompleta.
- Se está usando un downloader/programador que fuerza temporalmente STOP.
- Existe una condición eléctrica anormal.

La función “Stop PLC when reboot” está documentada en el manual local [XDXL instruction manual.pdf](../XDXL%20instruction%20manual.pdf), página 12. Debe reservarse para recuperación/mantenimiento, no para la operación normal.

## Alternativa sin PC para mantenimiento

Xinje ofrece el downloader `JD-P03`, capaz de copiar programas XD/XL sin PC y alternar RUN/STOP después de la descarga. El manual oficial lo describe en las páginas 81–85.

El firmware identificado en este proyecto es `3.4.7m`; el manual exige al menos `3.4.6` para subir desde PLC sin Ethernet y `3.4` para descargar, por lo que en principio cumple. Esto debe verificarse con el modelo físico antes de comprar el accesorio.

El `JD-P03` es útil como respaldo de mantenimiento, pero no debe entregarse al operario como control diario.

## Arranque automático de la aplicación web

También debe eliminarse la dependencia de abrir terminales manualmente:

1. Instalar Python, Node y dependencias durante la puesta en servicio.
2. Ejecutar una vez:

   ```powershell
   npm.cmd --prefix frontend run build
   ```

3. El backend servirá el frontend compilado en `http://127.0.0.1:8000/`.
4. Usar [scripts/start-hmi-production.ps1](../scripts/start-hmi-production.ps1) como comando de inicio.
5. Registrar ese script en el Programador de tareas de Windows bajo una cuenta de servicio o el usuario operativo.
6. Configurar reinicio si el proceso termina inesperadamente.
7. Crear un acceso directo o modo kiosco del navegador hacia `http://127.0.0.1:8000/`.

Ejemplo para crear una tarea al iniciar sesión:

```powershell
schtasks /Create /TN "PAI-HMI-Xinje" /SC ONLOGON /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\sergi\Desktop\Universidad\PAI\pai\scripts\start-hmi-production.ps1" /F
```

Para una máquina que deba funcionar antes de iniciar sesión, se recomienda registrar Uvicorn como servicio de Windows con una cuenta dedicada. No exponer el puerto fuera del PC mientras no exista autenticación.

## Checklist para entregar a producción

- [ ] Programa final descargado y respaldado.
- [ ] PLC vuelve a RUN después de un ciclo real de energía.
- [ ] Al recuperar energía no hay movimiento automático.
- [ ] Start físico y Start HMI funcionan sólo con interlocks válidos.
- [ ] `PWR` y `RUN` son visibles para mantenimiento.
- [ ] `ERR` produce una instrucción clara al operario.
- [ ] Backend y frontend arrancan automáticamente con Windows.
- [ ] La HMI abre sin XDPPro.
- [ ] El proceso del backend se reinicia ante falla.
- [ ] Existe copia versionada del `.xdp`, configuración y base de datos.
- [ ] El paro de emergencia funciona sin PLC/HMI/PC.
