import os
import signal
import sys
import time

HZ = os.sysconf('SC_CLK_TCK')
NCPU = os.cpu_count()

def leer_stat(pid):
    try:
        with open(f'/proc/{pid}/stat') as f:
            partes = f.read().rsplit(')', 1)[1].split()
        ppid = int(partes[1])
        ticks = int(partes[11]) + int(partes[12])
        with open(f'/proc/{pid}/status') as f:
            rss = next((int(l.split()[1]) for l in f if l.startswith('VmRSS:')), 0)
        with open(f'/proc/{pid}/comm') as f:
            comm = f.read().strip()
        return ppid, ticks, rss / 1024, comm
    except (FileNotFoundError, ProcessLookupError, StopIteration, PermissionError):
        return None

def procesos():
    out = {}
    for d in os.listdir('/proc'):
        if d.isdigit():
            s = leer_stat(int(d))
            if s:
                out[int(d)] = s
    return out

def cpu_sistema():
    with open('/proc/stat') as f:
        v = list(map(int, f.readline().split()[1:]))
    idle = v[3] + v[4]
    return sum(v), idle

def main():
    pid_api, pid_pg, salida = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    corriendo = [True]
    signal.signal(signal.SIGTERM, lambda *_: corriendo.__setitem__(0, False))
    signal.signal(signal.SIGINT, lambda *_: corriendo.__setitem__(0, False))

    def grupos(ps):
        g = {'api': [pid_api], 'postgres': [], 'k6': []}
        for pid, (ppid, _, _, comm) in ps.items():
            if pid == pid_pg or ppid == pid_pg:
                g['postgres'].append(pid)
            elif comm == 'k6':
                g['k6'].append(pid)
        return g

    prev = procesos()
    prev_sys = cpu_sistema()
    prev_t = time.time()
    with open(salida, 'w') as f:
        f.write('ts,api_cpu,api_mem_mb,pg_cpu,pg_mem_mb,pg_procs,k6_cpu,k6_mem_mb,sistema_cpu_pct\n')
        while corriendo[0]:
            time.sleep(1)
            act = procesos()
            sys_act = cpu_sistema()
            t = time.time()
            dt = t - prev_t
            fila = [f'{t:.0f}']
            g = grupos(act)
            for nombre in ('api', 'postgres', 'k6'):
                cpu = mem = 0.0
                for pid in g[nombre]:
                    if pid in act:
                        mem += act[pid][2]
                        if pid in prev:
                            cpu += (act[pid][1] - prev[pid][1]) / HZ / dt * 100
                fila += [f'{cpu:.1f}', f'{mem:.1f}']
                if nombre == 'postgres':
                    fila.append(str(len(g[nombre])))
            tot = sys_act[0] - prev_sys[0]
            idle = sys_act[1] - prev_sys[1]
            fila.append(f'{(1 - idle / tot) * 100 if tot else 0:.1f}')
            f.write(','.join(fila) + '\n')
            f.flush()
            prev, prev_sys, prev_t = act, sys_act, t

if __name__ == '__main__':
    main()
