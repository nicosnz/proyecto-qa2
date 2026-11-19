## 1. Cómo ejecutar

```bash
cd k6
k6 run smoke.js                      # ~1 min.  Puerta de entrada
k6 run load.js                       # ~18 min. Hora pico: 50 socios
k6 run stress.js                     # ~27 min. Escalones 50→400 y recuperación

# Versiones acortadas usadas en este informe
k6 run -e RAMP=30s -e HOLD=2m -e DOWN=15s load.js
k6 run -e STEP_RAMP=15s -e STEP_HOLD=45s -e RECUP_HOLD=45s stress.js

# Otros
k6 run -e VUS=100 load.js            # otro nivel de pico
k6 run -e BASE_URL=http://host:3000 smoke.js
```

Cada corrida genera `k6/results/<prueba>-<fecha>.json` y `.html` con los KPIs, la tabla por endpoint (y por escalón en estrés) y el estado de los umbrales.

**Con monitoreo de CPU y memoria** (la API y PostgreSQL deben correr en la misma máquina):

```bash
cd k6
pgrep -f "src/app.ts" | tail -1                 # PID de la API (Node)
pgrep -x postgres | head -1                     # PID del proceso padre de PostgreSQL
python3 monitor/monitor.py <PID_API> <PID_PG> results/monitor/stress-recursos.csv &
k6 run --out json=results/monitor/stress.json stress.js
kill %1                                         # detiene el monitor
python3 monitor/analizar.py results/monitor/stress-recursos.csv results/monitor/stress.json 50,100,200,300,400
```

**Datos que quedan en el sistema:** los socios de prueba `k6.socio.001…420@example.com` (se reutilizan entre corridas, porque la API no permite borrar usuarios). Esta prueba no modifica libros ni categorías.
